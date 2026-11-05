/**
 * The inbox (board C20): the account's notifications by tab (all, mentions, comments, review, alerts) with their
 * unread counts, "unread only", mark one or all read, and the picked one in full with what to do from it. Opening a
 * notification marks it read; the bell's count follows.
 */
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { type AppNotification, fetchInbox, markAllNotificationsRead, markNotificationRead } from '../api/notifications-api';
import { AppShell, SHELL_PATHS } from '../layout/app-shell';
import { useUnread } from '../layout/unread-context';
import { ILLUSTRATIONS } from '../ui/art';
import { Button } from '../ui/button';
import { Icon } from '../ui/icon';
import { Loader } from '../ui/loader';
import { INBOX_TABS, type InboxTab, noticeAgo, noticeView, tabOf, useInboxText } from './inbox-messages';
import './inbox-screen.css';

/** `now`: when the list came, the "5 phút trước" of its rows. */
type Load = { state: 'loading' } | { state: 'failed' } | { state: 'ready'; items: AppNotification[]; now: number };

export function InboxScreen(): ReactNode {
  const { t, locale } = useInboxText();
  const setUnread = useUnread().set;
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [tab, setTab] = useState<InboxTab>('all');
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    fetchInbox().then(
      (inbox) => {
        if (!live) return;
        setLoad({ state: 'ready', items: inbox.notifications, now: Date.now() });
        setPicked((current) => current ?? inbox.notifications[0]?.id ?? null);
      },
      () => {
        if (live) setLoad({ state: 'failed' });
      },
    );
    return () => {
      live = false;
    };
  }, [attempt]);

  const items = useMemo(() => (load.state === 'ready' ? load.items : []), [load]);
  const now = load.state === 'ready' ? load.now : 0;
  const unreadCount = items.filter((n) => n.readAt === null).length;
  useEffect(() => {
    if (load.state === 'ready') setUnread(unreadCount);
  }, [load.state, unreadCount, setUnread]);

  const setRead = useCallback((ids: readonly string[], read: boolean) => {
    const at = new Date().toISOString();
    setLoad((current) => (current.state === 'ready' ? { ...current, items: current.items.map((n) => (ids.includes(n.id) ? { ...n, readAt: read ? at : null } : n)) } : current));
  }, []);

  const markOne = (n: AppNotification, read: boolean): void => {
    setRead([n.id], read);
    markNotificationRead(n.id, read).catch(() => setRead([n.id], !read));
  };

  const open = (n: AppNotification): void => {
    setPicked(n.id);
    if (n.readAt === null) markOne(n, true);
  };

  const readAll = (): void => {
    const ids = items.filter((n) => n.readAt === null).map((n) => n.id);
    setRead(ids, true);
    setOnlyUnread(true);
    markAllNotificationsRead().catch(() => setRead(ids, false));
  };

  const counts = useMemo(() => {
    const c: Record<InboxTab, number> = { all: 0, mention: 0, comment: 0, review: 0, warn: 0 };
    for (const n of items) {
      if (n.readAt !== null) continue;
      c.all += 1;
      c[tabOf(n)] += 1;
    }
    return c;
  }, [items]);

  const shown = items.filter((n) => (tab === 'all' || tabOf(n) === tab) && (!onlyUnread || n.readAt === null));
  const selected = shown.find((n) => n.id === picked) ?? null;
  const selectedView = selected ? noticeView(t, locale, selected) : null;

  return (
    <AppShell screen="C20" veil="strong" className="inbox-shell" breadcrumb={[{ label: 'Universe', href: SHELL_PATHS.universe }, { label: t('inbox.title') }]}>
      <div className="inbox-screen" data-id="inbox-screen" data-state={load.state}>
        <div className="inbox-head">
          <h1 className="inbox-title">{t('inbox.title')}</h1>
          <span className="inbox-count" data-id="inbox-count">
            {t('inbox.unread', { count: counts.all })}
          </span>
          <span className="inbox-fill" />
          <button type="button" role="switch" aria-checked={onlyUnread} className="inbox-only" onClick={() => setOnlyUnread((v) => !v)} data-id="inbox-only">
            <span className="inbox-only-track">
              <span className="inbox-only-knob" />
            </span>
            {t('inbox.onlyUnread')}
          </button>
          <Button variant="rim" size="lg" className="inbox-read-all" onClick={readAll} disabled={counts.all === 0} dataId="inbox-read-all">
            {t('inbox.readAll')}
          </Button>
        </div>

        <div role="tablist" aria-label={t('inbox.tabs')} className="inbox-tabs">
          {INBOX_TABS.map((id) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} className="inbox-tab" onClick={() => setTab(id)} data-id={`inbox-tab-${id}`}>
              {t(`inbox.tab.${id}`)}
              {counts[id] > 0 && (
                <>
                  {' '}
                  <span className="inbox-tab-count">{counts[id]}</span>
                </>
              )}
            </button>
          ))}
        </div>

        <section aria-label={t('inbox.list')} className="inbox-list" data-id="inbox-list">
          {load.state === 'loading' && (
            <div className="inbox-center">
              <Loader variant="spinner" label={t('inbox.loading')} />
            </div>
          )}
          {load.state === 'failed' && (
            <div className="inbox-center" role="alert" data-id="inbox-failed">
              <span>{t('inbox.failed')}</span>
              <Button variant="glass" size="lg" onClick={() => setAttempt((n) => n + 1)}>
                {t('inbox.retry')}
              </Button>
            </div>
          )}
          {load.state === 'ready' && shown.length === 0 && (
            <div className="inbox-center inbox-empty" data-id="inbox-empty">
              <span className="inbox-empty-art" aria-hidden="true">
                <span className="inbox-empty-ring" />
                <img src={ILLUSTRATIONS['telescope-empty']} alt="" />
              </span>
              <span className="inbox-empty-title">{t('inbox.empty.title')}</span>
              <span className="inbox-empty-text">{t('inbox.empty.text')}</span>
              <Button variant="glass" size="lg" href={SHELL_PATHS.universe}>
                {t('inbox.empty.home')}
              </Button>
            </div>
          )}
          {shown.map((n) => {
            const view = noticeView(t, locale, n);
            const read = n.readAt !== null;
            return (
              <div key={n.id} className="inbox-row" data-selected={n.id === selected?.id || undefined} data-read={read || undefined} data-id={`inbox-row-${n.id}`}>
                <button type="button" className="inbox-row-open" onClick={() => open(n)}>
                  <span className="inbox-orb" data-tone={view.tone}>
                    <Icon name={view.icon} size={18} />
                  </span>
                  <span className="inbox-row-text">
                    <span className="inbox-row-title">{view.title}</span>
                    <span className="inbox-row-meta">
                      {view.kindLabel} · {noticeAgo(t, n.createdAt, now)}
                    </span>
                  </span>
                  {!read && <span className="inbox-dot" role="img" aria-label={t('inbox.unreadDot')} />}
                </button>
                <button type="button" className="inbox-toggle" aria-label={read ? t('inbox.markUnread') : t('inbox.markRead')} title={read ? t('inbox.markUnread') : t('inbox.markRead')} onClick={() => markOne(n, !read)}>
                  <Icon name={read ? 'mark-unread' : 'mark-read'} size={16} />
                </button>
              </div>
            );
          })}
        </section>

        <section aria-label={t('inbox.preview')} className="inbox-preview" data-id="inbox-preview">
          {selected && selectedView ? (
            <div className="inbox-detail" key={selected.id}>
              <div className="inbox-detail-head">
                <span className="inbox-orb inbox-orb-big" data-tone={selectedView.tone}>
                  <Icon name={selectedView.icon} size={24} />
                </span>
                <div className="inbox-detail-heading">
                  <div className="inbox-detail-kind">
                    {selectedView.kindLabel} · {noticeAgo(t, selected.createdAt, now)}
                  </div>
                  <h2 className="inbox-detail-title">{selectedView.title}</h2>
                </div>
              </div>
              {selectedView.body && <div className="inbox-detail-body">{selectedView.body}</div>}
              <div className="inbox-detail-meta">
                <span className="inbox-avatar">
                  {selectedView.initial}
                </span>
                {selectedView.meta}
              </div>
              <span className="inbox-fill" />
              <div className="inbox-detail-actions">
                {selectedView.actions.map((action) => (
                  <Button key={action.label} variant={action.primary ? 'rim' : 'glass'} size="xxl" href={action.href} className="inbox-action">
                    {action.label}
                  </Button>
                ))}
                <span className="inbox-fill" />
                <Button variant="glass" size="xxl" className="inbox-action inbox-action-toggle" onClick={() => markOne(selected, selected.readAt === null)} dataId="inbox-detail-toggle">
                  {selected.readAt === null ? t('inbox.markRead') : t('inbox.markUnread')}
                </Button>
              </div>
            </div>
          ) : (
            load.state === 'ready' && shown.length > 0 && <div className="inbox-center inbox-pick">{t('inbox.pick')}</div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
