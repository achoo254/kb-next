/** Where the routes of the shell lead (app routes, routes.ts); its own module so the ⌘K palette can use it too. */
export const SHELL_PATHS = {
  universe: '/u',
  graph: '/graph',
  canvas: '/canvas',
  search: '/search',
  copilot: '/copilot',
  mine: '/me',
  settings: '/settings',
  inbox: '/inbox',
} as const;
