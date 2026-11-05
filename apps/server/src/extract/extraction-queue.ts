/**
 * The in-process extraction queue: one file at a time (the host's RAM is tight, and Tika is shared with other apps),
 * at most MAX_ATTEMPTS runs per file, each within a deadline. A run that fails for a passing reason (Tika down or
 * slow, the deadline, an unexpected error) waits RETRY_DELAYS_MS and runs again; a file that is itself the problem
 * (too large, locked, damaged) fails at once. The queue is the `extract_jobs` table: at start, jobs a stopped server
 * left running are queued again and every due job is picked up.
 */
import { isUuid } from '../access/ids';
import type { ExtractStep } from '../db/schema';
import { safeErrorText } from '../log-error';
import { ExtractionError, asExtractionError } from './extraction-error';
import { cancelWaitingJob, claimNextJob, failJob, finishJob, nextRetryAt, queueJob, requeueInterrupted, saveSteps, saveSuggestions } from './job-store';
import { type PipelineDeps, StepTracker, runExtraction } from './pipeline';

export const MAX_ATTEMPTS = 3;
/** Wait before the second and the third run. */
export const RETRY_DELAYS_MS = [30_000, 120_000];
/** A run's deadline: a 25 MB scan of many pages takes Tika's Tesseract minutes. */
export const JOB_TIMEOUT_MS = 15 * 60 * 1000;

export interface ExtractionQueueOptions {
  retryDelaysMs?: readonly number[];
  jobTimeoutMs?: number;
  now?: () => Date;
}

export class ExtractionQueue {
  private running: Promise<void> | null = null;
  private again = false;
  private closed = false;
  private wakeTimer: NodeJS.Timeout | null = null;
  /** The job running now, to stop it on its owner's "Huỷ". */
  private current: { fileId: string; controller: AbortController; cancelled: boolean; again: boolean } | null = null;
  private readonly retryDelaysMs: readonly number[];
  private readonly jobTimeoutMs: number;
  private readonly now: () => Date;

  constructor(
    private readonly deps: PipelineDeps,
    options: ExtractionQueueOptions = {},
  ) {
    this.retryDelaysMs = options.retryDelaysMs ?? RETRY_DELAYS_MS;
    this.jobTimeoutMs = options.jobTimeoutMs ?? JOB_TIMEOUT_MS;
    this.now = options.now ?? (() => new Date());
  }

  /** Requeues what a stopped server left running, then works through every due job. */
  async start(): Promise<void> {
    const { requeued, failed } = await requeueInterrupted(this.deps.db, this.now(), MAX_ATTEMPTS);
    if (requeued > 0) console.log(`extract: resumed ${requeued} interrupted job(s)`);
    if (failed > 0) console.error(`extract: ${failed} job(s) stopped the server ${MAX_ATTEMPTS} times: failed (too-complex)`);
    this.kick();
  }

  /** Queues a file (again: a fresh count of attempts) and starts the queue; a job already running is left alone. */
  async enqueue(fileId: string): Promise<void> {
    // An unknown id rejects too (the job's foreign key): the upload calls this right after writing the file's row.
    if (!isUuid(fileId)) throw new Error('extract: not a file id');
    // "Thử lại" right after "Huỷ", while the cancelled run is still winding down: queued once it has.
    if (this.current?.fileId === fileId && this.current.cancelled) {
      this.current.again = true;
      return;
    }
    await queueJob(this.deps.db, fileId, this.now());
    this.kick();
  }

  /**
   * Stops a file's processing (C16 "Huỷ"): a waiting job is marked `cancelled` at once, a running one at its next
   * step (or when Tika answers). Resolves whether anything was stopped.
   */
  async cancel(fileId: string): Promise<boolean> {
    if (this.current?.fileId === fileId) {
      this.current.cancelled = true;
      this.current.controller.abort();
      return true;
    }
    return cancelWaitingJob(this.deps.db, fileId, this.now());
  }

  /** Resolves once no job is running or due (a job waiting for its retry time does not count). */
  async idle(): Promise<void> {
    while (this.running) await this.running;
  }

