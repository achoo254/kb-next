import { type Page, expect, test } from '@playwright/test';
import { C02_DRAFT_ID } from './graph-canvas-boards';
import { openScreen } from './open-screen';
import { JOURNEY_ID } from './journey-boards';
import { PARITY_SCREENS, type ParityScreen, layoutOf } from './parity-screens';
import { PUBLISH_DOCUMENT_ID } from './share-boards';
import { signInAt } from './sign-in';

/**
 * The phone screens (boards Mobile, M02–M06; apps/web/src/layout/device.ts) on phones from 320 to 430 CSS px wide:
 * laid out at the window's own width, so the page never scrolls sideways and nothing reaches past the right edge
 * (rows marked `data-scroll-row`, and a text's steps, scroll sideways inside themselves on purpose), and every control a finger presses is
 * at least 44×44 px. As in WCAG 2.5.8, links inside a line of text (a [[wikilink]], a source number in a sentence) are
 * exempt; a field counts with the label around it (pressing the label focuses it); the skip link counts only once it
 * shows (focus).
 */
const PHONES = [
  { width: 320, height: 640 },
  { width: 360, height: 780 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
] as const;
/** The phone screens without a board of their own are checked on the narrowest phone. */
const PHONE = PHONES[0];
const TOUCH = 44;
const PHONE_SCREENS = PARITY_SCREENS.filter((screen) => layoutOf(screen) === 'phone');

const CONTROLS = 'a[href], button, input:not([type="hidden"]), select, textarea, [role="button"], [role="tab"], [role="switch"], [role="radio"]';

/** The controls smaller than the touch target, as `tag.class "text" w×h`; and whether the page scrolls sideways. */
async function measure(page: Page): Promise<{ small: string[]; sideways: boolean; past: string[]; layout: string | undefined }> {
  return page.evaluate(
    ({ selector, touch }) => {
      const root = document.documentElement;
      const small: string[] = [];
      const past = new Set<string>();
      const name = (element: Element): string => `${element.tagName.toLowerCase()}.${(element.getAttribute('class') ?? '').split(' ')[0]}`;
      for (const element of document.querySelectorAll('body *')) {
        // rows that scroll sideways inside themselves on purpose (chips, cards, a text's steps)
        if (element.closest('[data-scroll-row], [data-steps]')) continue;
        const box = element.getBoundingClientRect();
        if (box.width === 0 || box.height === 0 || box.right <= 0) continue;
        if (box.right > window.innerWidth + 0.5) past.add(`${name(element)} right ${Math.round(box.right)}`);
      }
      for (const element of document.querySelectorAll<HTMLElement>(selector)) {
        if (element.closest('[aria-hidden="true"], [hidden], .kf-visually-hidden')) continue;
        const style = getComputedStyle(element);
        if (style.visibility === 'hidden' || style.display === 'none') continue;
        // a link inside a line of text (a [[wikilink]], a source in a sentence) is exempt
        if (element.tagName === 'A' && style.display.startsWith('inline')) continue;
        // a field is pressed through the label around it
        const field = ['INPUT', 'SELECT', 'TEXTAREA'].includes(element.tagName) ? element.closest('label') : null;
        const box = (field ?? element).getBoundingClientRect();
        if (box.width === 0 && box.height === 0) continue;
        // off the screen until focused (the skip link)
        if (box.bottom <= 0 || box.right <= 0) continue;
        if (box.width + 0.5 < touch || box.height + 0.5 < touch) {
          small.push(`${name(element)} "${(element.textContent ?? '').trim().slice(0, 24)}" ${Math.round(box.width)}×${Math.round(box.height)}`);
        }
      }
      return { small, sideways: root.scrollWidth > window.innerWidth + 0.5 || root.scrollWidth > root.clientWidth + 1, past: [...past], layout: root.dataset.device };
    },
    { selector: CONTROLS, touch: TOUCH },
  );
}

for (const screen of PHONE_SCREENS) {
  for (const size of PHONES) {
    test(`${screen.board} at ${size.width}×${size.height}: a phone layout within the width, 44px touch targets`, async ({ page }) => {
      await page.setViewportSize(size);
      await openScreen(page, screen);
      await checkPhone(page);
    });
  }
}

/** The phone screens with no board of their own: the editor stage of M02, the stages after M03, the upload. */
async function checkPhone(page: Page): Promise<void> {
  const result = await measure(page);
  expect(result.layout).toBe('phone');
  expect(result.sideways).toBe(false);
  expect(result.past).toEqual([]);
  expect(result.small).toEqual([]);
}

test('the phone editor (M02 editor stage) of a draft', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await signInAt(page, `/d/${C02_DRAFT_ID}/edit`);
  await page.locator('[data-id="editor-screen"][data-state="ready"]').waitFor();
  await checkPhone(page);
  // the AI assistant opens as a sheet over the editor
  await page.locator('[data-id="editor-tool-ai"]').click();
  await page.locator('[data-id="editor-ai-sheet"]').waitFor();
  await checkPhone(page);
});

