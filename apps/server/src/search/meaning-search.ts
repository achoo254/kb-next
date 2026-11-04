/**
 * Search by meaning with Jev, across languages (an English question finds a Vietnamese lab), in two calls:
 * 1. `search-documents`: one Choice over the candidate documents (their bilingual title and summary, or title and
 *    first passage) asks which one the query is about, and one Noul asks whether any of them is. The documents sit in
 *    the state, tagged with short ids, and the Choice options are those ids (docs.typesafe.ai, "Line-by-line search").
 *    A Choice takes at most 255 options: the caller orders the candidates by preference and only the first 255 go.
 * 2. `search-passages`: one Score question per passage of the documents chosen (the most probable ones) rates how
 *    well that passage answers the query, on four described levels.
 * Passages rated at least MIN_RELEVANCE come back, best first. Any Jev failure rejects: the caller falls back to the
 * keyword results and says so.
 */
import type { ChunkRow } from '../access/content';
import { JEV_MAX_CHOICE_OPTIONS, type JevAnswer, type JevJudge, type JevQuestion, type JevUsage } from '../jev/jev-client';
import { excerpt } from './document-summaries';

/** What Jev reads about a candidate document: its title (both languages when known) and a summary. */
export interface MeaningCandidate {
  documentId: string;
  title: { vi?: string; en?: string };
  summary: { vi?: string; en?: string };
}

export interface MeaningHit {
  documentId: string;
  chunkId: string;
  /** How well the passage answers the query, 0–1 (Jev's score over its four levels). */
  relevance: number;
  /** How probable Jev found the document, 0–1 (ties between passages go to the more probable document). */
  documentProbability: number;
}

export interface MeaningOutcome {
  hits: MeaningHit[];
  /** Calls made and their tokens, summed (also in the `jev-call` log lines and the daily totals). */
  calls: number;
  usage: JevUsage;
}

/** Documents whose passages are rated: the most probable, then any within reach of it. */
export const MAX_CHOSEN_DOCUMENTS = 3;
/** A document is rated too when Jev gives it at least this probability (and at least a quarter of the top one). */
const MIN_DOCUMENT_PROBABILITY = 0.1;
/** Below this "does any document address the query" probability, nothing is rated (no meaning results). */
export const MIN_EXISTS = 0.3;
const PASSAGES_PER_DOCUMENT = 8;
/** Characters of a passage Jev reads. */
const PASSAGE_CHARS = 900;
/** Lowest relevance (0–1) a passage needs to be a result. */
export const MIN_RELEVANCE = 0.5;
/** Each call's deadline: the page waits on both. */
export const JEV_SEARCH_TIMEOUT_MS = 2_500;

const PASSAGE_LEVELS = [
  'The passage is about something else than the query',
  'The passage is on a related topic but does not help answer the query',
  'The passage answers part of the query or gives a fact that helps answer it',
  'The passage directly answers the query',
];

/** Loads the passages of the chosen documents (through src/access/, for the same viewer). */
export type PassageLoader = (documentIds: readonly string[], perDocument: number) => Promise<ChunkRow[]>;

function addUsage(total: JevUsage, usage: JevUsage): JevUsage {
  return { inputTokens: total.inputTokens + usage.inputTokens, outputTokens: total.outputTokens + usage.outputTokens };
}

const optionId = (i: number): string => `D${String(i + 1).padStart(3, '0')}`;
const passageId = (i: number): string => `P${String(i + 1).padStart(2, '0')}`;

function noulOf(answer: JevAnswer | undefined): number | null {
  return answer?.type === 'noul' ? answer.noul : null;
}

/** The documents to rate, most probable first, from the Choice probabilities. */
export function chosenDocuments(probabilities: Record<string, number>, ids: ReadonlyMap<string, string>): Array<{ documentId: string; probability: number }> {
  const ranked = Object.entries(probabilities)
    .flatMap(([option, probability]) => {
      const documentId = ids.get(option);
      return documentId ? [{ documentId, probability }] : [];
    })
    .sort((a, b) => b.probability - a.probability);
  const top = ranked[0]?.probability ?? 0;
  return ranked.filter((d, i) => i === 0 || (d.probability >= MIN_DOCUMENT_PROBABILITY && d.probability >= top / 4)).slice(0, MAX_CHOSEN_DOCUMENTS);
}

