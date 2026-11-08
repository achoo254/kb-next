import type { MessageKey } from './i18n/messages';

/**
 * Who may open a screen: anyone (`public`, a page outside the app's shell); anyone in the app's shell (`open`: the
 * reading screens, a guest sees the public texts and signs in to write, save or ask AI); or only a signed-in account
 * (`signed-in`, others go to the sign-in page first). Owner's decision (07/11/2026): reading never needs an account.
 */
export type ScreenAccess = 'public' | 'open' | 'signed-in';

/** A screen of the app and the mock board it is built from. */
export interface ScreenRoute {
  /** The mock board (design/mock/<code>-*.dc.html, design/mock-png/<code>-*.png). */
  code: string;
  titleKey: MessageKey;
  access: ScreenAccess;
  pattern: RegExp;
}

const segment = '([A-Za-z0-9_-]+)';

/**
 * The app's screens. Reading is open to everyone: the Universe (C09), the list of all Spaces (no board), a Space
 * (C10), a text (C11), search (C12) and the graph (C13). The landing page (S01), the sign-in page (S02), a share link (H02), the privacy and terms pages and
 * the error page (X02, any unknown path) are public pages. Everything else needs a signed-in account.
 */
export const ROUTES: readonly ScreenRoute[] = [
  { code: 'S01', titleKey: 'screen.S01', access: 'public', pattern: /^\/$/ },
  { code: 'S02', titleKey: 'screen.S02', access: 'public', pattern: /^\/login$/ },
  { code: 'H02', titleKey: 'screen.H02', access: 'public', pattern: new RegExp(`^/l/${segment}$`) },
  // The privacy policy and terms of use: text pages with no board of their own (pages/legal-page.tsx).
  { code: 'Privacy', titleKey: 'screen.Privacy', access: 'public', pattern: /^\/privacy$/ },
  { code: 'Terms', titleKey: 'screen.Terms', access: 'public', pattern: /^\/terms$/ },
  { code: 'C09', titleKey: 'screen.C09', access: 'open', pattern: /^\/u$/ },
  { code: 'Spaces', titleKey: 'screen.Spaces', access: 'open', pattern: /^\/spaces$/ },
  { code: 'C10', titleKey: 'screen.C10', access: 'open', pattern: new RegExp(`^/s/${segment}$`) },
  { code: 'C11', titleKey: 'screen.C11', access: 'open', pattern: new RegExp(`^/d/${segment}$`) },
  { code: 'C21', titleKey: 'screen.C21', access: 'open', pattern: new RegExp(`^/d/${segment}/present$`) },
  // The editor of a document, and /new, which creates a note and opens it there.
  { code: 'C02', titleKey: 'screen.C02', access: 'signed-in', pattern: new RegExp(`^/d/${segment}/edit$`) },
  { code: 'C02', titleKey: 'screen.C02', access: 'signed-in', pattern: /^\/new$/ },
  { code: 'C17', titleKey: 'screen.C17', access: 'signed-in', pattern: new RegExp(`^/d/${segment}/history$`) },
  { code: 'F04', titleKey: 'screen.F04', access: 'signed-in', pattern: new RegExp(`^/d/${segment}/translate$`) },
  // Publishing a text (C04: who sees it, where it goes, then "Đăng công khai"), previewing it (C05), publishing it
  // (C06: the steps, then published or what to fix; visiting it never publishes), and its share link (C18).
  { code: 'C04', titleKey: 'screen.C04', access: 'signed-in', pattern: new RegExp(`^/d/${segment}/publish$`) },
  { code: 'C05', titleKey: 'screen.C05', access: 'signed-in', pattern: new RegExp(`^/d/${segment}/preview$`) },
  { code: 'C06', titleKey: 'screen.C06', access: 'signed-in', pattern: new RegExp(`^/d/${segment}/submit$`) },
  { code: 'C18', titleKey: 'screen.C18', access: 'signed-in', pattern: new RegExp(`^/d/${segment}/share$`) },
  { code: 'C12', titleKey: 'screen.C12', access: 'open', pattern: /^\/search$/ },
  { code: 'C14', titleKey: 'screen.C14', access: 'signed-in', pattern: /^\/copilot$/ },
  { code: 'C13', titleKey: 'screen.C13', access: 'open', pattern: /^\/graph$/ },
  // /canvas lists the account's canvases (and creates one), /canvas/:id opens one.
  { code: 'C15', titleKey: 'screen.C15', access: 'signed-in', pattern: new RegExp(`^/canvas(?:/${segment})?$`) },
  // Knowledge journeys: /journey/new creates a draft and opens its builder (C07), /journey/:id/edit builds one,
  // /journey/:id runs it (Flow).
  { code: 'C07', titleKey: 'screen.C07', access: 'signed-in', pattern: /^\/journey\/new$/ },
  { code: 'C07', titleKey: 'screen.C07', access: 'signed-in', pattern: new RegExp(`^/journey/${segment}/edit$`) },
  { code: 'Flow', titleKey: 'screen.Flow', access: 'signed-in', pattern: new RegExp(`^/journey/${segment}$`) },
  // The create ring, opened by the lens rail's "+".
  { code: 'C01', titleKey: 'screen.C01', access: 'signed-in', pattern: /^\/create$/ },
  { code: 'C08', titleKey: 'screen.C08', access: 'signed-in', pattern: /^\/me$/ },
  // Uploading Office files (C03), the Import Center (C16) and the offline sync queue (H04).
  { code: 'C03', titleKey: 'screen.C03', access: 'signed-in', pattern: /^\/upload$/ },
  { code: 'C16', titleKey: 'screen.C16', access: 'signed-in', pattern: /^\/import$/ },
  { code: 'H04', titleKey: 'screen.H04', access: 'signed-in', pattern: /^\/sync$/ },
  { code: 'C20', titleKey: 'screen.C20', access: 'signed-in', pattern: /^\/inbox$/ },
  { code: 'H03', titleKey: 'screen.H03', access: 'signed-in', pattern: /^\/settings$/ },
  { code: 'F03', titleKey: 'screen.F03', access: 'signed-in', pattern: /^\/settings\/keys$/ },
  // An invite link (C19 "Mời bằng link"): signed in through the IdP first, then accepted here.
  { code: 'Invite', titleKey: 'screen.Invite', access: 'signed-in', pattern: new RegExp(`^/i/${segment}$`) },
  // The admin station (admins only; others get X02 403): workspace settings, published texts (also the station's
  // entry, /admin), the API and its tokens.
  { code: 'C19', titleKey: 'screen.C19', access: 'signed-in', pattern: /^\/admin\/settings$/ },
  { code: 'A02', titleKey: 'screen.A02', access: 'signed-in', pattern: /^\/admin(\/content)?$/ },
  { code: 'A03', titleKey: 'screen.A03', access: 'signed-in', pattern: /^\/admin\/api$/ },
];

