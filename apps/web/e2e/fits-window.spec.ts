import { type Page, expect, test } from '@playwright/test';
import { openScreen } from './open-screen';
import { PARITY_SCREENS, hasPhoneLayout, layoutOf } from './parity-screens';

/**
 * Every screen fits windows other than its 1440×900 board (the board frame, apps/web/src/layout/board-zoom.ts): no
 * link, button, field or text is cut off by an ancestor that clips it or left where the page cannot scroll to, and
 * from 768px up the page never scrolls sideways. On a phone (390×844) the screens with a phone board (/u, /create,
 * /new, /upload, /search, /copilot, a text, its editor, publishing and sending) take the phone layout and never scroll sideways either; the others
 * keep their desktop board at its smallest zoom and scroll sideways (apps/web/src/layout/device.ts). A new screen is
 * checked as soon as it is listed in parity-screens.ts. The /dev/kit pages are the kit's own sheets and are left out.
 */
const WINDOWS = [
  { width: 1280, height: 720 },
  { width: 1024, height: 768 },
  { width: 390, height: 844 },
];

/** What a person must be able to reach on a screen. */
const REACHABLE = 'a[href], button, input, textarea, select, [role="button"], [role="tab"], h1, h2, h3, p, li';

/** The parts that cannot be reached, as `selector-ish (reason)` strings; and whether the page scrolls sideways. */
async function unreachable(page: Page): Promise<{ parts: string[]; sideways: boolean }> {
  return page.evaluate((selector) => {
    const root = document.documentElement;
    const parts = new Set<string>();
    const name = (element: Element) => `${element.tagName.toLowerCase()}.${(element.getAttribute('class') ?? '').split(' ')[0]}`;
    for (const element of document.querySelectorAll(selector)) {
      if (element.closest('[aria-hidden="true"], [hidden], .kf-visually-hidden')) continue;
      let box = element.getBoundingClientRect();
      if (box.width < 4 || box.height < 4 || getComputedStyle(element).visibility === 'hidden') continue;
      let reason = '';
      // Walk up: a scrolling ancestor makes the part reachable if the ancestor is; a clipping one must hold it.
      for (let parent = element.parentElement; parent && parent !== document.body && !reason; parent = parent.parentElement) {
        const style = getComputedStyle(parent);
        const overflows = [style.overflowX, style.overflowY];
        const frame = parent.getBoundingClientRect();
        if (overflows.some((value) => value === 'auto' || value === 'scroll')) box = frame;
        else if (overflows.some((value) => value === 'hidden' || value === 'clip')) {
          if (box.left < frame.left - 1 || box.right > frame.right + 1 || box.top < frame.top - 1 || box.bottom > frame.bottom + 1) {
            reason = `clipped by ${name(parent)}`;
          }
        }
      }
      const right = box.right + window.scrollX;
      const bottom = box.bottom + window.scrollY;
      if (!reason && (right > root.scrollWidth + 1 || bottom > root.scrollHeight + 1)) reason = 'past the page';
      if (reason) parts.add(`${name(element)} (${reason})`);
    }
    return { parts: [...parts], sideways: root.scrollWidth > root.clientWidth + 1 };
  }, REACHABLE);
}

/**
 * Whether a screen of the list shows at `width`: a tablet or phone board only in its own layout (1024 is a tablet,
 * 390 a phone), a desktop board everywhere except a phone where its route takes the phone layout instead.
 */
function shows(screen: (typeof PARITY_SCREENS)[number], width: number): boolean {
  const layout = layoutOf(screen);
  if (layout === 'phone') return width <= 640;
  if (layout === 'tablet') return width > 640 && width < 1280;
  return width > 640 || !hasPhoneLayout(screen.path);
}

for (const screen of PARITY_SCREENS.filter((entry) => !entry.path.startsWith('/dev/'))) {
  for (const size of WINDOWS.filter((window) => shows(screen, window.width))) {
    test(`${screen.board} fits a ${size.width}×${size.height} window`, async ({ page }) => {
      await page.setViewportSize(size);
      await openScreen(page, screen);
      const result = await unreachable(page);
      expect(result.parts).toEqual([]);
      const phoneLayout = await page.evaluate(() => document.documentElement.dataset.device === 'phone' && document.querySelector('.phone-shell') !== null);
      if (size.width >= 768 || phoneLayout) expect(result.sideways).toBe(false);
    });
  }
}
