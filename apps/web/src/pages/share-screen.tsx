/**
 * A text's sharing (board C18, /d/:id/share), for its author or an admin: the story card of the text, who sees it
 * (official, community, or the author's own and locked), its public link (made, copied, given an expiry and an access,
 * revoked), who has access, and the access history (each opening, by an account or a guest, and what was done to the
 * link; never the token).
 *
 * A token is shown once, when made (only its sha256 is stored): right after "Tạo link" the full link can be copied;
 * later the field shows its last four characters, and "Tạo link mới" (confirmed) replaces it to copy again. An expired
 * or revoked link stays off (the server refuses to change it): "Tạo link mới" makes a new one with the settings shown.
 *
 * States: loading, failed (not found, no access, server), locked (not approved), no link yet, live (just made or
 * not), expired, revoked, paused (an admin hid the text: the banner from the account's "permission" notice), and an
 * action that failed.
 */
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { ApiError, NETWORK_ERROR } from '../api/api-client';
import {
  type ShareAccess,
  type ShareExpiry,
  type ShareHistoryLine,
  type ShareView,
  SHARE_ACCESS,
  SHARE_EXPIRIES,
  changeShareLink,
  createShareLink,
  fetchShare,
  revokeShareLink,
} from '../api/share-api';
import { brand } from '../brand';
import { AppShell, SHELL_PATHS } from '../layout/app-shell';
import { ILLUSTRATIONS } from '../ui/art';
import { Button } from '../ui/button';
import { Icon } from '../ui/icon';
import { Modal } from '../ui/modal';
import { ErrorPanel } from './error-screen';
import { type ReaderFailure, readerLoadError } from './reader-screen';
import { type ShareMessageKey, isToday, shareDate, shareTime, useShareText } from './share-messages';
import type { ScreenTranslate } from './space-messages';
import './share-screen.css';

type Load = { status: 'loading' } | { status: 'failed'; error: ReaderFailure } | { status: 'ready'; view: ShareView };
type Translate = ScreenTranslate<ShareMessageKey>;

/** Where the text stands for sharing. */
export type ShareState = 'locked' | 'paused' | 'none' | 'live' | 'expired' | 'revoked';

export function shareState(view: ShareView): ShareState {
  const doc = view.document;
  if (doc.status !== 'approved') return 'locked';
  if (doc.hidden) return 'paused';
  if (!view.link) return 'none';
  if (view.link.revokedAt) return 'revoked';
  return view.link.expired ? 'expired' : 'live';
}

/** The words of one history line (C18 "Lịch sử truy cập"); `opens`: the 7-day count, on the latest opening only. */
export function historyText(t: Translate, line: ShareHistoryLine, now: Date, locale: 'vi' | 'en', opens: number | null): { title: string; sub: string } {
  const time = shareTime(locale, line.at, now);
  const by = line.by ?? '';
  const byLine = by ? t('share.history.by', { by, time }) : time;
  switch (line.kind) {
    case 'opened': {
      const who = line.by ?? t('share.history.guest');
      return {
        title: t('share.history.opened', { time: isToday(line.at, now) ? t('share.today', { time }) : time }),
        sub: opens === null ? who : `${who} · ${t('share.history.count', { n: opens })}`,
      };
    }
    case 'created':
      return { title: t('share.history.created'), sub: byLine };
    case 'revoked':
      return { title: t('share.history.revoked'), sub: byLine };
    case 'changed': {
      const [expiryPart = '', accessPart = ''] = (line.detail ?? '').split('|');
      const expiry = SHARE_EXPIRIES.find((e) => e === expiryPart);
      const access = SHARE_ACCESS.find((a) => a === accessPart);
      const title = expiry
        ? t('share.history.expiry', { expiry: t(`share.expiry.${expiry}`).toLowerCase() })
        : access
          ? t('share.history.access', { access: t(`share.access.${access}`).toLowerCase() })
          : t('share.history.changed');
      return { title, sub: byLine };
    }
    case 'approved':
      return { title: t('share.history.approved'), sub: byLine };
    case 'hidden':
      return { title: t('share.history.hidden'), sub: byLine };
    case 'shown':
      return { title: t('share.history.shown'), sub: byLine };
  }
}

