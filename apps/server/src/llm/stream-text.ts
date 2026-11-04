/**
 * One streaming interface over the three providers: `streamText` yields the model's text as it arrives.
 * - OpenAI: Chat Completions with `stream: true` (`choices[0].delta.content`, then `data: [DONE]`);
 * - Gemini: `streamGenerateContent?alt=sse` (`candidates[0].content.parts[].text`, thought parts skipped), thinking
 *   lowered to `MINIMAL` on Gemini 3+ with room for it in `maxOutputTokens`;
 * - Anthropic: Messages with `stream: true` (`content_block_delta` / `text_delta`), thinking disabled on Haiku 5.x and
 *   at its lowest on Sonnet 5.5.
 * A refused call throws ProviderError with what it means for the key (src/llm/providers.ts, `classifyFailure`); a
 * stream that breaks or reports an error midway throws ProviderError('failed') after the text already yielded.
 * Each call logs one line (provider, model, outcome, status, time): never the key, the prompt or the answer.
 */
import { type AiProvider, type Failure, type ProviderBases, authHeaders, classifyFailure } from './providers';

export interface LlmCall {
  provider: AiProvider;
  model: string;
  apiKey: string;
}

export interface LlmPrompt {
  system: string;
  user: string;
  maxOutputTokens: number;
  temperature?: number;
}

export class ProviderError extends Error {
  constructor(
    readonly kind: Failure,
    readonly status: number | null,
  ) {
    super(`provider call ${kind}${status === null ? '' : ` (HTTP ${status})`}`);
    this.name = 'ProviderError';
  }
}

/** Gemini 3+ thinks before answering; it is held to MINIMAL and given this many extra output tokens for it. */
export const GEMINI_THINKING_HEADROOM = 2_000;
/** The whole call, stream included. */
const CALL_TIMEOUT_MS = 120_000;
/** Of an error answer, only this much is read (to classify it). */
const ERROR_BODY_CHARS = 4_000;

function geminiThinking(model: string): { thinkingLevel: 'MINIMAL' } | null {
  const major = Number(/^gemini-(\d+)/.exec(model)?.[1] ?? 0);
  return major >= 3 ? { thinkingLevel: 'MINIMAL' } : null;
}

/** The lowest thinking each Claude model takes: Haiku 5.x can turn it off, Sonnet 5.5 only skips the first pass. */
function anthropicThinking(model: string): { type: string } | null {
  if (model.startsWith('claude-haiku-5')) return { type: 'disabled' };
  if (model.startsWith('claude-sonnet-5-5')) return { type: 'between_tools' };
  return null;
}

/** URL and JSON body of a streaming call. */
export function streamRequest(bases: ProviderBases, call: LlmCall, prompt: LlmPrompt): { url: string; body: Record<string, unknown> } {
  const temperature = prompt.temperature ?? 0.2;
  switch (call.provider) {
    case 'openai':
      return {
        url: `${bases.openai}/v1/chat/completions`,
        body: {
          model: call.model,
          stream: true,
          temperature,
          max_completion_tokens: prompt.maxOutputTokens,
          messages: [
            { role: 'system', content: prompt.system },
            { role: 'user', content: prompt.user },
          ],
        },
      };
    case 'gemini': {
      const thinking = geminiThinking(call.model);
      return {
        url: `${bases.gemini}/v1beta/models/${encodeURIComponent(call.model)}:streamGenerateContent?alt=sse`,
        body: {
          systemInstruction: { parts: [{ text: prompt.system }] },
          contents: [{ role: 'user', parts: [{ text: prompt.user }] }],
          generationConfig: {
            temperature,
            maxOutputTokens: prompt.maxOutputTokens + (thinking ? GEMINI_THINKING_HEADROOM : 0),
            ...(thinking ? { thinkingConfig: thinking } : {}),
          },
        },
      };
    }
    case 'anthropic': {
      const thinking = anthropicThinking(call.model);
      return {
        url: `${bases.anthropic}/v1/messages`,
        body: {
          model: call.model,
          stream: true,
          max_tokens: prompt.maxOutputTokens,
          temperature,
          system: prompt.system,
          messages: [{ role: 'user', content: prompt.user }],
          ...(thinking ? { thinking } : {}),
        },
      };
    }
  }
}

