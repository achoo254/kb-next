import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BACKUP_KEEP_DAYS } from './retention';

describe('retention', () => {
  it('keeps backups as long as the backup script does (the privacy page prints BACKUP_KEEP_DAYS)', () => {
    const script = readFileSync(new URL('../../../infra/backup-kb.sh', import.meta.url), 'utf8');
    const kept = [...script.matchAll(/-mtime \+(\d+) -delete/g)].map((match) => Number(match[1]));
    expect(kept).toHaveLength(2);
    for (const days of kept) expect(days).toBe(BACKUP_KEEP_DAYS);
  });
});
