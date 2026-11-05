/**
 * The posting API (board A03, /admin/api): the admin token in use (only its last four characters, ever; a new one is
 * shown once and revokes the old), revoking it, the three endpoints with a sample request each, and the latest calls.
 */
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { type AdminCall, type AdminToken, createAdminToken, fetchAdminCalls, fetchAdminTokens, revokeAdminToken } from '../api/review-api';
import { AppShell } from '../layout/app-shell';
import { Icon } from '../ui/icon';
import { Toast } from '../ui/toast';
import { type AdminMessageKey, clockText, dayText, useAdminText } from './admin-messages';
import type { ScreenTranslate } from './space-messages';
import './admin-screens.css';

const ENDPOINTS = [
  {
    id: 'post',
    method: 'POST',
    path: '/api/admin/posts',
    title: 'POST /api/admin/posts',
    code: 'Authorization: Bearer <ADMIN_TOKEN>\nContent-Type: application/json\n\n{\n  "title": "Giao thức DHCP",\n  "lang": "vi",\n  "collection": "networking",\n  "tags": ["dhcp", "dora"],\n  "markdown": "## DORA 4 bước\\n...markdown...",\n  "source": "ai",\n  "hidden": false\n}',
  },
  {
    id: 'patch',
    method: 'PATCH',
    path: '/api/admin/posts/:id',
    title: 'PATCH /api/admin/posts/{id}',
    code: 'Authorization: Bearer <ADMIN_TOKEN>\nContent-Type: application/json\n\n{\n  "hidden": true\n}',
  },
  {
    id: 'review',
    method: 'GET',
    path: '/api/admin/review',
    title: 'GET /api/admin/review',
    code: 'Authorization: Bearer <ADMIN_TOKEN>\n\n200 OK\n{\n  "documents": [\n    { "id": "…", "title": "TCP vs UDP bằng hình",\n      "authorName": "…", "preReview": { "onTopic": 0.92, … } }\n  ]\n}',
  },
] as const;
type EndpointId = (typeof ENDPOINTS)[number]['id'];

const ERROR_KEYS: Record<string, AdminMessageKey> = {
  'invalid-token': 'api.err.invalid-token',
  'token-required': 'api.err.token-required',
  'invalid-body': 'api.err.invalid-body',
  'space-required': 'api.err.space-required',
  'not-found': 'api.err.not-found',
  'not-approved': 'api.err.not-approved',
};

/** What a logged call did, as A03's log line says it. */
export function callOutcome(t: ScreenTranslate<AdminMessageKey>, call: AdminCall): { ok: boolean; text: string } {
  const ok = call.status >= 200 && call.status < 300;
  if (!ok) {
    const key = call.error ? ERROR_KEYS[call.error] : undefined;
    return { ok, text: key ? t(key) : t('api.err.other', { code: call.error ?? String(call.status) }) };
  }
  if (!call.document) return { ok, text: '' };
  return { ok, text: call.method === 'POST' ? t('api.log.post', { title: call.document.title }) : t('api.log.changed', { title: call.document.title }) };
}

/** "21:31" for today in Saigon time, else the day. */
function whenText(iso: string, now: number): string {
  return dayText(iso) === dayText(new Date(now).toISOString()) ? clockText(iso) : dayText(iso);
}

type TokenView = { kind: 'none' } | { kind: 'active'; token: AdminToken } | { kind: 'revoked'; token: AdminToken } | { kind: 'fresh'; token: AdminToken; secret: string };

