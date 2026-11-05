/**
 * Jev's "gợi ý bước tiếp theo" of the journey builder (C07): one Choice question over documents of the journey's
 * Space it does not hold yet, each described by its title and summary; the options Jev finds most likely become the
 * suggestions, with their probability. Jev only suggests: the author adds a step or not. Any Jev failure rejects, so
 * the caller says the suggestions are unavailable.
 */
import { JEV_MAX_CHOICE_OPTIONS, type JevJudge } from './jev-client';

export interface NextStepCandidate {
  id: string;
  title: string;
  /** A line on what the document is about (its summary, else its first sentence). */
  text: string;
}

export interface NextStepSuggestion {
  id: string;
  /** 0–1: Jev's probability that this is the best next step. */
  probability: number;
}

/** Suggestions shown, best first. */
export const NEXT_STEP_SUGGESTIONS = 3;
/** Options Jev reads in one call (well under the Choice limit, to keep the call small). */
export const MAX_NEXT_STEP_OPTIONS = Math.min(30, JEV_MAX_CHOICE_OPTIONS - 1);
/** Lowest probability worth suggesting. */
export const MIN_NEXT_STEP_PROBABILITY = 0.05;
const TEXT_CHARS = 240;
const NONE = 'none';

const optionId = (i: number): string => `d${i + 1}`;

/** The best next steps after the journey's `steps` (their titles, in order), among the first MAX_NEXT_STEP_OPTIONS candidates. */
export async function suggestNextSteps(jev: JevJudge, journey: { title: string; steps: readonly string[] }, candidates: readonly NextStepCandidate[]): Promise<NextStepSuggestion[]> {
  const offered = candidates.slice(0, MAX_NEXT_STEP_OPTIONS);
  if (offered.length === 0) return [];
  const describe = (c: NextStepCandidate): string => {
    const text = c.text.trim().slice(0, TEXT_CHARS);
    return text ? `${c.title}: ${text}` : c.title;
  };
  const state = { journey: { title: journey.title, steps: journey.steps.map((title, i) => ({ n: i + 1, title })) } };
  const { answers } = await jev.ask('journey-next-step', state, {
    next: {
      type: 'choice',
      instructions:
        'A learner follows the `journey`: its steps in order, each one a document to read or practise. Which of these documents is the best step to add right after its last step (or the first step, when it has none)?',
      criteria: {
        ...Object.fromEntries(offered.map((c, i) => [optionId(i), describe(c)])),
        [NONE]: 'None of these documents fits as a next step of this journey',
      },
    },
  });
  const answer = answers.next;
  if (answer?.type !== 'choice') return [];
  return offered
    .map((c, i) => ({ id: c.id, probability: answer.probabilities[optionId(i)] ?? (answer.choice === optionId(i) ? answer.confidence : 0) }))
    .filter((s) => s.probability >= MIN_NEXT_STEP_PROBABILITY)
    .sort((a, b) => b.probability - a.probability)
    .slice(0, NEXT_STEP_SUGGESTIONS)
    .map((s) => ({ id: s.id, probability: Math.round(s.probability * 100) / 100 }));
}
