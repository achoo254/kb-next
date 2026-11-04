/**
 * Parity with the mock: each screen of parity-screens.ts is shot at its board's size (the `parity` project: 1440×900,
 * reduced motion, dark theme) and compared pixel by pixel with the board exported from the mock. The difference is
 * printed for every screen and attached with a diff image; built screens must stay within their ceiling.
 * Run: pnpm parity (or pnpm e2e --project parity at the root).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import { openScreen } from './open-screen';
import { MAX_DIFF_RATIO, PARITY_SCREENS } from './parity-screens';

const MOCK_PNG_DIR = new URL('../../../design/mock-png/', import.meta.url);

/** Share of pixels that differ between two same-size PNGs, and the diff image. */
function compare(actual: PNG, expected: PNG): { ratio: number; diff: PNG } {
  const { width, height } = expected;
  const diff = new PNG({ width, height });
  // threshold 0.1 is pixelmatch's default sensitivity per pixel (anti-aliasing is ignored).
  const changed = pixelmatch(actual.data, expected.data, diff.data, width, height, { threshold: 0.1 });
  return { ratio: changed / (width * height), diff };
}

for (const screen of PARITY_SCREENS) {
  test(`${screen.board} matches its mock board`, async ({ page }, testInfo) => {
    const expected = PNG.sync.read(readFileSync(fileURLToPath(new URL(`${screen.board}.png`, MOCK_PNG_DIR))));
    await page.setViewportSize({ width: expected.width, height: expected.height });
    await openScreen(page, screen);
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
