/** Counts behind C19 "Tích hợp": the stored files, read for an admin. */
import { count, sum } from 'drizzle-orm';
import type { Db } from '../db/client';
import { files } from '../db/schema';
import type { AdminViewer } from './review';

export interface FilesSummary {
  files: number;
  bytes: number;
}

export async function filesSummary(db: Db, _admin: AdminViewer): Promise<FilesSummary> {
  const [row] = await db.select({ n: count(), bytes: sum(files.size) }).from(files);
  return { files: row?.n ?? 0, bytes: Number(row?.bytes ?? 0) };
}
