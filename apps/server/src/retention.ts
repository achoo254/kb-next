/**
 * How long kb keeps what it keeps, in days. The server enforces these numbers and the web's privacy page
 * (apps/web/src/pages/legal-docs.ts) prints the very same constants, so the page cannot drift from the code.
 * Plain numbers only: the web bundle imports this file.
 */

/** A sign-in lasts at most this long, whatever happens. */
export const SESSION_ABSOLUTE_DAYS = 30;
/** A sign-in not used for this long ends. */
export const SESSION_IDLE_DAYS = 14;
/** A document in the trash is deleted for good after this long (C08 "tự xoá sau 30 ngày"). */
export const TRASH_DAYS = 30;
/** A share link's access history keeps an opening this long. */
export const SHARE_OPENINGS_KEEP_DAYS = 90;
/** The admin API's call log keeps a call this long. */
export const ADMIN_CALL_LOG_DAYS = 30;
/** Daily backups (database and uploaded files) are kept this long; enforced by infra/backup-kb.sh. */
export const BACKUP_KEEP_DAYS = 14;
