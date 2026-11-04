import { type ReactNode, createContext, useContext } from 'react';
import type { SessionState, SessionUser } from '../api/session-api';

const SessionContext = createContext<SessionState>({ status: 'loading' });

/** Shares the one session the app loads (App calls useSession once) with every screen below it. */
export function SessionProvider({ value, children }: { value: SessionState; children?: ReactNode }): ReactNode {
  return <SessionContext value={value}>{children}</SessionContext>;
}

export function useSessionState(): SessionState {
  return useContext(SessionContext);
}

/** The signed-in account, or null while loading or when signed out. */
export function signedInUser(session: SessionState): SessionUser | null {
  return session.status === 'ready' && session.signedIn ? (session.user ?? { name: null, email: null, picture: null }) : null;
}
