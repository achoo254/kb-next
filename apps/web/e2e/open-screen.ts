import type { Page } from '@playwright/test';
import type { ParityMock, ParityScreen } from './parity-screens';
import { C12_SEARCH, C12_SPACES, F01_SEARCH } from './search-boards';
import { signInAt } from './sign-in';

/**
 * Opens a screen of parity-screens.ts in the state of its board (fixed clock, API answers, signed in, keys pressed),
 * at the page's current viewport: shared by the pixel parity check and the window-size check (fits-window.spec.ts).
 */
/** Changes the API's answers for one shot (see ParityMock); everything else goes to the real API. */
async function mockApi(page: Page, mocks: readonly ParityMock[]): Promise<void> {
  if (mocks.includes('onboarded')) {
    await page.route('**/api/me', async (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      const response = await route.fetch();
      if (!response.ok()) return route.fulfill({ response });
      const me = (await response.json()) as Record<string, unknown>;
      return route.fulfill({ response, json: { ...me, onboardedAt: me.onboardedAt ?? '2026-11-03T14:05:00.000Z' } });
    });
  }
  if (mocks.includes('spaces-pending')) {
    // never answered: the screen stays in its loading state for the shot
    await page.route('**/api/spaces', () => undefined);
  }
  if (mocks.includes('spaces-without-texts')) {
    await page.route('**/api/spaces', async (route) => {
      const response = await route.fetch();
      if (!response.ok()) return route.fulfill({ response });
      const body = (await response.json()) as { spaces: Array<{ kind: string; documentCount: number }> };
      const shared = body.spaces.filter((space) => space.kind !== 'personal').map((space) => ({ ...space, documentCount: 0 }));
      return route.fulfill({ response, json: { spaces: shared } });
    });
  }
  for (const [mock, json] of [
    ['search-c12', C12_SEARCH],
    ['search-f01', F01_SEARCH],
  ] as const) {
    if (mocks.includes(mock)) await page.route('**/api/search?*', (route) => route.fulfill({ json }));
  }
  // C12's Space filter lists the board's five Spaces, matching its results.
  if (mocks.includes('search-c12')) await page.route('**/api/spaces', (route) => route.fulfill({ json: C12_SPACES }));
}

/** Opens `screen` and waits until it is ready to be looked at. */
export async function openScreen(page: Page, screen: ParityScreen): Promise<void> {
  if (screen.clock) await page.clock.setFixedTime(new Date(screen.clock));
  if (screen.mocks) await mockApi(page, screen.mocks);
  if (screen.signedIn) await signInAt(page, screen.path);
  else await page.goto(screen.path);
  await page.evaluate(() => document.fonts.ready);
  if (screen.keys || screen.type) {
    // A screen opened from the keyboard (the palette): once the page is ready to listen.
    await page.waitForLoadState('networkidle');
    for (const key of screen.keys ?? []) await page.keyboard.press(key);
    if (screen.type) await page.keyboard.type(screen.type);
  }
  if (screen.waitFor) await page.locator(screen.waitFor).waitFor();
  else await page.waitForLoadState('networkidle');
}
