/**
 * The admin station opens for staff only, as /api/me says: the review queue (A01) for reviewers and admins, every
 * other screen (A02, A03, C19) for admins; anyone else gets X02 403. The server refuses those calls to them all the
 * same: this only spares them a screen that cannot load. The rail follows the role (a reviewer sees the queue only).
 */
import { type ReactNode, useEffect, useState } from 'react';
import { fetchMe } from '../api/content-api';
import { ScreenPage } from '../layout/screen-page';
import { type StaffRole, StaffRoleProvider } from '../layout/staff-role';
import { useAdminText } from './admin-messages';
import { ErrorScreen } from './error-screen';

type Gate = { kind: 'checking' } | { kind: 'open'; role: StaffRole } | { kind: 'forbidden' } | { kind: 'failed' };

/** `review`: the review queue (reviewers too); `admin`: admins only. */
export type GateNeed = 'admin' | 'review';

export function AdminGate({ code, need = 'admin', children }: { code: string; need?: GateNeed; children: ReactNode }): ReactNode {
  const { t } = useAdminText();
  const [gate, setGate] = useState<Gate>({ kind: 'checking' });
  useEffect(() => {
    let live = true;
    fetchMe().then(
      (me) => {
        if (!live) return;
        const allowed = need === 'admin' ? me.isAdmin : me.canReview;
        setGate(allowed ? { kind: 'open', role: me.isAdmin ? 'admin' : 'reviewer' } : { kind: 'forbidden' });
      },
      () => {
        if (live) setGate({ kind: 'failed' });
      },
    );
    return () => {
      live = false;
    };
  }, [need]);
  if (gate.kind === 'open') return <StaffRoleProvider value={gate.role}>{children}</StaffRoleProvider>;
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
