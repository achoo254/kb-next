import { C11_SELECTION, C14_PATH, F03_CLOCK, F04_DOCUMENT_ID } from './ai-boards';
import { C13_DHCP_ID, C15_CANVAS_ID } from './graph-canvas-boards';

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
  /** Keys pressed once the screen shows (e.g. `Control+k` opens the ⌘K palette), then `type` typed. */
  keys?: readonly string[];
  type?: string;
  /** Text selected inside the element `within` once the screen shows (C11's selected passage). */
  select?: { within: string; text: string };
  /** An element clicked after that (C11's "Giải thích"). */
  click?: string;
}

/**
 * `onboarded`: /api/me says the first-visit dialog is done (the Universe without S03 over it); `spaces-pending`:
 * /api/spaces never answers (the Universe loading, S04); `spaces-without-texts`: /api/spaces without the reader's own
 * Space and with nothing readable in the others (the empty Universe, S05; captions and the recent texts the AI panel
 * asks about stay as seeded, as the board draws them); `search-c12` / `search-f01`: /api/search answers the board's
 * results (search-boards.ts: E2E has neither Meilisearch nor a Jev key), and on C12 /api/spaces the board's five
 * Spaces of the filter; `keys-f03` / `translate-f04`: /api/me/keys answers the board's three keys, and on F04 the
 * document and the translation stream are the board's, held mid-stream (ai-boards.ts: E2E has no AI provider);
 * `copilot-c14`: the board's keys, Copilot history and finished answer; `ask-c11`: the board's keys and AI card answer;
 * `canvas-c15`: Jev's suggested connection of the board (graph-canvas-boards.ts: E2E has no Jev key).
 */
export type ParityMock = 'onboarded' | 'spaces-pending' | 'spaces-without-texts' | 'search-c12' | 'search-f01' | 'keys-f03' | 'translate-f04' | 'copilot-c14' | 'ask-c11' | 'canvas-c15';

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
  // The Universe loading past 1.5 s (the "Thử lại" chip shows), and a Universe with nothing to read yet (S05 shows
  // only then: a reader without a Space of their own gets C09, docs/mock-deviations.md).
  { board: 'S04-OrbitSkeleton', path: '/u', signedIn: true, status: 'built', mocks: ['onboarded', 'spaces-pending'], waitFor: '[data-id="universe-slow"]' },
  // maxDiff: the waiting crystals are brighter than the board's (user feedback 04/11/2026); docs/mock-deviations.md.
  { board: 'S05-OrbitEmpty', path: '/u', signedIn: true, status: 'built', maxDiff: 0.045, mocks: ['onboarded', 'spaces-without-texts'], clock: UNIVERSE_CLOCK },
  { board: 'S01-Landing', path: '/', signedIn: false, status: 'built' },
  // The seeded Space and document of the boards (KB_SEED=mock): Networking on "Giao thức nền tảng", and DHCP read
  // by the seed's owner (its progress, backlinks, comments "2 giờ trước"), at the seed's last update.
  { board: 'C10-Space', path: '/s/networking', signedIn: true, status: 'built', clock: SEED_CLOCK },
  // The board's default: the broadcast sentence selected, its toolbar, and the AI card explaining it.
  {
    board: 'C11-Reader',
    path: `/d/${F04_DOCUMENT_ID}`,
    signedIn: true,
    status: 'built',
    clock: SEED_CLOCK,
    mocks: ['ask-c11'],
    select: { within: '#broadcast-la-gi', text: C11_SELECTION },
    click: '[data-id="reader-sel-explain"]',
    waitFor: '[data-id="reader-ai-card"][data-state="done"]',
  },
  // Search (C12) on the board's query and results, and the ⌘K palette (F01) opened over the Universe and given "dhcp".
  { board: 'C12-Search', path: '/search?q=c%E1%BA%A5p%20ph%C3%A1t%20ip', signedIn: true, status: 'built', mocks: ['search-c12'], waitFor: '[data-id="search-screen"][data-state="results"]' },
  // maxDiff: the palette opens over the real Universe (hero, AI panel, stage) the board leaves out; docs/mock-deviations.md.
  {
    board: 'F01-Search',
    path: '/u',
    signedIn: true,
    status: 'built',
    maxDiff: 0.05,
    mocks: ['onboarded', 'search-f01'],
    clock: UNIVERSE_CLOCK,
    keys: ['Control+k'],
    type: 'dhcp',
    waitFor: '[data-id="palette"][data-state="results"]',
  },
  // Own keys (F03) with the board's keys, and AI translation (F04) of the board's DHCP text, 70% through.
  { board: 'F03-Keys', path: '/settings/keys', signedIn: true, status: 'built', mocks: ['keys-f03'], clock: F03_CLOCK },
  { board: 'F04-Translate', path: `/d/${F04_DOCUMENT_ID}/translate`, signedIn: true, status: 'built', mocks: ['translate-f04'] },
  // Copilot (C14) asked from the DHCP text about the Space, its answer finished; its eight states (F02) side by side.
  { board: 'C14-Copilot', path: C14_PATH, signedIn: true, status: 'built', mocks: ['copilot-c14'], clock: F03_CLOCK, waitFor: '[data-id="copilot-screen"][data-state="done"]' },
  // The Graph of Networking from the seed's documents and links, DHCP picked (its neighbours lit, the panel open).
  // maxDiff: d3-force places the real graph's nodes, not the board's hand-placed 20; docs/mock-deviations.md.
  {
    board: 'C13-Graph',
    path: '/graph?space=networking',
    signedIn: true,
    status: 'built',
    maxDiff: 0.08,
    click: `[data-id="graph-node-${C13_DHCP_ID}"]`,
    waitFor: '[data-id="graph-detail"]',
  },
  // The seed's canvas "DHCP từ A đến Z", its lab card picked, with Jev's suggested connection.
  { board: 'C15-Canvas', path: `/canvas/${C15_CANVAS_ID}`, signedIn: true, status: 'built', mocks: ['canvas-c15'], click: '[data-id="canvas-card-lab"]', waitFor: '[data-id="canvas-suggest"]' },
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
  { board: 'F02-CopilotStates', path: '/dev/kit/copilot-states', signedIn: false, status: 'built' },
  // The documentation boards.
  { board: 'Z01-Sitemap', path: '/dev/kit/sitemap', signedIn: false, status: 'built' },
  { board: 'Z02-Spatial3D', path: '/dev/kit/spatial', signedIn: false, status: 'built' },
];
