/**
 * The light theme (Sáng) on every screen: each screen of parity-screens.ts opens in the state of its board (same
 * mocks, seed and clock) with the account's theme pinned to light, is shot for a person to look over (the PNGs land
 * in apps/web/test-results), and its visible text must meet WCAG 2 AA against what it actually sits on. Desktop boards
 * at 1440×900, the tablet board at 1180×820, the phone boards and every route with a phone layout at 390×844.
 *
 * Two checks, both must pass: axe-core's color-contrast rule (solid backgrounds, inputs), and the pixel check of
 * text-contrast.ts (text over the gradients, blurs and pictures axe leaves "incomplete", where dark fills meant for the
 * dark theme hide). The dark theme is covered by the parity check (parity.spec.ts).
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { openScreen } from './open-screen';
import { PARITY_SCREENS, type ParityScreen, hasPhoneLayout, layoutOf } from './parity-screens';
import { textContrastFailures } from './text-contrast';

const SIZES = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 1180, height: 820 },
  phone: { width: 390, height: 844 },
} as const;

interface Shot {
  name: string;
  screen: ParityScreen;
  size: keyof typeof SIZES;
}

/**
 * A desktop board's state on a phone: its data (mocks, clock), without the desktop-only steps (a selection, a click, a
 * key, a file pick, an element to wait for), which the phone layout draws differently; the shot waits for a quiet
 * network instead.
 */
function onPhone(screen: ParityScreen): ParityScreen {
  return { board: screen.board, path: screen.path, signedIn: screen.signedIn, status: screen.status, mocks: screen.mocks, clock: screen.clock };
}

/**
 * Each board at its own size, and each desktop board whose route has a phone layout again on a phone; but not the
 * Universe held loading (S04: its API never answers, so the network never goes quiet; the phone boards show /u).
 */
const SHOTS: readonly Shot[] = PARITY_SCREENS.flatMap((screen): Shot[] => {
  const layout = layoutOf(screen);
  const own: Shot = { name: screen.board, screen, size: layout };
  const settles = !screen.mocks?.includes('spaces-pending');
  return layout === 'desktop' && hasPhoneLayout(screen.path) && settles ? [own, { name: `${screen.board}-phone`, screen: onPhone(screen), size: 'phone' }] : [own];
});

/**
 * Texts below AA in the dark theme as well (the same pixel check run in dark, 06/11/2026): colours and dims the boards
 * draw for both themes, not a dark fill leaking into the light theme. Each stays listed with its reason until the
 * boards change; any other failure fails the test.
 */
const BOTH_THEMES: ReadonlyArray<{ match: RegExp; reason: string }> = [
  { match: /^span\.(space-avatar|history-avatar|inbox-avatar|share-person-orb|a01-author|a02-badge-user)\b/, reason: 'white initials on the mid-tone avatar colours' },
  { match: /^span\.file-badge\b/, reason: 'white letter on the file-type colours (Excel green)' },
  { match: /^span\.import-node\b/, reason: 'white mark on the step colours of the Import Center' },
  { match: /^button\.keys-orb\b/, reason: 'white letters on the provider orbs (F03)' },
  { match: /^span\.kf-top-unread-count\b/, reason: 'white count on the rose unread dot' },
  { match: /^span\.graph-node-name\b/, reason: 'nodes outside the picked neighbourhood, faded on purpose (C13)' },
  { match: /^span\.(jr-stop-n|jr-stop-name)\b/, reason: 'stops not reached yet, faded on purpose (Flow)' },
  { match: /^span\.open-step\b/, reason: 'steps locked until sign-in, faded on purpose (H02)' },
  { match: /^span\.a02-planet-name\b/, reason: 'hidden texts, faded on purpose (A02)' },
];

function knownInBothThemes(failure: string): boolean {
  return BOTH_THEMES.some((known) => known.match.test(failure));
}

interface ContrastData {
  fgColor?: string;
  bgColor?: string;
  contrastRatio?: number;
  expectedContrastRatio?: string;
}

test.use({ colorScheme: 'light', reducedMotion: 'reduce' });

for (const { name, screen, size } of SHOTS) {
  test(`${name} reads in the light theme`, async ({ page }, testInfo) => {
    await page.setViewportSize(SIZES[size]);
    await openScreen(page, screen, { theme: 'light' });
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('light');

    const shot = await page.screenshot({ path: testInfo.outputPath(`${name}-light.png`), fullPage: false });
    await testInfo.attach(`${name}-light.png`, { body: shot, contentType: 'image/png' });

    const axe = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
    const axeFailures = axe.violations.flatMap((violation) =>
      violation.nodes.map((node) => {
        const data = (node.any[0]?.data ?? {}) as ContrastData;
        const html = node.html.replace(/\s+/g, ' ').slice(0, 90);
        return `axe ${node.target.join(' ')}: ${data.contrastRatio ?? '?'}:1 (needs ${data.expectedContrastRatio ?? '4.5:1'}), ${data.fgColor ?? '?'} on ${data.bgColor ?? '?'} ${html}`;
      }),
    );
    const pixel = await textContrastFailures(page);
    const known = pixel.filter(knownInBothThemes);
    const pixelFailures = pixel.filter((failure) => !knownInBothThemes(failure));
    console.log(`${name} (light): ${axeFailures.length} axe and ${pixelFailures.length} pixel contrast failure(s), ${known.length} known in both themes`);
    if (known.length > 0) testInfo.annotations.push({ type: 'contrast in both themes', description: known.join('\n') });
    expect([...axeFailures, ...pixelFailures]).toEqual([]);
  });
}
