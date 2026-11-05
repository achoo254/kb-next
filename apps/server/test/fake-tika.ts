/**
 * A Tika server on loopback for tests, answering like Tika 2.9 does: `PUT /tika` gives XHTML (a PDF page by page in
 * `<div class="page">`, with hOCR words when OCR is asked), `PUT /detect/stream` a MIME type. What it answers is up
 * to the test (`respond`); every request is recorded with its headers and body size.
 */
import { type IncomingMessage, type Server, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface TikaCall {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: Buffer;
}

export interface TikaReply {
  status?: number;
  body: string;
  /** Wait this long before answering. */
  delayMs?: number;
}

export interface FakeTika {
  url: string;
  calls: TikaCall[];
  /** The answer to a call (default: 200 with an empty XHTML page). */
  respond: (call: TikaCall) => TikaReply | Promise<TikaReply>;
  /** Calls asking for OCR. */
  ocrCalls(): TikaCall[];
  close(): Promise<void>;
}

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const parts: Buffer[] = [];
  for await (const part of req) parts.push(part as Buffer);
  return Buffer.concat(parts);
}

export async function startFakeTika(): Promise<FakeTika> {
  const fake: FakeTika = {
    url: '',
    calls: [],
    respond: () => ({ body: xhtml('') }),
    ocrCalls: () => fake.calls.filter((c) => c.headers['x-tika-pdfocrstrategy'] === 'ocr_only'),
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
  const server: Server = createServer((req, res) => {
    void (async () => {
      const call: TikaCall = {
        method: req.method ?? '',
        path: req.url ?? '',
        headers: Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(',') : (v ?? '')])),
        body: await readBody(req),
      };
      fake.calls.push(call);
      const reply = await fake.respond(call);
      if (reply.delayMs) await new Promise((resolve) => setTimeout(resolve, reply.delayMs));
      if (!res.destroyed) res.writeHead(reply.status ?? 200, { 'Content-Type': 'text/html; charset=UTF-8' }).end(reply.body);
    })();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  fake.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return fake;
}

const escape = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** A Tika XHTML document around `body`. */
export function xhtml(body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><meta name="Content-Type" content="application/pdf"/><title></title></head><body>${body}</body></html>`;
}

/** Tika's XHTML of a PDF read from its text layer: one `<div class="page">` per page, a paragraph per line. */
export function pdfPagesHtml(pages: readonly string[]): string {
  return xhtml(pages.map((text) => `<div class="page">${text.split('\n').map((line) => `<p>${escape(line)}</p>`).join('')}</div>`).join(''));
}

/** Tika's XHTML of OCR'd PDF pages in hOCR: each word with its confidence (`x_wconf`). */
export function hocrPagesHtml(pages: ReadonlyArray<{ text: string; confidence: number }>): string {
  return xhtml(
    pages
      .map(
        ({ text, confidence }, p) =>
          `<div class="page"><div class="ocr_page" id="page_${p + 1}"><p class="ocr_par">${text
            .split('\n')
            .map(
              (line, l) =>
                `<span class="ocr_line" id="line_${p + 1}_${l + 1}">${line
                  .split(/\s+/)
                  .filter(Boolean)
                  .map((word, w) => `<span class="ocrx_word" id="word_${p + 1}_${l + 1}_${w + 1}" title="bbox 10 10 50 30; x_wconf ${confidence}">${escape(word)}</span>`)
                  .join(' ')}</span>`,
            )
            .join('\n')}</p></div></div>`,
      )
      .join(''),
  );
}