test('a new note opens in the phone editor', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await signInAt(page, '/new');
  await page.waitForURL(/\/d\/[^/]+\/edit$/);
  await page.locator('[data-id="editor-screen"][data-state="ready"]').waitFor();
  await checkPhone(page);
});

for (const outcome of ['sent', 'failed'] as const) {
  test(`publishing on a phone ends ${outcome} (M03 stages)`, async ({ page }) => {
    await page.setViewportSize(PHONE);
    // the publication is answered here: the shared draft must stay a draft for the other screens
    await page.route('**/api/documents/*/submit', (route) =>
      outcome === 'sent'
        ? route.fulfill({ json: { status: 'approved', hidden: false, publishedAt: '2026-11-03T14:05:00.000Z' } })
        : route.abort('internetdisconnected'),
    );
    await signInAt(page, `/d/${PUBLISH_DOCUMENT_ID}/publish`);
    await page.locator('[data-id="publish-cta"]').click();
    await page.locator(`[data-id="submit-screen"][data-state="${outcome}"]`).waitFor();
    await checkPhone(page);
  });
}

/**
 * The journey screens have no phone board: the builder (C07's journey, its five steps, Jev's suggestions and the pool)
 * and the run (Flow's journey, two steps done) are checked at every phone width, the builder with its sheets open too.
 */
const JOURNEY_PHONE_SCREENS: readonly ParityScreen[] = [
  { board: 'C07-FlowBuilder', path: `/journey/${JOURNEY_ID}/edit`, signedIn: true, status: 'built', mocks: ['journey-c07'], waitFor: '[data-id="journey-builder"][data-state="ready"]' },
  { board: 'Flow', path: `/journey/${JOURNEY_ID}`, signedIn: true, status: 'built', mocks: ['journey-flow'], waitFor: '[data-id="journey-card"]' },
];

for (const screen of JOURNEY_PHONE_SCREENS) {
  for (const size of PHONES) {
    test(`${screen.path} at ${size.width}×${size.height}: the phone journey layout within the width, 44px touch targets`, async ({ page }) => {
      await page.setViewportSize(size);
      await openScreen(page, screen);
      await checkPhone(page);
      if (screen.board !== 'C07-FlowBuilder') return;
      await page.locator('[data-id="journey-add"]').click();
      await page.locator('[data-id="journey-add-sheet"] [data-id="journey-jev"][data-state="ready"]').waitFor();
      await checkPhone(page);
      await page.keyboard.press('Escape');
      await page.locator('[data-id="journey-step"] .jbp-step-main').nth(1).click();
      await page.locator('[data-id="journey-step-sheet"]').waitFor();
      await checkPhone(page);
    });
  }
}

test('a new journey opens in the phone builder', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await signInAt(page, '/journey/new');
  await page.waitForURL(/\/journey\/[^/]+\/edit$/);
  await page.locator('[data-id="journey-builder"][data-state="empty"]').waitFor();
  await checkPhone(page);
});

test('the template picker on the phone create bloom (M02)', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await signInAt(page, '/create');
  await page.locator('[data-id="create-template"]').click();
  await page.locator('[data-id="create-template-sheet"]').waitFor();
  await checkPhone(page);
});

test('uploading on a phone', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await signInAt(page, '/upload');
  await page.locator('[data-id="upload-phone"]').waitFor();
  await checkPhone(page);
});
