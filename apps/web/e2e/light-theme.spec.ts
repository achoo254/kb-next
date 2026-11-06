/**
 * The light theme (Sáng) on every screen: each screen of parity-screens.ts opens in the state of its board (same
 * mocks, seed and clock) with the account's theme pinned to light, is shot for a person to look over (the PNGs land
 * in apps/web/test-results), and its visible text must meet WCAG 2 AA against what it actually sits on. Desktop boards
 * at 1440×900, the tablet board at 1180×820, the phone boards and every route with a phone layout at 390×844.
 *
 * Two checks, both must pass: axe-core's color-contrast rule (solid backgrounds, inputs), and the pixel check of
 * text-contrast.ts (text over the gradients, blurs and pictures axe leaves "incomplete", where dark fills meant for the
 * dark theme hide). The same screens run the pixel check in the dark theme too (Tối, the boards' theme; its look is
 * held by the parity check, parity.spec.ts), so text that reads in neither theme cannot hide behind the other.
 */
import AxeBuilder from '@axe-core/playwright';
import { type Page, type TestInfo, expect, test } from '@playwright/test';
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
 * States shown by fading on purpose, in both themes: their faded text is below AA by design. Each also carries a cue
 * that is not its fade (a shape on screen and words for a screen reader), named here; any other failure fails the test.
 */
const FADED: ReadonlyArray<{ match: RegExp; state: string; cue: string }> = [
  { match: /^span\.graph-node-name\b/, state: 'C13: nodes outside the picked node\'s neighbourhood', cue: 'only the neighbours keep their lines to it and are listed in its panel; the node\'s name says "không nối với bài đang chọn"' },
  { match: /^span\.(jr-stop-n|jr-stop-name)\b/, state: 'Flow: stops not reached yet', cue: 'done stops carry a check and the current one the traveller; the stop\'s name says "chưa tới"' },
  { match: /^span\.(open-step|open-step-text)\b/, state: 'H02: sections locked until sign-in', cue: 'a lock on each locked section, with "mở khi đăng nhập" for a screen reader' },
  { match: /^span\.(a02-planet-name|a02-badge-user)\b/, state: 'A02: hidden texts', cue: 'a crossed eye on the planet (as on the legend); its name says "Đã ẩn"' },
];

function fadedOnPurpose(failure: string): boolean {
  return FADED.some((faded) => faded.match.test(failure));
}

interface ContrastData {
  fgColor?: string;
  bgColor?: string;
  contrastRatio?: number;
  expectedContrastRatio?: string;
}

/** The pixel check, with the faded states set apart (logged on the test, not failed). */
async function pixelFailures(page: Page, testInfo: TestInfo): Promise<string[]> {
  const all = await textContrastFailures(page);
  const faded = all.filter(fadedOnPurpose);
  if (faded.length > 0) testInfo.annotations.push({ type: 'faded on purpose', description: faded.join('\n') });
  return all.filter((failure) => !fadedOnPurpose(failure));
}

test.describe('light theme', () => {
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
      const pixel = await pixelFailures(page, testInfo);
      console.log(`${name} (light): ${axeFailures.length} axe and ${pixel.length} pixel contrast failure(s)`);
      expect([...axeFailures, ...pixel]).toEqual([]);
    });
  }
});

test.describe('dark theme', () => {
  test.use({ colorScheme: 'dark', reducedMotion: 'reduce' });

  for (const { name, screen, size } of SHOTS) {
    test(`${name} reads in the dark theme`, async ({ page }, testInfo) => {
      await page.setViewportSize(SIZES[size]);
      await openScreen(page, screen, { theme: 'dark' });
      expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
      const shot = await page.screenshot({ path: testInfo.outputPath(`${name}-dark.png`), fullPage: false });
      await testInfo.attach(`${name}-dark.png`, { body: shot, contentType: 'image/png' });
      const pixel = await pixelFailures(page, testInfo);
      console.log(`${name} (dark): ${pixel.length} pixel contrast failure(s)`);
      expect(pixel).toEqual([]);
    });
  }
});
