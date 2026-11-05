/**
 * Apache Tika server (2.9, shared on the host, loopback): a file's XHTML (`PUT /tika`, `Accept: text/html`), with OCR
 * of PDF pages through Tika's Tesseract (`vie` only, hOCR so word confidences come back) when asked. Files over
 * MAX_FILE_BYTES are never sent. A refused connection or a 502–504 (Tika restarting, overloaded) is retried a few
 * times here; a timeout is not (the queue retries the whole job later). Nothing of a file's content is logged.
 */
import { safeErrorText } from '../log-error';
import { ExtractionError } from './extraction-error';
import { MAX_FILE_BYTES } from './formats';

/** OCR languages of the host's Tesseract, Vietnamese first. */
// `vie` alone: its Latin set reads English terms too, while `vie+eng` let the English model drop Vietnamese tone marks
// on blurred scans (measured on the server 05/11/2026: 3 word errors instead of 6, and 40% faster).
export const TIKA_OCR_LANGUAGES = 'vie';
const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_RETRY_DELAYS_MS = [1_000, 3_000];
const TRANSIENT_STATUSES = new Set([502, 503, 504]);

export interface TikaOptions {
  /** Default deadline of one request. */
  timeoutMs?: number;
  /** Waits before each retry of a transient failure; their count is the number of retries. */
  retryDelaysMs?: readonly number[];
}

export interface TikaRequest {
  /** OCR every page of this PDF (Tesseract, hOCR); otherwise no OCR at all (embedded images neither). */
  ocr?: boolean;
  /** Aborts the request (the job's deadline). */
  signal?: AbortSignal;
  /** This request's deadline, instead of the client's default. */
  timeoutMs?: number;
}

/** What Tika is asked; tests replace it at this boundary. */
export interface TikaExtractor {
  /** XHTML of the file. Rejects with an ExtractionError. */
  html(bytes: Uint8Array, contentType: string, request?: TikaRequest): Promise<string>;
  /** Tika's MIME type of the bytes. Rejects with an ExtractionError. */
  detect(bytes: Uint8Array, request?: TikaRequest): Promise<string>;
}

class TransientFailure extends Error {}

function wait(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new ExtractionError('timeout', 'job deadline passed'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(new ExtractionError('timeout', 'job deadline passed'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export class TikaClient implements TikaExtractor {
  private readonly timeoutMs: number;
  private readonly retryDelaysMs: readonly number[];

  constructor(
    private readonly baseUrl: string,
    options: TikaOptions = {},
  ) {
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.retryDelaysMs = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
  }

  async html(bytes: Uint8Array, contentType: string, request: TikaRequest = {}): Promise<string> {
    const pdf = contentType === 'application/pdf';
    const headers: Record<string, string> = { Accept: 'text/html', 'Content-Type': contentType };
    if (request.ocr) {
      Object.assign(headers, {
        'X-Tika-PDFOcrStrategy': 'ocr_only',
        'X-Tika-OCRLanguage': TIKA_OCR_LANGUAGES,
        'X-Tika-OCRoutputType': 'hocr',
      });
    } else {
      headers['X-Tika-OCRskipOcr'] = 'true';
      if (pdf) headers['X-Tika-PDFOcrStrategy'] = 'no_ocr';
    }
    return this.put('/tika', bytes, headers, request);
  }

  async detect(bytes: Uint8Array, request: TikaRequest = {}): Promise<string> {
    const type = await this.put('/detect/stream', bytes, { Accept: 'text/plain' }, request);
    return type.trim();
  }

  private async put(route: string, bytes: Uint8Array, headers: Record<string, string>, request: TikaRequest): Promise<string> {
    if (bytes.byteLength > MAX_FILE_BYTES) throw new ExtractionError('too-large', `file of ${bytes.byteLength} bytes`);
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await this.once(route, bytes, headers, request);
      } catch (error) {
        if (!(error instanceof TransientFailure)) throw error;
        const delay = this.retryDelaysMs[attempt];
        if (delay === undefined) throw new ExtractionError('tika-unavailable', error.message, { cause: error });
        await wait(delay, request.signal);
      }
    }
  }

  private async once(route: string, bytes: Uint8Array, headers: Record<string, string>, request: TikaRequest): Promise<string> {
    const deadline = AbortSignal.timeout(request.timeoutMs ?? this.timeoutMs);
    const signal = request.signal ? AbortSignal.any([request.signal, deadline]) : deadline;
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${route}`, { method: 'PUT', headers, body: bytes, signal });
    } catch (error) {
      if (signal.aborted) throw new ExtractionError('timeout', `Tika ${route} did not answer in time`, { cause: error });
      throw new TransientFailure(`Tika ${route} unreachable: ${safeErrorText(error)}`);
    }
    let body: string;
    try {
      body = await res.text();
    } catch (error) {
      if (signal.aborted) throw new ExtractionError('timeout', `Tika ${route} did not finish in time`, { cause: error });
      throw new TransientFailure(`Tika ${route} broke off: ${safeErrorText(error)}`);
    }
    if (res.ok) return body;
    if (TRANSIENT_STATUSES.has(res.status)) throw new TransientFailure(`Tika ${route} answered ${res.status}`);
    if (res.status === 415) throw new ExtractionError('unsupported-type', `Tika ${route} answered 415`);
    // 422: the parser failed on this file. Its body is a stack trace naming the exception (never logged).
    if (res.status === 422) {
      const encrypted = /EncryptedDocumentException|password/i.test(body);
      throw new ExtractionError(encrypted ? 'encrypted' : 'corrupt', `Tika ${route} answered 422`);
    }
    throw new ExtractionError('tika-unavailable', `Tika ${route} answered ${res.status}`);
  }
}
