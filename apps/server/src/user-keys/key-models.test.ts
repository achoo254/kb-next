import { describe, expect, it } from 'vitest';
import { allowedModels, listedIds } from './key-check';
import { type KeyEntry, pickActive } from './key-store';

const entry = (models: string[]): KeyEntry => ({ provider: 'openai', last4: 'TU4A', status: 'ok', updatedAt: '2026-11-05T01:10:00.000Z', lastCheckedAt: null, models });

describe('models a key may call', () => {
  it('reads the ids of each provider’s models listing', () => {
    expect(listedIds(JSON.stringify({ data: [{ id: 'gpt-4.1-mini' }, { id: 'gpt-4o' }] }))).toEqual(['gpt-4.1-mini', 'gpt-4o']);
    expect(listedIds(JSON.stringify({ models: [{ name: 'models/gemini-3.8-flash' }] }))).toEqual(['gemini-3.8-flash']);
    expect(listedIds('not json')).toEqual([]);
  });

  it('keeps the app’s models the key lists, in the app’s order; unknown when the listing names none', () => {
    // A project that has gpt-4.1-mini but not gpt-4.1-nano (seen on a real key, 05/11/2026).
    expect(allowedModels('openai', ['gpt-5', 'gpt-4.1-mini', 'gpt-4o-mini'])).toEqual(['gpt-4.1-mini']);
    expect(allowedModels('openai', ['gpt-5'])).toEqual([]);
    expect(allowedModels('openai', [])).toBeNull();
  });

  it('uses a chosen model only when the key may call it, else the key’s first model', () => {
    expect(pickActive([entry(['gpt-4.1-mini'])], { provider: 'openai', model: 'gpt-4.1-nano' })).toEqual({ provider: 'openai', model: 'gpt-4.1-mini', last4: 'TU4A' });
    expect(pickActive([entry(['gpt-4.1-nano'])], null)).toEqual({ provider: 'openai', model: 'gpt-4.1-nano', last4: 'TU4A' });
    expect(pickActive([entry([])], null)).toBeNull();
  });
});
