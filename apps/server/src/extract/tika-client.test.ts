/** The Tika client against a fake Tika: OCR headers, retries of a restarting Tika, deadlines, errors, the 25 MB cap. */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type FakeTika, startFakeTika, xhtml } from '../../test/fake-tika';
import { ExtractionError } from './extraction-error';
import { MAX_FILE_BYTES } from './formats';
import { TikaClient } from './tika-client';

let tika: FakeTika;
const bytes = new Uint8Array([37, 80, 68, 70]);

beforeAll(async () => {
  tika = await startFakeTika();
});
afterAll(async () => {
  await tika.close();
});
beforeEach(() => {
  tika.calls.length = 0;
  tika.respond = () => ({ body: xhtml('<p>ok</p>') });
});

async function failure(promise: Promise<unknown>): Promise<ExtractionError> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  if (!(error instanceof ExtractionError)) throw new Error(`expected an ExtractionError, got ${String(error)}`);
  return error;
}

describe('TikaClient', () => {
  it('asks for XHTML without any OCR by default, and for Vietnamese hOCR when told', async () => {
    const client = new TikaClient(tika.url);
    expect(await client.html(bytes, 'application/pdf')).toContain('<p>ok</p>');
    await client.html(bytes, 'application/pdf', { ocr: true });
    const [plain, ocr] = tika.calls;
    expect(plain).toMatchObject({ method: 'PUT', path: '/tika' });
    expect(plain?.headers).toMatchObject({ accept: 'text/html', 'content-type': 'application/pdf', 'x-tika-ocrskipocr': 'true', 'x-tika-pdfocrstrategy': 'no_ocr' });
    expect(ocr?.headers).toMatchObject({ 'x-tika-pdfocrstrategy': 'ocr_only', 'x-tika-ocrlanguage': 'vie', 'x-tika-ocroutputtype': 'hocr' });
    expect(ocr?.headers['x-tika-ocrskipocr']).toBeUndefined();
    expect(plain?.body.length).toBe(4);
  });

  it('detects a MIME type', async () => {
    tika.respond = () => ({ body: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document\n' });
    expect(await new TikaClient(tika.url).detect(bytes)).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    expect(tika.calls[0]?.path).toBe('/detect/stream');
  });

  it('retries a restarting Tika, then gives up as unavailable', async () => {
    let n = 0;
    tika.respond = () => ({ status: (n += 1) < 3 ? 503 : 200, body: xhtml('<p>back</p>') });
    expect(await new TikaClient(tika.url, { retryDelaysMs: [0, 0] }).html(bytes, 'application/pdf')).toContain('back');
    expect(tika.calls).toHaveLength(3);

    tika.calls.length = 0;
    tika.respond = () => ({ status: 503, body: '' });
    expect((await failure(new TikaClient(tika.url, { retryDelaysMs: [0, 0] }).html(bytes, 'application/pdf'))).code).toBe('tika-unavailable');
    expect(tika.calls).toHaveLength(3);
  });

  it('treats a refused connection as unavailable (retryable)', async () => {
    const error = await failure(new TikaClient('http://127.0.0.1:1', { retryDelaysMs: [0] }).html(bytes, 'application/pdf'));
    expect(error).toMatchObject({ code: 'tika-unavailable', retryable: true, hint: 'retry-later' });
  });

  it('times out a slow answer without retrying it', async () => {
    tika.respond = () => ({ body: xhtml(''), delayMs: 300 });
    const error = await failure(new TikaClient(tika.url, { timeoutMs: 50, retryDelaysMs: [0, 0] }).html(bytes, 'application/pdf'));
    expect(error).toMatchObject({ code: 'timeout', retryable: true });
    expect(tika.calls).toHaveLength(1);
  });

  it('names a locked file, a damaged one and an unsupported one', async () => {
    const client = new TikaClient(tika.url, { retryDelaysMs: [] });
    tika.respond = () => ({ status: 422, body: 'org.apache.tika.exception.EncryptedDocumentException: Unable to process: document is encrypted' });
    expect(await failure(client.html(bytes, 'application/pdf'))).toMatchObject({ code: 'encrypted', hint: 'remove-password', retryable: false });
    tika.respond = () => ({ status: 422, body: 'org.apache.tika.exception.TikaException: Unexpected RuntimeException' });
    expect(await failure(client.html(bytes, 'application/pdf'))).toMatchObject({ code: 'corrupt', hint: 'resave-file' });
    tika.respond = () => ({ status: 415, body: '' });
    expect(await failure(client.html(bytes, 'application/x-unknown'))).toMatchObject({ code: 'unsupported-type', hint: 'convert-format' });
  });

  it('never sends a file over 25 MB', async () => {
    const error = await failure(new TikaClient(tika.url).html(new Uint8Array(MAX_FILE_BYTES + 1), 'application/pdf'));
    expect(error).toMatchObject({ code: 'too-large', hint: 'smaller-file', retryable: false });
    expect(tika.calls).toHaveLength(0);
  });
});
