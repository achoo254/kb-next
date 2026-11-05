/**
 * One run of an uploaded file through C16's steps: upload (the bytes on disk), OCR (PDF only: Inspector, Decision
 * Engine, Tika's Tesseract on the pages that need it, Quality Validator), structure (Tika's XHTML, or the Markdown as
 * it is), chunk (Document Normalizer), classify (Jev's suggestions) and index (the document's chunks, then search
 * sync). Each step's state is saved as it changes, so C16 follows along. Throws an ExtractionError; the queue
 * decides about retries.
 */
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { type ExtractionTarget, collectionOptions, extractionTarget, writeExtractedChunks } from '../access/extraction';
import type { Db } from '../db/client';
import type { ExtractStep, ExtractStepDetail, ExtractStepName, ExtractStepState, ExtractSuggestions, LowQualityPage } from '../db/schema';
import type { JevJudge } from '../jev/jev-client';
import { safeErrorText } from '../log-error';
import type { IndexSync } from '../search/index-sync';
import { candidateTags, classify } from './classifier';
import { type ExtractedPart, normalize, ocrPageText, tikaMarkdown, tikaPages } from './document-normalizer';
import { ExtractionError } from './extraction-error';
import { type FileRoute, MAX_FILE_BYTES, routeFor } from './formats';
import { type PageDecision, decidePages } from './ocr-decision';
import { inspectPdf } from './pdf-inspector';
import { pdfWithPages } from './pdf-subset';
import { assessOcrPages } from './quality-validator';
import { initialSteps } from './job-store';
import type { TikaExtractor } from './tika-client';

/** Pages per OCR request to Tika: each stays well inside its deadline and Tika's heap. */
export const OCR_PAGES_PER_REQUEST = 4;
const OCR_REQUEST_BASE_MS = 60_000;
const OCR_REQUEST_PER_PAGE_MS = 60_000;
/** Storage keys are random names made by the upload; anything else never reaches the file system. */
const STORAGE_KEY = /^[A-Za-z0-9_-]{8,128}$/;

export interface PipelineDeps {
  db: Db;
  tika: TikaExtractor;
  jev: JevJudge | null;
  sync: Pick<IndexSync, 'enqueue'> | null;
  filesDir: string;
}

/** One run's links to its job: where its steps and suggestions are saved, and its deadline. */
export interface PipelineRun {
  tracker: StepTracker;
  saveSuggestions(suggestions: ExtractSuggestions): Promise<void>;
  signal: AbortSignal;
}

/** The steps of a run, saved on every change. */
export class StepTracker {
  readonly steps: ExtractStep[] = initialSteps();

  /** `save` rejects (stopping the run) once the job's deadline has passed. */
  constructor(private readonly save: (steps: readonly ExtractStep[]) => Promise<void>) {}

  async set(step: ExtractStepName, state: ExtractStepState, detail?: ExtractStepDetail): Promise<void> {
    const index = this.steps.findIndex((s) => s.step === step);
    this.steps[index] = detail ? { step, state, detail } : { step, state };
    await this.save(this.steps);
  }

  /** The step that was running when the run stopped, marked failed. */
  failRunning(): ExtractStep[] {
    return this.steps.map((s) => (s.state === 'running' ? { ...s, state: 'failed' } : s));
  }
}

async function readStoredFile(filesDir: string, target: ExtractionTarget): Promise<Uint8Array> {
  if (!STORAGE_KEY.test(target.storageKey)) throw new ExtractionError('file-missing', 'storage key is not a stored name');
  if (target.size > MAX_FILE_BYTES) throw new ExtractionError('too-large', `file of ${target.size} bytes`);
  const file = path.join(filesDir, target.storageKey);
  try {
    // The size on disk, not the row's: the cap holds whatever was written.
    if ((await stat(file)).size > MAX_FILE_BYTES) throw new ExtractionError('too-large', 'file on disk over the cap');
    return new Uint8Array(await readFile(file));
  } catch (error) {
    if (error instanceof ExtractionError) throw error;
    const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : null;
    if (code === 'ENOENT') throw new ExtractionError('file-missing', 'stored file not found');
    throw new ExtractionError('internal', `stored file unreadable: ${safeErrorText(error)}`, { cause: error });
  }
}

async function routeOf(tika: TikaExtractor, target: ExtractionTarget, bytes: Uint8Array, signal: AbortSignal): Promise<FileRoute> {
  const route = routeFor(target.mime) ?? routeFor(await tika.detect(bytes, { signal }));
  if (!route) throw new ExtractionError('unsupported-type', 'not docx, xlsx, pptx, pdf or md');
  return route;
}

function markdownOf(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch (error) {
    throw new ExtractionError('corrupt', 'Markdown is not UTF-8 text', { cause: error });
  }
}

interface OcrOutcome {
  /** Usable OCR text by page (low-quality pages left out). */
  texts: Map<number, string>;
  detail: ExtractStepDetail;
}

