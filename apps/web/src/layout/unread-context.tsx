import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { fetchUnread } from '../api/notifications-api';

interface UnreadState {
  /** Unread notifications of the account (0 while unknown or signed out). */
  total: number;
  /** Asks the server again (after the inbox marks some read). */
  refresh(): void;
  /** Sets the count the inbox already knows, without a request. */
  set(total: number): void;
}

const UnreadContext = createContext<UnreadState>({ total: 0, refresh: () => undefined, set: () => undefined });

/**
 * The bell's count (TopActions' red dot), asked once per page for a signed-in account. A failed request leaves the
 * count at 0: the bell is a hint, never an error.
 */
export function UnreadProvider({ signedIn, children }: { signedIn: boolean; children?: ReactNode }): ReactNode {
  const [total, setTotal] = useState(0);
  const [asked, setAsked] = useState(0);
  useEffect(() => {
    if (!signedIn) return;
    let live = true;
    fetchUnread().then(
      (counts) => {
        if (live) setTotal(counts.total);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [signedIn, asked]);
  const refresh = useCallback(() => setAsked((n) => n + 1), []);
  const value = useMemo(() => ({ total: signedIn ? total : 0, refresh, set: setTotal }), [signedIn, total, refresh]);
  return <UnreadContext value={value}>{children}</UnreadContext>;
}

export function useUnread(): UnreadState {
  return useContext(UnreadContext);
}
