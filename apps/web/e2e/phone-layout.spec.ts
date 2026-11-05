import { type Page, expect, test } from '@playwright/test';
import { openScreen } from './open-screen';
import { PARITY_SCREENS, layoutOf } from './parity-screens';

/**
 * The phone screens (boards Mobile, M02–M06; apps/web/src/layout/device.ts) at 390×844: laid out at the window's own
 * width, so the page never scrolls sideways, and every control a finger presses is at least 44×44 px. As in WCAG
 * 2.5.8, links inside a line of text (a [[wikilink]], a source number in a sentence) are exempt; a field counts with
 * the label around it (pressing the label focuses it); the skip link counts only once it shows (focus).
 */
const PHONE = { width: 390, height: 844 };
const TOUCH = 44;
const PHONE_SCREENS = PARITY_SCREENS.filter((screen) => layoutOf(screen) === 'phone');

const CONTROLS = 'a[href], button, input:not([type="hidden"]), select, textarea, [role="button"], [role="tab"], [role="switch"], [role="radio"]';

/** The controls smaller than the touch target, as `tag.class "text" w×h`; and whether the page scrolls sideways. */
async function measure(page: Page): Promise<{ small: string[]; sideways: boolean; layout: string | undefined }> {
  return page.evaluate(
    ({ selector, touch }) => {
      const root = document.documentElement;
      const small: string[] = [];
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
          const name = `${element.tagName.toLowerCase()}.${(element.getAttribute('class') ?? '').split(' ')[0]}`;
          small.push(`${name} "${(element.textContent ?? '').trim().slice(0, 24)}" ${Math.round(box.width)}×${Math.round(box.height)}`);
        }
      }
      return { small, sideways: root.scrollWidth > root.clientWidth + 1, layout: root.dataset.device };
    },
    { selector: CONTROLS, touch: TOUCH },
  );
}

for (const screen of PHONE_SCREENS) {
  test(`${screen.board} is a phone layout without sideways scroll and with 44px touch targets`, async ({ page }) => {
    await page.setViewportSize(PHONE);
    await openScreen(page, screen);
    const result = await measure(page);
    expect(result.layout).toBe('phone');
    expect(result.sideways).toBe(false);
    expect(result.small).toEqual([]);
  });
}