/** OCR of the pages that need it, in batches, then their quality. */
async function ocrPages(deps: PipelineDeps, bytes: Uint8Array, decisions: readonly PageDecision[], signal: AbortSignal): Promise<OcrOutcome> {
  const wanted = decisions.filter((d) => d.source === 'ocr').map((d) => d.page);
  const read: Array<{ page: number; text: string; confidence: number | null }> = [];
  for (let start = 0; start < wanted.length; start += OCR_PAGES_PER_REQUEST) {
    const batch = wanted.slice(start, start + OCR_PAGES_PER_REQUEST);
    const subset = await pdfWithPages(bytes, batch);
    const html = await deps.tika.html(subset, 'application/pdf', { ocr: true, signal, timeoutMs: OCR_REQUEST_BASE_MS + OCR_REQUEST_PER_PAGE_MS * batch.length });
    const pages = tikaPages(html);
    // One page in the batch and no page markup: the whole answer is that page.
    const htmlOf = (i: number): string => pages[i] ?? (batch.length === 1 && pages.length === 0 ? html : '');
    batch.forEach((page, i) => read.push({ page, ...ocrPageText(htmlOf(i)) }));
  }
  const quality = await assessOcrPages(deps.jev, read);
  const garbageLayer = new Set(decisions.filter((d) => d.garbageTextLayer).map((d) => d.page));
  const lowQualityPages: LowQualityPage[] = quality
    .filter((q) => q.low)
    .map((q) => ({ page: q.page, score: q.score, hint: garbageLayer.has(q.page) ? 'export-text-pdf' : 'rescan' }));
  const low = new Set(lowQualityPages.map((p) => p.page));
  const texts = new Map(read.filter((r) => !low.has(r.page)).map((r) => [r.page, r.text]));
  const mean = quality.length > 0 ? Math.round((quality.reduce((sum, q) => sum + q.score, 0) / quality.length) * 100) / 100 : null;
  return { texts, detail: { pages: decisions.length, ocrPages: wanted, quality: mean, lowQualityPages } };
}

/** The text of each text-layer page: Tika's (with its structure) when its pages line up with the PDF's, else pdf.js's. */
async function textPages(deps: PipelineDeps, bytes: Uint8Array, pageCount: number, fallback: ReadonlyMap<number, string>, signal: AbortSignal): Promise<Map<number, string>> {
  const html = await deps.tika.html(bytes, 'application/pdf', { signal });
  const pages = tikaPages(html);
  if (pages.length !== pageCount) return new Map(fallback);
  return new Map([...fallback.keys()].map((page) => [page, tikaMarkdown(pages[page - 1] ?? '')]));
}

/** Runs every step of the file's extraction; resolves when the file is indexed (or its steps say why not). */
export async function runExtraction(deps: PipelineDeps, fileId: string, run: PipelineRun): Promise<void> {
  const { tracker, signal } = run;
  // The upload step checks what was uploaded: the file, its document, its size and its kind.
  await tracker.set('upload', 'running');
  const target = await extractionTarget(deps.db, fileId);
  if (!target) throw new ExtractionError('file-missing', 'no such file');
  if (!target.document || target.document.inTrash) throw new ExtractionError('no-document', 'the file belongs to no live document');
  const document = target.document;
  const bytes = await readStoredFile(deps.filesDir, target);
  const route = await routeOf(deps.tika, target, bytes, signal);
  await tracker.set('upload', 'done');

  let parts: ExtractedPart[];
  if (route === 'pdf') {
    await tracker.set('ocr', 'running');
    const reports = await inspectPdf(bytes, signal);
    const decisions = await decidePages(deps.jev, reports);
    const needsOcr = decisions.some((d) => d.source === 'ocr');
    const ocr = needsOcr ? await ocrPages(deps, bytes, decisions, signal) : null;
    if (ocr) await tracker.set('ocr', 'done', ocr.detail);
    else await tracker.set('ocr', 'skipped', { pages: reports.length, ocrPages: [], quality: null, lowQualityPages: [], reason: 'no-scanned-pages' });

    await tracker.set('structure', 'running');
    const layer = new Map(reports.filter((r) => decisions[r.page - 1]?.source === 'text').map((r) => [r.page, r.text]));
    const texts = layer.size > 0 ? await textPages(deps, bytes, reports.length, layer, signal) : new Map<number, string>();
    parts = decisions.flatMap((d): ExtractedPart[] => {
      const text = d.source === 'text' ? texts.get(d.page) : d.source === 'ocr' ? ocr?.texts.get(d.page) : undefined;
      return text ? [{ page: d.page, markdown: text }] : [];
    });
    await tracker.set('structure', 'done', { format: 'pdf' });
  } else {
    await tracker.set('ocr', 'skipped', { reason: 'not-scanned' });
    await tracker.set('structure', 'running');
    const markdown = route === 'markdown' ? markdownOf(bytes) : tikaMarkdown(await deps.tika.html(bytes, target.mime, { signal }));
    parts = [{ page: null, markdown }];
    await tracker.set('structure', 'done', { format: route });
  }

  await tracker.set('chunk', 'running');
  const normalized = normalize(parts, document.lang);
  await tracker.set('chunk', 'done', { chunks: normalized.chunks.length });

  if (!deps.jev) {
    await tracker.set('classify', 'skipped', { reason: 'jev-off' });
  } else {
    await tracker.set('classify', 'running');
    try {
      const options = await collectionOptions(deps.db, target.ownerId);
      const text = normalized.chunks.map((c) => c.text).join('\n\n');
      const suggestions = await classify(deps.jev, document.title, text, options, candidateTags(text));
      await run.saveSuggestions(suggestions);
      await tracker.set('classify', 'done');
    } catch (error) {
      if (signal.aborted) throw new ExtractionError('timeout', 'job deadline passed');
      // Suggestions are a help, not a gate: the file is indexed all the same.
      console.error('extract: Jev classification failed', safeErrorText(error));
      await tracker.set('classify', 'skipped', { reason: 'jev-failed' });
    }
  }

  await tracker.set('index', 'running');
  const written = await writeExtractedChunks(deps.db, document.id, fileId, normalized.chunks);
  if (written === 'written') {
    deps.sync?.enqueue([document.id]);
    await tracker.set('index', 'done', deps.sync ? { chunks: normalized.chunks.length } : { chunks: normalized.chunks.length, reason: 'search-off' });
  } else {
    await tracker.set('index', 'skipped', { reason: written === 'superseded' ? 'superseded' : 'document-gone' });
  }
}
