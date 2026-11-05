/**
 * The Search screen's state shared by its two layouts (C12, phone M06): the search in the page's address, and the
 * Spaces the reader can see. Kept apart from search-data.ts, which the ⌘K palette also uses without the filters.
 */
import { useEffect, useMemo, useState } from 'react';
import { type SpaceListItem, fetchSpaces } from '../api/content-api';
import { type SearchState, useSearch } from './search-data';
import { type SearchAddress, addressOf, readAddress, searchParamsOf } from './search-filters';

export function useVisibleSpaces(): readonly SpaceListItem[] {
  const [spaces, setSpaces] = useState<readonly SpaceListItem[]>([]);
  useEffect(() => {
    let live = true;
    // Without the list the Space filter is empty; searching still works.
    fetchSpaces()
      .then((list) => live && setSpaces(list))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  return spaces;
}

/** The search in the page's address (?q=, mode, filters): the answer, and a way to change it that keeps the address in step. */
export function useSearchAddress(): { address: SearchAddress; update(next: Partial<SearchAddress>): void; state: SearchState; retry(): void } {
  const [address, setAddress] = useState<SearchAddress>(() => readAddress(window.location.search));
  const params = useMemo(() => searchParamsOf(address), [address]);
  const { state, retry } = useSearch(params);
  const update = (next: Partial<SearchAddress>): void => {
    const changed = { ...address, ...next };
    // A new query asks for the exact diacritics again.
    if (next.q !== undefined && next.q !== address.q) changed.variants = false;
    setAddress(changed);
    window.history.replaceState(window.history.state, '', addressOf(changed));
  };
  return { address, update, state, retry };
}

