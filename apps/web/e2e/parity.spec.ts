/**
 * Parity with the mock: each screen of parity-screens.ts is shot at its board's size (the `parity` project: 1440×900,
 * reduced motion, dark theme) and compared pixel by pixel with the board exported from the mock. The difference is
 * printed for every screen and attached with a diff image; built screens must stay within their ceiling.
 * Run: pnpm parity (or pnpm e2e --project parity at the root).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { type Page, expect, test } from '@playwright/test';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import { MAX_DIFF_RATIO, PARITY_SCREENS, type ParityMock } from './parity-screens';
import { C12_SEARCH, C12_SPACES, F01_SEARCH } from './search-boards';
import { signInAt } from './sign-in';

const MOCK_PNG_DIR = new URL('../../../design/mock-png/', import.meta.url);

/** Share of pixels that differ between two same-size PNGs, and the diff image. */
function compare(actual: PNG, expected: PNG): { ratio: number; diff: PNG } {
  const { width, height } = expected;
  const diff = new PNG({ width, height });
  // threshold 0.1 is pixelmatch's default sensitivity per pixel (anti-aliasing is ignored).
  const changed = pixelmatch(actual.data, expected.data, diff.data, width, height, { threshold: 0.1 });
  return { ratio: changed / (width * height), diff };
}

/** Changes the API's answers for one shot (see ParityMock); everything else goes to the real API. */
async function mockApi(page: Page, mocks: readonly ParityMock[]): Promise<void> {
  if (mocks.includes('onboarded')) {
    await page.route('**/api/me', async (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      const response = await route.fetch();
      if (!response.ok()) return route.fulfill({ response });
      const me = (await response.json()) as Record<string, unknown>;
      return route.fulfill({ response, json: { ...me, onboardedAt: me.onboardedAt ?? '2026-11-03T14:05:00.000Z' } });
    });
  }
  if (mocks.includes('spaces-pending')) {
    // never answered: the screen stays in its loading state for the shot
    await page.route('**/api/spaces', () => undefined);
  }
  if (mocks.includes('spaces-without-texts')) {
    await page.route('**/api/spaces', async (route) => {
      const response = await route.fetch();
      if (!response.ok()) return route.fulfill({ response });
      const body = (await response.json()) as { spaces: Array<{ kind: string; documentCount: number }> };
      const shared = body.spaces.filter((space) => space.kind !== 'personal').map((space) => ({ ...space, documentCount: 0 }));
      return route.fulfill({ response, json: { spaces: shared } });
    });
  }
  for (const [mock, json] of [
    ['search-c12', C12_SEARCH],
    ['search-f01', F01_SEARCH],
  ] as const) {
    if (mocks.includes(mock)) await page.route('**/api/search?*', (route) => route.fulfill({ json }));
  }
  // C12's Space filter lists the board's five Spaces, matching its results.
  if (mocks.includes('search-c12')) await page.route('**/api/spaces', (route) => route.fulfill({ json: C12_SPACES }));
}

for (const screen of PARITY_SCREENS) {
  test(`${screen.board} matches its mock board`, async ({ page }, testInfo) => {
    const expected = PNG.sync.read(readFileSync(fileURLToPath(new URL(`${screen.board}.png`, MOCK_PNG_DIR))));
    await page.setViewportSize({ width: expected.width, height: expected.height });
    if (screen.clock) await page.clock.setFixedTime(new Date(screen.clock));
    if (screen.mocks) await mockApi(page, screen.mocks);
    if (screen.signedIn) await signInAt(page, screen.path);
    else await page.goto(screen.path);
    await page.evaluate(() => document.fonts.ready);
    if (screen.keys || screen.type) {
      // A screen opened from the keyboard (the palette): once the page is ready to listen.
      await page.waitForLoadState('networkidle');
      for (const key of screen.keys ?? []) await page.keyboard.press(key);
      if (screen.type) await page.keyboard.type(screen.type);
    }
    if (screen.waitFor) await page.locator(screen.waitFor).waitFor();
    else await page.waitForLoadState('networkidle');
    const actual = PNG.sync.read(await page.screenshot({ fullPage: false }));
    expect([actual.width, actual.height]).toEqual([expected.width, expected.height]);

    const { ratio, diff } = compare(actual, expected);
    const ceiling = screen.maxDiff ?? MAX_DIFF_RATIO;
    const line = `${screen.board} (${screen.status}): ${(ratio * 100).toFixed(2)}% of pixels differ (ceiling ${(ceiling * 100).toFixed(0)}%)`;
    console.log(line);
    testInfo.annotations.push({ type: 'parity', description: line });
    await testInfo.attach(`${screen.board}-actual.png`, { body: PNG.sync.write(actual), contentType: 'image/png' });
    await testInfo.attach(`${screen.board}-diff.png`, { body: PNG.sync.write(diff), contentType: 'image/png' });
    if (screen.status === 'built') expect(ratio).toBeLessThanOrEqual(ceiling);
  });
}