  close(): void {
    this.closed = true;
    if (this.wakeTimer) clearTimeout(this.wakeTimer);
    this.wakeTimer = null;
  }

  private kick(): void {
    if (this.closed) return;
    if (this.running) {
      this.again = true;
      return;
    }
    this.running = this.drain().finally(() => {
      this.running = null;
      if (this.again) {
        this.again = false;
        this.kick();
      }
    });
  }

  private async drain(): Promise<void> {
    try {
      for (;;) {
        if (this.closed) return;
        const job = await claimNextJob(this.deps.db, this.now());
        if (!job) break;
        await this.runJob(job.fileId, job.attempts);
      }
      await this.scheduleWake();
    } catch (error) {
      // The database failing under the queue: try again later rather than spin.
      console.error('extract: queue failed', safeErrorText(error));
      this.wakeAt(new Date(this.now().getTime() + (this.retryDelaysMs[0] ?? 30_000)));
    }
  }

  private async scheduleWake(): Promise<void> {
    const at = await nextRetryAt(this.deps.db);
    if (at) this.wakeAt(at);
  }

  private wakeAt(at: Date): void {
    if (this.closed) return;
    if (this.wakeTimer) clearTimeout(this.wakeTimer);
    this.wakeTimer = setTimeout(
      () => {
        this.wakeTimer = null;
        this.kick();
      },
      Math.max(0, at.getTime() - this.now().getTime()),
    );
    // Never keeps the process alive on its own.
    this.wakeTimer.unref();
  }

  private async runJob(fileId: string, attempt: number): Promise<void> {
    const { db } = this.deps;
    const controller = new AbortController();
    const expired = new Promise<never>((_resolve, reject) => {
      controller.signal.addEventListener('abort', () => reject(new ExtractionError('timeout', 'job deadline passed')), { once: true });
    });
    // Unhandled until the race below observes it; a run that finishes first never rejects it.
    expired.catch(() => undefined);
    const deadline = setTimeout(() => controller.abort(), this.jobTimeoutMs);
    const current = { fileId, controller, cancelled: false, again: false };
    this.current = current;
    const tracker = new StepTracker(async (steps: readonly ExtractStep[]) => {
      // A run past its deadline stops at its next step instead of writing over the failure.
      if (controller.signal.aborted) throw new ExtractionError('timeout', 'job deadline passed');
      await saveSteps(db, fileId, steps, this.now());
    });
    const run = runExtraction(this.deps, fileId, {
      tracker,
      signal: controller.signal,
      saveSuggestions: async (suggestions) => {
        // A run cancelled or past its deadline writes nothing more onto its job.
        if (controller.signal.aborted) throw new ExtractionError('timeout', 'job deadline passed');
        await saveSuggestions(db, fileId, suggestions, this.now());
      },
    });
    try {
      // The deadline wins even over a step that does not watch the signal.
      await Promise.race([run, expired]);
      await finishJob(db, fileId, tracker.steps, this.now());
    } catch (raw) {
      run.catch(() => undefined);
      const error = current.cancelled ? new ExtractionError('cancelled', 'stopped by its owner') : controller.signal.aborted ? new ExtractionError('timeout', 'job deadline passed') : asExtractionError(raw);
      const delay = error.retryable && attempt < MAX_ATTEMPTS ? (this.retryDelaysMs[attempt - 1] ?? this.retryDelaysMs.at(-1) ?? 0) : null;
      const retryAt = delay === null ? null : new Date(this.now().getTime() + delay);
      await failJob(db, fileId, tracker.failRunning(), { code: error.code, hint: error.hint }, retryAt, this.now());
      // The file id and the error code only: never the file's name or text.
      console.error(`extract: file ${fileId} ${retryAt ? 'will retry' : 'failed'} (${error.code}, attempt ${attempt}/${MAX_ATTEMPTS}): ${error.message}`);
      if (current.cancelled && current.again) await queueJob(db, fileId, this.now());
    } finally {
      clearTimeout(deadline);
      controller.abort();
      if (this.current === current) this.current = null;
    }
  }
}
