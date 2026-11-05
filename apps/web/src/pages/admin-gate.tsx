/**
 * The admin station opens for admins only (ADMIN_SUBS, as /api/me says); anyone else gets X02 403. The server refuses
 * the admin API to them all the same: this only spares them a screen that cannot load.
 */
import { type ReactNode, useEffect, useState } from 'react';
import { fetchMe } from '../api/content-api';
import { ScreenPage } from '../layout/screen-page';
import { useAdminText } from './admin-messages';
import { ErrorScreen } from './error-screen';

type Gate = 'checking' | 'admin' | 'forbidden' | 'failed';

export function AdminGate({ code, children }: { code: string; children: ReactNode }): ReactNode {
  const { t } = useAdminText();
  const [gate, setGate] = useState<Gate>('checking');
  useEffect(() => {
    let live = true;
    fetchMe().then(
      (me) => {
        if (live) setGate(me.isAdmin ? 'admin' : 'forbidden');
      },
      () => {
        if (live) setGate('failed');
      },
    );
    return () => {
      live = false;
    };
  }, []);
  if (gate === 'admin') return children;
  if (gate === 'forbidden') return <ErrorScreen kind="forbidden" code="X02" />;
  if (gate === 'failed') return <ErrorScreen kind="server" code="X02" />;
  return (
    <ScreenPage code={code}>
      <p className="screen-lead" role="status" data-id="admin-checking">
        {t('admin.loading')}
      </p>
    </ScreenPage>
  );
}
