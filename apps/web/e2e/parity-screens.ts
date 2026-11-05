import { C11_SELECTION, C14_PATH, F03_CLOCK, F04_DOCUMENT_ID } from './ai-boards';
import { C02_CLOCK, C02_DRAFT_ID, C13_DHCP_ID, C15_CANVAS_ID } from './graph-canvas-boards';
import { A01_CLOCK, A03_CLOCK } from './admin-boards';
import { C08_CLOCK } from './mine-boards';
import { JOURNEY_ID } from './journey-boards';
import { C18_CLOCK, H02_TOKEN, PUBLISH_DOCUMENT_ID } from './share-boards';
import { C03_FILES } from './office-boards';

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
  /** Files picked in a file input once the screen shows (C03's batch): zero bytes of the given sizes. */
  files?: { input: string; files: ReadonlyArray<{ name: string; size: number }> };
  /** The connection drops once the screen shows (H04 offline). */
  offline?: boolean;
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
 * `canvas-c15`: Jev's suggested connection of the board (graph-canvas-boards.ts: E2E has no Jev key); `keys-c02`: the
 * board's OpenAI key ••••a1b2 for the editor's AI writing chip (E2E has no secret file to store keys); `history-c17`:
 * the history and comparison an admin sees (history-boards.ts: the E2E account is an ordinary reader); `mine-c08`:
 * /api/me/documents answers the board's eight texts at every step of review (mine-boards.ts: the seed holds those
 * titles as other boards draw them); `upload-c03`, `imports-c16`, `offline-h04`: the upload, the Import Center and the
 * offline queue mid-way (office-boards.ts: E2E has no Tika, and a fresh browser keeps no drafts); `admin`: /api/me
 * says the account is an admin (the E2E account is not); `admin-a01` / `admin-a02` / `admin-a03`: the review queue
 * and its first text, the published texts, the token and its calls of the boards (admin-boards.ts); `publish-c04`:
 * the owner's draft placed in Networking with its DORA sections and tags, and the Spaces it may go to (C04, C05);
 * `share-c18`: the DHCP text's sharing with its 7-day link and history; `open-h02`: a share link opened signed out
 * (share-boards.ts: E2E cannot show a token again, and the seed's draft has no sections or tags); `journey-c07` /
 * `journey-flow`: the journey "Máy mới vào mạng" of the boards, built (its steps, Jev's next steps, the documents to
 * pick) and run two steps in (journey-boards.ts: the seed's journey walks other steps, and E2E has no Jev key).
 */
export type ParityMock =
  | 'onboarded'
  | 'spaces-pending'
  | 'spaces-without-texts'
  | 'search-c12'
  | 'search-f01'
  | 'keys-f03'
  | 'translate-f04'
  | 'copilot-c14'
  | 'ask-c11'
  | 'canvas-c15'
  | 'keys-c02'
  | 'history-c17'
  | 'mine-c08'
  | 'upload-c03'
  | 'imports-c16'
  | 'offline-h04'
  | 'admin'
  | 'admin-a01'
  | 'admin-a02'
  | 'admin-a03'
  | 'publish-c04'
  | 'share-c18'
  | 'open-h02'
  | 'journey-c07'
  | 'journey-flow';

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
  // The owner's draft of C02 in the editor, saved at 21:24 that day, with the board's own key for AI writing.
  { board: 'C02-Editor', path: `/d/${C02_DRAFT_ID}/edit`, signedIn: true, status: 'built', mocks: ['keys-c02'], clock: C02_CLOCK, waitFor: '[data-id="editor-key"]' },
  // The history of DHCP (C17) as its admin sees it: AI versions, the review, Minh's v4, hiding and showing; v3 ⇄ v4.
  { board: 'C17-Timeline', path: `/d/${C13_DHCP_ID}/history`, signedIn: true, status: 'built', mocks: ['history-c17'], waitFor: '[data-id="history-lines"][data-state="ready"]' },
  // The create ring of the "+" (C01), the note described; and "Của tôi" (C08) on the board's texts, the one sent
  // back picked, with the seed's recent texts, favourites and trash.
  { board: 'C01-CreateMenu', path: '/create', signedIn: true, status: 'built', waitFor: '[data-id="create-hint"]' },
  { board: 'C08-MyContent', path: '/me', signedIn: true, status: 'built', mocks: ['mine-c08'], clock: C08_CLOCK, waitFor: '[data-id="mine-screen"][data-state="ready"]' },
  // Uploading the board's six files: two done, one still sending, a dropped connection, one too large, one not taken.
  {
    board: 'C03-Upload',
    path: '/upload',
    signedIn: true,
    status: 'built',
    mocks: ['upload-c03'],
    files: { input: 'input[aria-label="Chọn tệp để tải lên"]', files: C03_FILES },
    waitFor: '.upload-count:has-text("2 xong · 3 lỗi")',
  },
  // The Import Center on the board's five files at their steps, with Jev's suggestion for subnet-calc.xlsx.
  { board: 'C16-ImportCenter', path: '/import', signedIn: true, status: 'built', mocks: ['imports-c16'], waitFor: '[data-id="import-suggestion"]' },
  // The offline queue: lab-notes.docx in conflict with the server's version, subnet.xlsx and a note waiting; offline.
  { board: 'H04-Offline', path: '/sync', signedIn: true, status: 'built', mocks: ['offline-h04'], offline: true, waitFor: '[data-id="sync-banner"][data-state="offline"]' },
  // The inbox (C20) on the seed's seven notifications of the board, the mention picked; sending for review (C06): its
  // three states and the two result cards side by side, from the screen's own panels.
  { board: 'C20-Inbox', path: '/inbox', signedIn: true, status: 'built', clock: SEED_CLOCK, waitFor: '[data-id="inbox-screen"][data-state="ready"]' },
  { board: 'C06-Submit', path: '/dev/kit/submit', signedIn: false, status: 'built' },
  // Publishing (C04) and previewing (C05) the owner's draft, the DHCP text's sharing (C18), a share link opened
  // signed out (H02).
  { board: 'C04-Publish', path: `/d/${PUBLISH_DOCUMENT_ID}/publish`, signedIn: true, status: 'built', mocks: ['publish-c04'], waitFor: '[data-id="publish-card"]' },
  { board: 'C05-Preview', path: `/d/${PUBLISH_DOCUMENT_ID}/preview`, signedIn: true, status: 'built', mocks: ['publish-c04'], waitFor: '[data-id="preview-stage"]' },
  { board: 'C18-Share', path: `/d/${C13_DHCP_ID}/share`, signedIn: true, status: 'built', mocks: ['share-c18'], clock: C18_CLOCK, waitFor: '[data-id="share-history"]' },
  { board: 'H02-SharedOpen', path: `/l/${H02_TOKEN}`, signedIn: false, status: 'built', mocks: ['open-h02'], waitFor: '[data-id="open-card"]' },
  // The admin station on the boards' data (the E2E account answered as an admin): the queue with TCP vs UDP picked,
  // published texts by Space with DHCP picked, the API with its token and calls.
  { board: 'A01-AdminReview', path: '/admin', signedIn: true, status: 'built', mocks: ['admin', 'admin-a01'], clock: A01_CLOCK, waitFor: '.a01-block[data-n="2"]' },
  { board: 'A02-AdminContent', path: '/admin/content', signedIn: true, status: 'built', mocks: ['admin', 'admin-a02'], waitFor: '[data-id="content-detail"]' },
  { board: 'A03-AdminApi', path: '/admin/api', signedIn: true, status: 'built', mocks: ['admin', 'admin-a03'], clock: A03_CLOCK, waitFor: '.a03-line[data-tone="danger"]' },
  // The first-visit dialog at its first step (`?tour=1` opens it for an onboarded account too), over the Universe.
  { board: 'S03-Onboarding', path: '/u?tour=1', signedIn: true, status: 'built', clock: UNIVERSE_CLOCK },
  // The journey builder (C07) on the board's five steps, step 2 picked, with Jev's next steps; its run (Flow) two steps
  // in, ARP to do (where they differ from the boards: docs/mock-deviations.md).
  {
    board: 'C07-FlowBuilder',
    path: `/journey/${JOURNEY_ID}/edit`,
    signedIn: true,
    status: 'built',
    mocks: ['journey-c07'],
    click: '[aria-label="Chọn bước 2"]',
    waitFor: '[data-id="journey-jev"][data-state="ready"] ~ [data-id="journey-pool"][data-state="ready"]',
  },
  { board: 'Flow', path: `/journey/${JOURNEY_ID}`, signedIn: true, status: 'built', mocks: ['journey-flow'], waitFor: '[data-id="journey-card"]' },
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
