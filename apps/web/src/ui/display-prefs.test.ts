import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PREFS, DEFAULT_VIEW_KEY, DISPLAY_PREFS_KEY, applyPrefs, prefersReducedMotion, readDefaultView, readStoredPrefs, storeDefaultView } from './display-prefs';

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.motion;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('display settings', () => {
  it('reads the copy kept in this browser, the defaults when it is missing or broken', () => {
    expect(readStoredPrefs()).toEqual(DEFAULT_PREFS);
    localStorage.setItem(DISPLAY_PREFS_KEY, '{not json');
    expect(readStoredPrefs()).toEqual(DEFAULT_PREFS);
    localStorage.setItem(DISPLAY_PREFS_KEY, JSON.stringify({ theme: 'blue', reducedMotion: 'yes' }));
    expect(readStoredPrefs()).toEqual(DEFAULT_PREFS);
    localStorage.setItem(DISPLAY_PREFS_KEY, JSON.stringify({ theme: 'light', reducedMotion: true }));
    expect(readStoredPrefs()).toEqual({ theme: 'light', reducedMotion: true });
  });

  it('applies the theme and reduced motion to the page and keeps them for the next first paint', () => {
    applyPrefs({ theme: 'light', reducedMotion: true });
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.documentElement.dataset.motion).toBe('reduce');
    expect(readStoredPrefs()).toEqual({ theme: 'light', reducedMotion: true });
    applyPrefs({ theme: 'system', reducedMotion: false });
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(document.documentElement.dataset.motion).toBeUndefined();
  });

  it('stops motion for the app switch or the system setting', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query }));
    expect(prefersReducedMotion()).toBe(false);
    applyPrefs({ theme: 'dark', reducedMotion: true });
    expect(prefersReducedMotion()).toBe(true);
    applyPrefs({ theme: 'dark', reducedMotion: false });
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce'), media: query }));
    expect(prefersReducedMotion()).toBe(true);
  });

  it('remembers the default view of this device', () => {
    expect(readDefaultView()).toBe('orbit');
    storeDefaultView('list');
    expect(localStorage.getItem(DEFAULT_VIEW_KEY)).toBe('list');
    expect(readDefaultView()).toBe('list');
  });
});
