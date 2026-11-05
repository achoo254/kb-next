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
} as const;
