import { act, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearPrefetched } from './api/api-client';
import { RoutedApp } from './app';
import { getRouterState, navigate, resetRouter } from './router/navigation';
import { answer } from './test/api-fakes';
import { renderWithI18n } from './test/render';

const SESSION = { signedIn: true, signInAvailable: true, user: { id: 'u1', name: 'Đạt', email: 'dat@example.com', picture: null, readerTextSize: 20 } };

let sessionChecks = 0;
let slowSpace = false;

function fakeApi(input: RequestInfo | URL): Promise<Response> {
  const path = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
  if (path === '/api/session') {
    sessionChecks += 1;
    return Promise.resolve(answer(200, SESSION));
  }
  if (path === '/api/me/notifications/unread') return Promise.resolve(answer(200, { total: 0, byKind: {} }));
  if (slowSpace && path.startsWith('/api/spaces/')) return new Promise<Response>(() => undefined);
  // every screen's own data: an error, which each screen shows inside its shell
  return Promise.resolve(answer(503, { error: 'unavailable' }));
}

beforeEach(() => {
  sessionChecks = 0;
  slowSpace = false;
  window.history.replaceState(null, '', '/inbox');
  resetRouter();
  clearPrefetched();
  vi.stubGlobal('fetch', vi.fn(fakeApi));
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function shown(code: string): Promise<HTMLElement> {
  let main: HTMLElement | null = null;
  await waitFor(() => {
    main = document.querySelector<HTMLElement>(`.app-shell > main#content[data-screen="${code}"]`);
    expect(main).not.toBeNull();
  });
  if (!main) throw new Error(`screen ${code} not shown`);
  return main;
}

describe('in-app navigation', () => {
  it('changes the screen in place: one session check, no opening card, the same shell, the title announced', async () => {
    const { container } = renderWithI18n(<RoutedApp />);
    const inbox = await shown('C20');
    const rail = container.querySelector('.app-shell-rail');
    expect(container.querySelector('[data-id="route-announcer"]')?.textContent).toBe('');
    // the account's reader text size, as the session tells it
    expect(document.documentElement.style.getPropertyValue('--reader-text-size')).toBe('20px');

    act(() => navigate('/settings/keys'));
    const keys = await shown('F03');
    expect(keys).toBe(inbox);
    expect(container.querySelector('.app-shell-rail')).toBe(rail);
    expect(container.querySelector('[data-id="universe-opening"]')).toBeNull();
    expect(sessionChecks).toBe(1);
    await waitFor(() => expect(document.title).toMatch(/Knowledge Base|·/));
    expect(container.querySelector('[data-id="route-announcer"]')?.textContent).toBe(document.title);

    act(() => window.history.back());
    await shown('C20');
    expect(container.querySelector('.app-shell-rail')).toBe(rail);
    expect(sessionChecks).toBe(1);
  });

  it('shows the progress bar while the next screen waits, and keeps the current one meanwhile', async () => {
    slowSpace = true;
    const { container } = renderWithI18n(<RoutedApp />);
    await shown('C20');
    act(() => navigate('/s/networking'));
    await waitFor(() => expect(container.querySelector('[data-id="nav-progress"]')).not.toBeNull());
    expect(document.querySelector('main#content')?.getAttribute('data-screen')).toBe('C20');
    await shown('C10');
    await waitFor(() => expect(container.querySelector('[data-id="nav-progress"]')).toBeNull());
    expect(getRouterState().pending).toBe(false);
  });
});
