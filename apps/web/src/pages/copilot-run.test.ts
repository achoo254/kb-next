import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AskRequest } from '../api/copilot-api';
import { answer, eventStream } from '../test/api-fakes';
import { copilotHref, parseScope, readCopilotLink } from './copilot-links';
import { type CopilotTurn, citationScore, doubtfulCitations, historyTurn, runAsk } from './copilot-run';

const REQUEST: AskRequest = { question: 'Máy mới lấy IP kiểu gì?', scope: { kind: 'space', id: 'networking' } };

const SOURCE = { n: 1, documentId: 'dhcp', anchor: 'tong-quan', title: 'Giao thức DHCP', section: 'DORA', spaceName: 'Networking', collectionName: null, origin: 'official', status: 'approved' } as const;

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** The turns runAsk reports for one answer of /api/ask. */
async function run(response: Response | Promise<never>): Promise<CopilotTurn[]> {
  fetchMock.mockReturnValue(response);
  const turns: CopilotTurn[] = [];
  await runAsk(REQUEST, new AbortController().signal, (turn) => turns.push(turn));
  return turns;
}

function last(turns: CopilotTurn[]): CopilotTurn {
  const turn = turns.at(-1);
  if (!turn) throw new Error('no turn');
  return turn;
}

describe('copilot links', () => {
  it('builds and reads /copilot?q=&scope=&from=&h=', () => {
    const href = copilotHref('DHCP?', { scope: { kind: 'document', id: 'd1' }, from: 'd1', item: 'q9' });
    expect(href).toBe('/copilot?q=DHCP%3F&scope=document%3Ad1&from=d1&h=q9');
    expect(readCopilotLink(href.slice('/copilot'.length))).toEqual({ question: 'DHCP?', scope: { kind: 'document', id: 'd1' }, from: 'd1', item: 'q9' });
    expect(copilotHref()).toBe('/copilot');
    expect(copilotHref(undefined, { scope: { kind: 'universe' } })).toBe('/copilot');
  });

  it('ignores a scope or id it does not know', () => {
    expect(parseScope('universe')).toEqual({ kind: 'universe' });
    expect(parseScope('galaxy:x')).toBeNull();
    expect(parseScope('space:../etc')).toBeNull();
    expect(parseScope('space:')).toBeNull();
    expect(readCopilotLink('?from=a/b&h=')).toEqual({ question: undefined, scope: undefined, from: undefined, item: undefined });
  });
});