export function AdminApiScreen(): ReactNode {
  const { t } = useAdminText();
  const [token, setToken] = useState<TokenView>({ kind: 'none' });
  const [confirming, setConfirming] = useState(false);
  const [copied, setCopied] = useState(false);
  const [endpoint, setEndpoint] = useState<EndpointId>('post');
  const [log, setLog] = useState<{ calls: AdminCall[]; now: number }>({ calls: [], now: 0 });
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const refresh = useCallback(() => {
    fetchAdminTokens().then(
      (tokens) => {
        const latest = tokens[0];
        setToken((current) => (current.kind === 'fresh' ? current : !latest ? { kind: 'none' } : latest.revokedAt ? { kind: 'revoked', token: latest } : { kind: 'active', token: latest }));
      },
      () => setFailed(true),
    );
    fetchAdminCalls().then(
      (calls) => setLog({ calls, now: Date.now() }),
      () => setFailed(true),
    );
  }, []);
  useEffect(refresh, [refresh]);

  const create = (): void => {
    setConfirming(false);
    setBusy(true);
    createAdminToken(t('api.token.label'))
      .then(
        ({ token: secret, info }) => {
          setCopied(false);
          setToken({ kind: 'fresh', token: info, secret });
        },
        () => setFailed(true),
      )
      .finally(() => setBusy(false));
  };

  const revoke = (): void => {
    if (token.kind === 'none' || token.kind === 'revoked') return;
    setBusy(true);
    revokeAdminToken(token.token.id)
      .then(
        () => setToken({ kind: 'revoked', token: { ...token.token, revokedAt: new Date().toISOString() } }),
        () => setFailed(true),
      )
      .finally(() => setBusy(false));
  };

  const copy = (secret: string): void => {
    navigator.clipboard.writeText(secret).then(
      () => setCopied(true),
      () => setFailed(true),
    );
  };

  const { calls, now } = log;
  const live = token.kind === 'active' || token.kind === 'fresh';
  const status = token.kind === 'fresh' ? t('api.token.fresh') : token.kind === 'active' ? t('api.token.active') : token.kind === 'revoked' ? t('api.token.revoked') : t('api.token.none');
  const meta =
    token.kind === 'fresh'
      ? t('api.token.new')
      : token.kind === 'active'
        ? token.token.lastUsedAt
          ? t('api.token.meta', { created: dayText(token.token.createdAt), used: whenText(token.token.lastUsedAt, now) })
          : t('api.token.metaUnused', { created: dayText(token.token.createdAt) })
        : token.kind === 'revoked'
          ? t('api.token.revokedMeta')
          : t('api.token.noneMeta');
  const value = token.kind === 'fresh' ? token.secret : token.kind === 'active' ? `kf_admin_••••••••••••${token.token.last4}` : t('api.token.none');
  const sample = ENDPOINTS.find((e) => e.id === endpoint) ?? ENDPOINTS[0];

  return (
    <AppShell screen="A03" rail="api" admin veil="strong" className="admin-shell">
      <div className="admin-screen" data-id="admin-api">
        <div className="a03-left">
          <div>
            <h1 className="a03-title">{t('api.title')}</h1>
            <span className="a03-lead">{t('api.lead')}</span>
          </div>

          <section aria-label={t('api.token')} className="admin-glass a03-card a03-token" data-state={token.kind} data-id="api-token">
            <div className="a03-token-head">
              <span className="a03-key" aria-hidden="true">
                <Icon name="admin-key" size={20} />
              </span>
              <div className="admin-fill">
                <div className="a03-strong">{t('api.token')}</div>
                <div className="a03-muted">{meta}</div>
              </div>
              <span className="a03-status">{status}</span>
            </div>
            <div className="a03-value">
              <span className="a03-value-text" data-id="api-token-value">
                {value}
              </span>
              {token.kind === 'fresh' && (
                <button type="button" className="a03-copy" onClick={() => copy(token.secret)}>
                  {copied ? t('api.token.copied') : t('api.token.copy')}
                </button>
              )}
            </div>
            {token.kind === 'fresh' && <span className="a03-once">{t('api.token.once')}</span>}
            {confirming && (
              <div role="alertdialog" aria-label={t('api.token.confirm')} className="a03-confirm">
                <span className="a03-confirm-text">{t('api.token.confirm')}</span>
                <div className="a03-buttons">
                  <button type="button" className="a03-cancel" onClick={() => setConfirming(false)}>
                    {t('api.token.cancel')}
                  </button>
                  <button type="button" className="a03-confirm-btn" onClick={create} data-id="api-token-confirm">
                    {t('api.token.createConfirm')}
                  </button>
                </div>
              </div>
            )}
            <div className="a03-buttons">
              <button type="button" className="a03-create" disabled={busy} onClick={() => (live ? setConfirming(true) : create())} data-id="api-token-create">
                {t('api.token.create')}
              </button>
              <button type="button" className="a03-revoke" disabled={busy || !live} onClick={revoke} data-id="api-token-revoke">
                {t('api.token.revoke')}
              </button>
            </div>
          </section>

          <section aria-label={t('api.endpoints')} className="admin-glass a03-card a03-endpoints">
            <span className="a03-strong">{t('api.endpoints')}</span>
            {ENDPOINTS.map((e) => (
              <button key={e.id} type="button" aria-pressed={endpoint === e.id} className="a03-endpoint" onClick={() => setEndpoint(e.id)}>
                <span className="a03-method" data-method={e.method}>
                  {e.method}
                </span>
                <span className="a03-path">{e.path}</span>
                <span className="a03-muted">{t(`api.ep.${e.id}`)}</span>
              </button>
            ))}
          </section>
        </div>

        <section aria-label={t('api.sample')} className="admin-glass a03-sample">
          <div className="a03-sample-head">
            <span className="a03-strong admin-fill">{t('api.sample')}</span>
            <span className="a03-sample-title">{sample.title}</span>
          </div>
          <pre className="a03-code" key={sample.id}>
            {sample.code}
          </pre>
          <span className="a03-muted">{t(`api.note.${sample.id}`)}</span>
        </section>

        <section aria-label={t('api.log')} className="admin-glass a03-log" data-id="api-log">
          <span className="a03-strong">{t('api.log')}</span>
          <div className="a03-log-lines">
            <span className="a03-log-rail" aria-hidden="true" />
            {calls.length === 0 && <span className="a03-muted">{t('api.log.empty')}</span>}
            {calls.slice(0, 5).map((call) => {
              const outcome = callOutcome(t, call);
              const tone = outcome.ok ? 'ok' : call.status === 401 ? 'danger' : 'warn';
              return (
                <div key={call.id} className="a03-line" data-tone={tone}>
                  <span className="a03-line-dot" />
                  <span className="a03-line-time">{whenText(call.at, now)}</span>
                  <span className="a03-line-ep">
                    {call.method} {call.path}
                  </span>
                  <span className="a03-line-status">{call.status}</span>
                  {outcome.ok ? (
                    <>
                      <span className="a03-line-chip">
                        <Icon name="star" size={11} />
                        {t('api.log.official')}
                      </span>
                      {call.document && (
                        <a href={`/d/${encodeURIComponent(call.document.id)}`} className="a03-line-link">
                          {outcome.text}
                        </a>
                      )}
                    </>
                  ) : (
                    <span className="a03-line-err">{outcome.text}</span>
                  )}
                </div>
              );
            })}
          </div>
        </section>
        {failed && <Toast tone="error" message={t('api.failed')} onClose={() => setFailed(false)} className="admin-toast" />}
      </div>
    </AppShell>
  );
}
