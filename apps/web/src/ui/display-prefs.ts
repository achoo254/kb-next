/**
 * The account's display settings (H03): theme (Tối / Sáng / Theo hệ thống) and app-level reduced motion. The server
 * keeps them per account (PATCH /api/me) and the session hands them over (GET /api/session); this browser keeps a copy
 * so the first paint already has them, before the session answers.
 *
 * Applying them: the theme is `data-theme` on <html> (none: follow the system, tokens.css); reduced motion is
 * `data-motion="reduce"` on <html>, on top of the system's `prefers-reduced-motion` (app.css stops animations and
 * transitions for either; `prefersReducedMotion` answers for both).
 */
import { setTheme } from './theme';

export const THEME_CHOICES = ['dark', 'light', 'system'] as const;
export type ThemeChoice = (typeof THEME_CHOICES)[number];

export interface DisplayPrefs {
  theme: ThemeChoice;
  reducedMotion: boolean;
}

export const DEFAULT_PREFS: DisplayPrefs = { theme: 'system', reducedMotion: false };

/** Where this browser keeps the copy. */
export const DISPLAY_PREFS_KEY = 'kb-display';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function isThemeChoice(value: unknown): value is ThemeChoice {
  return typeof value === 'string' && (THEME_CHOICES as readonly string[]).includes(value);
}

/** The copy kept in this browser; the defaults when there is none or it cannot be read. */
export function readStoredPrefs(): DisplayPrefs {
  try {
    const raw = localStorage.getItem(DISPLAY_PREFS_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return DEFAULT_PREFS;
    const theme = 'theme' in parsed && isThemeChoice(parsed.theme) ? parsed.theme : DEFAULT_PREFS.theme;
    const reducedMotion = 'reducedMotion' in parsed && typeof parsed.reducedMotion === 'boolean' ? parsed.reducedMotion : DEFAULT_PREFS.reducedMotion;
    return { theme, reducedMotion };
  } catch {
    return DEFAULT_PREFS;
  }
}

function storePrefs(prefs: DisplayPrefs): void {
  try {
    localStorage.setItem(DISPLAY_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Storage blocked: the settings still apply now and come back from the server next time.
  }
}

/** Applies the settings to the page at once (every screen follows) and keeps the copy for the next first paint. */
export function applyPrefs(prefs: DisplayPrefs): void {
  setTheme(prefs.theme === 'system' ? null : prefs.theme);
  if (prefs.reducedMotion) document.documentElement.dataset.motion = 'reduce';
  else delete document.documentElement.dataset.motion;
  storePrefs(prefs);
}

/** Whether motion should stop: the app's switch (H03) or the system's setting. */
export function prefersReducedMotion(): boolean {
  if (typeof document !== 'undefined' && document.documentElement.dataset.motion === 'reduce') return true;
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

/** How screens with an orbit and a list (C08 "Của tôi", A02) open on this device (H03 "Mở app ở chế độ"). */
export type DefaultView = 'orbit' | 'list';
export const DEFAULT_VIEW_KEY = 'kb-default-view';

export function readDefaultView(): DefaultView {
  try {
    return localStorage.getItem(DEFAULT_VIEW_KEY) === 'list' ? 'list' : 'orbit';
  } catch {
    return 'orbit';
  }
}

export function storeDefaultView(view: DefaultView): void {
  try {
    localStorage.setItem(DEFAULT_VIEW_KEY, view);
  } catch {
    // Storage blocked: the screens open in the orbit, as by default.
  }
}
