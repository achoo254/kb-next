/**
 * The `text/event-stream` answer of POST /api/ask and POST /api/documents/:id/translate: each event is
 * `event: <name>` and one `data:` line of JSON. nginx is told not to buffer it. `signal` aborts when the browser goes
 * away, so a provider call in flight stops instead of billing the user's key for text nobody reads.
 */
import type { Response } from 'express';

export interface EventStream {
  send(event: string, data: unknown): void;
  end(): void;
  readonly signal: AbortSignal;
}

export function openEventStream(res: Response): EventStream {
  const closed = new AbortController();
  res.on('close', () => closed.abort());
  res.status(200).set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  return {
    send(event, data) {
      if (closed.signal.aborted || res.writableEnded) return;
      // JSON.stringify never emits a raw newline, so the data stays on one line.
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    },
    end() {
      if (!res.writableEnded) res.end();
    },
    signal: closed.signal,
  };
}
