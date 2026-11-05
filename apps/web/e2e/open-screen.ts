import type { Page } from '@playwright/test';
import type { ParityMock, ParityScreen } from './parity-screens';
import { C11_STREAM, C14_HISTORY, C14_STREAM, F03_KEYS, F04_DOCUMENT, F04_DOCUMENT_ID, F04_STREAM } from './ai-boards';
import { C15_SUGGESTION } from './graph-canvas-boards';
import { C17_DIFF, C17_HISTORY } from './history-boards';
import { c08Documents } from './mine-boards';
import { mockImportsC16, mockUploadC03, seedOfflineH04 } from './office-boards';
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
  if (mocks.includes('keys-f03') || mocks.includes('copilot-c14') || mocks.includes('ask-c11') || mocks.includes('keys-c02')) await page.route('**/api/me/keys', (route) => route.fulfill({ json: F03_KEYS }));
  for (const [mock, body] of [
    ['copilot-c14', C14_STREAM],
    ['ask-c11', C11_STREAM],
  ] as const) {
    if (mocks.includes(mock)) await page.route('**/api/ask', (route) => route.fulfill({ status: 200, contentType: 'text/event-stream', body }));
  }
  if (mocks.includes('copilot-c14')) await page.route('**/api/copilot/history', (route) => route.fulfill({ json: C14_HISTORY }));
  if (mocks.includes('history-c17')) {
    await page.route('**/api/documents/*/history', (route) => route.fulfill({ json: C17_HISTORY }));
    await page.route('**/api/documents/*/diff?*', (route) => route.fulfill({ json: C17_DIFF }));
  }
  if (mocks.includes('mine-c08')) {
    await page.route('**/api/me/documents', async (route) => {
      const response = await route.fetch();
      if (!response.ok()) return route.fulfill({ response });
      const real = (await response.json()) as { documents: Array<{ space: { slug: string; nameVi: string; nameEn: string; tint: string; glow: string } }> };
      const personal = real.documents.map((doc) => doc.space).find((space) => space.slug.startsWith('personal-'));
      return personal ? route.fulfill({ response, json: c08Documents(personal) }) : route.fulfill({ response });
    });
  }
  if (mocks.includes('upload-c03')) await mockUploadC03(page);
  if (mocks.includes('imports-c16')) await mockImportsC16(page);
  if (mocks.includes('offline-h04')) await seedOfflineH04(page);
  if (mocks.includes('canvas-c15')) await page.route('**/api/canvases/*/suggestion', (route) => route.fulfill({ json: C15_SUGGESTION }));
  if (mocks.includes('translate-f04')) {
    await page.route('**/api/me/keys', (route) => route.fulfill({ json: F03_KEYS }));
    await page.route(`**/api/documents/${F04_DOCUMENT_ID}`, (route) => (route.request().method() === 'GET' ? route.fulfill({ json: F04_DOCUMENT }) : route.fallback()));
    // A route can only answer a whole body, and the screen must stay mid-stream: the page's own fetch answers the
    // translation with the board's events on a stream that is never closed.
    await page.addInitScript((body: string) => {
      const original = window.fetch.bind(window);
      window.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        if (!url.endsWith('/translate')) return original(input, init);
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(body));
          },
        });
        return Promise.resolve(new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }));
      };
    }, F04_STREAM);
  }
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
  if (screen.select) {
    await page.waitForLoadState('networkidle');
    await page.evaluate(({ within, text }) => {
      const root = document.querySelector(within);
      const walker = root ? document.createTreeWalker(root, NodeFilter.SHOW_TEXT) : null;
      for (let node = walker?.nextNode(); node; node = walker?.nextNode()) {
        const start = node.textContent?.indexOf(text) ?? -1;
        if (start < 0) continue;
        const range = document.createRange();
        range.setStart(node, start);
        range.setEnd(node, start + text.length);
        document.getSelection()?.removeAllRanges();
        document.getSelection()?.addRange(range);
        return;
      }
      throw new Error(`"${text}" not found in ${within}`);
    }, screen.select);
  }
  if (screen.files) {
    await page.waitForLoadState('networkidle');
    await page.locator(screen.files.input).setInputFiles(screen.files.files.map((file) => ({ name: file.name, mimeType: 'application/octet-stream', buffer: Buffer.alloc(file.size) })));
  }
  if (screen.offline) {
    await page.waitForLoadState('networkidle');
    await page.context().setOffline(true);
  }
  if (screen.click) await page.locator(screen.click).click();
  if (screen.waitFor) await page.locator(screen.waitFor).waitFor();
  else await page.waitForLoadState('networkidle');
}