function failureText(t: Translate, error: unknown): string {
  if (error instanceof ApiError && error.code === NETWORK_ERROR) return t('share.failed.network');
  if (error instanceof ApiError && (error.code === 'not-shareable' || error.code === 'no-link' || error.code === 'link-expired')) return t('share.failed.shareable');
  return t('share.failed.other');
}

export function ShareScreen({ id }: { id: string }): ReactNode {
  const { t, locale } = useShareText();
  const [load, setLoad] = useState<Load>({ status: 'loading' });

  const reload = useCallback(
    () =>
      fetchShare(id).then(
        (view) => setLoad({ status: 'ready', view }),
        (error: unknown) => setLoad({ status: 'failed', error: readerLoadError(error) }),
      ),
    [id],
  );
  useEffect(() => {
    void reload();
  }, [reload]);

  const view = load.status === 'ready' ? load.view : null;
  const doc = view?.document;
  const spaceName = doc ? (locale === 'vi' ? doc.space.nameVi : doc.space.nameEn) : '';
  const collectionName = doc?.collection ? (locale === 'vi' ? doc.collection.nameVi : doc.collection.nameEn) : null;

  return (
    <AppShell
      screen="C18"
      rail="spaces"
      view="docs"
      veil="strong"
      stars={false}
      className="share-shell"
      docHref={`/d/${encodeURIComponent(id)}`}
      spaceHref={doc ? `/s/${encodeURIComponent(doc.space.slug)}` : undefined}
      breadcrumb={[
        { label: 'Universe', href: SHELL_PATHS.universe },
        ...(doc ? [{ label: spaceName, href: `/s/${encodeURIComponent(doc.space.slug)}` }] : []),
        ...(doc && collectionName ? [{ label: collectionName, href: `/s/${encodeURIComponent(doc.space.slug)}` }] : []),
        ...(doc ? [{ label: doc.title, href: `/d/${encodeURIComponent(id)}` }] : []),
        { label: t('share.crumb') },
      ]}
    >
      <div className="share-screen" data-id="share-screen" data-state={view ? shareState(view) : load.status}>
        {load.status === 'loading' && (
          <p className="share-loading" role="status">
            {t('share.loading')}
          </p>
        )}
        {load.status === 'failed' && (
          <div className="share-error">
            <ErrorPanel kind={load.error === 'no-access' || load.error === 'hidden' ? 'forbidden' : load.error === 'not-found' ? 'not-found' : 'server'} />
          </div>
        )}
        {view && <ShareBody view={view} onChanged={(next) => setLoad({ status: 'ready', view: next })} reload={reload} />}
      </div>
    </AppShell>
  );
}

interface BodyProps {
  view: ShareView;
  onChanged(view: ShareView): void;
  reload(): Promise<void>;
}

function ShareBody({ view, onChanged, reload }: BodyProps): ReactNode {
  const { t } = useShareText();
  const state = shareState(view);
  const doc = view.document;
  const banner = view.permission;
  const badge: ShareMessageKey =
    doc.status !== 'approved' ? (doc.status === 'pending' ? 'share.badge.pending' : 'share.badge.own') : doc.hidden ? 'share.badge.hidden' : doc.origin === 'official' ? 'share.badge.official' : 'share.badge.community';
  return (
    <div className="share-content" data-banner={banner ? 'on' : undefined}>
      <div className="share-head">
        <h1 className="share-title">{t('share.title')}</h1>
        <span className="share-badge" data-tone={doc.status !== 'approved' || doc.hidden ? 'warn' : 'violet'}>
          {t(badge)}
        </span>
      </div>
      {banner && (
        <div className="share-banner" role="status" data-id="share-banner">
          <Icon name="eye-off" size={18} />
          <span className="share-fill">{banner.hidden ? t('share.banner.hidden') : t('share.banner.shown')}</span>
          <a href={SHELL_PATHS.inbox} className="share-banner-link">
            {t('share.banner.inbox')}
          </a>
        </div>
      )}
      <StoryCard view={view} state={state} />
      <section className="share-middle">
        <Provenance view={view} />
        {state === 'locked' ? (
          <div className="share-rim share-locked" data-id="share-locked">
            <span className="share-locked-title">{t('share.locked.title')}</span>
            <span className="share-locked-text">{t('share.locked.text')}</span>
            <Button variant="rim" size="lg" href={SHELL_PATHS.mine} className="share-locked-action">
              {t('share.locked.status')}
            </Button>
          </div>
        ) : (
          <LinkCard view={view} state={state} onChanged={onChanged} reload={reload} />
        )}
      </section>
      <section className="share-right">
        <People view={view} state={state} />
        <History view={view} />
      </section>
    </div>
  );
}

