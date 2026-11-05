/**
 * The review queue (board A01, /admin): the texts waiting, filtered by kind; the picked one as a reader would see it
 * (its outline and sources); Jev's pre-review (hints only); and the verdict: approve, request changes or reject with
 * a reason the author reads. Keys: J/K move, A approves, R opens the rejection, E the request for changes.
 */
import { type CSSProperties, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError } from '../api/api-client';
import { type DocumentView, fetchDocument } from '../api/content-api';
import { type ReviewDecision, type ReviewQueueItem, decideReview, fetchReviewQueue } from '../api/review-api';
import { AppShell, SHELL_PATHS } from '../layout/app-shell';
import { useStaffRole } from '../layout/staff-role';
import { ILLUSTRATIONS } from '../ui/art';
import { Button } from '../ui/button';
import { Icon } from '../ui/icon';
import { Loader } from '../ui/loader';
import { Toast } from '../ui/toast';
import { type AdminMessageKey, queueAgo, scoreText, useAdminText } from './admin-messages';
import type { ScreenTranslate } from './space-messages';
import './admin-screens.css';

const FILTERS = ['all', 'note', 'office', 'journey'] as const;
type Filter = (typeof FILTERS)[number];
const REASONS = ['duplicate', 'offTopic', 'noSources', 'other'] as const;
type Reason = (typeof REASONS)[number];
type FormKind = 'changes' | 'reject';

/** `now`: when the queue came, the "5 phút trước" of its texts. */
type Load = { state: 'loading' } | { state: 'failed' } | { state: 'ready'; items: ReviewQueueItem[]; now: number };

function matches(filter: Filter, item: ReviewQueueItem): boolean {
  if (filter === 'all') return true;
  if (filter === 'note') return item.type === 'note' || item.type === 'process' || item.type === 'lab';
  return item.type === filter;
}

