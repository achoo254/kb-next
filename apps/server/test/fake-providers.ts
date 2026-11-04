/**
 * OpenAI, Gemini and Anthropic on one loopback server, for tests: the key check endpoints and the three streaming
 * text endpoints, each in its provider's wire format. What a key does is in its name:
 * - `bad`: refused everywhere (401); `broke`: no credit everywhere; `flaky`: 500 everywhere;
 * - `revoked`: accepted by the check, refused (401, the body quoting the whole key) when generating;
 * - `drained`: accepted by the check, out of credit when generating;
 * - `midfail`: streams the first part of the reply, then the connection drops;
 * - anything else: works. `reply` writes the model's text for each prompt. Every request is recorded.
 */
import { type IncomingMessage, type Server, type ServerResponse, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { AiProvider, ProviderBases } from '../src/llm/providers';

export interface RecordedRequest {
  method: string;
  path: string;
  provider: AiProvider | null;
  headers: Record<string, string>;
  body: unknown;
}

export interface FakePrompt {
  provider: AiProvider;
  system: string;
  user: string;
}

export interface FakeProviders {
  bases: ProviderBases;
  requests: RecordedRequest[];
  /** POST requests (model calls) made so far. */
  generations(): RecordedRequest[];
  /** The model's text for a prompt (default: a fixed sentence). */
  reply: (prompt: FakePrompt) => string;
  close(): Promise<void>;
}

function header(req: IncomingMessage, name: string): string {
  const value = req.headers[name];
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

function keyOf(req: IncomingMessage): { provider: AiProvider; key: string } | null {
  const bearer = /^Bearer (.+)$/.exec(header(req, 'authorization'))?.[1];
  if (bearer) return { provider: 'openai', key: bearer };
  if (header(req, 'x-goog-api-key')) return { provider: 'gemini', key: header(req, 'x-goog-api-key') };
  if (header(req, 'x-api-key') && header(req, 'anthropic-version')) return { provider: 'anthropic', key: header(req, 'x-api-key') };
  return null;
}

function noCredit(res: ServerResponse, provider: AiProvider): void {
  if (provider === 'openai') res.writeHead(429).end(JSON.stringify({ error: { code: 'insufficient_quota', message: 'You exceeded your current quota' } }));
  else if (provider === 'gemini')
    res.writeHead(429).end(
      JSON.stringify({
        error: { status: 'RESOURCE_EXHAUSTED', details: [{ '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }] }] },
      }),
    );
  else res.writeHead(400).end(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API.' } }));
}

function field(value: unknown, ...path: Array<string | number>): unknown {
  let current: unknown = value;
  for (const key of path) {
    if (typeof current !== 'object' || current === null) return undefined;
    current = (current as Record<string | number, unknown>)[key];
  }
  return current;
}

function promptOf(provider: AiProvider, body: unknown): FakePrompt {
  const text = (value: unknown): string => (typeof value === 'string' ? value : '');
  if (provider === 'openai') return { provider, system: text(field(body, 'messages', 0, 'content')), user: text(field(body, 'messages', 1, 'content')) };
  if (provider === 'gemini') return { provider, system: text(field(body, 'systemInstruction', 'parts', 0, 'text')), user: text(field(body, 'contents', 0, 'parts', 0, 'text')) };
  return { provider, system: text(field(body, 'system')), user: text(field(body, 'messages', 0, 'content')) };
}

/** The reply in three pieces, each as its provider streams text. */
function events(provider: AiProvider, text: string): string[] {
  const third = Math.ceil(text.length / 3);
  const pieces = [text.slice(0, third), text.slice(third, 2 * third), text.slice(2 * third)].filter(Boolean);
  if (provider === 'openai') return [...pieces.map((p) => `data: ${JSON.stringify({ choices: [{ delta: { content: p } }] })}\n\n`), 'data: [DONE]\n\n'];
  if (provider === 'gemini')
    return [
      `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: 'thinking…', thought: true }] } }] })}\n\n`,
      ...pieces.map((p) => `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: p }] } }] })}\n\n`),
    ];
  return [
    `event: message_start\ndata: ${JSON.stringify({ type: 'message_start', message: {} })}\n\n`,
    ...pieces.map((p) => `event: content_block_delta\ndata: ${JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: p } })}\n\n`),
    `event: message_stop\ndata: ${JSON.stringify({ type: 'message_stop' })}\n\n`,
  ];
}

export async function startFakeProviders(): Promise<FakeProviders> {
  const fake: Omit<FakeProviders, 'bases' | 'close'> = {
    requests: [],
    generations: () => fake.requests.filter((r) => r.method === 'POST'),
    reply: () => 'A fixed answer.',
  };

  const handle = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const raw = Buffer.concat(chunks).toString('utf8');
    const body: unknown = raw ? JSON.parse(raw) : null;
    const path = req.url ?? '/';
    const auth = keyOf(req);
    fake.requests.push({
      method: req.method ?? '',
      path,
      provider: auth?.provider ?? null,
      headers: Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k, String(v)])),
      body,
    });
    res.setHeader('Content-Type', 'application/json');
    if (!auth || auth.key.includes('bad')) {
      res.writeHead(401).end(JSON.stringify({ error: { message: 'Incorrect API key provided' } }));
      return;
    }
    if (auth.key.includes('broke')) return noCredit(res, auth.provider);
    if (auth.key.includes('flaky')) {
      res.writeHead(500).end('{}');
      return;
    }
    if (req.method === 'GET') {
      res.writeHead(200).end(JSON.stringify({ data: [], models: [] }));
      return;
    }
    if (auth.key.includes('revoked')) {
      res.writeHead(401).end(JSON.stringify({ error: { code: 'invalid_api_key', message: `Incorrect API key provided: ${auth.key}` } }));
      return;
    }
    if (auth.key.includes('drained')) return noCredit(res, auth.provider);
    const out = events(auth.provider, fake.reply(promptOf(auth.provider, body)));
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    if (auth.key.includes('midfail')) {
      res.write(out[auth.provider === 'openai' ? 0 : 1] ?? '');
      // Let the first piece reach the client, then drop the connection.
      setTimeout(() => res.socket?.destroy(), 50);
      return;
    }
    for (const event of out) res.write(event);
    res.end();
  };

  const server: Server = createServer((req, res) => {
    handle(req, res).catch(() => res.writeHead(500).end());
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return Object.assign(fake, {
    bases: { openai: origin, gemini: origin, anthropic: origin },
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  });
}
