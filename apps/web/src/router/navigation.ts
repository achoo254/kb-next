/**
 * In-app navigation (docs/navigation.md). A click on a link to a screen of the app, `navigate()` and the browser's
 * back/forward change the address with the History API and re-render the app in place: the bundle, the session and
 * the app shell stay, only the screen changes.
 *
 * A navigation keeps the current screen on view, under a thin progress bar (navigation-progress.tsx), while the next
 * screen's first data loads (route-prefetch.ts), for at most NAV_GRACE_MS; then the next screen mounts, with its data
 * already there or its own loading state. Where the browser has View Transitions the swap is atomic: the old screen
 * stays painted until the new one has rendered the data that was waiting (SETTLE_MS at most), then the content area
 * cross-fades (none with reduced motion).
 *
 * Each history entry the router makes carries a key (`history.state.kbNav`): the scroll position is kept per key and
 * restored on back/forward; a new screen opens at the top, or at its `#anchor`.
 */
import { flushSync } from 'react-dom';
import { useSyncExternalStore } from 'react';
import { prefersReducedMotion } from '../ui/display-prefs';
import { isInAppPath } from '../routes';
import { prefetchRoute } from './route-prefetch';

/** How long the current screen stays while the next one's data loads; after that the next one shows its skeleton. */
export const NAV_GRACE_MS = 300;
/** How long a view transition waits for data already in the cache to render before it swaps. */
export const SETTLE_MS = 40;

export interface RouterLocation {
  pathname: string;
  search: string;
  hash: string;
  /** The history entry's key; a new one for each navigation, so the screen mounts afresh. */
  key: string;
}

export interface RouterState {
  location: RouterLocation;
  /** A navigation is waiting for its screen (the progress bar shows). */
  pending: boolean;
}

type Mode = 'push' | 'replace' | 'pop';

const STATE_KEY = 'kbNav';

let state: RouterState | null = null;
const listeners = new Set<() => void>();
let installed = false;
/** Navigations made in the app since the page loaded (0: the screen came with the page). */
let inAppNavigations = 0;
/** The latest navigation: an older one still waiting gives way. */
let latest = 0;
let keySeed = 0;
const scrollPositions = new Map<string, { x: number; y: number }>();

function newKey(): string {
  keySeed += 1;
  return `${Date.now().toString(36)}-${keySeed}`;
}

/** The router key of a history entry's state, if the router made (or stamped) that entry. */
export function entryKey(historyState: unknown): string | undefined {
  if (typeof historyState !== 'object' || historyState === null || !(STATE_KEY in historyState)) return undefined;
  const key: unknown = (historyState as Record<string, unknown>)[STATE_KEY];
  return typeof key === 'string' ? key : undefined;
}

function withKey(historyState: unknown, key: string): Record<string, unknown> {
  const base = typeof historyState === 'object' && historyState !== null ? (historyState as Record<string, unknown>) : {};
  return { ...base, [STATE_KEY]: key };
}

function locationNow(key: string): RouterLocation {
  const { pathname, search, hash } = window.location;
  return { pathname, search, hash, key };
}

function current(): RouterState {
  state ??= { location: locationNow(entryKey(window.history.state) ?? newKey()), pending: false };
  return state;
}

