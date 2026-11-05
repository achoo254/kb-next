import { useDevice } from '../layout/device';
import { type ReactNode, useEffect, useState } from 'react';
import { type Me, type SpaceListItem, fetchMe, fetchSpaces } from '../api/content-api';
import { useI18n } from '../i18n/i18n';
import { Toast } from '../ui/toast';
import { UniverseOpening } from './login-page';
import { Onboarding, interestSpaces } from './onboarding';
import './universe-entry.css';

/** `?tour=1` opens the first-visit dialog again (a replay from Settings, and the S03 parity shot). */
export const TOUR_PARAM = 'tour';

type AccountState = { status: 'loading' } | { status: 'ready'; onboarded: boolean; spaces: readonly SpaceListItem[] } | { status: 'failed' };

/** Whether the first-visit dialog shows: on request, or for an account that has not been through it. */
export function showOnboarding(account: Pick<AccountState, 'status'> & { onboarded?: boolean }, search: string): boolean {
  if (new URLSearchParams(search).get(TOUR_PARAM) === '1') return account.status !== 'loading';
  return account.status === 'ready' && account.onboarded === false;
}

function dropTourParam(): void {
  const url = new URL(window.location.href);
  if (!url.searchParams.has(TOUR_PARAM)) return;
  url.searchParams.delete(TOUR_PARAM);
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
}

interface UniverseEntryProps {
  /** The Universe screen (C09). */
  children?: ReactNode;
}

/** The account, and the Spaces to offer as interests when the first-visit dialog will show. */
async function loadAccount(search: string): Promise<{ me: Me; spaces: SpaceListItem[] }> {
  const me = await fetchMe();
  const needsSpaces = me.onboardedAt === null || new URLSearchParams(search).get(TOUR_PARAM) === '1';
  // Without the Space list the dialog still runs, only without its interests step.
  const spaces = needsSpaces ? await fetchSpaces().catch(() => []) : [];
  return { me, spaces };
}

/**
 * The way into /u: the Universe opening (S02 B) while the account loads, then the Universe with the first-visit
 * dialog (S03) over it when the account has not been onboarded. An account that cannot be read opens the Universe
 * without the dialog, so a missing profile never blocks reading.
 */
export function UniverseEntry({ children }: UniverseEntryProps): ReactNode {
  const { t, locale } = useI18n();
  const [account, setAccount] = useState<AccountState>({ status: 'loading' });
  const [closed, setClosed] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const device = useDevice();

  useEffect(() => {
    let live = true;
    loadAccount(window.location.search)
      .then(({ me, spaces }) => live && setAccount({ status: 'ready', onboarded: me.onboardedAt !== null, spaces }))
      .catch(() => live && setAccount({ status: 'failed' }));
    return () => {
      live = false;
    };
  }, []);

  if (account.status === 'loading') return <UniverseOpening stage="universe" />;
  // The tour points at the desktop's rail, panel and stage, which a phone does not have: it waits for a bigger screen.
  const open = device !== 'phone' && !closed && showOnboarding(account, window.location.search);
  return (
    <>
      {children}
      {open && (
        <Onboarding
          spaces={account.status === 'ready' ? interestSpaces(account.spaces, locale) : []}
          onDone={({ saved }) => {
            setClosed(true);
            setSaveFailed(!saved);
            dropTourParam();
          }}
        />
      )}
      {saveFailed && (
        <div className="universe-entry-toast">
          <Toast tone="warn" message={t('onboarding.saveFailed')} onClose={() => setSaveFailed(false)} dataId="onboarding-save-failed" />
        </div>
      )}
    </>
  );
}
