import { type Page, expect, test } from '@playwright/test';
import { signInAt } from './sign-in';

/**
 * Windows narrower than the 1440px board (phones, tablets): the landing stacks its hero, Universe preview and feature
 * cards instead of keeping the board's absolute places, which cut the title and the sign-in button off at the right.
 */
const NARROW = [
  { width: 360, height: 780 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
];

const PARTS = ['.brand-logo', '.screen-page-actions', '.landing-hero', '.landing-title', '.landing-cta', '.landing-scene', '.kf-stage-card', '.landing-footer'];

/** The parts of the landing that cross a window edge, the gap between the logo and the top-right buttons, and order. */
async function measure(page: Page) {
  // the widths depend on the brand and title fonts, so measure once they are in
  await page.evaluate(() => document.fonts.ready);
  return page.evaluate((parts) => {
    const box = (selector: string) => document.querySelector(selector)?.getBoundingClientRect();
    const outside = parts.flatMap((selector) =>
      [...document.querySelectorAll(selector)].filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.left < -0.5 || rect.right > window.innerWidth + 0.5;
      }).map(() => selector),
    );
    const logo = box('.brand-logo');
    const actions = box('.screen-page-actions');
    const hero = box('.landing-hero');
    const scene = box('.landing-scene');
    return {
      outside,
      pageWidth: document.documentElement.scrollWidth,
      headerGap: logo && actions ? actions.left - logo.right : -1,
      heroAboveScene: Boolean(hero && scene && hero.bottom <= scene.top),
    };
  }, PARTS);
}

for (const size of NARROW) {
  test(`S01-Landing fits a ${size.width}px window`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto('/');
    await expect(page.locator('.kf-scene-orb')).toBeVisible();
    const result = await measure(page);
    expect(result.outside).toEqual([]);
    expect(result.pageWidth).toBe(size.width);
    expect(result.headerGap).toBeGreaterThanOrEqual(8);
    expect(result.heroAboveScene).toBe(true);
  });
}

/** Signed in, the top-right button reads "Vào Universe" / "Enter the Universe" (longer) beside the language button. */
for (const width of [360, 420, 479, 480, 560, 768]) {
  test(`S01-Landing signed in keeps the logo clear of the top-right buttons at ${width}px, both languages`, async ({ page }) => {
    await signInAt(page, '/me');
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    await expect(page.locator('[data-id="landing-cta"]')).toBeVisible();
    for (const round of [0, 1]) {
      if (round === 1) await page.locator('[data-id="landing-lang"]').click();
      const result = await measure(page);
      expect(result.outside).toEqual([]);
      expect(result.headerGap).toBeGreaterThanOrEqual(8);
    }
  });
}
