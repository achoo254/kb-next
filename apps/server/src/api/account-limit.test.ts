import { describe, expect, it } from 'vitest';
import { AccountBudget } from './account-limit';

describe('per-account AI budget', () => {
  it('spends calls per account in one-minute windows, never past the limit', () => {
    let at = 0;
    const budget = new AccountBudget(20, () => at);
    expect(budget.take('a', 12)).toBe(true);
    expect(budget.take('a', 9)).toBe(false);
    expect(budget.take('a', 8)).toBe(true);
    expect(budget.take('a', 1)).toBe(false);
    expect(budget.take('b', 20)).toBe(true);
    at = 60_000;
    expect(budget.take('a', 20)).toBe(true);
  });
});
