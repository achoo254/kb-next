/**
 * PDF work of one extraction job in its own worker thread (pdf-worker.ts) with a heap limit: measuring the pages
 * (pdf.js) and copying the pages to OCR (pdf-lib). A PDF that needs more memory ends the worker with
 * ERR_WORKER_OUT_OF_MEMORY, and the job fails as `too-complex` while the API keeps running. Only the bytes the
 * worker needs cross over: a copy for pdf.js (which consumes it) and one for pdf-lib's single parse.
 */
import { Worker } from 'node:worker_threads';
import { ExtractionError, type ExtractErrorCode } from './extraction-error';
import type { PdfPageReport } from './pdf-inspector';
import type { PdfReply, PdfRequest } from './pdf-worker';

/** The worker's limits: its JS heap (pdf.js and pdf-lib objects); decoded images are capped by MAX_IMAGE_PIXELS. */
export const PDF_WORKER_LIMITS = { maxOldGenerationSizeMb: 160, maxYoungGenerationSizeMb: 16, stackSizeMb: 4 } as const;

const CODES: ReadonlySet<string> = new Set<ExtractErrorCode>(['too-large', 'encrypted', 'corrupt', 'unsupported-type', 'file-missing', 'no-document', 'tika-unavailable', 'timeout', 'internal', 'cancelled', 'too-complex']);

function isCode(code: string): code is ExtractErrorCode {
  return CODES.has(code);
}

/**
 * The worker's file: the bundled `pdf-worker.mjs` beside the server's bundle in production, the TypeScript source
 * (loaded through tsx) in dev and tests.
 */
function workerFile(): { url: URL; execArgv: string[] } {
  const fromSource = import.meta.url.endsWith('.ts');
  return { url: new URL(fromSource ? './pdf-worker.ts' : './pdf-worker.mjs', import.meta.url), execArgv: fromSource ? ['--import', 'tsx'] : [] };
}

export interface PdfWorkOptions {
  limits?: { maxOldGenerationSizeMb: number; maxYoungGenerationSizeMb: number; stackSizeMb: number };
}

export class PdfWork {
  private worker: Worker | null = null;
  private failure: ExtractionError | null = null;
  private nextId = 1;
  private readonly waiting = new Map<number, { resolve(value: unknown): void; reject(error: ExtractionError): void }>();
  private parsed = false;

  constructor(
    private readonly signal: AbortSignal,
    private readonly options: PdfWorkOptions = {},
  ) {
    signal.addEventListener('abort', () => this.stop(new ExtractionError('timeout', 'job deadline passed')), { once: true });
  }

  /** Every page's text layer and image cover. */
  inspect(bytes: Uint8Array): Promise<PdfPageReport[]> {
    // pdf.js consumes what it is given: the worker gets its own copy, moved (not cloned again) across.
    const copy = bytes.slice();
    return this.send((id) => ({ id, op: 'inspect', bytes: copy }), [copy.buffer]) as Promise<PdfPageReport[]>;
  }

  /** The given pages as a new PDF; the first call hands the file over for pdf-lib's single parse. */
  async subset(bytes: Uint8Array, pages: readonly number[]): Promise<Uint8Array> {
    const copy = this.parsed ? null : bytes.slice();
    this.parsed = true;
    return (await this.send((id) => ({ id, op: 'subset', pages: [...pages], bytes: copy }), copy ? [copy.buffer] : [])) as Uint8Array;
  }

  /** Ends the worker (the job is done with its PDF). */
  close(): void {
    const worker = this.worker;
    this.worker = null;
    if (worker) void worker.terminate();
  }

  private start(): Worker {
    if (this.worker) return this.worker;
    const { url, execArgv } = workerFile();
    const worker = new Worker(url, { execArgv, resourceLimits: this.options.limits ?? PDF_WORKER_LIMITS });
    worker.on('message', (reply: PdfReply) => {
      const pending = this.waiting.get(reply.id);
      if (!pending) return;
      this.waiting.delete(reply.id);
      if (reply.ok) pending.resolve(reply.result);
      else pending.reject(new ExtractionError(isCode(reply.code) ? reply.code : 'internal', reply.message));
    });
    worker.on('error', (error: Error & { code?: string }) => {
      const failure =
        error.code === 'ERR_WORKER_OUT_OF_MEMORY'
          ? new ExtractionError('too-complex', 'the PDF needs more memory than its worker may use', { cause: error })
          : new ExtractionError('internal', `PDF worker failed: ${error.name}`, { cause: error });
      this.stop(failure);
    });
    worker.on('exit', (code) => {
      if (this.worker === worker) this.stop(new ExtractionError(code === 0 ? 'internal' : 'too-complex', `PDF worker exited (${code})`));
    });
    this.worker = worker;
    return worker;
  }

  private stop(failure: ExtractionError): void {
    this.failure ??= failure;
    for (const pending of this.waiting.values()) pending.reject(this.failure);
    this.waiting.clear();
    this.close();
  }

  private send(request: (id: number) => PdfRequest, transfer: ArrayBuffer[]): Promise<unknown> {
    if (this.failure) return Promise.reject(this.failure);
    if (this.signal.aborted) return Promise.reject(new ExtractionError('timeout', 'job deadline passed'));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.waiting.set(id, { resolve, reject });
      this.start().postMessage(request(id), transfer);
    });
  }
}
