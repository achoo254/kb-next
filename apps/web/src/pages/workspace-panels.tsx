/**
 * The read-mostly tabs of "Cài đặt workspace" (board C19): the rights of each role (as src/access/roles.ts grants
 * them), sign-in through auth.hoandat.com and the session rules (read only), the integrations checked live, the admin
 * API token (managed in A03) and the audit log with its filters.
 */
import { type ReactNode, useCallback, useState } from 'react';
import { type AdminCall, type AdminToken, fetchAdminCalls, fetchAdminTokens } from '../api/review-api';
import {
  AUDIT_CATEGORIES,
  type AuditCategory,
  type AuditLine,
  type Integration,
  type IntegrationId,
  fetchAudit,
  fetchIntegrations,
  fetchSignInInfo,
} from '../api/workspace-api';
import { SHELL_PATHS } from '../layout/shell-paths';
import { useI18n } from '../i18n/i18n';
import { clockText, dayText } from './admin-messages';
import { sizeText } from './settings-messages';
import type { ScreenTranslate } from './space-messages';
import { Failed, useLoad } from './workspace-load';
import { type WorkspaceMessageKey, auditKey, roleLabel } from './workspace-messages';

type T = ScreenTranslate<WorkspaceMessageKey>;

function Check({ yes }: { yes: boolean }): ReactNode {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
      <path d={yes ? 'M5 12l5 5 9-10' : 'M6 12h12'} />
    </svg>
  );
}

/** Admin, reviewer, member: what each may do (the server's rule, src/access/roles.ts). */
const MATRIX: ReadonlyArray<{ key: WorkspaceMessageKey; rights: readonly [boolean, boolean, boolean] }> = [
  { key: 'ws.matrix.read', rights: [true, true, true] },
  { key: 'ws.matrix.write', rights: [true, true, true] },
  { key: 'ws.matrix.review', rights: [true, true, false] },
  { key: 'ws.matrix.hide', rights: [true, false, false] },
  { key: 'ws.matrix.members', rights: [true, false, false] },
  { key: 'ws.matrix.api', rights: [true, false, false] },
];

export function RolesPanel({ t }: { t: T }): ReactNode {
  return (
    <section className="ws-glass ws-matrix" role="tabpanel" aria-label={t('ws.tab.roles')} data-id="ws-roles">
      <div className="ws-matrix-head">
        <span>{t('ws.matrix.right')}</span>
        <span>{roleLabel(t, 'admin')}</span>
        <span>{roleLabel(t, 'reviewer')}</span>
        <span>{roleLabel(t, 'member')}</span>
      </div>
      {MATRIX.map((row) => (
        <div key={row.key} className="ws-matrix-row">
          <span className="ws-strong">{t(row.key)}</span>
          {row.rights.map((yes, index) => (
            <span key={index} className="ws-matrix-cell" data-yes={yes || undefined}>
              <Check yes={yes} />
              {yes ? t('ws.matrix.yes') : t('ws.matrix.no')}
            </span>
          ))}
        </div>
      ))}
      <span className="ws-muted ws-small">{t('ws.matrix.note')}</span>
    </section>
  );
}

function Switch({ on, label }: { on: boolean; label: string }): ReactNode {
  return (
    <span role="switch" aria-checked={on} aria-label={label} aria-readonly="true" className="ws-switch">
      <span />
    </span>
  );
}

export function SignInPanel({ t }: { t: T }): ReactNode {
  const info = useLoad(fetchSignInInfo);
  if (info.load.status === 'loading') return <span className="ws-muted ws-13">{t('ws.loading')}</span>;
  if (info.load.status === 'failed') return <Failed t={t} onRetry={info.reload} />;
  const data = info.load.data;
  const host = data.issuer ? new URL(data.issuer).host : '—';
  const state = !data.enabled ? 'off' : data.reachable ? 'ok' : 'down';
  const checked = clockText(data.checkedAt);
  return (
    <div className="ws-row-panels" role="tabpanel" aria-label={t('ws.tab.sso')} data-id="ws-sso">
      <section className="ws-glass ws-panel" aria-label={host}>
        <div className="ws-head">
          <span className="ws-hd" aria-hidden="true">
            hd
          </span>
          <div className="ws-fill">
            <div className="ws-strong ws-17">{host}</div>
            <div className="ws-muted ws-13">{t('ws.sso.provider')}</div>
          </div>
          <span className="ws-state" data-state={state}>
            <span />
            {state === 'ok' ? t('ws.sso.connected') : state === 'down' ? t('ws.sso.unreachable') : t('ws.sso.off')}
          </span>
        </div>
        <div className="ws-facts">
          <div className="ws-fact">
            <div className="ws-muted">{t('ws.sso.client')}</div>
            <div className="ws-strong">{data.clientId || '—'}</div>
          </div>
          <div className="ws-fact">
            <div className="ws-muted">{t('ws.sso.checked')}</div>
            <div className="ws-strong">{data.reachable ? t('ws.sso.checkedOk', { time: checked }) : t('ws.sso.checkedFail', { time: checked })}</div>
          </div>
        </div>
      </section>
      <section className="ws-glass ws-panel" aria-label={t('ws.sso.policies')}>
        <span className="ws-panel-title">{t('ws.sso.policies')}</span>
        {[
          { title: t('ws.sso.backchannel'), sub: t('ws.sso.backchannel.sub') },
          { title: t('ws.sso.only'), sub: t('ws.sso.only.sub') },
          { title: t('ws.sso.idle', { days: data.idleDays }), sub: t('ws.sso.idle.sub', { days: data.absoluteDays }) },
        ].map((policy) => (
          <div key={policy.title} className="ws-policy">
            <div className="ws-fill">
              <div className="ws-14 ws-semi">{policy.title}</div>
              <div className="ws-muted ws-small">{policy.sub}</div>
            </div>
            <Switch on label={policy.title} />
          </div>
        ))}
        <span className="ws-muted ws-small">{t('ws.sso.readonly')}</span>
      </section>
    </div>
  );
}