/** The first sentence of a Markdown passage, without its marks. */
export function firstSentence(markdown: string, max = 80): string {
  const plain = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*_`[\]()|-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const sentence = /^(.+?[.!?])(\s|$)/.exec(plain)?.[1] ?? plain;
  return sentence.length > max ? `${sentence.slice(0, max - 1).trimEnd()}…` : sentence;
}

/** The text as A01 shows it: its lead, its first three sections as cards, the rest, and its sources. */
export function outlineOf(view: DocumentView): { lead: string; blocks: Array<{ key: string; text: string }>; rest: string; sources: Array<{ mark: string; name: string; note: 'inStore' | 'web' }> } {
  const [first, ...others] = view.chunks;
  const overview = first && first.heading === null ? first : null;
  const sections = overview ? others : view.chunks;
  const blocks = sections.slice(0, 3).map((c) => ({ key: c.heading ?? '', text: firstSentence(c.markdown, 40).replace(/\.$/, '') }));
  const rest = sections
    .slice(3)
    .map((c) => firstSentence(c.markdown, 200))
    .join(' ');
  const sources: Array<{ mark: string; name: string; note: 'inStore' | 'web' }> = view.outgoing.map((link) => ({
    mark: (link.document.type === 'lab' ? 'L' : (Array.from(link.document.title)[0] ?? '·')).toLocaleUpperCase(),
    name: link.document.title,
    note: 'inStore',
  }));
  if (view.document.sourceUrl) sources.push({ mark: 'W', name: view.document.sourceUrl, note: 'web' });
  if (view.file) sources.unshift({ mark: view.file.kind.charAt(0).toUpperCase(), name: view.file.name, note: 'inStore' });
  return { lead: overview ? firstSentence(overview.markdown) : '', blocks, rest, sources };
}

/** The four checks of A01, each 0–1: for the first two higher is better, for the last two lower is. */
function checksOf(t: ScreenTranslate<AdminMessageKey>, item: ReviewQueueItem): Array<{ key: string; name: string; hint: string; value: number | null; bad: boolean; low: boolean }> {
  const p = item.preReview;
  const rows: Array<[string, AdminMessageKey, AdminMessageKey, number | null, boolean]> = [
    ['onTopic', 'review.check.onTopic', 'review.check.onTopic.hint', p?.onTopic ?? null, false],
    ['hasSources', 'review.check.hasSources', 'review.check.hasSources.hint', p?.hasSources ?? null, false],
    ['duplicate', 'review.check.duplicate', 'review.check.duplicate.hint', p?.duplicate ?? null, true],
    ['inappropriate', 'review.check.inappropriate', 'review.check.inappropriate.hint', p?.inappropriate ?? null, true],
  ];
  return rows.map(([key, name, hint, value, low]) => ({
    key,
    name: t(name),
    hint: key === 'duplicate' && p?.duplicateOf && value !== null && value > 0.5 ? t('review.check.duplicate.of', { title: p.duplicateOf.title }) : t(hint),
    value,
    low,
    bad: value !== null && (low ? value > 0.5 : value < 0.5),
  }));
}

export function AdminReviewScreen(): ReactNode {
  const { t, locale } = useAdminText();
  const staffRole = useStaffRole();
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [filter, setFilter] = useState<Filter>('all');
  const [picked, setPicked] = useState<string | null>(null);
  const [doc, setDoc] = useState<DocumentView | null>(null);
  const [form, setForm] = useState<FormKind | null>(null);
  const [reason, setReason] = useState<Reason>('noSources');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ tone: 'success' | 'warn' | 'error'; message: string } | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    fetchReviewQueue().then(
      (items) => {
        if (live) setLoad({ state: 'ready', items, now: Date.now() });
      },
      () => {
        if (live) setLoad({ state: 'failed' });
      },
    );
    return () => {
      live = false;
    };
  }, [attempt]);

  const items = useMemo(() => (load.state === 'ready' ? load.items.filter((i) => matches(filter, i)) : []), [load, filter]);
  const current = items.find((i) => i.id === picked) ?? items[0] ?? null;
  const currentId = current?.id ?? null;
  const now = load.state === 'ready' ? load.now : 0;

  useEffect(() => {
    if (!currentId) return;
    let live = true;
    fetchDocument(currentId).then(
      (view) => {
        if (live) setDoc(view);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [currentId]);

  const move = useCallback(
    (step: number) => {
      if (items.length === 0) return;
      const at = Math.max(0, items.findIndex((i) => i.id === current?.id));
      const next = items[Math.min(items.length - 1, Math.max(0, at + step))];
      if (next) {
        setPicked(next.id);
        setForm(null);
      }
    },
    [items, current?.id],
  );

  const decide = useCallback(
    (decision: ReviewDecision) => {
      if (!current || busy) return;
      const message = note.trim();
      const why = decision === 'approved' ? undefined : [t(`review.reason.${reason}`), message].filter(Boolean).join(': ');
      setBusy(true);
      decideReview(current.id, decision, why)
        .then(
          () => {
            const done: AdminMessageKey = decision === 'approved' ? 'review.done.approved' : decision === 'rejected' ? 'review.done.rejected' : 'review.done.changes';
            setToast({ tone: decision === 'approved' ? 'success' : 'warn', message: t(done, { title: current.title }) });
            return true;
          },
          (error: unknown) => {
            const gone = error instanceof ApiError && (error.code === 'not-pending' || error.code === 'not-found');
            const own = error instanceof ApiError && error.code === 'own-text';
            setToast({ tone: 'error', message: own ? t('review.done.ownText') : gone ? t('review.done.gone') : t('review.done.failed') });
            return gone;
          },
        )
        .then((leave) => {
          if (!leave) return;
          const index = items.findIndex((i) => i.id === current.id);
          setLoad((l) => (l.state === 'ready' ? { ...l, items: l.items.filter((i) => i.id !== current.id) } : l));
          setPicked(items[index + 1]?.id ?? items[index - 1]?.id ?? null);
          setForm(null);
          setNote('');
        })
        .finally(() => setBusy(false));
    },
    [current, busy, note, reason, items, t],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === 'j') move(1);
      else if (key === 'k') move(-1);
      else if (key === 'a') decide('approved');
      else if (key === 'r') setForm('reject');
      else if (key === 'e') setForm('changes');
      else if (key === 'escape') setForm(null);
      else return;
      event.preventDefault();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [move, decide]);

  const outline = doc && current && doc.document.id === current.id ? outlineOf(doc) : null;
  const typeKey = (type: ReviewQueueItem['type']): AdminMessageKey => `admin.type.${type}`;

  return (
    <AppShell screen="A01" rail="review" admin veil="strong" topExtra={<span className="admin-keys">{t('review.keys')}</span>} className="admin-shell">
      <div className="admin-screen" data-id="admin-review" data-state={load.state}>
        <section aria-label={t('review.queue')} className="admin-glass a01-queue">
          <div className="a01-queue-head">
            <span className="a01-queue-title">{t('review.queue')}</span>
            <span className="a01-count" data-id="review-count">
              {t('review.waiting', { count: items.length })}
            </span>
          </div>
          <div role="group" aria-label={t('review.filter')} className="a01-filters">
            {FILTERS.map((f) => (
              <button key={f} type="button" aria-pressed={filter === f} className="admin-chip a01-filter" onClick={() => setFilter(f)}>
                {t(`review.filter.${f}`)}
              </button>
            ))}
          </div>
          {load.state === 'loading' && <Loader variant="spinner" label={t('admin.loading')} />}
          {load.state === 'failed' && (
            <div className="admin-failed" role="alert">
              {t('admin.failed')}
              <Button variant="glass" size="md" onClick={() => setAttempt((n) => n + 1)}>
                {t('admin.retry')}
              </Button>
            </div>
          )}
          <div className="a01-list">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                className="a01-item"
                aria-current={item.id === current?.id || undefined}
                onClick={() => {
                  setPicked(item.id);
                  setForm(null);
                }}
                style={{ '--planet-hi': item.space.tint, '--planet': item.space.glow } as CSSProperties}
                data-id={`review-item-${item.id}`}
              >
                <span className="a01-planet" aria-hidden="true" />
                <span className="a01-item-text">
                  <span className="a01-item-title">{item.title}</span>
                  <span className="a01-item-meta">
                    <span className="a01-author">{(Array.from(item.authorName ?? '·')[0] ?? '·').toLocaleUpperCase()}</span>
                    {t(typeKey(item.type))} · {queueAgo(locale, item.submittedAt, now)}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>

        {load.state === 'ready' && !current && (
          <div className="a01-empty" data-id="review-empty">
            <span className="a01-empty-orb" aria-hidden="true" />
            <span className="a01-empty-title">{t('review.empty.title')}</span>
            <span className="a01-empty-text">{t('review.empty.text')}</span>
            {/* Published texts (A02) are for admins: a reviewer has nowhere to go from here. */}
            {staffRole === 'admin' && (
              <Button variant="rim" size="xl" href={SHELL_PATHS.adminContent}>
                {t('review.empty.action')}
              </Button>
            )}
          </div>
        )}

        {current && (
          <>
            <article className="admin-glass a01-doc" key={current.id} data-id="review-doc">
              <div className="a01-chips">
                <span className="a01-chip-pending">{t('review.pending')}</span>
                <span className="a01-chip-origin">{t(`review.origin.${current.origin}`)}</span>
                <a href={`/d/${encodeURIComponent(current.id)}`} className="a01-reader-link">
                  {t('review.asReader')}
                </a>
                <span>·</span>
                <span>{t('review.sentBy', { author: current.authorName ?? t('review.someone'), when: queueAgo(locale, current.submittedAt, now) })}</span>
              </div>
              <div className="a01-hero">
                <span className="a01-hero-art" aria-hidden="true" style={{ '--planet': current.space.glow } as CSSProperties}>
                  <img src={ILLUSTRATIONS['doc-planet']} alt="" />
                  <span className="a01-hero-ring" />
                </span>
                <div className="a01-hero-text">
                  <span className="a01-hero-kind">
                    {t(typeKey(current.type))} · {current.lang.toUpperCase()}
                  </span>
                  <h1 className="a01-hero-title">{current.title}</h1>
                  {outline?.lead && <span className="a01-hero-lead">{outline.lead}</span>}
                </div>
              </div>
              {outline && outline.blocks.length > 0 && (
                <div className="a01-blocks">
                  {outline.blocks.map((block, i) => (
                    <div key={`${i}-${block.key}`} className="a01-block" data-n={i}>
                      <span className="a01-block-key">{block.key}</span>
                      <span className="a01-block-text">{block.text}</span>
                    </div>
                  ))}
                </div>
              )}
              {outline?.rest && <p className="a01-rest">{outline.rest}</p>}
              <div className="a01-sources">
                <span className="a01-label">{t('review.sources')}</span>
                {outline && outline.sources.length === 0 && <span className="a01-none">{t('review.source.none')}</span>}
                {outline?.sources.slice(0, 3).map((source) => (
                  <div key={source.name} className="a01-source">
                    <span className="a01-source-mark">{source.mark}</span>
                    <span className="a01-source-name">{source.name}</span>
                    <span className="a01-source-note">{t(`review.source.${source.note}`)}</span>
                  </div>
                ))}
              </div>
            </article>

            <aside aria-label={t('review.jev')} className="admin-glass a01-side" data-id="review-jev">
              <div className="a01-jev-head">
                <span className="a01-jev-orb" aria-hidden="true" />
                <div>
                  <div className="a01-jev-title">{t('review.jev')}</div>
                  <div className="a01-jev-lead">{t('review.jev.lead')}</div>
                </div>
              </div>
              {current.preReview === null && <p className="a01-jev-off">{t('review.jev.off')}</p>}
              {current.preReview !== null &&
                checksOf(t, current).map((check) => (
                  <div key={check.key} className="a01-check" data-bad={check.bad || undefined} data-low={check.low || undefined}>
                    <div className="a01-check-row">
                      <span className="a01-check-name">{check.name}</span>
                      <span className="a01-check-value">{check.value === null ? t('review.check.none') : scoreText(locale, check.value)}</span>
                    </div>
                    <div className="a01-check-track">
                      <div className="a01-check-bar" style={{ width: `${Math.round((check.value ?? 0) * 100)}%` }} />
                    </div>
                    <span className="a01-check-hint">{check.hint}</span>
                  </div>
                ))}
              <div className="a01-place">
                <span className="a01-label">{t('review.place')}</span>
                <span className="a01-place-name">{[locale === 'vi' ? current.space.nameVi : current.space.nameEn, current.collection ? (locale === 'vi' ? current.collection.nameVi : current.collection.nameEn) : null].filter(Boolean).join(' › ')}</span>
                {current.tags.length > 0 && (
                  <div className="a01-tags">
                    {current.tags.map((tag) => (
                      <span key={tag} className="admin-tag">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="admin-fill" />
              {form && (
                <div className="a01-form" data-kind={form} data-id="review-form">
                  <span className="a01-form-title">{form === 'reject' ? t('review.form.reject') : t('review.form.changes')}</span>
                  <div role="group" aria-label={t('review.form.reasons')} className="a01-reasons">
                    {REASONS.map((r) => (
                      <button key={r} type="button" aria-pressed={reason === r} className="a01-reason" onClick={() => setReason(r)}>
                        {t(`review.reason.${r}`)}
                      </button>
                    ))}
                  </div>
                  <label className="a01-note">
                    {t('review.form.note')}
                    <textarea rows={2} value={note} maxLength={900} placeholder={t('review.form.placeholder')} onChange={(e) => setNote(e.target.value)} />
                  </label>
                  <div className="a01-form-actions">
                    <button type="button" className="a01-cancel" onClick={() => setForm(null)}>
                      {t('review.form.cancel')}
                    </button>
                    <button type="button" className="a01-confirm" disabled={busy} onClick={() => decide(form === 'reject' ? 'rejected' : 'changes_requested')} data-id="review-confirm">
                      {form === 'reject' ? t('review.form.sendReject') : t('review.form.sendChanges')}
                    </button>
                  </div>
                </div>
              )}
              <button type="button" className="a01-approve" disabled={busy} onClick={() => decide('approved')} data-id="review-approve">
                <Icon name="check" size={18} />
                {t('review.approve')}
              </button>
              <div className="a01-second">
                <button type="button" className="a01-changes" onClick={() => setForm('changes')} data-id="review-changes">
                  {t('review.changes')}
                </button>
                <button type="button" className="a01-reject" onClick={() => setForm('reject')} data-id="review-reject">
                  {t('review.reject')}
                </button>
              </div>
            </aside>
          </>
        )}
        {toast && <Toast tone={toast.tone} message={toast.message} onClose={() => setToast(null)} className="admin-toast" dataId="review-toast" />}
      </div>
    </AppShell>
  );
}
