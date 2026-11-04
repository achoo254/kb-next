import { expect, test } from '@playwright/test';
import { FAKE_IDP_PORT } from './e2e-env';
import { signInAt } from './sign-in';

test('the landing, a share link and an unknown page open without an account', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-screen="S01"]')).toBeVisible();
  await page.goto('/l/some-token');
  await expect(page.locator('[data-screen="H02"]')).toBeVisible();
  await page.goto('/no-such-page');
  await expect(page.locator('[data-screen="X02"]')).toBeVisible();
});

test('a signed-in screen sends a visitor through sign-in and back, on the Universe backdrop', async ({ page }) => {
  await signInAt(page, '/u');
  await expect(page.locator('[data-screen="C09"]')).toBeVisible();
  const background = page.locator('.universe-bg img');
  // The landscape of the theme in use (the browser's scheme: no data-theme is set yet).
  await expect(background).toHaveAttribute('src', /^\/art\/bg-universe-(dark|light)\.webp$/);
  // The picture really loaded (not a broken image).
  expect(await background.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
});

test('signing out at the IdP ends the session here', async ({ page, request }) => {
  await signInAt(page, '/settings');
  await expect(page.locator('[data-screen="H03"]')).toBeVisible();
  const signOut = await request.post(`http://127.0.0.1:${FAKE_IDP_PORT}/test/sign-out`);
  expect(signOut.status()).toBe(200);
  await page.reload();
  await expect(page).toHaveURL(/\/login\?return=%2Fsettings$/);
});

test('signing out in the app ends the session', async ({ page }) => {
  await signInAt(page, '/me');
  await page.locator('[data-id="sign-out"]').click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto('/me');
  await expect(page).toHaveURL(/\/login\?return=%2Fme$/);
});
