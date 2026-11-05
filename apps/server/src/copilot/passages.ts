/**
 * Which passages the Copilot answers from. The layered search (src/search/layered-search.ts) finds candidates in the
 * scope; one Jev call (`ask-passages`) then asks, over those candidates, a Noul "is there enough here to answer the
 * question" and a Score per passage, and the best rated become the sources. Below MIN_ENOUGH, or with no passage rated
 * useful, the knowledge base has no answer and the user's provider is never called.
 */
import type { JevJudge, JevQuestion } from '../jev/jev-client';
import { excerpt } from '../search/document-summaries';
import type { Found, LayeredSearchResult } from '../search/layered-search';

/** Candidates Jev reads. */
export const MAX_CANDIDATES = 12;
/** Passages given to the model (and shown as sources). */
export const MAX_SOURCES = 5;
/** Below this "enough to answer" probability the answer is NO_ANSWER. */
export const MIN_ENOUGH = 0.4;
/** Lowest rating (0–1) a passage needs to be a source. */
export const MIN_PASSAGE_RELEVANCE = 0.5;
/** Characters of a passage Jev reads. */
const PASSAGE_CHARS = 1_200;
/** Jev reads more here than in the search: a longer deadline (the user is already waiting on the answer). */
export const ASK_JEV_TIMEOUT_MS = 6_000;

const LEVELS = [
  'The passage is about something else than the question',
  'The passage is on a related topic but does not help answer the question',
  'The passage answers part of the question or gives a fact the answer needs',
  'The passage directly answers the question',
];

const passageId = (i: number): string => `P${String(i + 1).padStart(2, '0')}`;

/** Passages Jev rated (best first), then those only keyword search found, one entry per passage. */
export function candidatesOf(search: Pick<LayeredSearchResult, 'keywordFound' | 'meaningFound'>): Found[] {
  const seen = new Set<string>();
  const out: Found[] = [];
  for (const found of [...search.meaningFound, ...search.keywordFound]) {
    if (seen.has(found.chunk.id)) continue;
    seen.add(found.chunk.id);
    out.push(found);
    if (out.length >= MAX_CANDIDATES) break;
  }
  return out;
}

export interface PassageChoice {
  /** The sources, best rated first (at most MAX_SOURCES). */
  passages: Found[];
  /** Jev's probability that the candidates are enough to answer; null when it gave none (the ratings decide). */
  enough: number | null;
  /** The language the question is written in, as Jev reads it; null when it gave none. */
  language: AnswerLanguage | null;
}

export type AnswerLanguage = 'vi' | 'en';

/** Letters only Vietnamese uses (beyond plain Latin): their presence settles the language without Jev. */
const VIETNAMESE_LETTERS = /[ăâđêôơưàảãáạằẳẵắặầẩẫấậèẻẽéẹềểễếệìỉĩíịòỏõóọồổỗốộờởỡớợùủũúụừửữứựỳỷỹýỵ]/i;

/**
 * The language to answer in when Jev gave none: Vietnamese when the text has a Vietnamese letter, else English
 * (Vietnamese typed without its marks reads as English here; Jev tells them apart when it is on).
 */
export function guessLanguage(text: string): AnswerLanguage {
  return VIETNAMESE_LETTERS.test(text) ? 'vi' : 'en';
}

/** Whether the choice answers: something rated useful, and Jev did not find the whole set too thin. */
export function hasAnswer(choice: PassageChoice): boolean {
  return choice.passages.length > 0 && (choice.enough === null || choice.enough >= MIN_ENOUGH);
}

/** One Jev call over the candidates; rejects on any Jev failure (the caller falls back to keyword order). */
export async function choosePassages(jev: JevJudge, question: string, candidates: readonly Found[]): Promise<PassageChoice> {
  if (candidates.length === 0) return { passages: [], enough: null, language: null };
  const state = {
    question,
    passages: Object.fromEntries(
      candidates.map((c, i) => [passageId(i), { document: c.doc.title, section: c.chunk.heading, text: excerpt(c.chunk.text, PASSAGE_CHARS) }]),
    ),
  };
  const questions: Record<string, JevQuestion> = {
    enough: {
      type: 'noul',
      instructions:
        'Do the passages of `passages`, taken together, contain enough information to answer `question`? ' +
        'The question and the passages may be in different languages (English, Vietnamese).',
      criteria: {
        true: 'The passages state what the answer needs, at least its main part',
        false: 'The passages are about other things, or only name the topic without what the question asks',
      },
    },
    // Asked here, in the same call, so the answer's language costs no extra request: models tend to follow the
    // sources' language (mostly Vietnamese) instead of the question's when only told "the question's language".
    language: {
      type: 'choice',
      instructions: 'Which language is `question` written in? Vietnamese typed without its accent marks is still Vietnamese.',
      criteria: { vi: 'Vietnamese', en: 'English, or any language other than Vietnamese' },
    },
    ...Object.fromEntries(
      candidates.map((_, i) => [
        passageId(i),
        {
          type: 'score' as const,
          instructions: `How well does the passage \`passages.${passageId(i)}\` help answer \`question\`? Judge that passage alone; they may be in different languages.`,
          criteria: LEVELS,
        },
      ]),
    ),
  };
  const { answers } = await jev.ask('ask-passages', state, questions, { timeoutMs: ASK_JEV_TIMEOUT_MS });
  const enoughAnswer = answers.enough;
  const top = LEVELS.length - 1;
  const passages = candidates
    .flatMap((c, i): Found[] => {
      const answer = answers[passageId(i)];
      if (answer?.type !== 'score') return [];
      const relevance = Math.min(1, Math.max(0, answer.score / top));
      return relevance >= MIN_PASSAGE_RELEVANCE ? [{ ...c, relevance }] : [];
    })
    .sort((a, b) => (b.relevance ?? 0) - (a.relevance ?? 0))
    .slice(0, MAX_SOURCES);
  const languageAnswer = answers.language;
  const language = languageAnswer?.type === 'choice' && (languageAnswer.choice === 'vi' || languageAnswer.choice === 'en') ? languageAnswer.choice : null;
  return { passages, enough: enoughAnswer?.type === 'noul' ? enoughAnswer.noul : null, language };
}