describe('runAsk', () => {
  it('streams the answer: thinking (A), sources, text, Jev’s check and the saved question', async () => {
    const turns = await run(
      eventStream([
        ['status', { stage: 'searching', jev: 'ok', found: 0 }],
        ['sources', { sources: [SOURCE] }],
        ['status', { stage: 'writing', jev: 'ok', found: 1 }],
        ['delta', { text: 'Gửi Discover ' }],
        ['delta', { text: '[1].' }],
        ['check', { citations: [{ n: 1, supported: true }] }],
        ['done', { questionId: 'q1', provider: 'openai', model: 'gpt-4.1-mini', last4: 'a1b2' }],
      ]),
    );
    expect(turns[0]?.stage).toBe('searching');
    expect(turns.some((turn) => turn.stage === 'writing' && turn.text === 'Gửi Discover ')).toBe(true);
    expect(last(turns)).toMatchObject({ stage: 'done', text: 'Gửi Discover [1].', jev: 'ok', found: 1, questionId: 'q1', key: { provider: 'openai', last4: 'a1b2' } });
    expect(citationScore(last(turns))).toEqual({ ok: 1, total: 1 });
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual(REQUEST);
  });

  it.each([
    ['NO_ANSWER', 'no-answer'],
    ['USER_KEY_REJECTED', 'key-rejected'],
    ['USER_KEY_NO_CREDIT', 'no-credit'],
    ['PROVIDER_FAILED', 'interrupted'],
    ['INTERNAL', 'interrupted'],
  ] as const)('maps the stream error %s to %s, keeping what was written', async (code, failure) => {
    const turns = await run(
      eventStream([
        ['status', { stage: 'writing', jev: 'ok', found: 1 }],
        ['delta', { text: 'Một nửa' }],
        ['error', { code, provider: 'gemini', last4: '9f3e' }],
      ]),
    );
    expect(last(turns)).toMatchObject({ stage: 'failed', failure, text: 'Một nửa', key: { provider: 'gemini', last4: '9f3e' } });
  });

  it('calls a stream that ends without done or error interrupted (H)', async () => {
    const turns = await run(eventStream([['delta', { text: 'Bị cắt' }]]));
    expect(last(turns)).toMatchObject({ stage: 'failed', failure: 'interrupted', text: 'Bị cắt' });
  });

  it('keeps Jev’s "off" (E): keyword search only, no check', async () => {
    const turns = await run(
      eventStream([
        ['status', { stage: 'searching', jev: 'off', found: 0 }],
        ['status', { stage: 'writing', jev: 'off', found: 2 }],
        ['delta', { text: 'Theo từ khoá.' }],
        ['done', { questionId: 'q2', provider: 'openai', model: 'm', last4: 'a1b2' }],
      ]),
    );
    expect(last(turns)).toMatchObject({ stage: 'done', jev: 'off', citations: null });
    expect(citationScore(last(turns))).toBeNull();
  });

  it.each([
    [403, 'NO_USER_KEY', 'no-key'],
    [403, 'USER_KEY_UNREADABLE', 'key-unreadable'],
    [503, 'USER_KEYS_DISABLED', 'off'],
    [429, 'rate-limited', 'rate-limited'],
    [401, 'sign-in-required', 'signed-out'],
    [404, 'not-found', 'scope-missing'],
    [400, 'invalid-body', 'too-long'],
    [500, 'boom', 'other'],
  ] as const)('maps %i %s before the stream to %s', async (status, error, failure) => {
    const turns = await run(Promise.resolve(answer(status, { error })) as Promise<never>);
    expect(last(turns)).toMatchObject({ stage: 'failed', failure });
  });

  it('queues the question when the browser is offline (F), and says "not sent" when online', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    let turns = await run(Promise.reject(new TypeError('Failed to fetch')));
    expect(last(turns).stage).toBe('queued');
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    turns = await run(Promise.reject(new TypeError('Failed to fetch')));
    expect(last(turns)).toMatchObject({ stage: 'failed', failure: 'not-sent' });
  });

  it('reports nothing once aborted ("Dừng")', async () => {
    const controller = new AbortController();
    fetchMock.mockImplementation(() => {
      controller.abort();
      return Promise.reject(new DOMException('aborted', 'AbortError'));
    });
    const turns: CopilotTurn[] = [];
    await runAsk(REQUEST, controller.signal, (turn) => turns.push(turn));
    expect(turns.map((turn) => turn.stage)).toEqual(['searching']);
  });
});

describe('citations of a turn', () => {
  it('lists citations Jev did not confirm (G) and history sources that can no longer be opened', () => {
    const turn = historyTurn({
      id: 'q1',
      task: 'answer',
      question: 'Lease bao lâu?',
      selection: null,
      scope: { kind: 'universe', id: null },
      answer: 'Nửa thời gian [1]. 24 giờ [2]. Đã ẩn [3].',
      sources: [
        { ...SOURCE, available: true },
        { ...SOURCE, n: 2, available: true },
        { ...SOURCE, n: 3, title: '', available: false },
      ],
      citations: [
        { n: 1, supported: true },
        { n: 2, supported: false },
        { n: 3, supported: true },
      ],
      provider: 'anthropic',
      model: 'claude-haiku-5-5',
      createdAt: '2026-11-04T10:00:00.000Z',
    });
    expect(turn).toMatchObject({ stage: 'done', jev: 'ok', request: { question: 'Lease bao lâu?', scope: { kind: 'universe' }, task: 'answer' }, key: { provider: 'anthropic' } });
    expect(doubtfulCitations(turn)).toEqual({ unsupported: [2], unavailable: [3] });
    expect(citationScore(turn)).toEqual({ ok: 2, total: 3 });
  });
});
