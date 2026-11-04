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

export const PARITY_SCREENS: readonly ParityScreen[] = [{ board: 'C09-Universe', path: '/u', signedIn: true, status: 'pending' }];
