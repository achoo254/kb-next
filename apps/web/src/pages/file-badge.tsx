/** The coloured letter badge of a file's kind (C03, C16, H04): W, X, P, PDF, M, or the extension's first letter. */
import type { ReactNode } from 'react';
import type { FileKind } from '../api/files-api';
import './file-badge.css';

const LETTER: Record<FileKind, string> = { docx: 'W', xlsx: 'X', pptx: 'P', pdf: 'PDF', md: 'M' };

/** The letter of a file: its kind's, a note's N, else the first letter of its extension. */
export function badgeLetter(kind: FileKind | 'note' | null, name: string): string {
  if (kind === 'note') return 'N';
  if (kind) return LETTER[kind];
  const ext = /\.([A-Za-z])[A-Za-z]*$/.exec(name)?.[1];
  return ext ? ext.toUpperCase() : '?';
}

export function FileBadge({ kind, name, size = 38 }: { kind: FileKind | 'note' | null; name: string; size?: number }): ReactNode {
  return (
    <span className="file-badge" data-kind={kind ?? 'other'} style={{ width: size, height: size }} aria-hidden="true">
      {badgeLetter(kind, name)}
    </span>
  );
}
