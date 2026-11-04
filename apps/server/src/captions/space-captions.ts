/**
 * The caption under each Space's crystal on the Universe (C09: "8 lab", "5 tuần", "3 tệp · riêng tư"). Code
 * builds 2 to 5 short candidates (vi and en, at most MAX_CAPTION_CHARS each) from the per-type counts the viewer
 * may read; Jev chooses the clearest, most compact one. Jev never writes the text.
 *
 * The choice is cached in `space_captions` per Space and signature (a hash of the candidates and the Space's
 * names), so Jev is asked again only when the counts change, never on every page view. Without a key, or when Jev
 * fails or times out, the caption is "<total> bài" / "<total> docs"; a failure is cached too and retried after
 * FAILURE_RETRY_MS, so a Jev outage does not turn into one call per page view. Captions the dev/E2E seed stored
 * (`seed`, see seedMockCaptions) are read like Jev's, with or without a key.
 */
import { createHash } from 'node:crypto';
import { and, eq, or } from 'drizzle-orm';
import type { SpaceRow } from '../access/content';
import { countTextsByType } from '../access/reading';
import type { Viewer } from '../access/viewer';
import type { Db } from '../db/client';
import { type documentType, spaceCaptions } from '../db/schema';
import type { JevChoiceQuestion, JevJudge } from '../jev/jev-client';
import { safeErrorText } from '../log-error';

export type DocumentType = (typeof documentType.enumValues)[number];

export interface Caption {
  vi: string;
  en: string;
}

export interface CaptionInput {
  space: { id: string; kind: 'public' | 'personal'; nameVi: string; nameEn: string; unitVi: string; unitEn: string };
  /** Readable texts of the Space per type (a text and its translations count once). */
  counts: Partial<Record<DocumentType, number>>;
}

export const MAX_CAPTION_CHARS = 18;
const MAX_CANDIDATES = 5;
const FAILURE_RETRY_MS = 60 * 60 * 1000;
/** Bump when the candidates change shape: every cached choice is then made again. */
const CANDIDATES_VERSION = 1;

/** What a document of each type is called in a caption: Vietnamese has no plural, English does. */
const TYPE_LABELS: Record<DocumentType, { vi: string; en: [string, string] }> = {
  lab: { vi: 'lab', en: ['lab', 'labs'] },
  note: { vi: 'ghi chú', en: ['note', 'notes'] },
  process: { vi: 'quy trình', en: ['process', 'processes'] },
  office: { vi: 'tệp', en: ['file', 'files'] },
  web: { vi: 'trang web', en: ['web page', 'web pages'] },
  journey: { vi: 'lối đi', en: ['path', 'paths'] },
};
const TYPE_ORDER = Object.keys(TYPE_LABELS) as DocumentType[];

const chars = (text: string): number => [...text].length;
const english = (n: number, [one, many]: [string, string]): string => `${n} ${n === 1 ? one : many}`;
/** A Space's English unit is stored in the plural ("labs", "weeks"); one of them drops the final s. */
const englishUnit = (n: number, plural: string): string => `${n} ${n === 1 && plural.endsWith('s') ? plural.slice(0, -1) : plural}`;

function total(counts: CaptionInput['counts']): number {
  return Object.values(counts).reduce((sum, n) => sum + (n ?? 0), 0);
}

/** The caption inputs of the given Spaces for a viewer: the texts of each type the viewer may read there. */
export async function captionInputsFor(db: Db, viewer: Viewer, spaces: readonly SpaceRow[]): Promise<CaptionInput[]> {
  const counts = await countTextsByType(db, viewer);
  return spaces.map((space) => ({
    space,
    counts: Object.fromEntries(counts.filter((c) => c.spaceId === space.id).map((c) => [c.type, c.count])),
  }));
}

/** Readable texts of a caption input. */
export function textTotal(input: CaptionInput): number {
  return total(input.counts);
}

/** The caption when Jev is not asked or fails: the plain number of texts. */
export function fallbackCaption(n: number): Caption {
  return { vi: `${n} bài`, en: english(n, ['doc', 'docs']) };
}

