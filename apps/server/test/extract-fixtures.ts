/** Small files for extraction tests, made on the fly, and a fake Jev answering the extraction's questions. */
import { PDFDocument, StandardFonts } from 'pdf-lib';
import type { JevAnswer, JevCallOptions, JevJudge, JevQuestion, JevResult } from '../src/jev/jev-client';

/** A 1×1 grey PNG: drawn over a whole page it stands for a scan. */
const PIXEL_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

export interface FixturePage {
  /** Text drawn on the page (its text layer), line by line. ASCII: the standard fonts have no Vietnamese letters. */
  text?: string;
  /** Share of the page an image covers (1: a full-page scan). */
  image?: number;
}

/** A PDF of A4 pages with the given text layers and images. */
export async function makePdf(pages: readonly FixturePage[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const png = await doc.embedPng(PIXEL_PNG);
  for (const spec of pages) {
    const page = doc.addPage([595, 842]);
    if (spec.image) {
      const side = Math.sqrt(spec.image);
      page.drawImage(png, { x: 0, y: 0, width: 595 * side, height: 842 * side });
    }
    spec.text?.split('\n').forEach((line, i) => page.drawText(line, { x: 40, y: 800 - i * 16, font, size: 11 }));
  }
  return doc.save();
}

export const ENGLISH_PAGE = [
  'The Domain Name System translates names into addresses.',
  'Each resolver asks the root servers, then the servers of the top level domain.',
  'A record maps a name to an IPv4 address and caching keeps answers for their time to live.',
].join('\n');

export const SECOND_PAGE = ['Kubernetes schedules containers onto nodes in a cluster.', 'A deployment keeps the wanted number of pods running and replaces failed ones.'].join('\n');

export const VIETNAMESE_OCR = 'Mạng máy tính là tập hợp các máy tính kết nối với nhau để chia sẻ dữ liệu và tài nguyên. Giao thức định tuyến chọn đường đi tốt nhất cho gói tin.';

export const GARBAGE_OCR = 'l1| ;;~ ¸µ ®Ò ~~~ |||| ¬¬ ÿþ %% ^^ rnrn ¦¦ ~|~ qxz';

export type JevHandler = (purpose: string, state: unknown, questions: Record<string, JevQuestion>) => Record<string, JevAnswer> | Promise<Record<string, JevAnswer>>;

export interface FakeJev extends JevJudge {
  calls: Array<{ purpose: string; state: unknown; questions: Record<string, JevQuestion> }>;
  handler: JevHandler;
}

/** A Jev that records each call and answers through `handler` (default: every page clear and readable, no collection). */
export function fakeJev(handler?: JevHandler): FakeJev {
  const jev: FakeJev = {
    calls: [],
    handler:
      handler ??
      ((_purpose, _state, questions) =>
        Object.fromEntries(
          Object.entries(questions).map(([name, q]): [string, JevAnswer] => {
            if (q.type === 'noul') return [name, { type: 'noul', noul: 0.9 }];
            if (q.type === 'score') return [name, { type: 'score', score: q.criteria.length - 1, confidence: 0.9, probabilities: {} }];
            return [name, { type: 'choice', choice: 'none', confidence: 0.9, probabilities: {} }];
          }),
        )),
    async choose() {
      throw new Error('extraction never calls choose');
    },
    async ask(purpose: string, state: unknown, questions: Record<string, JevQuestion>, _options?: JevCallOptions): Promise<JevResult> {
      jev.calls.push({ purpose, state, questions });
      return { answers: await jev.handler(purpose, state, questions), usage: { inputTokens: 10, outputTokens: 0 } };
    },
  };
  return jev;
}
