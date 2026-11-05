/**
 * A stand-in for the Office editor (ranuts/document, docs/office-editor.md), which E2E cannot run: every request to
 * the editor's origin gets one small page that speaks the editor's embed protocol over `postMessage` to the page that
 * embeds it (`embedOrigin`), as the real one does:
 *
 * - `document:ready` once loaded;
 * - `document:open-buffer` → `document:opened` (`document:error` for an empty buffer), then `document:dirty-changed`;
 * - `document:save` → `document:saved` with `savedBase64` as the edited file (a docx Blob), even offline: the page
 *   is loaded already and the edited file is in it.
 */
import type { BrowserContext } from '@playwright/test';

function stubPage(savedBase64: string): string {
  const script = `
const embedder = new URLSearchParams(location.search).get('embedOrigin');
const saved = Uint8Array.from(atob(${JSON.stringify(savedBase64)}), (c) => c.charCodeAt(0));
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
let name = 'document.docx';
const reply = (message) => parent.postMessage(message, embedder);
addEventListener('message', (event) => {
  if (event.origin !== embedder || event.source !== parent) return;
  const { id, type, payload } = event.data ?? {};
  if (type === 'document:open-buffer') {
    const size = payload?.buffer?.byteLength ?? 0;
    if (size === 0) return reply({ id, type: 'document:error', payload: { message: 'empty buffer' } });
    name = payload.fileName ?? name;
    reply({ id, type: 'document:opened', payload: {} });
    reply({ type: 'document:dirty-changed', payload: { dirty: true } });
  } else if (type === 'document:save') {
    reply({ id, type: 'document:saved', payload: { file: new File([saved], name, { type: DOCX }), dirty: false } });
  }
});
reply({ type: 'document:ready', payload: {} });
`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>editor stub</title></head><body><script>${script}</script></body></html>`;
}

/** Serves the stub for every page of `origin`; saving in it hands back `savedBase64` (a docx). */
export async function routeEditorStub(context: BrowserContext, origin: string, savedBase64: string): Promise<void> {
  const html = stubPage(savedBase64);
  await context.route(`${origin}/**`, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: html }));
}