/** The candidates Jev chooses among, most specific first; at most MAX_CANDIDATES, each short enough in both languages. */
export function captionCandidates({ space, counts }: CaptionInput): Caption[] {
  const n = total(counts);
  if (n === 0) return [fallbackCaption(0)];
  const types = TYPE_ORDER.filter((type) => (counts[type] ?? 0) > 0).sort((a, b) => (counts[b] ?? 0) - (counts[a] ?? 0));
  const ofType = (type: DocumentType): Caption => {
    const k = counts[type] ?? 0;
    return { vi: `${k} ${TYPE_LABELS[type].vi}`, en: english(k, TYPE_LABELS[type].en) };
  };
  const unit: Caption = { vi: `${n} ${space.unitVi}`, en: englishUnit(n, space.unitEn) };
  // A unit that names a type ("lab") counts that type, which the type candidate already says.
  const unitIsType = TYPE_ORDER.some((type) => TYPE_LABELS[type].vi === space.unitVi);
  const candidates: Caption[] = [];
  if (!unitIsType) candidates.push(unit);
  if (space.kind === 'personal') candidates.push({ vi: `${unit.vi} · riêng tư`, en: `${unit.en} · private` });
  const [first, second] = types;
  if (first) candidates.push(ofType(first));
  if (first && second) {
    const a = ofType(first);
    const b = ofType(second);
    candidates.push({ vi: `${a.vi} · ${b.vi}`, en: `${a.en} · ${b.en}` });
  }
  candidates.push(fallbackCaption(n));
  if (second) candidates.push(ofType(second));
  const kept: Caption[] = [];
  for (const c of candidates) {
    const fits = chars(c.vi) <= MAX_CAPTION_CHARS && chars(c.en) <= MAX_CAPTION_CHARS;
    if (fits && !kept.some((k) => k.vi === c.vi)) kept.push(c);
  }
  return kept.slice(0, MAX_CANDIDATES);
}

/** Identifies what a choice was made from: the candidates and the names Jev saw. */
export function captionSignature({ space }: CaptionInput, candidates: readonly Caption[]): string {
  const basis = { v: CANDIDATES_VERSION, kind: space.kind, vi: space.nameVi, en: space.nameEn, candidates };
  return createHash('sha256').update(JSON.stringify(basis)).digest('hex');
}

interface Pending {
  key: string;
  input: CaptionInput;
  candidates: Caption[];
  signature: string;
}

const KIND_FOR_JEV = { public: 'public, readable by everyone', personal: 'personal, private to the reader' } as const;

export class SpaceCaptions {
  /** Choices being made now, by `spaceId:signature`: two page views at once share one Jev call. */
  private readonly inflight = new Map<string, Promise<Caption>>();

