import { expect, test } from '@playwright/test';

/**
 * The orbit dots run on offset-distance, which Chrome animates on the main thread. Each dot needs its own layer
 * (will-change: transform), or every frame repaints the layer under it (the bloom SVG and the filtered crystals) and
 * the Universe scene drops to ~36 fps. Checked on the landing and the kit board that hold the scene.
 */
for (const path of ['/', '/dev/kit/design-system']) {
  test(`${path} gives every running orbit dot its own layer`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto(path);
    const dots = page.locator('.kf-orbit-dot');
    await expect(dots.first()).toBeAttached();
    const willChange = await dots.evaluateAll((elements) => elements.map((element) => getComputedStyle(element).willChange));
    expect(willChange.length).toBeGreaterThan(0);
    expect(willChange.every((value) => value === 'transform')).toBe(true);
  });
}
