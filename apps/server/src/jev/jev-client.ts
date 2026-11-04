/**
 * TypeSafe Jev (System One, https://docs.typesafe.ai/api/system-one): typed judgments over a `state`, never
 * generated text. The server only asks Choice questions so far (the crystal captions). Every call logs one
 * structured line with its token usage and estimated cost (never the key, the state or the answers), so the cost
 * can be reported with the other AI costs.
 */
import { z } from 'zod';
import { safeErrorText } from '../log-error';

const API = 'https://api.typesafe.ai/v1/systemone';
const MODEL = 'jev-latest';
/** USD per million input tokens on the TypeSafe console (output tokens are free); for the cost estimate in logs. */
export const JEV_USD_PER_MTOK = 0.042;

/** A Choice question: `criteria` maps each option name to its description (null when the name says it all). */
export interface JevChoiceQuestion {
  type: 'choice';
  instructions: string;
  criteria: Record<string, string | null>;
}

export interface JevChoiceAnswer {
  choice: string;
  confidence: number;
}

export interface JevUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface JevChoiceResult {
  answers: Record<string, JevChoiceAnswer>;
  usage: JevUsage;
}

/** What the server asks Jev; tests replace it at this boundary. */
export interface JevJudge {
  /** `purpose` names the feature in the usage log. Rejects on any failure, timeout included. */
  choose(purpose: string, state: unknown, questions: Record<string, JevChoiceQuestion>): Promise<JevChoiceResult>;
}

const ResponseSchema = z.object({
  model: z.string().optional(),
  answers: z.record(z.string(), z.object({ type: z.string(), choice: z.string().optional(), confidence: z.number().optional() })),
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

export class JevClient implements JevJudge {
  constructor(
    private readonly apiKey: string,
    /** Whole-call deadline: callers wait on it inside a page request. */
    private readonly timeoutMs: number = 3_000,
    private readonly log: (line: JevUsageLog) => void = (line) => console.log(JSON.stringify(line)),
  ) {}

  async choose(purpose: string, state: unknown, questions: Record<string, JevChoiceQuestion>): Promise<JevChoiceResult> {
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
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      status = res.status;
      const body = ResponseSchema.safeParse(await res.json().catch(() => null));
      if (!res.ok || !body.success) throw new Error(`Jev answered ${res.status}`);
      model = body.data.model ?? MODEL;
      usage = { inputTokens: body.data.usage?.input_tokens ?? 0, outputTokens: body.data.usage?.output_tokens ?? 0 };
      const answers: Record<string, JevChoiceAnswer> = {};
      for (const [name, answer] of Object.entries(body.data.answers)) {
        if (answer.type === 'choice' && answer.choice !== undefined) answers[name] = { choice: answer.choice, confidence: answer.confidence ?? 0 };
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
