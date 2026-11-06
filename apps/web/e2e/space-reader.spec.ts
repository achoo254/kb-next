/**
 * Reading through the seeded Networking Space (KB_SEED=mock, read by the seed's owner): Space → document → a
 * backlink and back, a #anchor deep link, comment times, and the reading progress saved while scrolling.
 * Nothing here changes what the parity screens show (DHCP's progress and anchor stay as seeded).
 */
import { expect, test } from '@playwright/test';
import { signInAt } from './sign-in';

/** When the seed's documents were last updated (SEED_LATEST_UPDATE, 03/11/2026 21:05 in Saigon). */
const SEED_NOW = new Date('2026-11-03T14:05:00Z');

test('a Space leads to its documents, a document to its backlinks, and back', async ({ page }) => {
  await page.clock.setFixedTime(SEED_NOW);
  await signInAt(page, '/s/networking');
  const space = page.locator('[data-screen="C10"]');
  await expect(space.getByRole('heading', { level: 1, name: 'Networking' })).toBeVisible();
  await expect(space.locator('[data-id="space-members"] li')).toHaveText([/Đạt/, /Linh/, /Minh/, /An/]);

  await space.getByRole('link', { name: /Giao thức DHCP/ }).click();
  await expect(page).toHaveURL(/\/d\/[0-9a-f-]{36}$/);
  const dhcp = page.url();
  const reader = page.locator('[data-screen="C11"]');
  await expect(reader.getByRole('heading', { level: 1, name: 'Giao thức DHCP' })).toBeVisible();
  await expect(reader.getByText('Đã duyệt bởi Linh')).toBeVisible();
  await expect(reader.locator('[data-id="reader-versions"]')).toContainText('Linh duyệt 03/11 · 4 phiên bản');
  // Resumes at the passage read last, which is already on screen.
  await expect(reader.getByRole('navigation', { name: 'Mục lục' }).getByRole('link', { name: 'Broadcast là gì' })).toHaveAttribute('aria-current', 'location');
  await expect(reader.locator('ol.reader-steps > li')).toHaveCount(4);
  await expect(reader.locator('[data-id="reader-comments"]')).toContainText('2 giờ trước');

  const backlinks = reader.locator('[data-id="reader-backlinks"]');
  await expect(backlinks.getByRole('link')).toHaveText([/Máy mới vào mạng/, /Giao thức ARP/, /lab-notes\.docx/]);
  await backlinks.getByRole('link', { name: /Giao thức ARP/ }).click();
  await expect(reader.getByRole('heading', { level: 1, name: 'Giao thức ARP' })).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(dhcp);
  await expect(reader.getByRole('heading', { level: 1, name: 'Giao thức DHCP' })).toBeVisible();

  await page.locator('[data-id="breadcrumb"]').getByRole('link', { name: 'Networking' }).click();
  await expect(space.getByRole('heading', { level: 1, name: 'Networking' })).toBeVisible();
});

test('a #anchor link opens the document at that passage', async ({ page }) => {
  await signInAt(page, '/s/networking');
  await page.locator('[data-screen="C10"]').getByRole('link', { name: /Giao thức DHCP/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Giao thức DHCP' })).toBeVisible();
  await page.goto(`${page.url()}#rui-ro-dhcp-gia-mao`);
  const toc = page.getByRole('navigation', { name: 'Mục lục' });
  await expect(toc.getByRole('link', { name: 'Rủi ro: DHCP giả mạo' })).toHaveAttribute('aria-current', 'location');
  await expect(page.locator('#rui-ro-dhcp-gia-mao')).toBeInViewport();
});

test('scrolling a document saves how far the reader got', async ({ page }) => {
  await signInAt(page, '/s/networking');
  await page.locator('[data-screen="C10"]').getByRole('link', { name: /Giao thức ARP/ }).click();
  const panel = page.locator('[data-id="reader-panel"]');
  await expect(panel.getByRole('heading', { level: 1, name: 'Giao thức ARP' })).toBeVisible();
  // The seed's document is short: a lower panel makes it scroll (the board's panel is 740px tall).
  await panel.evaluate((element) => {
    element.style.height = '320px';
  });
  const saved = page.waitForRequest((request) => request.url().endsWith('/progress') && request.method() === 'PUT');
  await panel.evaluate((element) => element.scrollTo({ top: element.scrollHeight }));
  const body = (await saved).postDataJSON() as { progress: number; anchor: string | null };
  expect(body.progress).toBe(100);
  expect(body.anchor).toBe('arp-request-reply');
});

test('A−/A+ sets the reading text size, kept for the account and the next visit', async ({ page }) => {
  await signInAt(page, '/s/networking');
  await page.locator('[data-screen="C10"]').getByRole('link', { name: /Giao thức DHCP/ }).click();
  const reader = page.locator('[data-screen="C11"]');
  const body = reader.locator('.reader-passage:not([data-overview]) p').first();
  await expect(body).toHaveCSS('font-size', '17px');
  const sizes = reader.getByRole('group', { name: 'Cỡ chữ' });
  const saved = page.waitForRequest((request) => request.url().endsWith('/api/me') && request.method() === 'PATCH');
  await sizes.getByRole('button', { name: 'Chữ lớn hơn' }).click();
  expect((await saved).postDataJSON()).toEqual({ readerTextSize: 18 });
  await expect(body).toHaveCSS('font-size', '18px');
  // the keyboard reaches it too
  const largest = page.waitForResponse((response) => response.url().endsWith('/api/me') && response.request().method() === 'PATCH' && response.request().postData() === '{"readerTextSize":20}');
  await sizes.getByRole('button', { name: 'Chữ lớn hơn' }).focus();
  await page.keyboard.press('Enter');
  await expect(body).toHaveCSS('font-size', '20px');
  expect((await largest).ok()).toBe(true);

  // the account keeps it: a fresh browser copy still gets 20px from the session
  await page.evaluate(() => localStorage.removeItem('kb-reader-text-size'));
  await page.reload();
  await expect(reader.locator('.reader-passage:not([data-overview]) p').first()).toHaveCSS('font-size', '20px');

  // back to the default, so other screens of the run see the board's setting
  const back = page.waitForResponse((response) => response.url().endsWith('/api/me') && response.request().method() === 'PATCH' && response.request().postData() === '{"readerTextSize":17}');
  await sizes.getByRole('button', { name: 'Chữ nhỏ hơn' }).click();
  await sizes.getByRole('button', { name: 'Chữ nhỏ hơn' }).click();
  await back;
  await expect(reader.locator('.reader-passage:not([data-overview]) p').first()).toHaveCSS('font-size', '17px');
});
