import { fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SessionState } from '../api/session-api';
import { renderWithI18n } from '../test/render';
import { LoginPage, UniverseOpening, gateHref, loginView } from './login-page';

const OUT: SessionState = { status: 'ready', signedIn: false, signInAvailable: true };
const IN: SessionState = { status: 'ready', signedIn: true, signInAvailable: true };
const CLOSED: SessionState = { status: 'ready', signedIn: false, signInAvailable: false };

function at(path: string): void {
  window.history.replaceState(null, '', path);
}

afterEach(() => {
  at('/');
  vi.restoreAllMocks();
});

describe('loginView', () => {
  it('waits at the gate, opens it on request, and reports why sign-in failed', () => {
    expect(loginView(OUT, '?return=%2Fu', false)).toEqual({ card: 'gate', opening: false });
    expect(loginView(OUT, '?return=%2Fu', true)).toEqual({ card: 'gate', opening: true });
    expect(loginView(OUT, '?return=%2Fu&go=1', false)).toEqual({ card: 'gate', opening: true });
    expect(loginView(OUT, '?login=fail', false)).toEqual({ card: 'failed', reason: 'fail' });
    expect(loginView(OUT, '?login=busy&go=1', false)).toEqual({ card: 'failed', reason: 'busy' });
    expect(loginView(OUT, '?login=removed', false)).toEqual({ card: 'failed', reason: 'removed' });
    expect(loginView(CLOSED, '', false)).toEqual({ card: 'failed', reason: 'unavailable' });
    expect(loginView(IN, '?login=fail', false)).toEqual({ card: 'opening' });
    expect(loginView({ status: 'loading' }, '?go=1', false)).toEqual({ card: 'gate', opening: true });
  });

  it('builds the landing link that goes straight on to the IdP, to this site only', () => {
    expect(gateHref('/u')).toBe('/login?return=%2Fu&go=1');
    expect(gateHref('https://evil.example')).toBe('/login?return=%2F&go=1');
  });
});

describe('LoginPage', () => {
  it('offers one sign-in button to the server route, and shows the gate opening once clicked', () => {
    at('/login?return=%2Fd%2Fdhcp');
    renderWithI18n(<LoginPage session={OUT} />);
    const cta = screen.getByRole('link', { name: 'Sign in with your hoandat account' });
    expect(cta.getAttribute('href')).toBe('/auth/login?return=%2Fd%2Fdhcp&lang=en');
    cta.addEventListener('click', (event) => event.preventDefault());
    fireEvent.click(cta);
    expect(screen.getByRole('status').textContent).toBe('Opening the auth.hoandat.com gate…');
    expect(screen.queryByRole('link', { name: 'Sign in with your hoandat account' })).toBeNull();
    expect(document.querySelector('[data-screen="S02"]')).not.toBeNull();
  });

  it('shows a failed sign-in with a retry and a way home', () => {
    at('/login?login=busy&return=%2Fu');
    renderWithI18n(<LoginPage session={OUT} />);
    expect(screen.getByRole('alert').textContent).toBe('Too many sign-ins');
    expect(screen.getByText('Too many sign-ins from your network. Wait a few minutes and try again.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Try again' }).getAttribute('href')).toBe('/auth/login?return=%2Fu&lang=en');
    expect(screen.getAllByRole('link', { name: 'Back to home' })[0]?.getAttribute('href')).toBe('/');
  });

  it('says sign-in is closed when the server has no IdP', () => {
    at('/login');
    renderWithI18n(<LoginPage session={CLOSED} />);
    expect(screen.getByRole('alert').textContent).toBe('Sign-in is closed for now');
  });
});

describe('UniverseOpening', () => {
  it('walks the three steps with the progress bar', () => {
    const first = renderWithI18n(<UniverseOpening stage="auth" />);
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('24');
    expect(document.querySelector('[data-id="opening-step-auth"]')?.getAttribute('data-state')).toBe('running');
    first.unmount();
    renderWithI18n(<UniverseOpening stage="universe" />);
    expect(document.querySelector('[data-id="opening-step-auth"]')?.getAttribute('data-state')).toBe('done');
    expect(document.querySelector('[data-id="opening-step-universe"]')?.textContent).toContain('running');
    expect(document.querySelector('[data-id="opening-step-ready"]')?.textContent).toContain('waiting');
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('62');
    expect(document.querySelector('[data-screen="C09"]')).not.toBeNull();
  });
});
