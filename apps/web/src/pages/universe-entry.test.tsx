import { screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getRouterState, installRouter, navigate, resetRouter } from '../router/navigation';
import { renderWithI18n } from '../test/render';
import { resetOpeningClock } from './opening-pace';
import { UniverseEntry, showOnboarding } from './universe-entry';

const ME = {
  name: 'Đạt',
  email: 'dat@example.com',
  picture: null,
  lang: 'vi',
  theme: 'system',
  role: 'member',
  isAdmin: false,
  canReview: false,
  roleLocked: false,
  reducedMotion: false,
  onboardedAt: null as string | null,
  interests: [],
};

const SPACE = {
  slug: 'networking',
  nameVi: 'Mạng',
  nameEn: 'Networking',
  tint: 'var(--tint-net)',
  glow: 'var(--glow-net)',
  art: '/art/crystal-networking.webp',
  kind: 'public',
  caption: { vi: '8 lab', en: '8 labs' },
  documentCount: 8,
  collectionCount: 4,
  collections: [],
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function serve(me: Response): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/api/me') return me;
      if (url === '/api/spaces') return json({ spaces: [SPACE, { ...SPACE, slug: 'mine', kind: 'personal' }] });
      return json({ error: 'not-found' }, 404);
    }),
  );
}

// The opening card's beats (opening-pace.ts) are tested on their own: here they are the short reduced-motion one,
// waited for with room to spare on a busy test machine.
const OPENED = { timeout: 3000 };
beforeEach(() => {
  document.documentElement.dataset.motion = 'reduce';
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
  delete document.documentElement.dataset.motion;
  resetOpeningClock();
});

describe('showOnboarding', () => {
  it('shows on the first visit, or when asked with ?tour=1 once the account is read', () => {
    expect(showOnboarding({ status: 'ready', onboarded: false }, '')).toBe(true);
    expect(showOnboarding({ status: 'ready', onboarded: true }, '')).toBe(false);
    expect(showOnboarding({ status: 'ready', onboarded: true }, '?tour=1')).toBe(true);
    expect(showOnboarding({ status: 'failed' }, '')).toBe(false);
    expect(showOnboarding({ status: 'failed' }, '?tour=1')).toBe(true);
    expect(showOnboarding({ status: 'loading' }, '?tour=1')).toBe(false);
  });
});

describe('UniverseEntry', () => {
  it('opens the Universe, then the first-visit dialog with the public Spaces as interests', async () => {
    serve(json(ME));
    renderWithI18n(
      <UniverseEntry>
        <p>universe</p>
      </UniverseEntry>,
    );
    expect(screen.getByRole('progressbar')).toBeTruthy();
    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy(), OPENED);
    expect(screen.getByText('universe')).toBeTruthy();
    screen.getByRole('button', { name: 'Next' }).click();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Networking' })).toBeTruthy());
    expect(screen.queryByRole('button', { name: 'mine' })).toBeNull();
  });

  it('skips the dialog for an onboarded account', async () => {
    serve(json({ ...ME, onboardedAt: '2026-11-04T08:00:00.000+07:00' }));
    renderWithI18n(
      <UniverseEntry>
        <p>universe</p>
      </UniverseEntry>,
    );
    await waitFor(() => expect(screen.getByText('universe')).toBeTruthy(), OPENED);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens the Universe without the dialog when the account cannot be read', async () => {
    serve(json({ error: 'internal' }, 500));
    renderWithI18n(
      <UniverseEntry>
        <p>universe</p>
      </UniverseEntry>,
    );
    await waitFor(() => expect(screen.getByText('universe')).toBeTruthy(), OPENED);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows the Universe at once, without the opening card, when reached by in-app navigation', async () => {
    serve(json(ME));
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    resetRouter();
    const stop = installRouter();
    try {
      navigate('/settings');
      await waitFor(() => expect(getRouterState().location.pathname).toBe('/settings'));
      renderWithI18n(
        <UniverseEntry>
          <p>universe</p>
        </UniverseEntry>,
      );
      expect(screen.getByText('universe')).toBeTruthy();
      expect(screen.queryByRole('progressbar')).toBeNull();
      // the first-visit dialog still comes once the account is read
      await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy());
    } finally {
      stop();
      resetRouter();
      vi.restoreAllMocks();
    }
  });
});
