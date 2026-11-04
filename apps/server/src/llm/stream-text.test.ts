/** The three providers behind one streaming interface, against local fakes of their APIs. */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type FakeProviders, startFakeProviders } from '../../test/fake-providers';
import { checkKey, keyFormatOk } from '../user-keys/key-check';
import { type AiProvider, ANTHROPIC_VERSION, classifyFailure, defaultModel } from './providers';
import { GEMINI_THINKING_HEADROOM, ProviderError, streamRequest, streamText } from './stream-text';

const KEYS: Record<AiProvider, string> = { openai: 'sk-test-openai-key-0001', gemini: 'AIza-test-gemini-key-0001', anthropic: 'sk-ant-test-key-00000001' };
const PROMPT = { system: 'Be brief.', user: 'Say hello.', maxOutputTokens: 100 };

let fake: FakeProviders;

beforeAll(async () => {
  fake = await startFakeProviders();
  fake.reply = (prompt) => `Hello from ${prompt.provider}: ${prompt.user}`;
});

afterAll(async () => {
  await fake.close();
});

async function collect(provider: AiProvider, key: string, model = defaultModel(provider)): Promise<string[]> {
  const out: string[] = [];
  for await (const delta of streamText(fake.bases, { provider, model, apiKey: key }, PROMPT, 'test')) out.push(delta);
  return out;
}

describe('streamText', () => {
  it.each(['openai', 'gemini', 'anthropic'] as const)('streams %s text in pieces, with the key in its header only', async (provider) => {
    fake.requests.length = 0;
    const pieces = await collect(provider, KEYS[provider]);
    expect(pieces.length).toBeGreaterThan(1);
    expect(pieces.join('')).toBe(`Hello from ${provider}: Say hello.`);
    const [request] = fake.requests;
    expect(request?.path).not.toContain(KEYS[provider]);
    expect(JSON.stringify(request?.body)).not.toContain(KEYS[provider]);
  });

  it('builds each provider request as its API documents it', () => {
    const bases = { openai: 'https://o', gemini: 'https://g', anthropic: 'https://a' };
    const openai = streamRequest(bases, { provider: 'openai', model: 'gpt-4.1-mini', apiKey: 'k' }, PROMPT);
    expect(openai.url).toBe('https://o/v1/chat/completions');
    expect(openai.body).toMatchObject({ model: 'gpt-4.1-mini', stream: true, max_completion_tokens: 100, messages: [{ role: 'system' }, { role: 'user' }] });

    const gemini = streamRequest(bases, { provider: 'gemini', model: 'gemini-3.8-flash', apiKey: 'k' }, PROMPT);
    expect(gemini.url).toBe('https://g/v1beta/models/gemini-3.8-flash:streamGenerateContent?alt=sse');
    expect(gemini.body.generationConfig).toEqual({ temperature: 0.2, maxOutputTokens: 100 + GEMINI_THINKING_HEADROOM, thinkingConfig: { thinkingLevel: 'MINIMAL' } });
    expect(streamRequest(bases, { provider: 'gemini', model: 'gemini-2.5-flash', apiKey: 'k' }, PROMPT).body.generationConfig).toEqual({ temperature: 0.2, maxOutputTokens: 100 });

    const haiku = streamRequest(bases, { provider: 'anthropic', model: 'claude-haiku-5-5', apiKey: 'k' }, PROMPT);
    expect(haiku.url).toBe('https://a/v1/messages');
    expect(haiku.body).toMatchObject({ model: 'claude-haiku-5-5', stream: true, max_tokens: 100, system: 'Be brief.', thinking: { type: 'disabled' } });
    expect(streamRequest(bases, { provider: 'anthropic', model: 'claude-sonnet-5-5', apiKey: 'k' }, PROMPT).body.thinking).toEqual({ type: 'between_tools' });
  });

  it('sends Anthropic its API version', async () => {
    fake.requests.length = 0;
    await collect('anthropic', KEYS.anthropic);
    expect(fake.requests[0]?.headers['anthropic-version']).toBe(ANTHROPIC_VERSION);
  });

  it.each([
    ['openai', 'sk-test-revoked-key-0001', 'rejected'],
    ['gemini', 'AIza-test-revoked-key-001', 'rejected'],
    ['anthropic', 'sk-ant-test-revoked-0001', 'rejected'],
    ['openai', 'sk-test-drained-key-0001', 'no-credit'],
    ['gemini', 'AIza-test-drained-key-001', 'no-credit'],
    ['anthropic', 'sk-ant-test-drained-0001', 'no-credit'],
    ['openai', 'sk-test-flaky-key-000001', 'failed'],
  ] as const)('maps a refused %s call (%s) to %s', async (provider, key, kind) => {
    const error = await collect(provider, key).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProviderError);
    expect((error as ProviderError).kind).toBe(kind);
    expect((error as ProviderError).message).not.toContain(key);
  });

  it('keeps the text streamed before the connection drops, then fails', async () => {
    const out: string[] = [];
    const error = await (async () => {
      for await (const delta of streamText(fake.bases, { provider: 'openai', model: 'gpt-4.1-mini', apiKey: 'sk-test-midfail-key-0001' }, PROMPT, 'test')) out.push(delta);
    })().catch((e: unknown) => e);
    expect(out.join('')).not.toBe('');
    expect(error).toBeInstanceOf(ProviderError);
    expect((error as ProviderError).kind).toBe('failed');
  });

  it('logs each call without the key or the text', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      await collect('openai', KEYS.openai);
      const lines = log.mock.calls.map((args) => args.join(' '));
      expect(lines.some((line) => line.includes('"event":"llm-call"') && line.includes('"outcome":"ok"'))).toBe(true);
      expect(lines.join('\n')).not.toContain(KEYS.openai);
      expect(lines.join('\n')).not.toContain('Hello from');
    } finally {
      log.mockRestore();
    }
  });
});

