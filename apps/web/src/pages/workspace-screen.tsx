/**
 * "Cài đặt workspace" (board C19, /admin/settings, admins only): six tabs.
 * - Thành viên: every account with its role (Quản trị, Thành viên) and last activity; "Đổi vai trò" and
 *   "Gỡ" (taking an account out; "Khôi phục" puts it back), never on the server's bootstrap admins or on yourself;
 *   and "Mời bằng link" (one live link, shown once when made, 7 days, letting members in).
 * - Vai trò & quyền, Đăng nhập (read only), Tích hợp (checked live), API keys (A03's token, a link to A03), Nhật ký
 *   kiểm toán (filters): workspace-panels.tsx.
 * Every change is written to the audit log by the server; the toast says so.
 */
import { type ReactNode, useState } from 'react';
import { ApiError } from '../api/api-client';
import { WORKSPACE_ROLES, type WorkspaceRole } from '../api/content-api';
import {
  type Invite,
  type MadeInvite,
  type Member,
  changeRole,
  createInvite,
  fetchInvite,
  fetchMemberPage,
  removeMember,
  restoreMember,
  revokeInvite,
} from '../api/workspace-api';
import { AppShell } from '../layout/app-shell';
import { GradientTitle } from '../ui/gradient-title';
import { Modal } from '../ui/modal';
import { Tabs } from '../ui/tabs';
import { dayText } from './admin-messages';
import type { ScreenTranslate } from './space-messages';
import { Failed, useLoad } from './workspace-load';
import { ApiKeysPanel, AuditPanel, IntegrationsPanel, RolesPanel, SignInPanel } from './workspace-panels';
import { type WorkspaceMessageKey, roleLabel, useWorkspaceText } from './workspace-messages';
import './workspace-screen.css';

type T = ScreenTranslate<WorkspaceMessageKey>;

export const WORKSPACE_TABS = ['members', 'roles', 'sso', 'integrations', 'api', 'audit'] as const;
type Tab = (typeof WORKSPACE_TABS)[number];

const AVATAR_TONES = ['violet', 'cyan', 'amber', 'emerald'] as const;
const DAY_MS = 24 * 60 * 60 * 1000;

const saigonDay = (date: Date): string => date.toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });

/** "vừa xong", "21:10" (today), "hôm qua", "3 ngày trước"; "chưa vào lại" without a live session. */
export function lastSeenText(t: T, iso: string | null, now: Date = new Date()): string {
  if (!iso) return t('ws.members.never');
  const at = new Date(iso);
  if (now.getTime() - at.getTime() < 2 * 60 * 1000) return t('ws.members.now');
  if (saigonDay(at) === saigonDay(now)) return at.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Ho_Chi_Minh' });
  if (saigonDay(at) === saigonDay(new Date(now.getTime() - DAY_MS))) return t('ws.members.yesterday');
  return t('ws.members.days', { count: Math.max(2, Math.floor((now.getTime() - at.getTime()) / DAY_MS)) });
}

function initialOf(member: Member): string {
  const source = member.name?.trim() || member.email?.trim() || '';
  return Array.from(source)[0]?.toLocaleUpperCase() ?? '·';
}

type Dialog = { kind: 'role'; member: Member; pick: WorkspaceRole } | { kind: 'remove'; member: Member } | null;

const ERROR_KEYS: Record<string, WorkspaceMessageKey> = { locked: 'ws.err.locked', self: 'ws.err.self', removed: 'ws.err.removed' };

function MemberRow({ member, index, t, onRole, onRemove, onRestore }: { member: Member; index: number; t: T; onRole(): void; onRemove(): void; onRestore(): void }): ReactNode {
  const locked = member.bootstrap || member.you;
  const name = member.name ?? t('ws.members.unnamed');
  return (
    <div className="ws-member" data-removed={member.removedAt !== null || undefined} data-id={`ws-member-${member.id}`}>
      <span className="ws-avatar" data-tone={AVATAR_TONES[index % AVATAR_TONES.length]} aria-hidden="true">
        {initialOf(member)}
      </span>
      <div className="ws-member-text">
        <div className="ws-member-name">
          {name}
        </div>
        <div className="ws-muted ws-small">
          {member.email ?? t('ws.members.noEmail')} · {lastSeenText(t, member.lastSeenAt)}
        </div>
      </div>
      {member.removedAt ? (
        <span className="ws-role" data-role="removed">
          {t('ws.members.removed')}
        </span>
      ) : (
        <span className="ws-role" data-role={member.role} title={member.bootstrap ? t('ws.members.locked') : undefined}>
          {roleLabel(t, member.role)}
        </span>
      )}
      {member.removedAt ? (
        <button type="button" className="ws-outline" onClick={onRestore} data-id={`ws-restore-${member.id}`}>
          {t('ws.members.restore')}
        </button>
      ) : (
        <button type="button" className="ws-outline" disabled={locked} onClick={onRole} data-id={`ws-change-${member.id}`}>
          {t('ws.members.change')}
        </button>
      )}
      <button type="button" className="ws-remove" disabled={locked || member.removedAt !== null} onClick={onRemove} aria-label={t('ws.members.removeLabel', { name })}>
        {t('ws.members.remove')}
      </button>
    </div>
  );
}

