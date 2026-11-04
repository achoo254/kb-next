/**
 * Search from anywhere: ⌘K (Ctrl+K) and the top-right button open the palette over the Universe, Esc closes it,
 * ⇧Enter shows every result on the Search screen (C12) with the query kept. E2E has neither Meilisearch nor a Jev
 * key: the answers come from search-boards.ts, the board's results, through the real web client.
 */
import { expect, test } from '@playwright/test';
import { C12_SEARCH, F01_SEARCH } from './search-boards';
import { signInAt } from './sign-in';

test('the palette opens from the keyboard and the ⌘K button, and leads to the Search screen', async ({ page }) => {
  await page.route('**/api/search?*', (route) => {
    const q = new URL(route.request().url()).searchParams.get('q');
    return route.fulfill({ json: q === 'dhcp' ? F01_SEARCH : C12_SEARCH });
  });
  // An account already through the first-visit dialog (S03), which would otherwise sit over the Universe.
  await page.route('**/api/me', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const response = await route.fetch();
    return route.fulfill({ response, json: { ...((await response.json()) as object), onboardedAt: '2026-11-03T14:05:00.000Z' } });
  });
  await signInAt(page, '/u');
  await page.waitForLoadState('networkidle');

  await page.keyboard.press('Control+k');
  const palette = page.getByRole('dialog', { name: 'Tìm nhanh' });
  await expect(palette).toBeVisible();
  await expect(palette.getByRole('combobox')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(palette).toBeHidden();

  await page.locator('[data-id="top-command"]').click();
  await expect(palette).toBeVisible();
  await page.keyboard.type('dhcp');
  await expect(palette.getByRole('option', { name: /Giao thức DHCP/ })).toHaveAttribute('aria-selected', 'true');
  await expect(palette.getByRole('complementary', { name: 'Xem trước' })).toContainText('Giao thức DHCP');

  await page.keyboard.press('Shift+Enter');
  await expect(page).toHaveURL(/\/search\?q=dhcp$/);
  const search = page.locator('[data-screen="C12"]');
  await expect(search.getByRole('searchbox', { name: 'Từ khoá tìm kiếm' })).toHaveValue('dhcp');
  await expect(search.locator('[data-id="search-screen"]')).toHaveAttribute('data-state', 'results');
  await expect(search.getByRole('region', { name: 'Networking' }).getByRole('link', { name: /Giao thức DHCP/ }).first()).toHaveAttribute('href', '/d/f01-dhcp#tong-quan');
});

test('the Search screen says so when the server cannot search', async ({ page }) => {
  // Without Meilisearch and without a Jev key, the real API answers that neither search runs.
  await signInAt(page, '/search?q=dhcp');
  await expect(page.locator('[data-id="search-screen"]')).toHaveAttribute('data-state', 'failed');
  await expect(page.getByText('Chưa tìm được')).toBeVisible();
});
