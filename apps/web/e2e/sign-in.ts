import { type Page, expect } from '@playwright/test';

/**
 * Opens a signed-in screen while signed out and goes through /login and the fake IdP back to it. Back on the screen
 * only its path is checked: a screen may rewrite its query once it has read it (C14 drops the question it asked), and
 * the opening card (the session, then the Universe's data; each step holds for a beat) has given way to the screen.
 */
export async function signInAt(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await expect(page).toHaveURL(/\/login\?return=/);
  await page.locator('[data-id="sign-in-cta"]').click();
  const pathname = path.split('?')[0] ?? path;
  await expect(page).toHaveURL(new RegExp(`${pathname.replace(/[/?]/g, '\\$&')}(\\?.*)?$`));
  await page.waitForFunction(() => document.getElementById('content') !== null && document.querySelector('[data-id="universe-opening"]') === null);
}
