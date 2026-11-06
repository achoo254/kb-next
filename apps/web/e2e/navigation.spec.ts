/**
 * In-app navigation (docs/navigation.md): links between screens change the address without a page load, so the
 * session, the shell and anything the page holds in memory stay; the opening card belongs to the page load only.
 * Reduced motion: the Universe's Spaces are plain links (no warp).
 */
import { expect, test } from '@playwright/test';
import { signInAt } from './sign-in';

test.use({ reducedMotion: 'reduce' });

interface PageMarks {
  kbMarker?: string;
  kbOpenings?: number;
}

test('Universe → Space → document → back stays on one page: no reload, no opening card, the title follows', async ({ page }) => {
  await signInAt(page, '/u');
  const universe = page.locator('[data-screen="C09"]');
  await expect(universe).toBeVisible();
  // a new account gets the first-visit dialog once its profile is read: skipped
  await page.waitForLoadState('networkidle');
  const skip = page.locator('[data-id="onboarding-skip"]');
  if (await skip.isVisible()) await skip.click();
  await expect(page.locator('[data-id="onboarding"]')).toHaveCount(0);
  // A page load would wipe these: a value on window, an attribute on the rail, and the count of opening cards since.
  await page.evaluate(() => {
    const marks = window as Window & PageMarks;
    marks.kbMarker = 'same-page';
    marks.kbOpenings = 0;
    new MutationObserver(() => {
      if (document.querySelector('[data-id="universe-opening"]')) marks.kbOpenings = (marks.kbOpenings ?? 0) + 1;
    }).observe(document.body, { childList: true, subtree: true });
    document.querySelector('.app-shell-rail')?.setAttribute('data-e2e-kept', '');
  });
  const universeTitle = await page.title();

  await universe.locator('[data-id="crystal-networking"]').click();
  const space = page.locator('[data-screen="C10"]');
  await expect(space.getByRole('heading', { level: 1, name: 'Networking' })).toBeVisible();
  await expect(page).toHaveURL(/\/s\/networking$/);
  await expect(page).not.toHaveTitle(universeTitle);
  const spaceTitle = await page.title();

  await space.getByRole('link', { name: /Giao thức DHCP/ }).click();
  const reader = page.locator('[data-screen="C11"]');
  await expect(reader.getByRole('heading', { level: 1, name: 'Giao thức DHCP' })).toBeVisible();
  await expect(page).toHaveURL(/\/d\/[0-9a-f-]{36}$/);
  await expect(page).toHaveTitle(/^Giao thức DHCP · /);
  // focus went to the new screen's heading, for screen readers
  await expect(reader.getByRole('heading', { level: 1, name: 'Giao thức DHCP' })).toBeFocused();

  await page.goBack();
  await expect(space.getByRole('heading', { level: 1, name: 'Networking' })).toBeVisible();
  await expect(page).toHaveURL(/\/s\/networking$/);
  await expect(page).toHaveTitle(spaceTitle);

  const marks = await page.evaluate(() => {
    const kept = window as Window & PageMarks;
    return { marker: kept.kbMarker, openings: kept.kbOpenings };
  });
  expect(marks).toEqual({ marker: 'same-page', openings: 0 });
  await expect(page.locator('.app-shell-rail[data-e2e-kept]')).toHaveCount(1);
  await expect(page.locator('[data-id="nav-progress"]')).toHaveCount(0);
});

test('links that leave the app still load their page', async ({ page }) => {
  await signInAt(page, '/settings');
  await page.evaluate(() => {
    (window as Window & PageMarks).kbMarker = 'same-page';
  });
  // the privacy page opens in place, at its anchor
  await page.evaluate(() => {
    const link = document.createElement('a');
    link.href = '/privacy#delete';
    link.textContent = 'privacy';
    link.dataset.id = 'e2e-link';
    document.body.append(link);
  });
  // dispatched: a link added at the end of the page sits under the board
  await page.locator('[data-id="e2e-link"]').dispatchEvent('click');
  await expect(page).toHaveURL(/\/privacy#delete$/);
  await expect(page.locator('#delete')).toBeInViewport();
  expect(await page.evaluate(() => (window as Window & PageMarks).kbMarker)).toBe('same-page');

  // a share link is a page of its own (the server sends its link preview)
  await page.evaluate(() => {
    const link = document.createElement('a');
    link.href = '/l/some-token';
    link.textContent = 'share';
    link.dataset.id = 'e2e-share';
    document.body.append(link);
  });
  await page.locator('[data-id="e2e-share"]').dispatchEvent('click');
  await expect(page.locator('[data-screen="H02"]')).toBeVisible();
  expect(await page.evaluate(() => (window as Window & PageMarks).kbMarker)).toBeUndefined();
});
