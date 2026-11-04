/**
 * The `text/event-stream` answer of POST /api/ask and POST /api/documents/:id/translate: each event is
 * `event: <name>` and one `data:` line of JSON. nginx is told not to buffer it.
 *
 * `connectionSignal` is taken first thing in the handler, before any awaited work: it aborts when the browser goes
 * away, also when it went away already (while the session, the key or the document were being read), so a provider
 * call stops (or never starts) instead of billing the user's key for text nobody reads, and nothing is saved.
 */
import type { Request, Response } from 'express';

export interface EventStream {
  send(event: string, data: unknown): void;
  end(): void;
  readonly signal: AbortSignal;
}

export function connectionSignal(req: Request, res: Response): AbortSignal {
  const gone = new AbortController();
  res.on('close', () => {
    if (!res.writableFinished) gone.abort();
  });
  if (req.socket.destroyed || res.destroyed) gone.abort();
  return gone.signal;
}

export function openEventStream(res: Response, signal: AbortSignal): EventStream {
  res.status(200).set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  return {
    send(event, data) {
      if (signal.aborted || res.writableEnded) return;
      // JSON.stringify never emits a raw newline, so the data stays on one line.
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    },
    end() {
      if (!res.writableEnded) res.end();
    },
    signal,
  };
}