function setState(next: Partial<RouterState>): void {
  state = { ...current(), ...next };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getRouterState(): RouterState {
  return current();
}

/** The address the app shows and whether a navigation is waiting. */
export function useRouterState(): RouterState {
  return useSyncExternalStore(subscribe, current, current);
}

/** Whether the app has navigated in place since the page loaded (the opening card is for the page load only). */
export function hasNavigatedInApp(): boolean {
  return inAppNavigations > 0;
}

/** Whether `url` opens in the app without a page load: this origin, a screen of the app (routes.ts `isInAppPath`). */
export function isInAppUrl(url: URL): boolean {
  return (url.protocol === 'http:' || url.protocol === 'https:') && url.origin === window.location.origin && isInAppPath(url.pathname);
}

function fullLoad(href: string, replace: boolean): void {
  if (replace) window.location.replace(href);
  else window.location.assign(href);
}

function parse(href: string): URL | null {
  try {
    return new URL(href, window.location.href);
  } catch {
    return null;
  }
}

/**
 * Goes to `href`: in place for a screen of the app, by a page load otherwise (and whenever the router is not
 * running, e.g. a screen rendered on its own in a test). `replace` replaces the current history entry.
 */
export function navigate(href: string, options: { replace?: boolean } = {}): void {
  const replace = options.replace === true;
  const url = installed ? parse(href) : null;
  if (!url || !isInAppUrl(url)) {
    fullLoad(href, replace);
    return;
  }
  void go(url, replace || url.href === window.location.href ? 'replace' : 'push');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function scrollToTarget(location: RouterLocation, mode: Mode): void {
  if (mode === 'pop') {
    const saved = scrollPositions.get(location.key);
    if (saved) {
      window.scrollTo(saved.x, saved.y);
      return;
    }
  }
  if (location.hash.length > 1) {
    let id = location.hash.slice(1);
    try {
      id = decodeURIComponent(id);
    } catch {
      // A malformed escape: look the raw text up.
    }
    const target = document.getElementById(id);
    if (target) {
      target.scrollIntoView();
      return;
    }
  }
  window.scrollTo(0, 0);
}

/** Where focus goes after a navigation: the new screen's main heading, else its main content. */
function focusContent(): void {
  const main = document.getElementById('content') ?? document.querySelector('main');
  if (!main) return;
  const heading = main.querySelector<HTMLElement>('h1');
  const target = heading ?? (main instanceof HTMLElement ? main : null);
  if (!target) return;
  if (!target.hasAttribute('tabindex')) {
    target.setAttribute('tabindex', '-1');
    target.dataset.routeFocus = '';
  }
  target.focus({ preventScroll: true });
}

/** Switches the address (for push/replace) and the state; React renders the new screen inside flushSync. */
function apply(url: URL, mode: Mode): RouterLocation {
  const from = current().location;
  scrollPositions.set(from.key, { x: window.scrollX, y: window.scrollY });
  let key: string;
  if (mode === 'pop') {
    key = entryKey(window.history.state) ?? newKey();
    if (entryKey(window.history.state) === undefined) window.history.replaceState(withKey(window.history.state, key), '');
  } else {
    key = newKey();
    const entry = withKey(null, key);
    if (mode === 'push') window.history.pushState(entry, '', url.href);
    else window.history.replaceState(entry, '', url.href);
  }
  inAppNavigations += 1;
  const location = locationNow(key);
  flushSync(() => setState({ location }));
  return location;
}

type StartViewTransition = (update: () => Promise<void>) => { updateCallbackDone: Promise<void>; finished: Promise<void> };

function viewTransitions(): StartViewTransition | null {
  const start: unknown = (document as Document & { startViewTransition?: unknown }).startViewTransition;
  return typeof start === 'function' ? (start.bind(document) as StartViewTransition) : null;
}

/** Mounts the new screen; with View Transitions, inside one (see the module comment). */
async function commit(url: URL, mode: Mode, dataWaiting: boolean): Promise<void> {
  const update = async (): Promise<void> => {
    const location = apply(url, mode);
    scrollToTarget(location, mode);
    if (!dataWaiting) return;
    await sleep(SETTLE_MS);
    // The content may have grown into place: back/forward and #anchors land where they belong.
    if (mode === 'pop' || location.hash.length > 1) scrollToTarget(location, mode);
  };
  const start = viewTransitions();
  if (!start) {
    await update();
    return;
  }
  const root = document.documentElement;
  // The content area gets a name only for the transition (navigation.css): only it cross-fades, the shell holds still.
  const fade = !prefersReducedMotion();
  if (fade) root.dataset.navTransition = '';
  try {
    const transition = start(update);
    void transition.finished.catch(() => undefined).finally(() => delete root.dataset.navTransition);
    await transition.updateCallbackDone;
  } catch (error) {
    delete root.dataset.navTransition;
    console.error('navigation failed', error);
  }
}

async function go(url: URL, mode: Mode): Promise<void> {
  latest += 1;
  const token = latest;
  setState({ pending: true });
  try {
    const outcome = await Promise.race([prefetchRoute(url).then((loader) => (loader ? 'ready' : 'none')), sleep(NAV_GRACE_MS).then(() => 'late')]);
    if (token !== latest) return;
    await commit(url, mode, outcome === 'ready');
    if (token === latest) focusContent();
  } catch (error) {
    console.error('navigation failed', error);
  } finally {
    if (token === latest) setState({ pending: false });
  }
}

function onPopState(): void {
  const rendered = current().location;
  const key = entryKey(window.history.state);
  // Same screen: a #anchor step, or an entry a screen made for itself (they only replace theirs today).
  const sameScreen = key === undefined ? window.location.pathname === rendered.pathname : key === rendered.key;
  if (sameScreen) return;
  void go(new URL(window.location.href), 'pop');
}

/**
 * The link a click opens in the app, or null when the browser should handle it: another button, a modifier key (new
 * tab or window), a click a handler already took, a link with a target, `download` or `rel="external"`, an address
 * outside the app (other origin, /api, /auth, files, sign-in, share pages), or an #anchor of the page on view.
 */
export function inAppLinkOf(event: Pick<MouseEvent, 'target' | 'defaultPrevented' | 'button' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'>): URL | null {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  return inAppLinkAt(event.target);
}

/** The in-app address of the link at (or around) `target`, by the rules of `inAppLinkOf` except the event's own. */
export function inAppLinkAt(target: EventTarget | null): URL | null {
  if (!(target instanceof Element)) return null;
  const anchor = target.closest('a[href]');
  if (!(anchor instanceof HTMLAnchorElement)) return null;
  if (anchor.hasAttribute('download')) return null;
  const linkTarget = anchor.getAttribute('target');
  if (linkTarget && linkTarget !== '_self') return null;
  if (/(^|\s)external(\s|$)/i.test(anchor.getAttribute('rel') ?? '')) return null;
  const url = parse(anchor.href);
  if (!url || !isInAppUrl(url)) return null;
  const here = window.location;
  if (url.hash && url.pathname === here.pathname && url.search === here.search) return null;
  return url;
}

function onClick(event: MouseEvent): void {
  const url = inAppLinkOf(event);
  if (!url) return;
  event.preventDefault();
  navigate(url.href);
}

let lastPrefetch = '';

function onIntent(event: Event): void {
  const url = inAppLinkAt(event.target);
  if (!url || url.href === lastPrefetch) return;
  lastPrefetch = url.href;
  void prefetchRoute(url);
}

/**
 * Starts the router: link clicks, back/forward, prefetch on hover/focus/touch, and the scroll kept per entry.
 * Returns the stop (React StrictMode starts, stops and starts again).
 */
export function installRouter(): () => void {
  const key = current().location.key;
  if (entryKey(window.history.state) !== key) window.history.replaceState(withKey(window.history.state, key), '');
  const previousRestoration = window.history.scrollRestoration;
  window.history.scrollRestoration = 'manual';
  document.addEventListener('click', onClick);
  document.addEventListener('mouseover', onIntent);
  document.addEventListener('focusin', onIntent);
  document.addEventListener('touchstart', onIntent, { passive: true });
  window.addEventListener('popstate', onPopState);
  installed = true;
  return () => {
    installed = false;
    document.removeEventListener('click', onClick);
    document.removeEventListener('mouseover', onIntent);
    document.removeEventListener('focusin', onIntent);
    document.removeEventListener('touchstart', onIntent);
    window.removeEventListener('popstate', onPopState);
    window.history.scrollRestoration = previousRestoration;
  };
}

/** Forgets the router's state (tests): the next read takes the browser's address again. */
export function resetRouter(): void {
  state = null;
  inAppNavigations = 0;
  latest += 1;
  lastPrefetch = '';
  scrollPositions.clear();
}
