/**
 * An invite link (/i/<token>, made in C19 "Mời bằng link"). The route needs a session, so the visitor has signed in
 * with their hoandat account (the IdP) before this card shows: it says the role the link grants, and "Vào workspace"
 * accepts it (the server raises the account's role, never lowers it). An expired, revoked or unknown link says so.
 */
import { type ReactNode, useEffect, useState } from 'react';
import { ApiError } from '../api/api-client';
import { type InviteInfo, type InviteRole, acceptInvite, fetchInviteInfo } from '../api/workspace-api';
import { ScreenPage } from '../layout/screen-page';
import { SHELL_PATHS } from '../layout/shell-paths';
import { Button } from '../ui/button';
import { roleLabel, useWorkspaceText } from './workspace-messages';
import './workspace-screen.css';

type State =
  | { kind: 'checking' }
  | { kind: 'open'; info: InviteInfo }
  | { kind: 'accepting'; info: InviteInfo }
  | { kind: 'accepted'; role: InviteRole; raised: boolean }
  | { kind: 'off' }
  | { kind: 'not-found' }
  | { kind: 'failed' };

function refusal(error: unknown): State {
  if (error instanceof ApiError && error.code === 'invite-off') return { kind: 'off' };
  if (error instanceof ApiError && error.code === 'not-found') return { kind: 'not-found' };
  console.error('invite failed', error);
  return { kind: 'failed' };
}

export function InviteScreen({ token }: { token: string }): ReactNode {
  const { t } = useWorkspaceText();
  const [state, setState] = useState<State>({ kind: 'checking' });
  useEffect(() => {
    let live = true;
    fetchInviteInfo(token).then(
      (info) => live && setState({ kind: 'open', info }),
      (error: unknown) => live && setState(refusal(error)),
    );
    return () => {
      live = false;
    };
  }, [token]);

  async function accept(info: InviteInfo): Promise<void> {
    setState({ kind: 'accepting', info });
    try {
      const result = await acceptInvite(token);
      setState({ kind: 'accepted', role: result.role, raised: result.raised });
    } catch (error) {
      setState(refusal(error));
    }
  }

  let body: ReactNode;
  switch (state.kind) {
    case 'checking':
      body = (
        <p className="screen-lead" role="status">
          {t('invite.checking')}
        </p>
      );
      break;
    case 'open':
    case 'accepting':
      body = (
        <>
          <p className="screen-lead">{t('invite.lead', { role: roleLabel(t, state.info.role) })}</p>
          <Button variant="rim" onClick={() => void accept(state.info)} disabled={state.kind === 'accepting'} dataId="invite-accept">
            {state.kind === 'accepting' ? t('invite.accepting') : t('invite.accept')}
          </Button>
        </>
      );
      break;
    case 'accepted':
      body = (
        <>
          <p className="screen-lead" role="status" data-id="invite-done">
            {state.raised ? t('invite.done', { role: roleLabel(t, state.role) }) : t('invite.kept', { role: roleLabel(t, state.role) })}
          </p>
          <Button variant="rim" href={SHELL_PATHS.universe}>
            {t('invite.go')}
          </Button>
        </>
      );
      break;
    default:
      body = (
        <p className="screen-lead" role="alert" data-id="invite-refused">
          {state.kind === 'off' ? t('invite.off') : state.kind === 'not-found' ? t('invite.notFound') : t('invite.failed')}
        </p>
      );
  }
  return (
    <ScreenPage code="Invite">
      <section className="glass-card invite-card" data-id="invite-card" data-state={state.kind}>
        <h1 className="screen-title">{t('invite.title')}</h1>
        {body}
      </section>
    </ScreenPage>
  );
}