  constructor(
    private readonly db: Db,
    /** null: no TYPESAFE_API_KEY, every caption is the fallback. */
    private readonly jev: JevJudge | null,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** The caption of each given Space, by Space id. */
  async captionsFor(inputs: readonly CaptionInput[]): Promise<Map<string, Caption>> {
    const result = new Map<string, Caption>();
    const pending: Pending[] = [];
    const jev = this.jev;
    for (const input of inputs) {
      const candidates = captionCandidates(input);
      const only = candidates.length === 1 ? candidates[0] : undefined;
      if (only) {
        result.set(input.space.id, only);
        continue;
      }
      const signature = captionSignature(input, candidates);
      pending.push({ key: `${input.space.id}:${signature}`, input, candidates, signature });
    }
    if (pending.length === 0) return result;

    const cached = await this.db
      .select()
      .from(spaceCaptions)
      .where(or(...pending.map((p) => and(eq(spaceCaptions.spaceId, p.input.space.id), eq(spaceCaptions.signature, p.signature)))));
    const at = this.now().getTime();
    const toAsk: Pending[] = [];
    for (const p of pending) {
      const row = cached.find((r) => r.spaceId === p.input.space.id && r.signature === p.signature);
      // Without a key any stored caption serves (a seeded one included); with one, a failure is retried in time.
      const fresh = row && (!jev || row.source !== 'fallback' || (row.retryAfter !== null && row.retryAfter.getTime() > at));
      if (row && fresh) result.set(p.input.space.id, { vi: row.captionVi, en: row.captionEn });
      else if (!jev) result.set(p.input.space.id, fallbackCaption(total(p.input.counts)));
      else if (!this.inflight.has(p.key)) toAsk.push(p);
    }
    if (jev && toAsk.length > 0) {
      const batch = this.choose(jev, toAsk);
      for (const p of toAsk) {
        const one = batch.then((chosen) => chosen.get(p.key) ?? fallbackCaption(total(p.input.counts)));
        this.inflight.set(p.key, one);
        void one.finally(() => this.inflight.delete(p.key));
      }
    }
    // Taken before awaiting: a settled choice leaves `inflight` while the others are still awaited.
    const waiting = pending.flatMap((p) => {
      const choice = result.has(p.input.space.id) ? undefined : this.inflight.get(p.key);
      return choice ? [{ id: p.input.space.id, choice }] : [];
    });
    for (const { id, choice } of waiting) result.set(id, await choice);
    return result;
  }

  /** One Jev request for all the given Spaces (one Choice question each), stored; never rejects. */
  private async choose(jev: JevJudge, pending: readonly Pending[]): Promise<Map<string, Caption>> {
    const ids = pending.map((_, i) => `s${i}`);
    const state = {
      spaces: Object.fromEntries(
        pending.map((p, i) => [
          ids[i],
          {
            name: { vi: p.input.space.nameVi, en: p.input.space.nameEn },
            kind: KIND_FOR_JEV[p.input.space.kind],
            readableTextsByType: p.input.counts,
            totalTexts: total(p.input.counts),
            unitTheSpaceCounts: { vi: p.input.space.unitVi, en: p.input.space.unitEn },
          },
        ]),
      ),
    };
    const questions: Record<string, JevChoiceQuestion> = Object.fromEntries(
      pending.map((p, i) => [
        ids[i],
        {
          type: 'choice',
          instructions:
            `Which caption should be printed under the crystal of the Space \`spaces.${ids[i]}\` ("${p.input.space.nameEn}") ` +
            'on the map of a knowledge base? Pick the clearest and most compact one: at a glance it should tell a reader how much ' +
            'there is to read in that Space and of what kind. Each option is the Vietnamese caption; its description is the English one.',
          criteria: Object.fromEntries(p.candidates.map((c) => [c.vi, `English: ${c.en}`])),
        },
      ]),
    );
    const chosen = new Map<string, Caption>();
    let tokens = 0;
    let failed = false;
    try {
      const { answers, usage } = await jev.choose('space-caption', state, questions);
      tokens = Math.ceil(usage.inputTokens / pending.length);
      pending.forEach((p, i) => {
        const picked = p.candidates.find((c) => c.vi === answers[ids[i] ?? '']?.choice);
        if (picked) chosen.set(p.key, picked);
      });
    } catch (error) {
      failed = true;
      console.warn('space captions: Jev unavailable, using the plain count', safeErrorText(error));
    }
    const at = this.now();
    try {
      for (const p of pending) {
        const picked = chosen.get(p.key);
        const caption = picked ?? fallbackCaption(total(p.input.counts));
        const values = {
          spaceId: p.input.space.id,
          signature: p.signature,
          captionVi: caption.vi,
          captionEn: caption.en,
          source: picked ? ('jev' as const) : ('fallback' as const),
          inputTokens: failed ? 0 : tokens,
          retryAfter: picked ? null : new Date(at.getTime() + FAILURE_RETRY_MS),
          createdAt: at,
        };
        await this.db
          .insert(spaceCaptions)
          .values(values)
          .onConflictDoUpdate({ target: [spaceCaptions.spaceId, spaceCaptions.signature], set: values });
        chosen.set(p.key, caption);
      }
    } catch (error) {
      // The page still gets its captions; the next view asks again.
      console.error('space captions: could not store', safeErrorText(error));
    }
    return chosen;
  }
}

/**
 * Stores the given captions (the C09 board's) for the counts each viewer sees now, as `seed` rows: with KB_SEED=mock
 * the Universe shows the board's text without asking Jev. `inputsPerViewer`: the caption inputs of each kind of
 * viewer (guest, the seed's owner…), so every signature they produce is covered.
 */
export async function storeSeedCaptions(db: Db, inputsPerViewer: ReadonlyArray<readonly CaptionInput[]>, captions: ReadonlyMap<string, Caption>, at: Date): Promise<number> {
  let stored = 0;
  for (const inputs of inputsPerViewer) {
    for (const input of inputs) {
      const caption = captions.get(input.space.id);
      if (!caption) continue;
      const values = {
        spaceId: input.space.id,
        signature: captionSignature(input, captionCandidates(input)),
        captionVi: caption.vi,
        captionEn: caption.en,
        source: 'seed' as const,
        inputTokens: 0,
        retryAfter: null,
        createdAt: at,
      };
      await db.insert(spaceCaptions).values(values).onConflictDoUpdate({ target: [spaceCaptions.spaceId, spaceCaptions.signature], set: values });
      stored += 1;
    }
  }
  return stored;
}
