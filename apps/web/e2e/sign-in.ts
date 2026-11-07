import { type Page, expect } from '@playwright/test';

/**
 * Signs in through /login and the fake IdP and lands on `path` (reading screens open to guests too, so the sign-in
 * page is opened straight away with the screen to return to rather than reached by a redirect). Back on the screen
 * only its path is checked: a screen may rewrite its query once it has read it (C14 drops the question it asked), and
 * the opening card (the session, then the Universe's data; each step holds for a beat) has given way to the screen.
 */
export async function signInAt(page: Page, path: string): Promise<void> {
  await page.goto(`/login?${new URLSearchParams({ return: path }).toString()}`);
  await page.locator('[data-id="sign-in-cta"]').click();
  const pathname = path.split('?')[0] ?? path;
  await expect(page).toHaveURL(new RegExp(`${pathname.replace(/[/?]/g, '\\$&')}(\\?.*)?$`));
  await page.waitForFunction(() => document.getElementById('content') !== null && document.querySelector('[data-id="universe-opening"]') === null);
}
