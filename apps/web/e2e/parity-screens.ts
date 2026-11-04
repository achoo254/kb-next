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
}

/** At most 3% of pixels may differ from the board. */
export const MAX_DIFF_RATIO = 0.03;

export const PARITY_SCREENS: readonly ParityScreen[] = [
  { board: 'C09-Universe', path: '/u', signedIn: true, status: 'pending' },
  { board: 'S01-Landing', path: '/', signedIn: false, status: 'built' },
  // The first-visit dialog at its first step (`?tour=1` opens it for an onboarded account too). Pending until the
  // Universe behind the dimmed dialog (C09: crystals, AI panel) is built.
  { board: 'S03-Onboarding', path: '/u?tour=1', signedIn: true, status: 'pending' },
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
