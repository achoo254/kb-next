/**
 * Jev checks the answer's citations (F02 "Trích dẫn mất"): every sentence carrying `[n]` becomes a claim, and one Noul
 * per (claim, cited source) asks whether that source supports it. The result has one entry per `[n]` written in the
 * answer, in the order they appear (code blocks and inline code skipped, as the web renders them), so the web marks
 * exactly the sentence a source does not back, not every sentence citing that source. A number no source has is left
 * out (the web shows it as plain text); a pair past the question cap stays unchecked and is not flagged.
 */
import type { JevJudge, JevQuestion } from '../jev/jev-client';
import { excerpt } from '../search/document-summaries';
import { ASK_JEV_TIMEOUT_MS } from './passages';

export interface CitationCheck {
  n: number;
  supported: boolean;
}

export interface CheckSource {
  n: number;
  title: string;
  section: string | null;
  text: string;
}

export interface Claim {
  sentence: string;
  numbers: number[];
  /** Every `[n]` of the sentence in writing order, repeats included (the numbers the web shows, one each). */
  cites: number[];
}

/** (claim, cited source) pairs checked at most, one question each; sources are at most 5, so every number fits. */
const MAX_QUESTIONS = 30;
/** At least this probability that the source supports the claim. */
export const MIN_SUPPORT = 0.5;
const SOURCE_CHARS = 1_800;

const CITATION = /\[(\d{1,2})\]/g;
/** Inline code, whose `[n]` the web shows as code, not as a citation. */
const INLINE_CODE = /`[^`\n]*`/g;
/** A sentence: up to a stop followed by a space or the line's end, with the citations written after the stop. */
const SENTENCE = /.+?(?:[.!?…]+(?=\s|$)(?:\s*\[\d{1,2}\])*|$)/g;

/** The sentences of `answer` that cite something, outside code blocks, with the numbers each cites. */
export function citedSentences(answer: string): Claim[] {
  const claims: Claim[] = [];
  let fenced = false;
  for (const line of answer.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    for (const match of line.replace(INLINE_CODE, (code) => ' '.repeat(code.length)).matchAll(SENTENCE)) {
      const sentence = match[0].trim();
      const cites = [...sentence.matchAll(CITATION)].map((m) => Number(m[1]));
      const numbers = [...new Set(cites)];
      if (numbers.length > 0) claims.push({ sentence: sentence.replace(CITATION, '').replace(/\s+([.!?…])/g, '$1').trim(), numbers, cites });
    }
  }
  return claims;
}

/**
 * One verdict per citation of a known source in `answer`, in writing order: whether that source supports the sentence
 * it closes. Rejects on any Jev failure.
 */
export async function checkCitations(jev: JevJudge, answer: string, sources: readonly CheckSource[]): Promise<CitationCheck[]> {
  const claims = citedSentences(answer);
  const byNumber = new Map(sources.map((s) => [s.n, s]));
  const all = claims.flatMap((claim, c) => claim.numbers.filter((n) => byNumber.has(n)).map((n) => ({ key: `C${c + 1}_S${n}`, claim: c, n })));
  // Past the cap, every cited number still gets its first claim checked, so none is left without a verdict.
  const firsts = all.filter((p, i) => all.findIndex((q) => q.n === p.n) === i);
  const pairs = [...firsts, ...all.filter((p) => !firsts.includes(p))].slice(0, MAX_QUESTIONS);
  /** Verdict per (claim, number); a pair missing from it was not asked (past the cap). */
  const verdicts = new Map<string, boolean>();

  if (pairs.length > 0) {
    const cited = [...new Set(pairs.map((p) => p.n))];
    const state = {
      sources: Object.fromEntries(
        cited.map((n) => {
          const s = byNumber.get(n);
          return [`S${n}`, { document: s?.title ?? '', section: s?.section ?? null, text: excerpt(s?.text ?? '', SOURCE_CHARS) }];
        }),
      ),
      claims: Object.fromEntries([...new Set(pairs.map((p) => p.claim))].map((c) => [`C${c + 1}`, claims[c]?.sentence ?? ''])),
    };
    const questions: Record<string, JevQuestion> = Object.fromEntries(
      pairs.map((p) => [
        p.key,
        {
          type: 'noul' as const,
          instructions: `Does the source \`sources.S${p.n}\` support the claim \`claims.C${p.claim + 1}\`? They may be in different languages.`,
          criteria: {
            true: 'The source states what the claim says, or something that directly implies it',
            false: 'The source does not say it, says something else, or contradicts it',
          },
        },
      ]),
    );
    const { answers } = await jev.ask('ask-check', state, questions, { timeoutMs: ASK_JEV_TIMEOUT_MS });
    for (const p of pairs) {
      const answer = answers[p.key];
      verdicts.set(p.key, answer?.type === 'noul' && answer.noul >= MIN_SUPPORT);
    }
  }
  // Only citations of a listed source: the web renders an unknown `[n]` as plain text, so it has no place in the order.
  return claims.flatMap((claim, c) =>
    claim.cites.filter((n) => byNumber.has(n)).map((n) => ({ n, supported: verdicts.get(`C${c + 1}_S${n}`) ?? true })),
  );
}
