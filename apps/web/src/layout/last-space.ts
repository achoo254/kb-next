/**
 * The Space this browser opened last, for the lens rail's "Spaces" on screens that show no Space (the Universe,
 * Search…). Kept in localStorage; a browser that cannot keep it (private mode, blocked storage) just has none.
 */
export const LAST_SPACE_KEY = 'kb-last-space';

const SLUG = /^[A-Za-z0-9_-]+$/;

/** The slug of a Space page path (`/s/<slug>`), else null. */
export function spaceSlugOf(href: string): string | null {
  return /^\/s\/([A-Za-z0-9_-]+)$/.exec(href)?.[1] ?? null;
}

export function readLastSpace(): string | null {
  try {
    const slug = localStorage.getItem(LAST_SPACE_KEY);
    return slug && SLUG.test(slug) ? slug : null;
  } catch {
    return null;
  }
}

export function rememberSpace(slug: string): void {
  try {
    localStorage.setItem(LAST_SPACE_KEY, slug);
  } catch {
    // nothing to keep it in: "Spaces" falls back to the first Space
  }
}
