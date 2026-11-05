/**
 * Text extraction of uploaded files (docs/text-extraction.md): the contract the upload API and C16 use.
 *
 * - `enqueueExtraction(fileId)` after the upload has written the file under FILES_DIR, its `files` row (with
 *   `documentId`) and the document's version pointing at that file. Calling it again re-runs the file (C16 "Thử lại").
 * - `extractionStatus(viewer, fileId)` for C16: null when there is no job, or the viewer is neither the file's owner
 *   nor an admin.
 */
import { mayFollowFile } from '../access/extraction';
import type { Viewer } from '../access/viewer';
import type { ServerConfig } from '../config';
import type { Db } from '../db/client';
import type { ExtractFixHint, ExtractStep, ExtractSuggestions, extractStatus } from '../db/schema';
import type { JevJudge } from '../jev/jev-client';
import type { IndexSync } from '../search/index-sync';
import { ExtractionQueue, MAX_ATTEMPTS } from './extraction-queue';
import { type ExtractJobRow, readJob } from './job-store';
import type { PdfWorkOptions } from './pdf-work';
import { TikaClient, type TikaExtractor } from './tika-client';

export { MAX_FILE_BYTES, routeFor } from './formats';
export { MAX_ATTEMPTS } from './extraction-queue';
export type { ExtractFixHint, ExtractStep, ExtractStepDetail, ExtractStepName, ExtractStepState, ExtractSuggestions, LowQualityPage } from '../db/schema';

/** What C16 shows of one file. */
export interface ExtractionStatus {
  fileId: string;
  /** `waiting`: a run failed for a passing reason and the next one is due at `nextAttemptAt`. */
  status: (typeof extractStatus.enumValues)[number];
  /** C16's six steps, in order. */
  steps: ExtractStep[];
  attempts: number;
  maxAttempts: number;
  /** The last failure: its code and what the reader can do (null when none). */
  error: { code: string; hint: ExtractFixHint | null } | null;
  /** Jev's suggestions, pending the owner's answer; null when none were made. */
  suggestions: ExtractSuggestions | null;
  nextAttemptAt: Date | null;
  updatedAt: Date;
  finishedAt: Date | null;
}

/** What C16 shows of a job row (also for the upload list, which reads the jobs with their files). */
export function toExtractionStatus(job: ExtractJobRow): ExtractionStatus {
  return {
    fileId: job.fileId,
    status: job.status,
    steps: job.steps,
    attempts: job.attempts,
    maxAttempts: MAX_ATTEMPTS,
    error: job.errorCode ? { code: job.errorCode, hint: job.errorHint } : null,
    suggestions: job.suggestions,
    nextAttemptAt: job.nextAttemptAt,
    updatedAt: job.updatedAt,
    finishedAt: job.finishedAt,
  };
}

export interface ExtractionService {
  enqueueExtraction(fileId: string): Promise<void>;
  /** Stops a file's processing (C16 "Huỷ"); `enqueueExtraction` runs it again. Resolves whether anything stopped. */
  cancelExtraction(fileId: string): Promise<boolean>;
  extractionStatus(viewer: Viewer, fileId: string): Promise<ExtractionStatus | null>;
  /** Resolves once no job is running or due (tests, shutdown). */
  idle(): Promise<void>;
  close(): void;
}

export interface ExtractionDeps {
  config: Pick<ServerConfig, 'tikaUrl' | 'filesDir'>;
  db: Db;
  jev: JevJudge | null;
  sync: Pick<IndexSync, 'enqueue'> | null;
  /** Tika (default: a client of config.tikaUrl); tests pass a fake. */
  tika?: TikaExtractor;
  queue?: ConstructorParameters<typeof ExtractionQueue>[1];
  /** Limits of the PDF worker thread (default PDF_WORKER_LIMITS); tests lower them. */
  pdfWorker?: PdfWorkOptions;
}

/** Starts the queue (resuming the jobs a stopped server left) and returns the contract. */
export async function startExtraction({ config, db, jev, sync, tika = new TikaClient(config.tikaUrl), queue: options, pdfWorker }: ExtractionDeps): Promise<ExtractionService> {
  const queue = new ExtractionQueue({ db, tika, jev, sync, filesDir: config.filesDir, pdfWorker }, options);
  await queue.start();
  return {
    async enqueueExtraction(fileId) {
      await queue.enqueue(fileId);
    },
    cancelExtraction: (fileId) => queue.cancel(fileId),
    async extractionStatus(viewer, fileId) {
      if (!(await mayFollowFile(db, viewer, fileId))) return null;
      const job = await readJob(db, fileId);
      return job ? toExtractionStatus(job) : null;
    },
    idle: () => queue.idle(),
    close: () => queue.close(),
  };
}
