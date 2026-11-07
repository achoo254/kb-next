import { cleanup, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { SessionState } from '../api/session-api';
import { renderWithI18n } from '../test/render';
import { AppShell, accountInitial } from './app-shell';
import { LAST_SPACE_KEY } from './last-space';
import { SessionProvider } from './session-context';

const SIGNED_IN: SessionState = {
  status: 'ready',
  signedIn: true,
  signInAvailable: true,
  user: { name: 'Đạt Trần', email: 'dat@example.com', picture: null },
};

describe('AppShell', () => {
  it('gives a guest a sign-in button back to the page on view, and no inbox', () => {
    window.history.replaceState(null, '', '/d/abc?lang=en');
    renderWithI18n(
      <SessionProvider value={{ status: 'ready', signedIn: false, signInAvailable: true }}>
        <AppShell screen="C11" view="docs">
          <p>content</p>
        </AppShell>
      </SessionProvider>,
    );
    expect(screen.getByRole('link', { name: 'Sign in' }).getAttribute('href')).toBe('/login?return=%2Fd%2Fabc%3Flang%3Den&go=1');
    expect(screen.queryByRole('link', { name: 'Notifications' })).toBeNull();
    window.history.replaceState(null, '', '/');
  });

  it('links every rail section and view to its route and lights the current ones', () => {
    renderWithI18n(
      <SessionProvider value={SIGNED_IN}>
        <AppShell screen="C13" rail="graph" view="graph" spaceHref="/s/networking" docHref="/d/abc">
          <p>content</p>
        </AppShell>
      </SessionProvider>,
    );
    const rail = screen.getByRole('navigation', { name: 'Main navigation' });
    const hrefs = within(rail)
      .getAllByRole('link')
      .map((link) => link.getAttribute('href'));
    // The Graph and Canvas of the current Space.
    expect(hrefs).toEqual(['/u', '/graph?space=networking', '/create', '/search', '/copilot', '/s/networking', '/me', '/settings']);
    expect(within(rail).getByRole('link', { name: 'Graph' }).getAttribute('aria-current')).toBe('page');

    const views = screen.getByRole('navigation', { name: 'Views' });
    expect(within(views).getByRole('link', { name: 'Docs' }).getAttribute('href')).toBe('/d/abc');
    expect(within(views).getByRole('link', { name: 'Canvas' }).getAttribute('href')).toBe('/canvas?space=networking');
    expect(within(views).getByRole('link', { name: 'Graph' }).getAttribute('aria-current')).toBe('page');
    expect(within(views).getByRole('link', { name: 'Orbit' }).getAttribute('aria-current')).toBeNull();

    expect(screen.getByRole('link', { name: 'Notifications' }).getAttribute('href')).toBe('/inbox');
    expect(screen.getByRole('main').dataset.screen).toBe('C13');
    expect(screen.getByText('content')).toBeTruthy();
  });

  it('puts the signed-in account on the avatar', () => {
    renderWithI18n(
      <SessionProvider value={SIGNED_IN}>
        <AppShell screen="C09" rail="universe" view="orbit" />
      </SessionProvider>,
    );
    const avatar = screen.getByRole('link', { name: 'Account of Đạt Trần' });
    expect(avatar.textContent).toBe('Đ');
    expect(avatar.getAttribute('href')).toBe('/settings');
  });

  it('draws the breadcrumb with links up to the current page', () => {
    renderWithI18n(
      <AppShell
        screen="C11"
        view="docs"
        breadcrumb={[{ label: 'Universe', href: '/u' }, { label: 'Networking', href: '/s/networking' }, { label: 'Giao thức nền tảng' }, { label: 'Giao thức DHCP' }]}
      />,
    );
    const crumbs = screen.getByRole('navigation', { name: 'You are here' });
    expect(within(crumbs).getAllByRole('link').map((link) => link.textContent)).toEqual(['Universe', 'Networking']);
    expect(within(crumbs).getByText('Giao thức DHCP').getAttribute('aria-current')).toBe('page');
    // Signed out (no session in context): no avatar.
    expect(screen.queryByRole('link', { name: /Account/ })).toBeNull();
  });

  describe('"Spaces" off a Space', () => {
    beforeEach(() => localStorage.removeItem(LAST_SPACE_KEY));
    const spacesLink = (): string | null =>
      within(screen.getByRole('navigation', { name: 'Main navigation' }))
        .getByRole('link', { name: 'Spaces' })
        .getAttribute('href');

    it('opens the first Space until one is opened, then the last one opened', () => {
      renderWithI18n(<AppShell screen="C09" rail="universe" view="orbit" fallbackSpaceHref="/s/networking" />);
      expect(spacesLink()).toBe('/s/networking');
      cleanup();

      renderWithI18n(<AppShell screen="C10" rail="spaces" spaceHref="/s/docker" />);
      expect(spacesLink()).toBe('/s/docker');
      cleanup();

      renderWithI18n(<AppShell screen="C09" rail="universe" view="orbit" fallbackSpaceHref="/s/networking" />);
      expect(spacesLink()).toBe('/s/docker');
      // the Graph stays the whole Universe's off a Space
      expect(within(screen.getByRole('navigation', { name: 'Main navigation' })).getByRole('link', { name: 'Graph' }).getAttribute('href')).toBe('/graph');
    });
  });

  it('leaves the breadcrumb out on the Universe', () => {
    renderWithI18n(<AppShell screen="C09" rail="universe" view="orbit" />);
    expect(screen.queryByRole('navigation', { name: 'You are here' })).toBeNull();
  });
});

describe('accountInitial', () => {
  it('takes the first letter of the name, else of the email', () => {
    expect(accountInitial({ name: 'đạt', email: null, picture: null })).toBe('Đ');
    expect(accountInitial({ name: '  ', email: 'zed@example.com', picture: null })).toBe('Z');
    expect(accountInitial({ name: null, email: null, picture: null })).toBe('·');
  });
});