interface SseMessage {
  event: string | null;
  data: string;
}

/** Server-sent events of a response body, one message per blank-line-terminated block. */
async function* readSse(body: ReadableStream<Uint8Array>): AsyncGenerator<SseMessage> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let event: string | null = null;
  let data: string[] = [];
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline = buffer.search(/\r?\n/);
      while (newline !== -1) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(buffer[newline] === '\r' ? newline + 2 : newline + 1);
        if (line === '') {
          if (data.length > 0) yield { event, data: data.join('\n') };
          event = null;
          data = [];
        } else if (line.startsWith('data:')) {
          data.push(line.slice(5).replace(/^ /, ''));
        } else if (line.startsWith('event:')) {
          event = line.slice(6).trim();
        }
        newline = buffer.search(/\r?\n/);
      }
    }
    if (data.length > 0) yield { event, data: data.join('\n') };
  } finally {
    reader.releaseLock();
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function field(value: unknown, ...path: Array<string | number>): unknown {
  let current: unknown = value;
  for (const key of path) {
    if (typeof current !== 'object' || current === null) return undefined;
    current = (current as Record<string | number, unknown>)[key];
  }
  return current;
}

/** The text of one streamed message, null at the end of the stream; throws when the message reports an error. */
function textOf(provider: AiProvider, message: SseMessage): string | null {
  if (provider === 'openai' && message.data.trim() === '[DONE]') return null;
  const json = parseJson(message.data);
  if (json === null || field(json, 'error') !== undefined || field(json, 'type') === 'error') throw new ProviderError('failed', null);
  switch (provider) {
    case 'openai': {
      const content = field(json, 'choices', 0, 'delta', 'content');
      return typeof content === 'string' ? content : '';
    }
    case 'gemini': {
      const parts = field(json, 'candidates', 0, 'content', 'parts');
      if (!Array.isArray(parts)) return '';
      return parts.map((part: unknown) => (field(part, 'thought') === true || typeof field(part, 'text') !== 'string' ? '' : String(field(part, 'text')))).join('');
    }
    case 'anthropic': {
      if (field(json, 'type') === 'message_stop') return null;
      if (field(json, 'type') !== 'content_block_delta' || field(json, 'delta', 'type') !== 'text_delta') return '';
      const text = field(json, 'delta', 'text');
      return typeof text === 'string' ? text : '';
    }
  }
}

async function errorBody(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, ERROR_BODY_CHARS);
  } catch {
    return '';
  }
}

/**
 * Streams the answer of `call` to `prompt`. `signal` stops it (the browser went away). `purpose` names the feature
 * in the log line.
 */
export async function* streamText(bases: ProviderBases, call: LlmCall, prompt: LlmPrompt, purpose: string, signal?: AbortSignal): AsyncGenerator<string> {
  const started = Date.now();
  let status: number | null = null;
  let outcome: Failure | 'ok' | 'aborted' = 'failed';
  try {
    const { url, body } = streamRequest(bases, call, prompt);
    const timeout = AbortSignal.timeout(CALL_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { ...authHeaders(call.provider, call.apiKey), 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify(body),
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
    } catch {
      throw new ProviderError('failed', null);
    }
    status = res.status;
    if (!res.ok || !res.body) {
      const kind = res.ok ? 'failed' : classifyFailure(call.provider, res.status, await errorBody(res));
      outcome = kind;
      throw new ProviderError(kind, res.status);
    }
    try {
      for await (const message of readSse(res.body)) {
        const text = textOf(call.provider, message);
        if (text === null) break;
        if (text) yield text;
      }
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      throw new ProviderError('failed', status);
    }
    outcome = 'ok';
  } finally {
    if (signal?.aborted && outcome !== 'ok') outcome = 'aborted';
    console.log(JSON.stringify({ event: 'llm-call', purpose, provider: call.provider, model: call.model, outcome, status, ms: Date.now() - started }));
  }
}
