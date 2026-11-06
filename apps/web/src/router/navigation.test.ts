import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearPrefetched } from '../api/api-client';
import { answer } from '../test/api-fakes';
import { NAV_GRACE_MS, getRouterState, hasNavigatedInApp, inAppLinkOf, installRouter, navigate, resetRouter } from './navigation';

const ORIGIN = window.location.origin;

function link(href: string, attrs: Record<string, string> = {}): HTMLAnchorElement {
  const anchor = document.createElement('a');
  anchor.setAttribute('href', href);
  for (const [name, value] of Object.entries(attrs)) anchor.setAttribute(name, value);
  anchor.append(document.createElement('span'));
  document.body.append(anchor);
  return anchor;
}

const LEFT = { defaultPrevented: false, button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false };

function clickOn(target: EventTarget, overrides: Partial<typeof LEFT> = {}): URL | null {
  return inAppLinkOf({ ...LEFT, ...overrides, target });
}

/**
 * A click the way the browser dispatches it; true when nothing took it (the browser would follow the link). The
 * page load itself is held back at the window (jsdom cannot load another document).
 */
function click(anchor: HTMLAnchorElement, init: MouseEventInit = {}): boolean {
  let followed = false;
  const hold = (event: Event): void => {
    followed = !event.defaultPrevented;
    event.preventDefault();
  };
  window.addEventListener('click', hold);
  anchor.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init }));
  window.removeEventListener('click', hold);
  return followed;
}

beforeEach(() => {
  window.history.replaceState(null, '', '/u');
  resetRouter();
  clearPrefetched();
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
});

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('which link clicks open in the app', () => {
  it('takes a plain left click on a link to a screen of the app, from the link or anything inside it', () => {
    const anchor = link('/s/networking?c=1');
    expect(clickOn(anchor)?.href).toBe(`${ORIGIN}/s/networking?c=1`);
    expect(clickOn(anchor.firstChild ?? anchor)?.pathname).toBe('/s/networking');
  });

  it.each([
    ['metaKey', { metaKey: true }],
    ['ctrlKey', { ctrlKey: true }],
    ['shiftKey', { shiftKey: true }],
    ['altKey', { altKey: true }],
    ['middle button', { button: 1 }],
    ['a click a handler already took', { defaultPrevented: true }],
  ])('leaves %s to the browser', (_name, overrides) => {
    expect(clickOn(link('/me'), overrides)).toBeNull();
  });

  it.each([
    ['another window', { target: '_blank' }],
    ['a download', { download: '' }],
    ['rel="external"', { rel: 'noopener external' }],
  ])('leaves a link to %s to the browser', (_name, attrs) => {
    expect(clickOn(link('/me', attrs))).toBeNull();
  });

  it('keeps target="_self" in the app', () => {
    expect(clickOn(link('/me', { target: '_self' }))?.pathname).toBe('/me');
  });

  it.each([
    ['another origin', 'https://office.example.com/editor'],
    ['the API', '/api/files/1/download'],
    ['the server sign-in', '/auth/login?return=%2Fu'],
    ['the sign-in page', '/login?return=%2Fu'],
    ['a share page (server-sent link preview)', '/l/abc123'],
    ['an unknown path', '/robots.txt'],
    ['the dev kit', '/dev/kit'],
    ['a mail address', 'mailto:hi@example.com'],
  ])('leaves %s to the browser', (_name, href) => {
    expect(clickOn(link(href))).toBeNull();
  });

  it('leaves an #anchor of the page on view to the browser, and opens another page at its anchor', () => {
    expect(clickOn(link('#install'))).toBeNull();
    expect(clickOn(link('/u#install'))).toBeNull();
    expect(clickOn(link('/privacy#delete'))?.hash).toBe('#delete');
  });

  it('ignores clicks outside links', () => {
    const div = document.createElement('div');
    document.body.append(div);
    expect(clickOn(div)).toBeNull();
    expect(clickOn(link('/me').ownerDocument)).toBeNull();
  });
});

describe('navigate', () => {
  it('goes by a page load while the router is not running', () => {
    const assign = vi.fn();
    const replace = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign, replace });
    navigate('/me');
    navigate('/u', { replace: true });
    expect(assign).toHaveBeenCalledWith('/me');
    expect(replace).toHaveBeenCalledWith('/u');
  });

  it('goes by a page load to an address outside the app', () => {
    const stop = installRouter();
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign, href: window.location.href, origin: ORIGIN });
    navigate('/auth/login?return=%2Fu');
    expect(assign).toHaveBeenCalledWith('/auth/login?return=%2Fu');
    stop();
  });
});

