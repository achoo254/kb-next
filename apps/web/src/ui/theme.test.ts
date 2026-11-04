import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolvedTheme, setTheme } from './theme';

describe('theme', () => {
  afterEach(() => {
    setTheme(null);
    vi.unstubAllGlobals();
  });

  it('follows the system scheme until data-theme pins one', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('light'), addEventListener() {}, removeEventListener() {} }));
    expect(resolvedTheme()).toBe('light');
    setTheme('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(resolvedTheme()).toBe('dark');
    setTheme(null);
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });
});
