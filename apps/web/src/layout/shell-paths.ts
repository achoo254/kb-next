/** Where the routes of the shell lead (app routes, routes.ts); its own module so the ⌘K palette can use it too. */
export const SHELL_PATHS = {
  universe: '/u',
  graph: '/graph',
  canvas: '/canvas',
  search: '/search',
  copilot: '/copilot',
  mine: '/me',
  /** The create ring (C01), the lens rail's "+". */
  create: '/create',
  /** A new note in the editor (C02). */
  newNote: '/new',
  settings: '/settings',
  /** Own AI keys (F03). */
  keys: '/settings/keys',
  inbox: '/inbox',
  /** Uploading Office files (C03), the Import Center (C16), the offline sync queue (H04). */
  upload: '/upload',
  imports: '/import',
  sync: '/sync',
  /** The admin station: the review queue (A01), published texts (A02), the API and its tokens (A03). */
  adminReview: '/admin',
  adminContent: '/admin/content',
  adminApi: '/admin/api',
} as const;

/** Sending a text for review (C06). */
export function submitPath(documentId: string): string {
  return `/d/${encodeURIComponent(documentId)}/submit`;
}

/** Publishing a text: who sees it, where it goes, its tags (C04). */
export function publishPath(documentId: string): string {
  return `/d/${encodeURIComponent(documentId)}/publish`;
}

/** Previewing a text as a guest or as its author, on each device (C05). */
export function previewPath(documentId: string): string {
  return `/d/${encodeURIComponent(documentId)}/preview`;
}

/** A journey's run (Flow). */
export function journeyPath(journeyId: string): string {
  return `/journey/${encodeURIComponent(journeyId)}`;
}

/** A journey's builder (C07). */
export function journeyEditPath(journeyId: string): string {
  return `${journeyPath(journeyId)}/edit`;
}

/** A text's share link and who has access (C18). */
export function sharePagePath(documentId: string): string {
  return `/d/${encodeURIComponent(documentId)}/share`;
}
