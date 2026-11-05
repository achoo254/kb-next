/**
 * Why an extraction failed, as C16 shows it: a stable `code`, the reader's `hint` (what to do about it), and whether
 * the queue should try again (`retryable`: Tika down or slow, an unexpected error) or give up at once (the file itself
 * is the problem: too large, locked, damaged, not a supported kind).
 */
import type { ExtractFixHint } from '../db/schema';

export type ExtractErrorCode =
  | 'too-large'
  | 'encrypted'
  | 'corrupt'
  | 'unsupported-type'
  | 'file-missing'
  | 'no-document'
  | 'tika-unavailable'
  | 'timeout'
  | 'internal'
  /** Stopped by its owner (C16 "Huỷ"); "Thử lại" runs it again. */
  | 'cancelled'
  /**
   * The file needs more memory than its reader may take (the PDF worker ran out), or the server stopped while reading
   * it MAX_ATTEMPTS times. Never retried on its own; only an admin may run it again (a user could loop it otherwise).
   */
  | 'too-complex';

const HINTS: Record<ExtractErrorCode, ExtractFixHint> = {
  'too-large': 'smaller-file',
  encrypted: 'remove-password',
  corrupt: 'resave-file',
  'unsupported-type': 'convert-format',
  'file-missing': 'upload-again',
  'no-document': 'upload-again',
  'tika-unavailable': 'retry-later',
  timeout: 'retry-later',
  internal: 'retry-later',
  cancelled: 'retry-later',
  'too-complex': 'smaller-file',
};

/** Codes only an admin may retry (C16 "Thử lại" is refused to the owner). */
export const ADMIN_RETRY_ONLY: ReadonlySet<string> = new Set<ExtractErrorCode>(['too-complex']);

const RETRYABLE: ReadonlySet<ExtractErrorCode> = new Set(['tika-unavailable', 'timeout', 'internal']);

export class ExtractionError extends Error {
  readonly hint: ExtractFixHint;
  readonly retryable: boolean;

  constructor(
    readonly code: ExtractErrorCode,
    message: string = code,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'ExtractionError';
    this.hint = HINTS[code];
    this.retryable = RETRYABLE.has(code);
  }
}

/** Any thrown value as an ExtractionError (unknown errors are `internal`, retried). */
export function asExtractionError(error: unknown): ExtractionError {
  if (error instanceof ExtractionError) return error;
  return new ExtractionError('internal', error instanceof Error ? `${error.name}: ${error.message}` : 'unknown error', { cause: error });
}
