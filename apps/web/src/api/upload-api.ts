/**
 * Uploading one file with its progress (C03, C16's drop zone): XMLHttpRequest, as fetch reports no progress for a
 * body it sends. Kept apart from files-api.ts, whose calls also run where there is no XMLHttpRequest (server tests).
 */
import * as z from 'zod/mini';
import { ApiError, BAD_RESPONSE, NETWORK_ERROR } from './api-client';
import { ABORTED, type StoredFile, StoredFileSchema, codeOf, parseJson } from './files-api';

export interface UploadOptions {
  /** A Space slug and one of its Collections (default: the personal Space). */
  space?: string;
  collection?: string;
  onProgress?(sent: number, total: number): void;
  signal?: AbortSignal;
}

/**
 * Uploads one file (multipart, field `file`). Rejects with ApiError (`aborted` when `signal` cancels it, `network`
 * when the connection drops, the API's code otherwise).
 */
export function uploadFile(file: Blob, name: string, options: UploadOptions = {}): Promise<StoredFile> {
  const query = new URLSearchParams();
  if (options.space) query.set('space', options.space);
  if (options.collection) query.set('collection', options.collection);
  const path = `/api/files${query.size > 0 ? `?${query.toString()}` : ''}`;
  return new Promise<StoredFile>((resolve, reject) => {
    if (options.signal?.aborted) {
      reject(new ApiError(0, ABORTED));
      return;
    }
    const xhr = new XMLHttpRequest();
    xhr.open('POST', path);
    xhr.withCredentials = true;
    xhr.upload.onprogress = (event) => options.onProgress?.(event.loaded, event.lengthComputable ? event.total : file.size);
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new ApiError(xhr.status, codeOf(xhr.responseText, xhr.status)));
        return;
      }
      const parsed = z.object({ file: StoredFileSchema }).safeParse(parseJson(xhr.responseText));
      if (parsed.success) resolve(parsed.data.file);
      else reject(new ApiError(xhr.status, BAD_RESPONSE));
    };
    xhr.onerror = () => reject(new ApiError(0, NETWORK_ERROR));
    xhr.onabort = () => reject(new ApiError(0, ABORTED));
    options.signal?.addEventListener('abort', () => xhr.abort(), { once: true });
    const form = new FormData();
    form.append('file', file, name);
    xhr.send(form);
  });
}
