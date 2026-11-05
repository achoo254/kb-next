/**
 * The account this browser's offline drafts belong to: GET /api/session `user.id`, asked once per page. The last
 * account seen is remembered (localStorage), so its own drafts still show and open offline, when the session cannot
 * be asked; signed out (the server says so), there is none and nothing is shown or sent.
 */
import { ApiError, NETWORK_ERROR } from '../api/api-client';
import { REMEMBERED_ACCOUNT_KEY as REMEMBERED, fetchSession } from '../api/session-api';
let asking: Promise<string | null> | null = null;

function remembered(): string | null {
  try {
    return localStorage.getItem(REMEMBERED);
  } catch {
    return null;
  }
}

function remember(id: string | null): void {
  try {
    if (id) localStorage.setItem(REMEMBERED, id);
    else localStorage.removeItem(REMEMBERED);
  } catch {
    // Storage blocked: offline, nothing is shown then.
  }
}

async function ask(): Promise<string | null> {
  try {
    const session = await fetchSession();
    const id = session.signedIn ? (session.user?.id ?? null) : null;
    remember(id);
    return id;
  } catch (error) {
    // No connection: the account last seen here. Any other failure: nobody, to be safe.
    return error instanceof ApiError && error.code === NETWORK_ERROR ? remembered() : null;
  }
}

export function currentAccountId(): Promise<string | null> {
  asking ??= ask();
  // "Nobody" is asked again next time: the reader may sign in (or come back online) meanwhile.
  void asking.then((id) => {
    if (id === null) asking = null;
  });
  return asking;
}

/** Forgets the account (the server answered 401: the session ended). */
export function forgetAccount(): void {
  asking = null;
  remember(null);
}
