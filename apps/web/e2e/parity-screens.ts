/**
 * The screens the parity check compares with their mock board (design/mock-png/<board>.png), with the route that
 * shows them and whether they are built. A `pending` screen is compared and its difference printed, but only a
 * `built` one must stay within MAX_DIFF_RATIO (or carry its reason in docs/mock-deviations.md and a raised `maxDiff`).
 */
export interface ParityScreen {
  /** File name in design/mock-png without `.png`. */
  board: string;
  path: string;
  /** Whether the screen needs a signed-in account. */
  signedIn: boolean;
  status: 'pending' | 'built';
  /** A per-screen ceiling, only with a reason in docs/mock-deviations.md. */
  maxDiff?: number;
  /** API answers changed for the shot (parity.spec.ts), to hold a screen in one of its states. */
  mocks?: readonly ParityMock[];
  /** Shoot once this element shows, instead of waiting for a quiet network (a screen held while loading). */
  waitFor?: string;
  /** The browser's fixed time (ISO 8601) for a screen that shows relative times. */
  clock?: string;
}

/**
 * `onboarded`: /api/me says the first-visit dialog is done (the Universe without S03 over it); `spaces-pending`:
 * /api/spaces never answers (the Universe loading, S04); `spaces-without-own`: /api/spaces without the reader's own
 * Space (their universe still empty, S05).
 */
export type ParityMock = 'onboarded' | 'spaces-pending' | 'spaces-without-own';

/**
 * 45 days after the seed's latest update (03/11/2026): the Universe's stage then shows "Cần cập nhật · Đã 45 ngày" for
 * the second most recent text, as board C09 does.
 */
const UNIVERSE_CLOCK = '2026-12-18T14:00:00Z';

/** At most 3% of pixels may differ from the board. */
export const MAX_DIFF_RATIO = 0.03;

/** The seed's last update (SEED_LATEST_UPDATE: 03/11/2026 21:05 in Saigon), the "now" of C10 and C11. */
const SEED_CLOCK = '2026-11-03T14:05:00.000Z';

export const PARITY_SCREENS: readonly ParityScreen[] = [
  { board: 'C09-Universe', path: '/u', signedIn: true, status: 'built', mocks: ['onboarded'], clock: UNIVERSE_CLOCK },
  // The Universe loading past 1.5 s (the "Thử lại" chip shows), and the reader's universe still empty.
  { board: 'S04-OrbitSkeleton', path: '/u', signedIn: true, status: 'built', mocks: ['onboarded', 'spaces-pending'], waitFor: '[data-id="universe-slow"]' },
  { board: 'S05-OrbitEmpty', path: '/u', signedIn: true, status: 'built', mocks: ['onboarded', 'spaces-without-own'], clock: UNIVERSE_CLOCK },
  { board: 'S01-Landing', path: '/', signedIn: false, status: 'built' },
  // The seeded Space and document of the boards (KB_SEED=mock): Networking on "Giao thức nền tảng", and DHCP read
  // by the seed's owner (its progress, backlinks, comments "2 giờ trước"), at the seed's last update.
  { board: 'C10-Space', path: '/s/networking', signedIn: true, status: 'built', clock: SEED_CLOCK },
  // maxDiff: the board's default shows an AI answer on a selected passage (own key, phase 7); docs/mock-deviations.md.
  { board: 'C11-Reader', path: '/d/989fedf1-beab-4f13-894d-111654ebdc45', signedIn: true, status: 'built', maxDiff: 0.09, clock: SEED_CLOCK },
  // The first-visit dialog at its first step (`?tour=1` opens it for an onboarded account too), over the Universe.
  { board: 'S03-Onboarding', path: '/u?tour=1', signedIn: true, status: 'built', clock: UNIVERSE_CLOCK },
  // The UI kit (dev server only, apps/web/src/dev-kit).
  { board: 'DesignSystem', path: '/dev/kit/design-system', signedIn: false, status: 'built' },
  { board: 'Interaction', path: '/dev/kit/interaction', signedIn: false, status: 'built' },
  { board: 'X01-Feedback', path: '/dev/kit/feedback', signedIn: false, status: 'built' },
  { board: 'X03-StatesCoverage', path: '/dev/kit/states', signedIn: false, status: 'built' },
  // Boards that show every state of a screen side by side, built from the screens' own components.
  { board: 'S02-Login', path: '/dev/kit/sign-in', signedIn: false, status: 'built' },
  { board: 'X02-Errors', path: '/dev/kit/errors', signedIn: false, status: 'built' },
  // The documentation boards.
  { board: 'Z01-Sitemap', path: '/dev/kit/sitemap', signedIn: false, status: 'built' },
  { board: 'Z02-Spatial3D', path: '/dev/kit/spatial', signedIn: false, status: 'built' },
];
