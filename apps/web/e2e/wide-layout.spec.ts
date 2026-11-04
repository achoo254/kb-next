import { expect, test } from '@playwright/test';
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
