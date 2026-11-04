import { expect, test } from '@playwright/test';

/**
 * The landing's hero (title, description, sign-in button) stays clear of the Cloud crystal on the board layout: its
 * Universe slot sits under the hero text, so the landing places it on the right. (Linux and Docker touch the hero's
 * edge on board S01 itself, so they are not checked.) The E2E seed has no Cloud Space, so the test adds one to
 * /api/spaces (Cloud has no crystal art yet; the orb stands in).
 */
for (const width of [1180, 1440]) {
  test(`S01-Landing keeps the Cloud crystal off the hero at ${width}px`, async ({ page }) => {
    await page.route('**/api/spaces', async (route) => {
      const response = await route.fetch();
      const body = (await response.json()) as { spaces: Array<Record<string, unknown>> };
      const [first] = body.spaces;
      if (!first) throw new Error('the seed has no Space');
      body.spaces.push({ ...first, id: 'cloud', slug: 'cloud', nameVi: 'Cloud', nameEn: 'Cloud', art: '/art/orb-universe.webp' });
      await route.fulfill({ response, json: body });
    });
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await expect(page.locator('[data-id="crystal-cloud"]')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const apart = await page.evaluate(() => {
      const hero = document.querySelector('.landing-hero')?.getBoundingClientRect();
      const box = document.querySelector('.kf-crystal[data-space="cloud"]')?.getBoundingClientRect();
      if (!hero || !box) return false;
      return box.right <= hero.left || box.left >= hero.right || box.bottom <= hero.top || box.top >= hero.bottom;
    });
    expect(apart).toBe(true);
  });
}
