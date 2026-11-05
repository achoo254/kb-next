import { describe, expect, it, vi } from 'vitest';
import { ProviderError } from '../llm/stream-text';
import type { OpenedKey, UserKeyStore } from '../user-keys/key-store';
import { reportProviderFailure } from './provider-failure';

const KEY: OpenedKey = { provider: 'openai', model: 'gpt-4.1-mini', last4: 'ABCD', apiKey: 'sk-not-used-here-ABCD', nonce: 'n' };

describe('provider failure', () => {
  it('still tells the user why the turn stopped when the key cannot be marked', async () => {
    const keys = { mark: vi.fn(() => Promise.reject(new Error('database down'))) } as unknown as UserKeyStore;
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      expect(await reportProviderFailure(keys, 'user', KEY, new ProviderError('rejected', 401))).toEqual({ code: 'USER_KEY_REJECTED', provider: 'openai', last4: 'ABCD' });
      expect(await reportProviderFailure(keys, 'user', KEY, new ProviderError('no-credit', 429))).toEqual({ code: 'USER_KEY_NO_CREDIT', provider: 'openai', last4: 'ABCD' });
      expect(await reportProviderFailure(keys, 'user', KEY, new ProviderError('failed', 500))).toEqual({ code: 'PROVIDER_FAILED', provider: 'openai', last4: 'ABCD' });
      expect(keys.mark).toHaveBeenCalledTimes(2);
    } finally {
      error.mockRestore();
    }
  });

  it('tells a model the key cannot reach (404) apart from a cut answer, and leaves the key as it is', async () => {
    const keys = { mark: vi.fn(() => Promise.resolve()), dropModel: vi.fn(() => Promise.resolve()) } as unknown as UserKeyStore;
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      expect(await reportProviderFailure(keys, 'user', KEY, new ProviderError('failed', 404))).toEqual({ code: 'MODEL_UNAVAILABLE', provider: 'openai', last4: 'ABCD' });
      // That model leaves the key's list, so the next turn runs on another one.
      expect(keys.dropModel).toHaveBeenCalledWith('user', 'openai', 'n', 'gpt-4.1-mini');
      expect(await reportProviderFailure(keys, 'user', KEY, new ProviderError('failed', null))).toEqual({ code: 'PROVIDER_FAILED', provider: 'openai', last4: 'ABCD' });
      expect(keys.dropModel).toHaveBeenCalledTimes(1);
      expect(keys.mark).not.toHaveBeenCalled();
    } finally {
      error.mockRestore();
    }
  });
});
