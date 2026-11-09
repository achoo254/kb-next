/**
 * The kinds of file Knowledge Base takes (docx, xlsx, pptx, pdf, md; decided 04/11/2026) and how each is read: a PDF page
 * by page (text layer or OCR), an Office file through Tika, Markdown as it is.
 */

/** Largest file accepted (C03 upload, and what is ever sent to Tika). */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

export type FileRoute = 'pdf' | 'office' | 'markdown';

const ROUTES: Record<string, FileRoute> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'office',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'office',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'office',
  'text/markdown': 'markdown',
  'text/x-markdown': 'markdown',
  'text/x-web-markdown': 'markdown',
  'text/plain': 'markdown',
};

/** How a file of this MIME type (parameters such as `; charset=utf-8` ignored) is read; null when not taken. */
export function routeFor(mime: string): FileRoute | null {
  const base = mime.split(';')[0]?.trim().toLowerCase() ?? '';
  return ROUTES[base] ?? null;
}