function StoryCard({ view, state }: { view: ShareView; state: ShareState }): ReactNode {
  const { t } = useShareText();
  const doc = view.document;
  const letters = doc.sections.slice(0, 4).map((s) => Array.from(s)[0]?.toLocaleUpperCase() ?? '');
  return (
    <aside className="share-story" aria-label={t('share.story')} data-dim={state === 'locked' || state === 'revoked' || undefined}>
      <div className="share-story-card">
        <span className="share-story-brand">{brand.appName}</span>
        <img src={ILLUSTRATIONS['wormhole-gate']} alt="" aria-hidden="true" className="share-story-art" />
        <span className="share-story-title">{doc.title}</span>
        {letters.length > 0 && (
          <div className="share-story-steps" aria-hidden="true">
            {letters.map((letter, i) => (
              <span key={`${i}-${letter}`} data-n={i % 2}>
                {letter}
              </span>
            ))}
          </div>
        )}
        <span className="share-fill" />
        <span className="share-story-url">
          {window.location.host}/d/{doc.id}
        </span>
        {state === 'locked' && (
          <span className="share-story-lock" aria-hidden="true">
            <img src={ILLUSTRATIONS['vault-lock']} alt="" />
          </span>
        )}
      </div>
    </aside>
  );
}

function Provenance({ view }: { view: ShareView }): ReactNode {
  const { t } = useShareText();
  const doc = view.document;
  const current = doc.status !== 'approved' ? 'own' : doc.origin === 'official' ? 'official' : 'community';
  return (
    <div className="share-rim share-who">
      <h2 className="share-h2">{t('share.who')}</h2>
      {(['official', 'community', 'own'] as const).map((p) => (
        <div key={p} className="share-prov" data-prov={p} data-on={current === p || undefined}>
          <span className="share-prov-dot" aria-hidden="true" />
          <div className="share-fill">
            <div className="share-prov-name">{t(`share.prov.${p}`)}</div>
            <div className="share-prov-text">{t(`share.prov.${p}.text`)}</div>
          </div>
          {current === p && <span className="share-prov-this">{t('share.prov.this')}</span>}
        </div>
      ))}
    </div>
  );
}

interface LinkCardProps {
  view: ShareView;
  state: ShareState;
  onChanged(view: ShareView): void;
  reload(): Promise<void>;
}