describe('the running router', () => {
  let stop: () => void = () => undefined;
  beforeEach(() => {
    stop = installRouter();
  });
  afterEach(() => stop());

  it('opens an app link in place: new address, new entry key, no page load', async () => {
    const before = getRouterState().location;
    const anchor = link('/settings');
    expect(click(anchor)).toBe(false);
    await vi.waitFor(() => expect(getRouterState().location.pathname).toBe('/settings'));
    expect(window.location.pathname).toBe('/settings');
    expect(getRouterState().location.key).not.toBe(before.key);
    expect(getRouterState().pending).toBe(false);
    expect(hasNavigatedInApp()).toBe(true);
    expect(window.history.length).toBeGreaterThan(1);
  });

  it('lets the browser follow a modified click', () => {
    expect(click(link('/settings'), { ctrlKey: true })).toBe(true);
    expect(getRouterState().location.pathname).toBe('/u');
  });

  it('follows back and forward, opening at the top and back at the kept scroll position', async () => {
    const scrollTo = vi.mocked(window.scrollTo);
    vi.spyOn(window, 'scrollY', 'get').mockReturnValue(420);
    navigate('/settings');
    await vi.waitFor(() => expect(getRouterState().location.pathname).toBe('/settings'));
    expect(scrollTo).toHaveBeenLastCalledWith(0, 0);
    const settingsKey = getRouterState().location.key;

    window.history.back();
    await vi.waitFor(() => expect(getRouterState().location.pathname).toBe('/u'));
    // /u was left at 420px down
    expect(scrollTo).toHaveBeenLastCalledWith(0, 420);

    window.history.forward();
    await vi.waitFor(() => expect(getRouterState().location.key).toBe(settingsKey));
  });

  it('leaves a back step between #anchors of the same page alone', async () => {
    const key = getRouterState().location.key;
    window.history.pushState(null, '', '/u#one');
    window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
    await Promise.resolve();
    expect(getRouterState().location.key).toBe(key);
    expect(getRouterState().pending).toBe(false);
  });

  it('opens another page at its #anchor', async () => {
    const target = document.createElement('h2');
    target.id = 'delete';
    const scrollIntoView = vi.fn();
    target.scrollIntoView = scrollIntoView;
    document.body.append(target);
    navigate('/privacy#delete');
    await vi.waitFor(() => expect(getRouterState().location.hash).toBe('#delete'));
    expect(scrollIntoView).toHaveBeenCalled();
  });

  it('replaces the entry when asked', async () => {
    const length = window.history.length;
    navigate('/me', { replace: true });
    await vi.waitFor(() => expect(getRouterState().location.pathname).toBe('/me'));
    expect(window.history.length).toBe(length);
  });

  it('keeps the current screen while the next one loads, at most the grace period', async () => {
    vi.useFakeTimers();
    // the Space's data never comes
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => undefined)));
    navigate('/s/networking');
    expect(getRouterState().pending).toBe(true);
    await vi.advanceTimersByTimeAsync(NAV_GRACE_MS - 10);
    expect(getRouterState().location.pathname).toBe('/u');
    expect(getRouterState().pending).toBe(true);
    await vi.advanceTimersByTimeAsync(20);
    expect(getRouterState().location.pathname).toBe('/s/networking');
    await vi.advanceTimersByTimeAsync(0);
    expect(getRouterState().pending).toBe(false);
  });

  it('shows the next screen as soon as its data is in', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_path: string) => Promise.resolve(answer(200, {})));
    vi.stubGlobal('fetch', fetchMock);
    navigate('/s/networking');
    await vi.advanceTimersByTimeAsync(0);
    // the data came at once: no waiting for the grace period
    expect(getRouterState().location.pathname).toBe('/s/networking');
    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([expect.stringMatching(/^\/api\/spaces\/networking/)]);
  });

  it('opens a screen without a loader at once', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    navigate('/settings');
    await vi.advanceTimersByTimeAsync(0);
    expect(getRouterState().location.pathname).toBe('/settings');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('lets a later navigation win over one still waiting', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => undefined)));
    navigate('/s/networking');
    navigate('/settings');
    await vi.advanceTimersByTimeAsync(NAV_GRACE_MS + 50);
    expect(getRouterState().location.pathname).toBe('/settings');
    expect(window.location.pathname).toBe('/settings');
  });

  it('prefetches a screen\'s data when its link is hovered, once', async () => {
    const fetchMock = vi.fn((_path: string) => Promise.resolve(answer(200, {})));
    vi.stubGlobal('fetch', fetchMock);
    const anchor = link('/d/dhcp-dora');
    anchor.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    anchor.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    anchor.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toMatch(/^\/api\/documents\/dhcp-dora/);
    // nothing for links that leave the app
    link('/api/files/1').dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('cross-fades the content inside a view transition, without the fade under reduced motion', async () => {
    const seen: Array<string | undefined> = [];
    const start = vi.fn((update: () => Promise<void>) => {
      seen.push(document.documentElement.dataset.navTransition);
      const done = update();
      return { updateCallbackDone: done, finished: done };
    });
    Object.defineProperty(document, 'startViewTransition', { value: start, configurable: true });
    try {
      navigate('/me');
      await vi.waitFor(() => expect(getRouterState().location.pathname).toBe('/me'));
      document.documentElement.dataset.motion = 'reduce';
      navigate('/settings');
      await vi.waitFor(() => expect(getRouterState().location.pathname).toBe('/settings'));
      expect(start).toHaveBeenCalledTimes(2);
      expect(seen).toEqual(['', undefined]);
      await vi.waitFor(() => expect(document.documentElement.dataset.navTransition).toBeUndefined());
    } finally {
      delete document.documentElement.dataset.motion;
      Reflect.deleteProperty(document, 'startViewTransition');
    }
  });

  it('moves focus to the new screen\'s heading', async () => {
    const main = document.createElement('main');
    main.id = 'content';
    const heading = document.createElement('h1');
    main.append(heading);
    document.body.append(main);
    navigate('/me');
    await vi.waitFor(() => expect(document.activeElement).toBe(heading));
    expect(heading.getAttribute('tabindex')).toBe('-1');
  });

  it('stops listening once stopped', () => {
    stop();
    expect(click(link('/settings'))).toBe(true);
    stop = installRouter();
  });
});
