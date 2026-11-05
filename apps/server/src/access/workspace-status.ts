/** Counts behind C19 "Tích hợp": the Học Cloud import and the stored files, read for an admin. */
import { and, count, eq, isNotNull, isNull, max, sum } from 'drizzle-orm';
import type { Db } from '../db/client';
import { documents, files } from '../db/schema';
import type { AdminViewer } from './review';

export interface ImportSummary {
  /** Live official texts copied from Học Cloud (they carry its source URL). */
  documents: number;
  /** When the latest of them changed; null before any import. */
  lastImportAt: Date | null;
}

export async function importSummary(db: Db, _admin: AdminViewer): Promise<ImportSummary> {
  const [row] = await db
    .select({ n: count(), last: max(documents.updatedAt) })
    .from(documents)
    .where(and(eq(documents.origin, 'official'), isNotNull(documents.sourceUrl), isNull(documents.deletedAt)));
  return { documents: row?.n ?? 0, lastImportAt: row?.last ? new Date(row.last) : null };
}

export interface FilesSummary {
  files: number;
  bytes: number;
}

export async function filesSummary(db: Db, _admin: AdminViewer): Promise<FilesSummary> {
  const [row] = await db.select({ n: count(), bytes: sum(files.size) }).from(files);
  return { files: row?.n ?? 0, bytes: Number(row?.bytes ?? 0) };
}
