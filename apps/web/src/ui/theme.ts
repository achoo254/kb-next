import { useSyncExternalStore } from 'react';

/** The two themes of the mock: Tối (dark, the default) and Sáng (light). */
export type ThemeName = 'dark' | 'light';

const LIGHT_QUERY = '(prefers-color-scheme: light)';

export function isThemeName(value: unknown): value is ThemeName {
  return value === 'dark' || value === 'light';
}

/** The theme in use: `data-theme` on <html> wins, else the system's colour scheme (tokens.css follows the same rule). */
export function resolvedTheme(): ThemeName {
  if (typeof document === 'undefined') return 'dark';
  const chosen = document.documentElement.dataset.theme;
  if (isThemeName(chosen)) return chosen;
  const prefersLight = typeof window.matchMedia === 'function' && window.matchMedia(LIGHT_QUERY).matches;
  return prefersLight ? 'light' : 'dark';
}

/** Pins the theme (`null` goes back to following the system). */
export function setTheme(theme: ThemeName | null): void {
  if (theme) document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
}

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  const media = typeof window.matchMedia === 'function' ? window.matchMedia(LIGHT_QUERY) : null;
  media?.addEventListener('change', onChange);
  return () => {
    observer.disconnect();
    media?.removeEventListener('change', onChange);
  };
}

/** The theme in use, re-rendering when `data-theme` or the system scheme changes. */
export function useTheme(): ThemeName {
  return useSyncExternalStore(subscribe, resolvedTheme, () => 'dark');
}
