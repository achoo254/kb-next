/**
 * The slides of a text (C21, KB_SEED=mock): opened from the reader, moved with the keys (the slide kept in the
 * address), left with Esc; a guest opens a public text's slides by address, and leaving records one viewing.
 */
import { expect, test } from '@playwright/test';
import { signInAt } from './sign-in';

test.use({ reducedMotion: 'reduce' });

test('the reader opens its text as slides; the keys move, the address follows, Esc leaves', async ({ page }) => {
  await signInAt(page, '/s/networking');
  await page.locator('[data-screen="C10"]').getByRole('link', { name: /Giao thức DHCP/ }).click();
  await expect(page).toHaveURL(/\/d\/[0-9a-f-]{36}$/);
  const reader = page.url();

  await page.locator('[data-id="reader-present"]').first().click();
  await expect(page).toHaveURL(/\/d\/[0-9a-f-]{36}\/present#1$/);
  const slides = page.locator('[data-id="present-screen"]');
  await expect(slides.getByRole('heading', { level: 1, name: 'Giao thức DHCP' })).toBeVisible();
  await expect(page).toHaveTitle(/^Trình bày · /);

  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(page).toHaveURL(/#3$/);
  await expect(slides.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '3');
  await page.keyboard.press('t');
  await expect(slides.locator('.present-kicker', { hasText: 'Mục lục' })).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(reader);
  await expect(page.locator('[data-screen="C11"]').getByRole('heading', { level: 1, name: 'Giao thức DHCP' })).toBeVisible();
});

test('a guest opens a public text as slides by its address, and leaving records the viewing', async ({ page }) => {
  const space = (await (await page.request.get('/api/spaces/networking')).json()) as { collections: Array<{ documents: Array<{ id: string; title: string }> }> };
  const dhcp = space.collections.flatMap((c) => c.documents).find((d) => d.title === 'Giao thức DHCP');
  expect(dhcp).toBeTruthy();

  await page.goto(`/d/${dhcp?.id ?? ''}/present#2`);
  const slides = page.locator('[data-id="present-screen"]');
  await expect(slides.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '2');

  const recorded = page.waitForRequest((req) => req.url().endsWith(`/api/documents/${dhcp?.id ?? ''}/present-views`) && req.method() === 'POST');
  await slides.locator('[data-id="present-close"]').click();
  // The server took it (Playwright does not see a beacon's body; present-screen.test.tsx checks what it carries).
  expect((await (await recorded).response())?.status()).toBe(204);
  await expect(page).toHaveURL(/\/d\/[0-9a-f-]{36}$/);
});