function LinkCard({ view, state, onChanged, reload }: LinkCardProps): ReactNode {
  const { t, locale } = useShareText();
  const doc = view.document;
  const link = view.link;
  const [fresh, setFresh] = useState<{ linkId: string; url: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [renewing, setRenewing] = useState(false);
  // What a new link gets: the live link's settings, else the board's defaults.
  const [draft, setDraft] = useState<{ expiry: ShareExpiry; access: ShareAccess }>({ expiry: link?.expiry ?? '7d', access: link?.access ?? 'view' });
  // Only a running link takes new settings; an expired or revoked one stays off, the settings go to a new link.
  const usable = state === 'live';
  const frozen = state === 'paused';
  const settings = usable && link ? { expiry: link.expiry, access: link.access } : draft;
  const shownUrl = fresh && link && fresh.linkId === link.id ? fresh.url : null;

  const run = async (action: () => Promise<void>): Promise<void> => {
    setBusy(true);
    setFailed(null);
    try {
      await action();
    } catch (error) {
      setFailed(failureText(t, error));
    } finally {
      setBusy(false);
    }
  };

  const make = (): Promise<void> =>
    run(async () => {
      const made = await createShareLink(doc.id, settings);
      setFresh({ linkId: made.link.id, url: `${window.location.origin}${made.path}` });
      setCopied(false);
      onChanged({ ...view, link: made.link });
      void reload();
    });

  const change = (patch: { expiry?: ShareExpiry; access?: ShareAccess }): void => {
    if (!usable) {
      setDraft({ ...draft, ...patch });
      return;
    }
    void run(async () => {
      const next = await changeShareLink(doc.id, patch);
      onChanged({ ...view, link: next });
      void reload();
    });
  };

  const revoke = (): Promise<void> =>
    run(async () => {
      const next = await revokeShareLink(doc.id);
      setFresh(null);
      onChanged({ ...view, link: next });
      void reload();
    });

  const copy = (): void => {
    if (!shownUrl) return;
    navigator.clipboard.writeText(shownUrl).then(
      () => setCopied(true),
      () => setFailed(t('share.failed.other')),
    );
  };

  const value = shownUrl ?? (link && state !== 'none' ? `${window.location.host}/l/••••${link.last4}` : t('share.link.none'));
  const expiryWord = t(`share.expiry.${settings.expiry}`).toLowerCase();
  const accessWord = t(`share.access.${settings.access}`).toLowerCase();
  let summary: string;
  if (frozen) summary = t('share.summary.paused');
  else if (state === 'live' && link?.expiresAt) summary = t('share.summary.until', { access: accessWord, date: shareDate(link.expiresAt) });
  else if (state === 'live') summary = t('share.summary.live', { access: accessWord, expiry: expiryWord });
  else if (state === 'expired' && link?.expiresAt) summary = t('share.summary.expired', { date: shareDate(link.expiresAt) });
  else summary = t('share.summary.off');

  return (
    <div className="share-rim share-link" data-frozen={frozen || undefined} data-id="share-link">
      <label className="share-link-label" htmlFor="share-link-value">
        {t('share.link')}
      </label>
      <span className="share-link-row">
        <input
          id="share-link-value"
          type="text"
          readOnly
          value={value}
          className="share-link-value"
          data-off={state === 'revoked' || undefined}
          data-id="share-link-value"
          onFocus={(e) => e.currentTarget.select()}
        />
        {state === 'none' || state === 'revoked' || state === 'expired' ? (
          <button type="button" className="share-button share-button-rim" disabled={busy || frozen} onClick={() => void make()} data-id="share-create">
            {busy ? t('share.link.making') : state === 'none' ? t('share.link.create') : t('share.link.new')}
          </button>
        ) : shownUrl ? (
          <button type="button" className="share-button share-button-rim" data-done={copied || undefined} disabled={frozen} onClick={copy} data-id="share-copy">
            {copied && <Icon name="check" size={14} />}
            {copied ? t('share.link.copied') : t('share.link.copy')}
          </button>
        ) : (
          <button type="button" className="share-button share-button-rim" title={t('share.link.onlyOnce')} disabled={busy || frozen} onClick={() => setRenewing(true)} data-id="share-renew">
            {t('share.link.new')}
          </button>
        )}
      </span>
      {state === 'revoked' && link?.revokedAt && <span className="share-link-note" data-tone="warn">{t('share.link.revokedAt', { time: shareTime(locale, link.revokedAt, new Date()) })}</span>}
      <div className="share-link-grid">
        <div className="share-link-group">
          <span className="share-link-small" id="share-expiry">
            {t('share.expiry')}
          </span>
          <div role="group" aria-labelledby="share-expiry" className="share-toggles">
            {SHARE_EXPIRIES.map((e) => (
              <button key={e} type="button" aria-pressed={settings.expiry === e} disabled={busy || frozen} onClick={() => change({ expiry: e })} data-id={`share-expiry-${e}`}>
                {t(`share.expiry.${e}`)}
              </button>
            ))}
          </div>
        </div>
        <div className="share-link-group">
          <span className="share-link-small" id="share-access">
            {t('share.access')}
          </span>
          <div role="group" aria-labelledby="share-access" className="share-toggles">
            {SHARE_ACCESS.map((a) => (
              <button key={a} type="button" aria-pressed={settings.access === a} disabled={busy || frozen} onClick={() => change({ access: a })} data-id={`share-access-${a}`}>
                {t(`share.access.${a}`)}
              </button>
            ))}
          </div>
        </div>
      </div>
      {failed && (
        <span className="share-link-note" data-tone="warn" role="alert">
          {t('share.failed', { reason: failed })}
        </span>
      )}
      <div className="share-link-foot">
        <span className="share-fill share-link-summary">{summary}</span>
        {link && !link.revokedAt && (
          <button type="button" className="share-button share-button-warn" disabled={busy} onClick={() => void revoke()} data-id="share-revoke">
            {t('share.revoke')}
          </button>
        )}
      </div>
      <Modal
        open={renewing}
        onClose={() => setRenewing(false)}
        title={t('share.renew.title')}
        description={t('share.renew.text')}
        actions={
          <>
            <Button variant="ghost" onClick={() => setRenewing(false)}>
              {t('share.renew.cancel')}
            </Button>
            <Button
              variant="rim"
              onClick={() => {
                setRenewing(false);
                void make();
              }}
              dataId="share-renew-ok"
            >
              {t('share.renew.ok')}
            </Button>
          </>
        }
      />
    </div>
  );
}

function People({ view, state }: { view: ShareView; state: ShareState }): ReactNode {
  const { t } = useShareText();
  const doc = view.document;
  const linkPerm: ShareMessageKey =
    state === 'locked' ? 'share.perm.notYet' : state === 'paused' ? 'share.perm.paused' : state === 'revoked' || state === 'expired' ? 'share.perm.revoked' : state === 'none' ? 'share.perm.none' : view.link?.access === 'remix' ? 'share.access.remix' : 'share.access.view';
  const everyonePerm: ShareMessageKey = state === 'locked' ? 'share.perm.notYet' : state === 'paused' ? 'share.perm.paused' : 'share.perm.view';
  const initial = (name: string | null): string => Array.from(name?.trim() || '·')[0]?.toLocaleUpperCase() ?? '·';
  const rows: Array<{ key: string; initial: string; name: string; role: string; perm: string; tone: string; off: boolean }> = [
    { key: 'everyone', initial: 'M', name: t('share.people.everyone'), role: t('share.people.everyone.role'), perm: t(everyonePerm), tone: 'cyan', off: everyonePerm !== 'share.perm.view' },
    { key: 'link', initial: 'L', name: t('share.people.link'), role: t('share.people.link.role'), perm: t(linkPerm), tone: 'accent', off: linkPerm.startsWith('share.perm.') },
    ...(view.approverName
      ? [{ key: 'reviewer', initial: initial(view.approverName), name: view.approverName, role: t('share.people.reviewer'), perm: t('share.people.reviewer.perm'), tone: 'success', off: false }]
      : []),
    { key: 'author', initial: initial(doc.authorName), name: doc.authorName ?? t('share.people.author'), role: t('share.people.author'), perm: t('share.people.author.perm'), tone: 'violet', off: false },
  ];
  return (
    <div className="share-rim share-people">
      <h2 className="share-h2">{t('share.people')}</h2>
      {rows.map((row) => (
        <div key={row.key} className="share-person" data-id={`share-person-${row.key}`}>
          <span className="share-person-orb" data-tone={row.tone} aria-hidden="true">
            {row.initial}
          </span>
          <div className="share-fill share-person-text">
            <div className="share-person-name">{row.name}</div>
            <div className="share-person-role">{row.role}</div>
          </div>
          <span className="share-person-perm" data-off={row.off || undefined}>
            {row.perm}
          </span>
        </div>
      ))}
    </div>
  );
}

function History({ view }: { view: ShareView }): ReactNode {
  const { t, locale } = useShareText();
  const now = new Date();
  const firstOpened = view.history.findIndex((line) => line.kind === 'opened');
  return (
    <div className="share-rim share-history">
      <h2 className="share-h2 share-history-title">{t('share.history')}</h2>
      {view.history.length === 0 ? (
        <span className="share-history-empty">{t('share.history.empty')}</span>
      ) : (
        <ol className="share-history-list" data-id="share-history">
          {view.history.map((line, i) => {
            const text = historyText(t, line, now, locale, i === firstOpened ? view.openings7d : null);
            return (
              <li key={`${line.kind}-${line.at}-${i}`} className="share-history-line" data-kind={line.kind}>
                <span className="share-history-track" aria-hidden="true" data-first={i === 0 || undefined} data-last={i === view.history.length - 1 || undefined}>
                  <span className="share-history-dot" />
                </span>
                <span className="share-history-text">
                  <span className="share-history-name">{text.title}</span>
                  <span className="share-history-sub">{text.sub}</span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
