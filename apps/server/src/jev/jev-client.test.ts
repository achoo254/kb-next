import { afterEach, describe, expect, it, vi } from 'vitest';
import { JEV_USD_PER_MTOK, JevClient, type JevUsageLog } from './jev-client';

const QUESTIONS = { s0: { type: 'choice' as const, instructions: 'Which caption?', criteria: { '8 lab': 'English: 8 labs', '13 bài': 'English: 13 docs' } } };
const KEY = 'ts-test-key-not-real';

afterEach(() => {
  vi.unstubAllGlobals();
});

function client(logs: JevUsageLog[], timeoutMs = 3_000): JevClient {
  return new JevClient(KEY, timeoutMs, (line) => logs.push(line));
}

describe('Jev client', () => {
  it('sends the model, state and questions with the key, and returns the choices and token usage', async () => {
    const fetchMock = vi.fn((_url: string, _init: RequestInit) =>
      Promise.resolve(
        Response.json({
          model: 'jev-1',
          answers: { s0: { type: 'choice', choice: '8 lab', confidence: 0.82, probabilities: { '8 lab': 0.9, '13 bài': 0.1 } } },
          usage: { input_tokens: 240, output_tokens: 3 },
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const logs: JevUsageLog[] = [];
    const result = await client(logs).choose('space-caption', { spaces: { s0: { name: 'Networking' } } }, QUESTIONS);
    expect(result).toEqual({ answers: { s0: { choice: '8 lab', confidence: 0.82 } }, usage: { inputTokens: 240, outputTokens: 3 } });

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('https://api.typesafe.ai/v1/systemone');
    expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${KEY}`);
    expect(JSON.parse(String(init?.body))).toEqual({ model: 'jev-latest', state: { spaces: { s0: { name: 'Networking' } } }, questions: QUESTIONS });

    expect(logs).toEqual([
      {
        event: 'jev-call',
        purpose: 'space-caption',
        model: 'jev-1',
        ok: true,
        status: 200,
        ms: expect.any(Number) as number,
        questions: 1,
        inputTokens: 240,
        outputTokens: 3,
        costUsd: (240 / 1_000_000) * JEV_USD_PER_MTOK,
      },
    ]);
    // The usage log never carries the key, the state or the answers.
    expect(JSON.stringify(logs)).not.toMatch(/ts-test-key|Networking|8 lab/);
  });

  it('rejects on an error status or a malformed answer, and logs the failed call', async () => {
    const logs: JevUsageLog[] = [];
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(Response.json({ detail: 'rate limited' }, { status: 429 }))));
    await expect(client(logs).choose('space-caption', {}, QUESTIONS)).rejects.toThrow(/Jev space-caption failed: Error: Jev answered 429/);
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(Response.json({ nothing: true }))));
    await expect(client(logs).choose('space-caption', {}, QUESTIONS)).rejects.toThrow(/Jev answered 200/);
    expect(logs.map((l) => [l.ok, l.status, l.inputTokens])).toEqual([
      [false, 429, 0],
      [false, 200, 0],
    ]);
  });

  it('gives up at its deadline', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(init.signal?.reason as Error))),
      ),
    );
    const logs: JevUsageLog[] = [];
    await expect(client(logs, 50).choose('space-caption', {}, QUESTIONS)).rejects.toThrow(/TimeoutError/);
    expect(logs[0]).toMatchObject({ ok: false, status: null });
  });
});
