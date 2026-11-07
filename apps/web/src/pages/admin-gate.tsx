/**
 * The admin station (A02, A03, C19) opens for admins only, as /api/me says; anyone else gets X02 403. The server
 * refuses those calls to them all the same: this only spares them a screen that cannot load.
 */
import { type ReactNode, useEffect, useState } from 'react';
import { fetchMe } from '../api/content-api';
import { ScreenPage } from '../layout/screen-page';
import { useAdminText } from './admin-messages';
import { ErrorScreen } from './error-screen';

type Gate = { kind: 'checking' } | { kind: 'open' } | { kind: 'forbidden' } | { kind: 'failed' };

export function AdminGate({ code, children }: { code: string; children: ReactNode }): ReactNode {
  const { t } = useAdminText();
  const [gate, setGate] = useState<Gate>({ kind: 'checking' });
  useEffect(() => {
    let live = true;
    fetchMe().then(
      (me) => {
        if (!live) return;
        setGate(me.isAdmin ? { kind: 'open' } : { kind: 'forbidden' });
      },
      () => {
        if (live) setGate({ kind: 'failed' });
      },
    );
    return () => {
      live = false;
    };
  }, []);
  if (gate.kind === 'open') return children;
  if (gate.kind === 'forbidden') return <ErrorScreen kind="forbidden" code="X02" />;
  if (gate.kind === 'failed') return <ErrorScreen kind="server" code="X02" />;
  return (
    <ScreenPage code={code}>
      <p className="screen-lead" role="status" data-id="admin-checking">
        {t('admin.loading')}
      </p>
    </ScreenPage>
  );
}
