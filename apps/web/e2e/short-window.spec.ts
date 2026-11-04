import { expect, test } from '@playwright/test';

/**
 * Windows shorter than the 900px board (a laptop with the browser's bars, a zoomed page): the landing keeps the board's
 * height and scrolls, so the feature cards stay reachable and the footer stays below them instead of on top.
 */
test('S01-Landing scrolls to its feature cards in a window shorter than the board', async ({ page }) => {
  await page.setViewportSize({ width: 1333, height: 700 });
  await page.goto('/');
  await expect(page.locator('.kf-stage-card').first()).toBeAttached();
  const layout = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.kf-stage-card')].map((card) => card.getBoundingClientRect());
    const footer = document.querySelector('.landing-footer')?.getBoundingClientRect();
    return {
      pageHeight: document.documentElement.scrollHeight,
      cardsBottom: Math.max(...cards.map((card) => card.bottom)),
      footerTop: footer?.top ?? 0,
    };
  });
  expect(layout.pageHeight).toBeGreaterThanOrEqual(layout.cardsBottom);
  expect(layout.footerTop).toBeGreaterThanOrEqual(layout.cardsBottom);
});
