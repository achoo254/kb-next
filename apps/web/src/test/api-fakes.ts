/** Fake API answers for component tests: JSON answers, event streams and a reader with one working key. */
import type { KeysResponse } from '../api/keys-api';

export function answer(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** A whole event-stream answer. */
export function eventStream(events: ReadonlyArray<readonly [string, unknown]>): Response {
  return new Response(events.map(([event, data]) => sse(event, data)).join(''), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

/** An event-stream answer the test writes to, event by event. */
export function openStream(): { response: Response; send(event: string, data: unknown): void; end(): void } {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });
  return {
    response: new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }),
    send: (event, data) => controller?.enqueue(encoder.encode(sse(event, data))),
    end: () => controller?.close(),
  };
}

const T = '2026-11-03T14:05:00.000Z';

/** /api/me/keys of a reader whose OpenAI key ••••a1b2 works and is in use. */
export const KEYS_OPENAI: KeysResponse = {
  available: true,
  keys: [{ provider: 'openai', last4: 'a1b2', status: 'ok', updatedAt: T, lastCheckedAt: T }],
  prefs: null,
  active: { provider: 'openai', model: 'gpt-4.1-mini', last4: 'a1b2' },
  models: { openai: [{ id: 'gpt-4.1-mini', label: 'GPT-4.1 mini' }], gemini: [], anthropic: [] },
};

/** /api/me/keys of a reader without a key. */
export const KEYS_NONE: KeysResponse = { ...KEYS_OPENAI, keys: [], active: null };
