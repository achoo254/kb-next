/**
 * TypeSafe Jev (System One, https://docs.typesafe.ai/api/system-one): typed judgments over a `state`, never
 * generated text. The server asks Choice questions (the crystal captions, which document answers a search) and
 * Score and Noul questions (how well a passage answers a search, whether anything does). Every call logs one
 * structured line with its token usage and estimated cost (never the key, the state or the answers), so the cost
 * can be reported with the other AI costs; the same line goes to an optional usage sink (the daily totals in
 * Postgres, src/jev/jev-usage.ts).
 */
import { z } from 'zod';
import { safeErrorText } from '../log-error';

const API = 'https://api.typesafe.ai/v1/systemone';
const MODEL = 'jev-latest';
/** USD per million input tokens on the TypeSafe console (output tokens are free); for the cost estimate in logs. */
export const JEV_USD_PER_MTOK = 0.042;
/** A Choice question takes at most this many options (docs.typesafe.ai, primitives/choice). */
export const JEV_MAX_CHOICE_OPTIONS = 255;
/** A Score question takes at most this many levels (docs.typesafe.ai, primitives/score). */
export const JEV_MAX_SCORE_LEVELS = 10;

/**
 * A Choice question: `criteria` maps each option name to its description (null when the name, or the state, says
 * it all). `instructions` and descriptions may be structured (objects), as the API allows.
 */
export interface JevChoiceQuestion {
  type: 'choice';
  instructions: string;
  criteria: Record<string, string | Record<string, string> | null>;
}

/** A Score question: `criteria` are the levels, lowest first, each a situation the model can match. */
export interface JevScoreQuestion {
  type: 'score';
  instructions: string;
  criteria: string[];
}

/** A Noul question: how likely the answer is yes, 0–1; `criteria` say what counts as true and false. */
export interface JevNoulQuestion {
  type: 'noul';
  instructions: string;
  criteria?: { true: string; false: string };
}

export type JevQuestion = JevChoiceQuestion | JevScoreQuestion | JevNoulQuestion;

export interface JevChoiceAnswer {
  choice: string;
  confidence: number;
}

/** Full answers of `ask`: a probability for every option or level. */
export type JevAnswer =
  | { type: 'choice'; choice: string; confidence: number; probabilities: Record<string, number> }
  | { type: 'score'; score: number; confidence: number; probabilities: Record<string, number> }
  | { type: 'noul'; noul: number };

export interface JevUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface JevChoiceResult {
  answers: Record<string, JevChoiceAnswer>;
  usage: JevUsage;
}

export interface JevResult {
  answers: Record<string, JevAnswer>;
  usage: JevUsage;
}

export interface JevCallOptions {
  /** This call's deadline, instead of the client's default. */
  timeoutMs?: number;
}

/** What the server asks Jev; tests replace it at this boundary. */
export interface JevJudge {
  /** `purpose` names the feature in the usage log. Rejects on any failure, timeout included. */
  choose(purpose: string, state: unknown, questions: Record<string, JevChoiceQuestion>): Promise<JevChoiceResult>;
  /** Any mix of Choice, Score and Noul questions, with their full answers. Rejects on any failure, timeout included. */
  ask(purpose: string, state: unknown, questions: Record<string, JevQuestion>, options?: JevCallOptions): Promise<JevResult>;
}

const Probabilities = z.record(z.string(), z.number());
const AnswerSchema = z.union([
  z.object({ type: z.literal('choice'), choice: z.string(), confidence: z.number().optional(), probabilities: Probabilities.optional() }),
  z.object({ type: z.literal('score'), score: z.number(), confidence: z.number().optional(), probabilities: Probabilities.optional() }),
  z.object({ type: z.literal('noul'), noul: z.number() }),
  // Another type (a future one, or Box): kept out of the answers.
  z.object({ type: z.string() }),
]);

const ResponseSchema = z.object({
  model: z.string().optional(),
  answers: z.record(z.string(), AnswerSchema),
  usage: z.object({ input_tokens: z.number().optional(), output_tokens: z.number().optional() }).optional(),
});

export interface JevUsageLog {
  event: 'jev-call';
  purpose: string;
  model: string;
  ok: boolean;
  status: number | null;
  ms: number;
  questions: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

function toAnswer(answer: z.infer<typeof AnswerSchema>): JevAnswer | null {
  if ('choice' in answer) return { type: 'choice', choice: answer.choice, confidence: answer.confidence ?? 0, probabilities: answer.probabilities ?? {} };
  if ('score' in answer) return { type: 'score', score: answer.score, confidence: answer.confidence ?? 0, probabilities: answer.probabilities ?? {} };
  if ('noul' in answer) return { type: 'noul', noul: answer.noul };
  return null;
}

export class JevClient implements JevJudge {
  constructor(
    private readonly apiKey: string,
    /** Default whole-call deadline: callers wait on it inside a page request. */
    private readonly timeoutMs: number = 3_000,
    private readonly log: (line: JevUsageLog) => void = (line) => console.log(JSON.stringify(line)),
  ) {}

  async choose(purpose: string, state: unknown, questions: Record<string, JevChoiceQuestion>): Promise<JevChoiceResult> {
    const { answers, usage } = await this.ask(purpose, state, questions);
    const choices: Record<string, JevChoiceAnswer> = {};
    for (const [name, answer] of Object.entries(answers)) {
      if (answer.type === 'choice') choices[name] = { choice: answer.choice, confidence: answer.confidence };
    }
    return { answers: choices, usage };
  }

  async ask(purpose: string, state: unknown, questions: Record<string, JevQuestion>, options: JevCallOptions = {}): Promise<JevResult> {
    const started = Date.now();
    let status: number | null = null;
    let model = MODEL;
    let usage: JevUsage = { inputTokens: 0, outputTokens: 0 };
    let ok = false;
    try {
      // One attempt only: a retry on 429/529 would not fit the deadline of a page request.
      const res = await fetch(API, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: MODEL, state, questions }),
        signal: AbortSignal.timeout(options.timeoutMs ?? this.timeoutMs),
      });
      status = res.status;
      const body = ResponseSchema.safeParse(await res.json().catch(() => null));
      if (!res.ok || !body.success) throw new Error(`Jev answered ${res.status}`);
      model = body.data.model ?? MODEL;
      usage = { inputTokens: body.data.usage?.input_tokens ?? 0, outputTokens: body.data.usage?.output_tokens ?? 0 };
      const answers: Record<string, JevAnswer> = {};
      for (const [name, raw] of Object.entries(body.data.answers)) {
        const answer = toAnswer(raw);
        if (answer) answers[name] = answer;
      }
      ok = true;
      return { answers, usage };
    } catch (error) {
      throw new Error(`Jev ${purpose} failed: ${safeErrorText(error)}`, { cause: error });
    } finally {
      this.log({
        event: 'jev-call',
        purpose,
        model,
        ok,
        status,
        ms: Date.now() - started,
        questions: Object.keys(questions).length,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        costUsd: (usage.inputTokens / 1_000_000) * JEV_USD_PER_MTOK,
      });
    }
  }
}