export async function searchByMeaning(jev: JevJudge, query: string, candidates: readonly MeaningCandidate[], loadPassages: PassageLoader): Promise<MeaningOutcome> {
  const offered = candidates.slice(0, JEV_MAX_CHOICE_OPTIONS);
  if (offered.length === 0) return { hits: [], calls: 0, usage: { inputTokens: 0, outputTokens: 0 } };

  const ids = new Map(offered.map((c, i) => [optionId(i), c.documentId]));
  const documentState = {
    documents: Object.fromEntries(offered.map((c, i) => [optionId(i), { title: c.title, summary: c.summary }])),
  };
  const documentQuestions: Record<string, JevQuestion> = {
    document: {
      type: 'choice',
      instructions:
        `Which document of \`documents\` best answers or covers the search query "${query}"? ` +
        'The query may be in English or Vietnamese; each document has a title and a summary in either language or both.',
      criteria: Object.fromEntries([...ids.keys()].map((id) => [id, null])),
    },
    exists: {
      type: 'noul',
      instructions: `Does any document of \`documents\` address the search query "${query}"?`,
      criteria: {
        true: 'At least one document is about what the query asks, so reading it would help answer it',
        false: 'No document is about what the query asks',
      },
    },
  };
  const first = await jev.ask('search-documents', documentState, documentQuestions, { timeoutMs: JEV_SEARCH_TIMEOUT_MS });
  let usage = first.usage;
  const choice = first.answers.document;
  const exists = noulOf(first.answers.exists);
  if (choice?.type !== 'choice' || (exists !== null && exists < MIN_EXISTS)) return { hits: [], calls: 1, usage };

  // An answer without its distribution still names its choice.
  const probabilities = Object.keys(choice.probabilities).length > 0 ? choice.probabilities : { [choice.choice]: 1 };
  const chosen = chosenDocuments(probabilities, ids);
  const probabilityOf = new Map(chosen.map((d) => [d.documentId, d.probability]));
  const titleOf = new Map(offered.map((c) => [c.documentId, c.title.vi ?? c.title.en ?? '']));
  const passages = await loadPassages(
    chosen.map((d) => d.documentId),
    PASSAGES_PER_DOCUMENT,
  );
  if (passages.length === 0) return { hits: [], calls: 1, usage };

  const passageState = {
    query,
    passages: Object.fromEntries(
      passages.map((p, i) => [passageId(i), { document: titleOf.get(p.documentId) ?? '', section: p.heading, text: excerpt(p.text, PASSAGE_CHARS) }]),
    ),
  };
  const passageQuestions: Record<string, JevQuestion> = Object.fromEntries(
    passages.map((_, i) => [
      passageId(i),
      {
        type: 'score',
        instructions: `How well does the passage \`passages.${passageId(i)}\` answer the search query \`query\`? Judge that passage alone; the query and the passage may be in different languages.`,
        criteria: PASSAGE_LEVELS,
      },
    ]),
  );
  const second = await jev.ask('search-passages', passageState, passageQuestions, { timeoutMs: JEV_SEARCH_TIMEOUT_MS });
  usage = addUsage(usage, second.usage);

  const top = PASSAGE_LEVELS.length - 1;
  const hits = passages
    .flatMap((p, i): MeaningHit[] => {
      const answer = second.answers[passageId(i)];
      if (answer?.type !== 'score') return [];
      const relevance = Math.min(1, Math.max(0, answer.score / top));
      return relevance >= MIN_RELEVANCE ? [{ documentId: p.documentId, chunkId: p.id, relevance, documentProbability: probabilityOf.get(p.documentId) ?? 0 }] : [];
    })
    .sort((a, b) => b.relevance - a.relevance || b.documentProbability - a.documentProbability);
  return { hits, calls: 2, usage };
}
