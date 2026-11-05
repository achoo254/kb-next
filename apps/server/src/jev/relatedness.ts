/**
 * How related two pieces of knowledge are, as Jev judges them: one Score question per pair, on five described levels,
 * over items that sit in the state under short ids (docs.typesafe.ai, primitives/score). Used to suggest an edge of
 * the Graph (C13) and a connection between two Canvas cards (C15); the user accepts a suggestion, Jev never links on
 * its own. Any Jev failure rejects: the caller says the suggestions are unavailable.
 */
import type { JevJudge, JevQuestion, JevUsage } from './jev-client';

/** What Jev reads about an item: its title and a short text (summary, first passage, card body). */
export interface RelatednessItem {
  id: string;
  title: string;
  text: string;
}

export interface RelatedPair {
  a: string;
  b: string;
  /** 0–100: Jev's score over the levels, as the UI writes it ("0,82"). */
  relevance: number;
}

/** Pairs asked in one call (each is one Score question). */
export const MAX_PAIRS = 30;
/** Characters of an item's text Jev reads. */
const TEXT_CHARS = 500;
/** Lowest relevance (0–100) worth suggesting. */
export const MIN_SUGGESTED_RELEVANCE = 50;
export const RELATEDNESS_TIMEOUT_MS = 4_000;

const LEVELS = [
  'The two are about unrelated topics',
  'Same broad field, but reading one does not help with the other',
  'They share a concept: reading one helps to understand the other',
  'Closely related: one explains, extends or applies the other',
  'One is the direct prerequisite or the next step of the other',
];

const itemId = (i: number): string => `I${String(i + 1).padStart(2, '0')}`;
const pairId = (i: number): string => `P${String(i + 1).padStart(2, '0')}`;

/**
 * Scores the given pairs (ids of `items`; the first MAX_PAIRS only), best first, keeping those of at least
 * MIN_SUGGESTED_RELEVANCE.
 */
export async function scoreRelatedness(
  jev: JevJudge,
  purpose: string,
  items: readonly RelatednessItem[],
  pairs: ReadonlyArray<readonly [string, string]>,
): Promise<{ pairs: RelatedPair[]; usage: JevUsage }> {
  const asked = pairs.slice(0, MAX_PAIRS);
  if (asked.length === 0) return { pairs: [], usage: { inputTokens: 0, outputTokens: 0 } };
  const used = [...new Set(asked.flat())];
  const shortId = new Map(used.map((id, i) => [id, itemId(i)]));
  const byId = new Map(items.map((item) => [item.id, item]));
  const state = {
    items: Object.fromEntries(
      used.map((id) => {
        const item = byId.get(id);
        return [shortId.get(id), { title: item?.title ?? '', text: (item?.text ?? '').slice(0, TEXT_CHARS) }];
      }),
    ),
  };
  const questions: Record<string, JevQuestion> = Object.fromEntries(
    asked.map(([a, b], i) => [
      pairId(i),
      {
        type: 'score',
        instructions: `How related are \`items.${shortId.get(a) ?? ''}\` and \`items.${shortId.get(b) ?? ''}\` for someone learning the topic? They may be in English or Vietnamese.`,
        criteria: LEVELS,
      },
    ]),
  );
  const { answers, usage } = await jev.ask(purpose, state, questions, { timeoutMs: RELATEDNESS_TIMEOUT_MS });
  const top = LEVELS.length - 1;
  const scored = asked
    .flatMap(([a, b], i): RelatedPair[] => {
      const answer = answers[pairId(i)];
      if (answer?.type !== 'score') return [];
      const relevance = Math.round(Math.min(1, Math.max(0, answer.score / top)) * 100);
      return relevance >= MIN_SUGGESTED_RELEVANCE ? [{ a, b, relevance }] : [];
    })
    .sort((x, y) => y.relevance - x.relevance);
  return { pairs: scored, usage };
}