function integrationDetail(t: T, item: Integration, locale: 'vi' | 'en'): string {
  const num = (key: string): number => (typeof item.facts[key] === 'number' ? Number(item.facts[key]) : 0);
  switch (item.id) {
    case 'jev':
      return t('ws.int.jev.detail', { count: num('requestsToday') });
    case 'files':
      return t('ws.int.files.detail', { count: num('files'), size: sizeText(num('bytes'), locale) });
    case 'search':
      return typeof item.facts.documents === 'number' ? t('ws.int.search.detail', { count: item.facts.documents }) : t('ws.int.search.unknown');
  }
}

const INTEGRATION_TONE: Record<IntegrationId, string> = { jev: 'emerald', files: 'amber', search: 'cyan' };

export function IntegrationsPanel({ t }: { t: T }): ReactNode {
  const { locale } = useI18n();
  const items = useLoad(fetchIntegrations);
  const [checking, setChecking] = useState<IntegrationId | null>(null);
  const check = useCallback(
    async (id: IntegrationId) => {
      setChecking(id);
      try {
        items.set(await fetchIntegrations());
      } catch (error) {
        console.warn('integration check failed', error);
      } finally {
        setChecking(null);
      }
    },
    [items],
  );
  if (items.load.status === 'loading') return <span className="ws-muted ws-13">{t('ws.loading')}</span>;
  if (items.load.status === 'failed') return <Failed t={t} onRetry={items.reload} />;
  return (
    <div className="ws-grid" role="tabpanel" aria-label={t('ws.tab.integrations')} data-id="ws-integrations">
      {items.load.data.map((item) => {
        const state = checking === item.id ? 'checking' : item.state;
        return (
          <section key={item.id} className="ws-glass ws-panel" aria-label={t(`ws.int.${item.id}`)} data-id={`ws-int-${item.id}`}>
            <div className="ws-head">
              <span className="ws-int-orb" data-tone={INTEGRATION_TONE[item.id]} aria-hidden="true" />
              <div className="ws-fill">
                <div className="ws-strong ws-16">{t(`ws.int.${item.id}`)}</div>
                <div className="ws-muted ws-small">{t(`ws.int.${item.id}.role`)}</div>
              </div>
              <span className="ws-state" data-state={state}>
                <span />
                {t(`ws.int.state.${state}`)}
              </span>
            </div>
            <span className="ws-muted ws-13">{integrationDetail(t, item, locale)}</span>
            <button type="button" className="ws-outline ws-check" disabled={checking !== null} onClick={() => void check(item.id)}>
              {t('ws.int.check')}
            </button>
          </section>
        );
      })}
    </div>
  );
}

const readTokens = (): Promise<{ tokens: AdminToken[]; calls: AdminCall[] }> => Promise.all([fetchAdminTokens(), fetchAdminCalls()]).then(([tokens, calls]) => ({ tokens, calls }));

