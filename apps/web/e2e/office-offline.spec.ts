/**
 * The Office editor's offline flow in a real browser (docs/office-editor.md, "Trong KnowFlow"): a docx opened online,
 * saved with the connection cut (Playwright's `setOffline`, so `navigator.onLine` and the `online`/`offline` events
 * are the browser's own) stays in IndexedDB and shows on H04 as waiting; once back online it goes up by itself as
 * version 2 and leaves the queue. The editor is a stub on the editor's origin (office-editor-stub.ts). E2E has no
 * Tika, so the new text is never extracted: the server's file is checked by its version and bytes, not by search.
 */
import { type Page, expect, test } from '@playwright/test';
import { OFFICE_EDITOR_ORIGIN } from './e2e-env';
import { docx } from './office-boards';
import { routeEditorStub } from './office-editor-stub';
import { signInAt } from './sign-in';

const NAME = 'offline-notes.docx';
const FIRST = docx(['Ghi chú offline', 'Bản đầu tiên.']);
const EDITED = docx(['Ghi chú offline', 'Bản đầu tiên.', 'Sửa khi mất mạng: zephyrine.']);

interface KeptCopy {
  state: string;
  fileId: string;
  bytes: string;
}

/** This browser's kept copy of `documentId` (IndexedDB `kb-office`), bytes as base64; null when there is none. */
function keptCopy(page: Page, documentId: string): Promise<KeptCopy | null> {
  return page.evaluate(
    (id) =>
      new Promise<KeptCopy | null>((resolve, reject) => {
        const open = indexedDB.open('kb-office');
        open.onerror = () => reject(new Error('kb-office did not open'));
        open.onsuccess = () => {
          const db = open.result;
          const all = db.transaction('files', 'readonly').objectStore('files').getAll();
          all.onerror = () => reject(new Error('kb-office files unreadable'));
          all.onsuccess = () => {
            db.close();
            const records = all.result as Array<{ documentId: string; state: string; fileId: string; bytes: ArrayBuffer }>;
            const found = records.find((record) => record.documentId === id);
            if (!found) return resolve(null);
            const bytes = new Uint8Array(found.bytes);
            let binary = '';
            for (const byte of bytes) binary += String.fromCharCode(byte);
            resolve({ state: found.state, fileId: found.fileId, bytes: btoa(binary) });
          };
        };
      }),
    documentId,
  );
}

test('an Office draft saved offline is kept on the device and becomes version 2 once back online', async ({ page, context }) => {
  await routeEditorStub(context, OFFICE_EDITOR_ORIGIN, EDITED);
  await signInAt(page, '/u');

  // As the browser's upload (C03) would: writes must come from the app's own origin.
  const upload = await page.request.post('/api/files', { headers: { Origin: new URL(page.url()).origin }, multipart: { file: { name: NAME, mimeType: 'application/octet-stream', buffer: Buffer.from(FIRST, 'base64') } } });
  expect(upload.status()).toBe(201);
  const { file: first } = (await upload.json()) as { file: { id: string; documentId: string; version: number } };
  expect(first.version).toBe(1);

  // Online: the reader opens the file in the editor (the server's copy is kept here for offline use).
  await page.goto(`/d/${first.documentId}`);
  await page.locator('[data-id="office-open"]').click();
  const save = page.locator('[data-id="office-save"]');
  await expect(save).toBeEnabled();
  await expect.poll(async () => (await keptCopy(page, first.documentId))?.state).toBe('synced');

  // H04 open in another tab of the same browser, before the connection drops (no page loads offline).
  const queue = await context.newPage();
  await queue.goto('/sync');
  await expect(queue.locator('.sync-count')).toHaveText('0');

  const puts: string[] = [];
  context.on('request', (request) => {
    if (request.method() === 'PUT' && request.url().includes('/api/files/')) puts.push(request.url());
  });

  await context.setOffline(true);
  await expect(queue.locator('[data-id="sync-banner"]')).toHaveAttribute('data-state', 'offline');
  await save.click();
  await expect(page.locator('[data-id="office-save-state"]')).toHaveText('Đã lưu trên máy · đồng bộ khi có mạng');
  expect(await keptCopy(page, first.documentId)).toEqual({ state: 'draft', fileId: first.id, bytes: EDITED });
  await expect(queue.locator('.sync-count')).toHaveText('1');
  await expect(queue.locator('[data-id="sync-row"]')).toHaveCount(1);
  await expect(queue.locator('[data-id="sync-row"]')).toHaveAttribute('data-state', 'wait');
  await expect(queue.locator('[data-id="sync-row"] .sync-row-name')).toHaveText(NAME);
  expect(puts).toEqual([]);

  // Back online: the draft goes up by itself (no button pressed) as the document's next version.
  const sent = context.waitForEvent('response', (response) => response.request().method() === 'PUT' && response.url().endsWith(`/api/files/${first.id}`));
  await context.setOffline(false);
  const response = await sent;
  expect(response.status()).toBe(200);
  const { file: second } = (await response.json()) as { file: { id: string; version: number } };
  expect(second.version).toBe(2);
  expect(puts).toHaveLength(1);

  await expect(queue.locator('.sync-count')).toHaveText('0');
  await expect(queue.locator('[data-id="sync-row"]')).toHaveCount(0);
  await expect.poll(async () => keptCopy(page, first.documentId)).toEqual({ state: 'synced', fileId: second.id, bytes: EDITED });
  await queue.reload();
  await expect(queue.locator('.sync-count')).toHaveText('0');

  // The server's document now is version 2, with the edited bytes.
  const doc = await page.request.get(`/api/documents/${first.documentId}`);
  expect(doc.status()).toBe(200);
  const { file: current } = (await doc.json()) as { file: { id: string; version: number } };
  expect(current).toMatchObject({ id: second.id, version: 2 });
  const bytes = await page.request.get(`/api/files/${second.id}`);
  expect(bytes.status()).toBe(200);
  const body = await bytes.body();
  expect(body.toString('base64')).toBe(EDITED);
  expect(body.equals(Buffer.from(FIRST, 'base64'))).toBe(false);
});
