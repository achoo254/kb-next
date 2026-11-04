/** Where search leads beyond its results, for C12 and the ⌘K palette. */
import { SHELL_PATHS } from '../layout/shell-paths';

/** C12 with a query. */
export function searchHref(query: string): string {
  return query.trim() ? `${SHELL_PATHS.search}?${new URLSearchParams({ q: query.trim() }).toString()}` : SHELL_PATHS.search;
}
