/**
 * The internal API answers only direct loopback calls: anything relayed by a proxy (a forwarding header) or from
 * another address is a 404, whatever `trust proxy` makes of `req.ip`. Jev's daily totals come back per day and
 * purpose; malformed, impossible, reversed or too long ranges are refused.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type TestServer, startTestServer } from '../../test/test-server';
import { jevUsageDaily } from '../db/schema';
import { MAX_USAGE_DAYS, isDirectLoopback } from './internal-routes';

let server: TestServer;

beforeAll(async () => {
  server = await startTestServer();
  await server.database.db.insert(jevUsageDaily).values([
    { day: '2026-11-03', purpose: 'search-documents', calls: 4, failedCalls: 1, inputTokens: 9_000, outputTokens: 120 },
    { day: '2026-11-04', purpose: 'search-documents', calls: 2, failedCalls: 0, inputTokens: 1_500, outputTokens: 60 },
    { day: '2026-11-04', purpose: 'space-caption', calls: 1, failedCalls: 0, inputTokens: 240, outputTokens: 30 },
    { day: '2026-11-05', purpose: 'search-passages', calls: 1, failedCalls: 0, inputTokens: 700, outputTokens: 10 },
  ]);
});
afterAll(async () => {
  await server.close();
});

function usage(query: string, headers: Record<string, string> = {}): Promise<Response> {
  return fetch(`${server.origin}/api/internal/jev-usage?${query}`, { headers });
}

describe('GET /api/internal/jev-usage', () => {
  it('gives the daily totals of the range to a direct loopback call', async () => {
    const res = await usage('from=2026-11-04&to=2026-11-04');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({
      days: [
        { day: '2026-11-04', purpose: 'search-documents', calls: 2, failedCalls: 0, inputTokens: 1_500, outputTokens: 60 },
        { day: '2026-11-04', purpose: 'space-caption', calls: 1, failedCalls: 0, inputTokens: 240, outputTokens: 30 },
      ],
    });
    const wide = await usage('from=2026-11-01&to=2026-11-30');
    expect(((await wide.json()) as { days: unknown[] }).days).toHaveLength(4);
    const empty = await usage('from=2026-10-01&to=2026-10-02');
    expect(await empty.json()).toEqual({ days: [] });
  });

  it.each([
    ['X-Forwarded-For', '127.0.0.1'],
    ['X-Real-IP', '127.0.0.1'],
    ['Forwarded', 'for=127.0.0.1'],
  ])('is a 404 when the call came through a proxy (%s)', async (name, value) => {
    const res = await usage('from=2026-11-04&to=2026-11-04', { [name]: value });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not-found' });
  });

  it('hides unknown internal paths from proxied calls the same way', async () => {
    const res = await fetch(`${server.origin}/api/internal/other`, { headers: { 'X-Forwarded-For': '203.0.113.9' } });
    expect(res.status).toBe(404);
  });

  it.each([
    'from=2026-11-04',
    'to=2026-11-04',
    'from=2026-11-4&to=2026-11-05',
    'from=04-11-2026&to=05-11-2026',
    'from=2026-02-30&to=2026-03-01',
    'from=2026-11-05&to=2026-11-04',
    'from=2026-11-04&from=2026-11-03&to=2026-11-05',
  ])('refuses a bad range: %s', async (query) => {
    const res = await usage(query);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid-query' });
  });

  it(`allows at most ${MAX_USAGE_DAYS} days`, async () => {
    expect((await usage('from=2026-10-01&to=2026-10-31')).status).toBe(200);
    expect((await usage('from=2026-10-01&to=2026-11-01')).status).toBe(400);
  });
});

describe('isDirectLoopback', () => {
  const req = (remoteAddress: string | undefined, headers: Record<string, string> = {}) => ({ headers, socket: { remoteAddress } });

  it('accepts loopback addresses without forwarding headers', () => {
    expect(isDirectLoopback(req('127.0.0.1'))).toBe(true);
    expect(isDirectLoopback(req('::1'))).toBe(true);
    expect(isDirectLoopback(req('::ffff:127.0.0.1'))).toBe(true);
  });

  it('refuses other addresses and any forwarding header', () => {
    expect(isDirectLoopback(req('203.0.113.5'))).toBe(false);
    expect(isDirectLoopback(req('127.0.0.2'))).toBe(false);
    expect(isDirectLoopback(req(undefined))).toBe(false);
    expect(isDirectLoopback(req('127.0.0.1', { 'x-forwarded-for': '' }))).toBe(false);
    expect(isDirectLoopback(req('127.0.0.1', { forwarded: 'for=127.0.0.1' }))).toBe(false);
  });
});
