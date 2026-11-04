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
  // A narrow window stacks the reader, so even a short document scrolls inside its panel.
  await page.setViewportSize({ width: 1000, height: 560 });
  await page.locator('[data-screen="C10"]').getByRole('link', { name: /Giao thức ARP/ }).click();
  const panel = page.locator('[data-id="reader-panel"]');
  await expect(panel.getByRole('heading', { level: 1, name: 'Giao thức ARP' })).toBeVisible();
  const saved = page.waitForRequest((request) => request.url().endsWith('/progress') && request.method() === 'PUT');
  await panel.evaluate((element) => element.scrollTo({ top: element.scrollHeight }));
  const body = (await saved).postDataJSON() as { progress: number; anchor: string | null };
  expect(body.progress).toBe(100);
  expect(body.anchor).toBe('arp-request-reply');
});
