import { type Page, expect, test } from '@playwright/test';
import { openScreen } from './open-screen';
import { PARITY_SCREENS } from './parity-screens';
import { signInAt } from './sign-in';

/**
 * Windows wider than the 1440px boards: the board's content area stays centred (it used to sit at the left edge
 * with an empty band on the right), while the lens rail keeps to the left edge.
 */
const WIDE = { width: 2000, height: 960 };

for (const board of ['C10-Space', 'C11-Reader', 'S01-Landing']) {
  test(`${board} keeps its content centred in a wide window`, async ({ page }) => {
    const screen = PARITY_SCREENS.find((entry) => entry.board === board);
    if (!screen) throw new Error(`no parity entry for ${board}`);
    await page.setViewportSize(WIDE);
    if (screen.clock) await page.clock.setFixedTime(new Date(screen.clock));
    if (screen.signedIn) await signInAt(page, screen.path);
    else await page.goto(screen.path);
    const box = await page.locator('main#content').boundingBox();
    if (!box) throw new Error('main#content is not rendered');
    expect(box.width).toBe(1440);
    // the same gap on both sides, to the pixel
    expect(Math.abs(box.x - (WIDE.width - box.x - box.width))).toBeLessThanOrEqual(1);
  });
}

/**
 * The Universe (C09) in windows other than its board: its AI panel keeps the board's 20px gutter to the window's right
 * edge, like the bell, and a short laptop window shows the whole board without scrolling (the zoom fits the height).
 */
async function openUniverse(page: Page, size: { width: number; height: number }) {
  const screen = PARITY_SCREENS.find((entry) => entry.board === 'C09-Universe');
  if (!screen) throw new Error('no parity entry for C09-Universe');
  await page.setViewportSize(size);
  await openScreen(page, screen);
  const panel = await page.locator('[data-id="universe-ai"]').boundingBox();
  const orb = await page.locator('.kf-scene-orb').boundingBox();
  if (!panel || !orb) throw new Error('the Universe is not rendered');
  const layout = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    innerHeight: window.innerHeight,
    scrollHeight: document.documentElement.scrollHeight,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  return { panel, orb, ...layout };
}

test('C09-Universe keeps its AI panel at the right edge of a 1920×1080 window', async ({ page }) => {
  const { panel, orb, width, scrollWidth } = await openUniverse(page, { width: 1920, height: 1080 });
  expect(width - (panel.x + panel.width)).toBeGreaterThanOrEqual(0);
  expect(width - (panel.x + panel.width)).toBeLessThanOrEqual(28);
  // the scene stays with the centred board: the orb's centre 20px left of the window's centre, as on the board
  expect(Math.abs(orb.x + orb.width / 2 - (width / 2 - 20))).toBeLessThanOrEqual(1);
  expect(scrollWidth).toBeLessThanOrEqual(width + 1);
});

test('C09-Universe keeps the board in place at 1440×900', async ({ page }) => {
  const { panel, orb } = await openUniverse(page, { width: 1440, height: 900 });
  expect(panel.x).toBeCloseTo(1034, 0);
  expect(panel.x + panel.width).toBeCloseTo(1420, 0);
  expect(orb.x).toBeCloseTo(575, 0);
});

test('C09-Universe fits a 1440×840 laptop window without scrolling', async ({ page }) => {
  const { panel, width, innerHeight, scrollHeight, scrollWidth } = await openUniverse(page, { width: 1440, height: 840 });
  expect(scrollHeight).toBeLessThanOrEqual(innerHeight + 1);
  expect(scrollWidth).toBeLessThanOrEqual(width + 1);
  // the board's 20px gutter, zoomed to 840/900
  expect(Math.abs(width - (panel.x + panel.width) - 20 * (840 / 900))).toBeLessThanOrEqual(1);
});
