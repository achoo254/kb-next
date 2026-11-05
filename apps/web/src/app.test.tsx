import { describe, expect, it } from 'vitest';
import { canShow, loginRedirect } from './app';
import { NOT_FOUND, ROUTES, matchRoute } from './routes';

const READY_OUT = { status: 'ready', signedIn: false, signInAvailable: true } as const;
const READY_IN = { status: 'ready', signedIn: true, signInAvailable: true } as const;

describe('routes', () => {
  it.each([
    ['/', 'S01'],
    ['/login', 'S02'],
    ['/u', 'C09'],
    ['/u/', 'C09'],
    ['/s/networking', 'C10'],
    ['/d/dhcp-dora', 'C11'],
    ['/search', 'C12'],
    ['/copilot', 'C14'],
    ['/graph', 'C13'],
    ['/canvas', 'C15'],
    ['/canvas/8bb6d274-c582-491b-88b0-06fdcd845e55', 'C15'],
    ['/canvas/a/b', 'X02'],
    ['/create', 'C01'],
    ['/journey/new', 'C07'],
    ['/journey/0c5f9a3e-1b2d-4e5f-8a9b-0c1d2e3f4a5b/edit', 'C07'],
    ['/journey/0c5f9a3e-1b2d-4e5f-8a9b-0c1d2e3f4a5b', 'Flow'],
    ['/journey/a/b', 'X02'],
    ['/me', 'C08'],
    ['/inbox', 'C20'],
    ['/settings', 'H03'],
    ['/settings/keys', 'F03'],
    ['/d/dhcp-dora/translate', 'F04'],
    ['/admin', 'A01'],
    ['/admin/review', 'A01'],
    ['/l/abc_DEF-123', 'H02'],
    ['/nowhere', 'X02'],
    ['/d/', 'X02'],
    ['/d/a/b', 'X02'],
  ])('%s opens board %s', (path, code) => {
    expect(matchRoute(path).code).toBe(code);
  });

  it('keeps every screen behind sign-in except the landing, sign-in, share-link and error pages', () => {
    const open = [...ROUTES, NOT_FOUND].filter((route) => route.access === 'public').map((route) => route.code);
    expect(open.sort()).toEqual(['H02', 'S01', 'S02', 'X02']);
  });
});

describe('sign-in gate', () => {
  it('shows public screens at once and signed-in screens only to a signed-in account', () => {
    expect(canShow(matchRoute('/'), { status: 'loading' })).toBe(true);
    expect(canShow(matchRoute('/l/tok'), READY_OUT)).toBe(true);
    expect(canShow(matchRoute('/u'), { status: 'loading' })).toBe(false);
    expect(canShow(matchRoute('/u'), READY_OUT)).toBe(false);
    expect(canShow(matchRoute('/u'), READY_IN)).toBe(true);
  });

  it('sends a signed-out visitor to sign in and back to the same page', () => {
    expect(loginRedirect('/d/dhcp', '?lang=en')).toBe('/login?return=%2Fd%2Fdhcp%3Flang%3Den');
  });
});
