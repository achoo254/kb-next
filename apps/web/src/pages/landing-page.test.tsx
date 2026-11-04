import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionState } from '../api/session-api';
import { renderWithI18n } from '../test/render';
import { LandingPage } from './landing-page';
import { BOARD_SPACES } from './universe-test-data';

/** /api/spaces as a guest sees it: the public Spaces (no personal one), or failing. */
function serveSpaces(ok = true): void {
  const spaces = BOARD_SPACES.filter((space) => space.kind !== 'personal');
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => (ok ? new Response(JSON.stringify({ spaces }), { headers: { 'Content-Type': 'application/json' } }) : new Response('{}', { status: 500 }))),
  );
}

beforeEach(() => serveSpaces());

const OUT: SessionState = { status: 'ready', signedIn: false, signInAvailable: true };
const IN: SessionState = { status: 'ready', signedIn: true, signInAvailable: true };

afterEach(() => {
  vi.unstubAllGlobals();
  document.cookie = 'hd_lang=; Max-Age=0; path=/';
  localStorage.clear();
});

describe('LandingPage', () => {
  it('sends a visitor through the sign-in gate to the Universe', () => {
    renderWithI18n(<LandingPage session={OUT} />);
    expect(document.querySelector('[data-screen="S01"]')).not.toBeNull();
    expect(screen.getByRole('link', { name: 'Sign in with your hoandat account' }).getAttribute('href')).toBe('/login?return=%2Fu&go=1');
    expect(screen.getByRole('link', { name: 'Sign in' }).getAttribute('href')).toBe('/login?return=%2Fu&go=1');
    expect(screen.getByText('Knowledge OS · kb.hoandat.com')).toBeTruthy();
  });

  it('previews the Universe from the public Spaces, with the visitor’s own Space as a promise', async () => {
    renderWithI18n(<LandingPage session={OUT} />);
    const preview = screen.getByRole('region', { name: 'Universe preview' });
    await waitFor(() => expect(preview.querySelectorAll('.kf-crystal')).toHaveLength(7));
    expect(screen.getByRole('link', { name: 'Networking · 8 labs' }).getAttribute('href')).toBe('/s/networking');
    expect(screen.getByRole('link', { name: 'Your universe · private' }).getAttribute('href')).toBe('/u');
    expect(screen.getByRole('link', { name: 'Enter the Học Cloud Universe' }).textContent).toContain('7 Spaces');
  });

  it('keeps the orb and the visitor’s own Space when the Spaces cannot be loaded', async () => {
    serveSpaces(false);
    renderWithI18n(<LandingPage session={OUT} />);
    await waitFor(() => expect(screen.getByRole('link', { name: 'Enter the Học Cloud Universe' }).textContent).toContain('1 Spaces'));
    expect(document.querySelectorAll('.kf-crystal')).toHaveLength(1);
  });

  it('lets a signed-in visitor go straight in', () => {
    renderWithI18n(<LandingPage session={IN} />);
    const enter = screen.getAllByRole('link', { name: 'Enter the Universe' });
    expect(enter.map((link) => link.getAttribute('href'))).toEqual(['/u', '/u']);
    expect(screen.queryByRole('link', { name: 'Sign in' })).toBeNull();
  });

  it('switches the language from the top bar', () => {
    renderWithI18n(<LandingPage session={OUT} />);
    fireEvent.click(screen.getByRole('button', { name: 'Change language (now English)' }));
    expect(screen.getByRole('button', { name: 'Đổi ngôn ngữ (đang dùng Tiếng Việt)' }).textContent).toBe('VI');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Vũ trụ tri thức\nhỏi gì cũng có nguồn');
  });
});
