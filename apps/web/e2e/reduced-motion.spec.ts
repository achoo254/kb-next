import { expect, test } from '@playwright/test';

/**
 * prefers-reduced-motion stops every animation and transition (the global rule in apps/web/src/ui/app.css). Checked on
 * the kit boards, which hold every moving piece of the kit: orbits, twinkling stars, floating crystals, loaders.
 */
const KIT_PAGES = ['/dev/kit/design-system', '/dev/kit/interaction', '/dev/kit/feedback', '/dev/kit/states'];

/** Animations running on the page (CSS animations and transitions, via the Web Animations API). */
async function runningAnimations(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(() => document.getAnimations().filter((animation) => animation.playState === 'running').length);
}

test.describe('with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  for (const path of KIT_PAGES) {
    test(`${path} runs no animation`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      expect(await runningAnimations(page)).toBe(0);
    });
  }
});

test('without reduced motion the kit does move (so the check above means something)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/dev/kit/design-system');
  await page.waitForLoadState('networkidle');
  expect(await runningAnimations(page)).toBeGreaterThan(0);
});
