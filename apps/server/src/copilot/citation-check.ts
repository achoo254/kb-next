/**
 * Jev checks the answer's citations (F02 "Trích dẫn mất"): every sentence carrying `[n]` becomes a claim, and one Noul
 * per (claim, cited source) asks whether that source supports it. A citation number is `supported` when every claim
 * citing it is; a number no source has is never supported. Code blocks (the Mermaid diagram) are not claims.
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
}

/** (claim, cited source) pairs checked at most, one question each; sources are at most 5, so every number fits. */
const MAX_QUESTIONS = 30;
/** At least this probability that the source supports the claim. */
export const MIN_SUPPORT = 0.5;
const SOURCE_CHARS = 1_800;

const CITATION = /\[(\d{1,2})\]/g;
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
    for (const match of line.matchAll(SENTENCE)) {
      const sentence = match[0].trim();
      const numbers = [...new Set([...sentence.matchAll(CITATION)].map((m) => Number(m[1])))];
      if (numbers.length > 0) claims.push({ sentence: sentence.replace(CITATION, '').replace(/\s+([.!?…])/g, '$1').trim(), numbers });
    }
  }
  return claims;
}

/** Every number cited in `answer`, each with whether its sources support it; rejects on any Jev failure. */
export async function checkCitations(jev: JevJudge, answer: string, sources: readonly CheckSource[]): Promise<CitationCheck[]> {
  const claims = citedSentences(answer);
  const byNumber = new Map(sources.map((s) => [s.n, s]));
  const all = claims.flatMap((claim, c) => claim.numbers.filter((n) => byNumber.has(n)).map((n) => ({ key: `C${c + 1}_S${n}`, claim: c, n })));
  // Past the cap, every cited number still gets its first claim checked, so none is left without a verdict.
  const firsts = all.filter((p, i) => all.findIndex((q) => q.n === p.n) === i);
  const pairs = [...firsts, ...all.filter((p) => !firsts.includes(p))].slice(0, MAX_QUESTIONS);
  const verdicts = new Map<number, boolean>();
  for (const claim of claims) for (const n of claim.numbers) if (!byNumber.has(n)) verdicts.set(n, false);

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
      const supported = answer?.type === 'noul' && answer.noul >= MIN_SUPPORT;
      verdicts.set(p.n, (verdicts.get(p.n) ?? true) && supported);
    }
  }
  return [...verdicts].map(([n, supported]) => ({ n, supported })).sort((a, b) => a.n - b.n);
}
