import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type DbHandle, openPglite } from '../db/client';
import type { JevUsageLog } from './jev-client';
import { JevUsageStore, saigonDay } from './jev-usage';

const line = (over: Partial<JevUsageLog> = {}): JevUsageLog => ({
  event: 'jev-call',
  purpose: 'search-documents',
  model: 'jev-1',
  ok: true,
  status: 200,
  ms: 300,
  questions: 2,
  inputTokens: 1_000,
  outputTokens: 30,
  costUsd: 0,
  ...over,
});

let database: DbHandle;
beforeAll(async () => {
  database = await openPglite();
});
afterAll(async () => {
  await database.close();
});

describe('Jev usage per day', () => {
  it('counts the day in Saigon', () => {
    // 17:30 UTC on 03/11 is already 04/11 in Saigon (UTC+7).
    expect(saigonDay(new Date('2026-11-03T17:30:00Z'))).toBe('2026-11-04');
    expect(saigonDay(new Date('2026-11-03T16:59:59Z'))).toBe('2026-11-03');
  });

  it('adds every call to its day and purpose, failures included', async () => {
    let now = new Date('2026-11-04T03:00:00Z');
    const store = new JevUsageStore(database.db, () => now);
    await Promise.all([store.record(line()), store.record(line({ inputTokens: 500 })), store.record(line({ purpose: 'search-passages', inputTokens: 2_000 }))]);
    await store.record(line({ ok: false, status: 529, inputTokens: 0, outputTokens: 0 }));
    now = new Date('2026-11-05T03:00:00Z');
    await store.record(line({ purpose: 'space-caption', inputTokens: 240 }));
    await store.idle();

    expect(await store.days('2026-11-04', '2026-11-05')).toEqual([
      { day: '2026-11-04', purpose: 'search-documents', calls: 3, failedCalls: 1, inputTokens: 1_500, outputTokens: 60 },
      { day: '2026-11-04', purpose: 'search-passages', calls: 1, failedCalls: 0, inputTokens: 2_000, outputTokens: 30 },
      { day: '2026-11-05', purpose: 'space-caption', calls: 1, failedCalls: 0, inputTokens: 240, outputTokens: 30 },
    ]);
    expect(await store.days('2026-11-05', '2026-11-05')).toHaveLength(1);
  });
});
