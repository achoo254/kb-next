/**
 * The first data of a screen, asked for before the screen mounts: when a link to it is hovered, focused or touched,
 * and while a navigation waits for it (navigation.ts). Each loader calls the very API functions the screen calls on
 * mount, with the same arguments, so the screen's own requests find the answers waiting (api-client.ts
 * `prefetchGets`). Screens without a loader simply load as they mount.
 *
 * The screens are not code-split (one bundle), so there is no route chunk to fetch ahead.
 */
import { prefetchGets } from '../api/api-client';
import { fetchMyRecent, fetchFavorites, fetchMyDocuments, fetchTrash } from '../api/authoring-api';
import { fetchCanvases } from '../api/canvas-api';
import { type Lang, fetchDocument, fetchMe, fetchRecent, fetchSpace, fetchSpaces } from '../api/content-api';
import { fetchGraph } from '../api/graph-api';
import { fetchInbox } from '../api/notifications-api';
import { SPACE_PARAM } from '../pages/graph-screen';
import { matchRoute, routeParam } from '../routes';

type Loader = (param: string, url: URL, lang: Lang | undefined) => Promise<unknown>;

/** By board code; each mirrors what the screen asks first (see the screen named). */
const LOADERS: Readonly<Partial<Record<string, Loader>>> = {
  // universe-entry.tsx (the account) and universe-data.ts (the Spaces and the recent texts)
  C09: () => Promise.all([fetchMe(), fetchSpaces(), fetchRecent()]),
  // space-screen.tsx
  C10: (slug, _url, lang) => fetchSpace(slug, lang),
  // reader-screen.tsx
  C11: (id, _url, lang) => fetchDocument(id, lang),
  // graph-screen.tsx: the Space of the address, else the Space list to pick the first one from
  C13: (_param, url, lang) => {
    const space = url.searchParams.get(SPACE_PARAM);
    return space ? fetchGraph(space, lang) : fetchSpaces();
  },
  // mine-screen.tsx
  C08: () => Promise.all([fetchMyDocuments(), fetchMyRecent(), fetchFavorites(), fetchTrash(), fetchCanvases(), fetchSpaces()]),
  // inbox-screen.tsx
  C20: () => fetchInbox(),
};

/** The language the screens ask in: the page's, as the I18nProvider sets it on <html>. */
function pageLang(): Lang | undefined {
  const lang = typeof document === 'undefined' ? '' : document.documentElement.lang;
  return lang === 'vi' || lang === 'en' ? lang : undefined;
}

/**
 * Warms the cache with the first data of the screen at `url` (same origin). Resolves once the answers are in (errors
 * included: the screen asks again and shows its own error), true when the screen has a loader.
 */
export function prefetchRoute(url: URL): Promise<boolean> {
  const route = matchRoute(url.pathname);
  const loader = LOADERS[route.code];
  if (!loader) return Promise.resolve(false);
  const lang = pageLang();
  return prefetchGets(() => loader(routeParam(route, url.pathname), url, lang)).then(() => true);
}
