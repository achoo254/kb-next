/**
 * The browser side of uploading (C03, and C16's drop zone): each file is checked as the server would (its kind by
 * name, at most 25 MB), then uploaded on its own, two at a time, with its progress; one file failing never stops
 * the others, and each can be retried, cancelled or removed alone.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ABORTED, type FileKind, type StoredFile, checkBeforeUpload, kindOfName } from '../api/files-api';
import { uploadFile } from '../api/upload-api';
import { ApiError, NETWORK_ERROR } from '../api/api-client';

export type UploadState = 'queued' | 'uploading' | 'done' | 'failed' | 'cancelled';

export interface UploadRow {
  key: string;
  name: string;
  size: number;
  kind: FileKind | null;
  state: UploadState;
  /** Bytes sent so far. */
  sent: number;
  /** Why it failed: an API error code (`too-large`, `unsupported-type`, `network`…). */
  error: string | null;
  /** Refused before sending (kind or size): retrying would not help. */
  refused: boolean;
  stored: StoredFile | null;
}

/** Uploads at once. */
export const PARALLEL_UPLOADS = 2;

export interface UploadTarget {
  space?: string;
  collection?: string;
}

export interface UploadQueue {
  rows: UploadRow[];
  add(files: readonly File[]): void;
  retry(key: string): void;
  cancel(key: string): void;
  remove(key: string): void;
  cancelAll(): void;
}

/** Percent of one row (100 once uploaded). */
export function rowPercent(row: UploadRow): number {
  if (row.state === 'done') return 100;
  return row.size > 0 ? Math.min(99, Math.floor((row.sent / row.size) * 100)) : 0;
}

/** The board's overall figure: the mean percent of the files uploading or uploaded. */
export function overallPercent(rows: readonly UploadRow[]): number {
  const active = rows.filter((row) => row.state === 'uploading' || row.state === 'queued' || row.state === 'done');
  if (active.length === 0) return 0;
  return Math.round(active.reduce((sum, row) => sum + rowPercent(row), 0) / active.length);
}

let counter = 0;

function errorCode(error: unknown): string {
  return error instanceof ApiError ? error.code : NETWORK_ERROR;
}

export function useUploadQueue(target: UploadTarget, onUploaded?: (file: StoredFile) => void): UploadQueue {
  const [rows, setRows] = useState<UploadRow[]>([]);
  const files = useRef(new Map<string, File>());
  const controllers = useRef(new Map<string, AbortController>());
  const targetRef = useRef(target);
  const uploadedRef = useRef(onUploaded);
  // The latest target and callback for uploads already under way (read when each one starts or ends).
  useEffect(() => {
    targetRef.current = target;
    uploadedRef.current = onUploaded;
  });

  const patch = useCallback((key: string, change: Partial<UploadRow>) => {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...change } : row)));
  }, []);

  const start = useCallback(
    (key: string) => {
      const file = files.current.get(key);
      if (!file) return;
      const controller = new AbortController();
      controllers.current.set(key, controller);
      patch(key, { state: 'uploading', sent: 0, error: null });
      uploadFile(file, file.name, {
        ...targetRef.current,
        signal: controller.signal,
        onProgress: (sent) => patch(key, { sent }),
      }).then(
        (stored) => {
          controllers.current.delete(key);
          patch(key, { state: 'done', sent: file.size, stored });
          uploadedRef.current?.(stored);
        },
        (error: unknown) => {
          controllers.current.delete(key);
          if (error instanceof ApiError && error.code === ABORTED) patch(key, { state: 'cancelled' });
          else patch(key, { state: 'failed', error: errorCode(error) });
        },
      );
    },
    [patch],
  );

  // The pump: whenever a slot is free, the oldest queued file starts.
  useEffect(() => {
    const uploading = rows.filter((row) => row.state === 'uploading').length;
    const next = rows.filter((row) => row.state === 'queued').slice(0, Math.max(0, PARALLEL_UPLOADS - uploading));
    for (const row of next) start(row.key);
  }, [rows, start]);

  // Leaving the screen cancels what is still sending.
  useEffect(() => {
    const live = controllers.current;
    return () => {
      for (const controller of live.values()) controller.abort();
    };
  }, []);

  const add = useCallback((picked: readonly File[]) => {
    const added: UploadRow[] = picked.map((file) => {
      counter += 1;
      const key = `upload-${counter}`;
      files.current.set(key, file);
      const refusal = checkBeforeUpload(file);
      return {
        key,
        name: file.name,
        size: file.size,
        kind: kindOfName(file.name),
        state: refusal ? 'failed' : 'queued',
        sent: 0,
        error: refusal,
        refused: refusal !== null,
        stored: null,
      };
    });
    if (added.length > 0) setRows((current) => [...current, ...added]);
  }, []);

  const retry = useCallback((key: string) => {
    const again = (row: UploadRow): boolean => row.key === key && !row.refused && (row.state === 'failed' || row.state === 'cancelled');
    setRows((current) => current.map((row) => (again(row) ? { ...row, state: 'queued', sent: 0, error: null } : row)));
  }, []);

  const cancel = useCallback((key: string) => {
    const controller = controllers.current.get(key);
    if (controller) controller.abort();
    else setRows((current) => current.map((row) => (row.key === key && row.state === 'queued' ? { ...row, state: 'cancelled' } : row)));
  }, []);

  const remove = useCallback((key: string) => {
    controllers.current.get(key)?.abort();
    files.current.delete(key);
    setRows((current) => current.filter((row) => row.key !== key));
  }, []);

  const cancelAll = useCallback(() => {
    for (const controller of controllers.current.values()) controller.abort();
    setRows((current) => current.map((row) => (row.state === 'queued' ? { ...row, state: 'cancelled' } : row)));
  }, []);

  return { rows, add, retry, cancel, remove, cancelAll };
}