describe('failure classification', () => {
  it('reads each provider error the way the provider writes it', () => {
    expect(classifyFailure('openai', 401, '{"error":{"code":"invalid_api_key"}}')).toBe('rejected');
    expect(classifyFailure('openai', 429, '{"error":{"code":"insufficient_quota"}}')).toBe('no-credit');
    expect(classifyFailure('openai', 429, '{"error":{"code":"rate_limit_exceeded"}}')).toBe('failed');
    expect(classifyFailure('gemini', 400, '{"error":{"details":[{"reason":"API_KEY_INVALID"}]}}')).toBe('rejected');
    expect(classifyFailure('gemini', 400, '{"error":{"message":"other"}}')).toBe('failed');
    expect(classifyFailure('gemini', 429, '{"error":{"details":[{"@type":"type.googleapis.com/google.rpc.QuotaFailure","violations":[{"quotaId":"GenerateRequestsPerMinutePerProjectPerModel"}]}]}}')).toBe('failed');
    expect(classifyFailure('anthropic', 403, '{}')).toBe('rejected');
    expect(classifyFailure('anthropic', 402, '{}')).toBe('no-credit');
    expect(classifyFailure('anthropic', 529, '{"type":"error","error":{"type":"overloaded_error"}}')).toBe('failed');
  });
});

describe('key check', () => {
  it('accepts a working key and tells a refused, empty or unreachable one apart, for every provider', async () => {
    for (const provider of ['openai', 'gemini', 'anthropic'] as const) {
      expect(await checkKey(fake.bases, provider, KEYS[provider])).toBe('valid');
      expect(await checkKey(fake.bases, provider, `${KEYS[provider]}-bad`)).toBe('rejected');
      expect(await checkKey(fake.bases, provider, `${KEYS[provider]}-broke`)).toBe('no-credit');
    }
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      expect(await checkKey(fake.bases, 'openai', 'sk-test-flaky-key-000001')).toBe('unreachable');
      expect(await checkKey({ openai: 'http://127.0.0.1:1', gemini: '', anthropic: '' }, 'openai', KEYS.openai)).toBe('unreachable');
    } finally {
      error.mockRestore();
    }
    expect(fake.requests.some((r) => r.method === 'GET' && r.path === '/v1beta/models?pageSize=1')).toBe(true);
  });

  it('checks the shape of a key before calling anyone', () => {
    expect(keyFormatOk('openai', 'sk-test-0123456789abcdef')).toBe(true);
    expect(keyFormatOk('openai', 'test-0123456789abcdefgh')).toBe(false);
    expect(keyFormatOk('openai', 'sk-ant-test-0123456789abcdef')).toBe(false);
    expect(keyFormatOk('anthropic', 'sk-ant-test-0123456789abcdef')).toBe(true);
    expect(keyFormatOk('gemini', 'short')).toBe(false);
    expect(keyFormatOk('gemini', 'AIza test 0123456789abcdef')).toBe(false);
    expect(keyFormatOk('gemini', 'a'.repeat(301))).toBe(false);
  });
});