/** The error page: any path no screen claims. */
export const NOT_FOUND: ScreenRoute = { code: 'X02', titleKey: 'screen.X02', access: 'public', pattern: /^$/ };

/** Normalised path: no trailing slash except the root. */
export function routePath(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
}

export function matchRoute(pathname: string): ScreenRoute {
  const path = routePath(pathname);
  return ROUTES.find((route) => route.pattern.test(path)) ?? NOT_FOUND;
}

/** The path parameter of a route (`/s/:space`, `/d/:doc`): the pattern's first capture group. */
export function routeParam(route: ScreenRoute, path: string): string {
  return route.pattern.exec(routePath(path))?.[1] ?? '';
}

/**
 * Screens always opened by a full page load, never by in-app navigation: the sign-in page (S02, the way to the
 * IdP and back) and a share link (H02, whose page the server sends with the shared text's link preview tags).
 */
const FULL_LOAD_SCREENS: ReadonlySet<string> = new Set(['S02', 'H02']);

/**
 * Whether a path of this site opens in the app without a page load: a screen of ROUTES other than the full-load ones.
 * Anything else (/api, /auth, files, the dev kit, an unknown path the server may answer) is left to the browser.
 */
export function isInAppPath(pathname: string): boolean {
  const route = matchRoute(pathname);
  return route !== NOT_FOUND && !FULL_LOAD_SCREENS.has(route.code);
}