function InvitePanel({ t }: { t: T }): ReactNode {
  const live = useLoad(fetchInvite);
  const [made, setMade] = useState<MadeInvite | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const current: Invite | null = made?.invite ?? (live.load.status === 'ready' ? live.load.data : null);

  async function make(): Promise<void> {
    setBusy(true);
    setFailed(false);
    try {
      const next = await createInvite();
      setMade(next);
      setCopied(false);
      live.set(next.invite);
    } catch (error) {
      console.error('invite not made', error);
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  async function copy(): Promise<void> {
    if (!made) return;
    try {
      await navigator.clipboard.writeText(made.url);
      setCopied(true);
    } catch (error) {
      console.warn('copy failed', error);
    }
  }

  async function revoke(): Promise<void> {
    if (!current) return;
    try {
      await revokeInvite(current.id);
      setMade(null);
      live.set(null);
    } catch (error) {
      console.error('invite not revoked', error);
      setFailed(true);
    }
  }

  const shown = made ? made.url.replace(/^https?:\/\//, '') : `${window.location.host}/i/${current ? `••••${current.last4}` : '…'}`;
  return (
    <section className="ws-glass ws-invite" aria-label={t('ws.invite.title')} data-id="ws-invite">
      <span className="ws-invite-title">{t('ws.invite.title')}</span>
      <span className="ws-muted ws-13">{t('ws.invite.lead')}</span>
      <div className="ws-invite-link">
        <span className="ws-invite-url" data-id="ws-invite-url">
          {shown}
        </span>
        {made ? (
          <button type="button" className="ws-primary ws-invite-btn" onClick={() => void copy()} data-id="ws-invite-copy">
            {copied ? t('ws.invite.copied') : t('ws.invite.copy')}
          </button>
        ) : (
          <button type="button" className="ws-primary ws-invite-btn" disabled={busy} onClick={() => void make()} data-id="ws-invite-make">
            {busy ? t('ws.invite.making') : t('ws.invite.make')}
          </button>
        )}
      </div>
      <span className="ws-muted ws-small">{current ? t('ws.invite.expires', { date: dayText(current.expiresAt) }) : t('ws.invite.expiresNew')}</span>
      {!made && current && <span className="ws-muted ws-small">{t('ws.invite.hidden')}</span>}
      {current && current.acceptedCount > 0 && <span className="ws-muted ws-small">{t('ws.invite.accepted', { count: current.acceptedCount })}</span>}
      {current && (
        <button type="button" className="ws-link-button" onClick={() => void revoke()} data-id="ws-invite-revoke">
          {t('ws.invite.revoke')}
        </button>
      )}
      {failed && (
        <span role="alert" className="ws-error">
          {t('ws.invite.failed')}
        </span>
      )}
    </section>
  );
}

function MembersTab({ t }: { t: T }): ReactNode {
  const members = useLoad(fetchMemberPage);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [toast, setToast] = useState<{ title: string; message: string; tone: 'ok' | 'error' } | null>(null);

  const replace = (updated: Member): void => {
    if (members.load.status !== 'ready') return;
    const page = members.load.data;
    members.set({ ...page, members: page.members.map((m) => (m.id === updated.id ? updated : m)) });
  };

  async function run(action: () => Promise<Member>, message: (m: Member) => string): Promise<void> {
    setDialog(null);
    try {
      const updated = await action();
      replace(updated);
      setToast({ title: t('ws.toast.title'), message: message(updated), tone: 'ok' });
    } catch (error) {
      const key = error instanceof ApiError ? ERROR_KEYS[error.code] : undefined;
      if (!key) console.error('member change failed', error);
      setToast({ title: t('ws.toast.title'), message: t(key ?? 'ws.err.other'), tone: 'error' });
    }
  }

  const nameOf = (m: Member): string => m.name ?? t('ws.members.unnamed');
  let body: ReactNode;
  if (members.load.status === 'loading') body = <span className="ws-muted ws-13">{t('ws.loading')}</span>;
  else if (members.load.status === 'failed') body = <Failed t={t} onRetry={members.reload} />;
  else {
    const list = members.load.data.members;
    const { total } = members.load.data;
    body = (
      <>
        <span className="ws-count">
          {total > list.length ? t('ws.members.page', { shown: list.length, total }) : t('ws.members.count', { count: list.filter((m) => m.removedAt === null).length })}
        </span>
        {list.map((member, index) => (
          <MemberRow
            key={member.id}
            member={member}
            index={index}
            t={t}
            onRole={() => setDialog({ kind: 'role', member, pick: member.role })}
            onRemove={() => setDialog({ kind: 'remove', member })}
            onRestore={() => void run(() => restoreMember(member.id), (m) => t('ws.toast.restored', { name: nameOf(m) }))}
          />
        ))}
      </>
    );
  }

  return (
    <div className="ws-members-tab" role="tabpanel" id="ws-panel-members" aria-label={t('ws.tab.members')}>
      <section className="ws-glass ws-members" aria-label={t('ws.tab.members')} data-id="ws-members" data-state={members.load.status}>
        {body}
      </section>
      <InvitePanel t={t} />
      <Modal
        open={dialog?.kind === 'role'}
        onClose={() => setDialog(null)}
        title={dialog ? t('ws.role.dialog.title', { name: nameOf(dialog.member) }) : ''}
        description={dialog ? t('ws.role.dialog.text', { name: nameOf(dialog.member) }) : ''}
        dataId="ws-role-dialog"
        actions={
          <>
            <button type="button" className="ws-outline ws-pill" onClick={() => setDialog(null)}>
              {t('ws.cancel')}
            </button>
            <button
              type="button"
              className="ws-primary ws-pill"
              onClick={() => {
                if (dialog?.kind !== 'role') return;
                const { member, pick } = dialog;
                void run(() => changeRole(member.id, pick), (m) => t('ws.toast.role', { name: nameOf(m), role: roleLabel(t, m.role) }));
              }}
              data-id="ws-role-confirm"
            >
              {t('ws.role.dialog.confirm')}
            </button>
          </>
        }
      >
        {dialog?.kind === 'role' && (
          <div role="radiogroup" aria-label={t('ws.role.dialog.group')} className="ws-role-options">
            {WORKSPACE_ROLES.map((role) => (
              <button key={role} type="button" role="radio" aria-checked={dialog.pick === role} className="ws-role-option" onClick={() => setDialog({ ...dialog, pick: role })} data-id={`ws-role-${role}`}>
                {roleLabel(t, role)} <span className="ws-muted ws-small">· {t(`ws.role.${role}.sub`)}</span>
              </button>
            ))}
          </div>
        )}
      </Modal>
      <Modal
        open={dialog?.kind === 'remove'}
        onClose={() => setDialog(null)}
        tone="danger"
        title={dialog ? t('ws.remove.dialog.title', { name: nameOf(dialog.member) }) : ''}
        description={dialog ? t('ws.remove.dialog.text', { name: nameOf(dialog.member) }) : ''}
        dataId="ws-remove-dialog"
        actions={
          <>
            <button type="button" className="ws-outline ws-pill" onClick={() => setDialog(null)}>
              {t('ws.cancel')}
            </button>
            <button
              type="button"
              className="ws-warn ws-pill"
              onClick={() => {
                if (dialog?.kind !== 'remove') return;
                const { member } = dialog;
                void run(() => removeMember(member.id), (m) => t('ws.toast.removed', { name: nameOf(m) }));
              }}
              data-id="ws-remove-confirm"
            >
              {t('ws.remove.dialog.confirm')}
            </button>
          </>
        }
      />
      {toast && (
        <div className="ws-toast" role="status" data-tone={toast.tone} data-id="ws-toast">
          <span className="ws-toast-icon" aria-hidden="true">
            {toast.tone === 'ok' ? '✓' : '!'}
          </span>
          <div className="ws-fill">
            <div className="ws-toast-title">{toast.title}</div>
            <div className="ws-muted ws-small">{toast.message}</div>
          </div>
          <button type="button" className="ws-toast-close" aria-label={t('ws.toast.close')} onClick={() => setToast(null)}>
            ×
          </button>
        </div>
      )}
    </div>
  );
}

export function WorkspaceScreen(): ReactNode {
  const { t } = useWorkspaceText();
  const [tab, setTab] = useState<Tab>('members');
  return (
    <AppShell screen="C19" rail="workspace" admin veil="strong" className="admin-shell">
      <div className="ws-screen">
        <div>
          <GradientTitle size={34} className="ws-title">
            {t('ws.title')}
          </GradientTitle>
          <span className="ws-muted ws-lead">{t('ws.lead')}</span>
        </div>
        <Tabs
          label={t('ws.tabs')}
          items={WORKSPACE_TABS.map((id) => ({ id, label: t(`ws.tab.${id}`) }))}
          value={tab}
          onChange={(id) => setTab(WORKSPACE_TABS.find((x) => x === id) ?? 'members')}
          className="ws-tabs"
          dataId="ws-tab"
        />
        {tab === 'members' && <MembersTab t={t} />}
        {tab === 'roles' && <RolesPanel t={t} />}
        {tab === 'sso' && <SignInPanel t={t} />}
        {tab === 'integrations' && <IntegrationsPanel t={t} />}
        {tab === 'api' && <ApiKeysPanel t={t} />}
        {tab === 'audit' && <AuditPanel t={t} />}
      </div>
    </AppShell>
  );
}
