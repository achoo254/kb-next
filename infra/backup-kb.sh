#!/bin/bash
# Daily backup of kb: a dump of the `kb` database and a copy of the uploaded files, kept for 14 days.
# Cron (root): 40 2 * * * /var/www/kb/infra/backup-kb.sh >> /var/log/kb-backup.log 2>&1
# Restore: docs/deployment-guide.md, "Sao lưu và khôi phục".
set -euo pipefail
umask 077
DEST=/var/backups/kb
STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$DEST"

# The database: peer auth as postgres, no password on the command line.
sudo -u postgres pg_dump --format=custom kb > "$DEST/kb-db-$STAMP.dump"

# The files: small and written once each (random names, never rewritten), so a full tar is enough.
tar -C /var/lib/kb -czf "$DEST/kb-files-$STAMP.tar.gz" files

find "$DEST" -name 'kb-db-*.dump' -mtime +14 -delete
find "$DEST" -name 'kb-files-*.tar.gz' -mtime +14 -delete
echo "$(date -Is) backup kb-$STAMP ok ($(du -sh "$DEST/kb-db-$STAMP.dump" | cut -f1) db, $(du -sh "$DEST/kb-files-$STAMP.tar.gz" | cut -f1) files)"