export function ApiKeysPanel({ t }: { t: T }): ReactNode {
  const data = useLoad(readTokens);
  if (data.load.status === 'loading') return <span className="ws-muted ws-13">{t('ws.loading')}</span>;
  if (data.load.status === 'failed') return <Failed t={t} onRetry={data.reload} />;
  const live = data.load.data.tokens.find((token) => token.revokedAt === null);
  const lastCall = data.load.data.calls[0];
  const last = live?.lastUsedAt ? `${clockText(live.lastUsedAt)}${lastCall ? ` (${lastCall.status})` : ''}` : t('ws.api.never');
  return (
    <section className="ws-glass ws-panel ws-api" role="tabpanel" aria-label={t('ws.tab.api')} data-id="ws-api">
      <div className="ws-head">
        <span className="ws-key" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="8" cy="15" r="4" />
            <path d="M11 12l9-9M17 6l3 3M15 8l2 2" />
          </svg>
        </span>
        <div className="ws-fill">
          <div className="ws-strong ws-16">{t('ws.api.token')}</div>
          <div className="ws-muted ws-13">{live ? t('ws.api.live', { last4: live.last4, date: dayText(live.createdAt), last }) : t('ws.api.none')}</div>
        </div>
        <span className="ws-state" data-state={live ? 'ok' : 'off'}>
          {live ? t('ws.api.inUse') : t('ws.api.off')}
        </span>
      </div>
      <div className="ws-endpoints">
        <span>POST /api/admin/posts</span>
        <span>PATCH /api/admin/posts/:id</span>
        <span>GET /api/admin/review</span>
      </div>
      <span className="ws-muted ws-13">{t('ws.api.note')}</span>
      <a className="ws-primary ws-open-api" href={SHELL_PATHS.adminApi}>
        {t('ws.api.open')}
      </a>
    </section>
  );
}

const AVATAR_TONES = ['violet', 'cyan', 'amber', 'emerald'] as const;

/** The sentence of a log line; an unknown action still says who did what. */
export function auditText(t: T, line: AuditLine): string {
  const actor = line.actor ? (line.actor.name ?? t('ws.audit.deleted')) : t('ws.audit.someone');
  const subject = line.subject ?? '—';
  const detail = line.detail ?? {};
  const role = typeof detail.to === 'string' ? detail.to : typeof detail.role === 'string' ? detail.role : null;
  const vars = {
    actor,
    subject,
    role: role === 'admin' || role === 'reviewer' || role === 'member' ? roleLabel(t, role) : (role ?? ''),
    status: typeof detail.status === 'number' ? detail.status : '',
    count: typeof detail.documents === 'number' ? detail.documents : 0,
    action: line.action,
  };
  const key = auditKey(line.action);
  return key ? t(key, vars) : t('ws.audit.other', vars);
}

function AuditList({ t, category }: { t: T; category: AuditCategory | null }): ReactNode {
  const read = useCallback(() => fetchAudit(category), [category]);
  const lines = useLoad(read);
  if (lines.load.status === 'loading') return <span className="ws-muted ws-13">{t('ws.loading')}</span>;
  if (lines.load.status === 'failed') return <Failed t={t} onRetry={lines.reload} />;
  if (lines.load.data.length === 0) return <span className="ws-muted ws-13">{t('ws.audit.empty')}</span>;
  const tones = new Map<string, (typeof AVATAR_TONES)[number]>();
  return (
    <div className="ws-audit-body">
      <div className="ws-audit-rail" aria-hidden="true" />
      <ol className="ws-audit" data-id="ws-audit-lines">
        {lines.load.data.map((line) => {
          const who = line.actor?.name ?? '';
          const tone = tones.get(who) ?? AVATAR_TONES[tones.size % AVATAR_TONES.length] ?? 'violet';
          tones.set(who, tone);
          const initial = line.action.startsWith('api.') ? 'AI' : (Array.from(who)[0]?.toLocaleUpperCase() ?? '·');
          return (
            <li key={`${line.category}-${line.id}`} className="ws-audit-line">
              <span className="ws-audit-time">{clockText(line.at)}</span>
              <span className="ws-avatar ws-avatar-sm" data-tone={tone} aria-hidden="true">
                {initial}
              </span>
              <span className="ws-fill ws-14">{auditText(t, line)}</span>
              <span className="ws-cat">{t(`ws.audit.${line.category}`)}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function AuditPanel({ t }: { t: T }): ReactNode {
  const [category, setCategory] = useState<AuditCategory | null>(null);
  return (
    <section className="ws-glass ws-panel ws-audit-panel" role="tabpanel" aria-label={t('ws.tab.audit')} data-id="ws-audit">
      <div role="group" aria-label={t('ws.audit.filters')} className="ws-filters">
        {[null, ...AUDIT_CATEGORIES].map((c) => (
          <button key={c ?? 'all'} type="button" className="ws-filter" aria-pressed={category === c} onClick={() => setCategory(c)} data-id={`ws-audit-${c ?? 'all'}`}>
            {c ? t(`ws.audit.${c}`) : t('ws.audit.all')}
          </button>
        ))}
      </div>
      <AuditList key={category ?? 'all'} t={t} category={category} />
    </section>
  );
}
