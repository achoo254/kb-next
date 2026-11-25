import { describe, expect, it } from 'vitest';
import { CONFIRM_TOKEN_TTL_MS, ConfirmTokens } from './confirm-token';

const binding = { subject: 'alice-sub', tool: 'save_note', args: { title: 'a', markdown: 'b', space: null, lang: null } };

describe('confirm tokens', () => {
  it('work once, for the same caller, tool and arguments', () => {
    const tokens = new ConfirmTokens();
    const { token } = tokens.issue(binding);
    expect(tokens.consume(token, { ...binding, subject: 'bob-sub' })).toBe('confirm_token_invalid');
    expect(tokens.consume(token, { ...binding, tool: 'other' })).toBe('confirm_token_invalid');
    expect(tokens.consume(token, { ...binding, args: { ...binding.args, title: 'c' } })).toBe('confirm_token_invalid');
    expect(tokens.consume(token, binding)).toBeNull();
    expect(tokens.consume(token, binding)).toBe('confirm_token_used');
  });

  it('expire after five minutes and refuse a malformed or forged token', () => {
    let now = 1_000_000;
    const tokens = new ConfirmTokens(() => now);
    const { token, expiresAt } = tokens.issue(binding);
    expect(expiresAt.getTime()).toBe(now + CONFIRM_TOKEN_TTL_MS);
    now += CONFIRM_TOKEN_TTL_MS;
    expect(tokens.consume(token, binding)).toBe('confirm_token_expired');
    expect(tokens.consume('v1.abc', binding)).toBe('confirm_token_invalid');
    expect(tokens.consume(new ConfirmTokens(() => now).issue(binding).token, binding)).toBe('confirm_token_invalid');
  });
});
