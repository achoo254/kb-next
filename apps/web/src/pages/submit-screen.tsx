/**
 * Sending a text for review (board C06, /d/:id/submit): the four steps while it goes (saved, content ready, Jev's
 * pre-review, into the queue), then "Đã gửi duyệt" or what to fix, and the latest review results of this text from
 * the inbox. The submission starts as the screen opens (C08 "Gửi duyệt" leads here); `?space=&collection=&tags=`
 * place and tag it first (C04). Jev's scores never show here: they are for admins (A01).
 */
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, NETWORK_ERROR } from '../api/api-client';
import { type DocumentView, fetchDocument } from '../api/content-api';
import { type AppNotification, fetchInbox } from '../api/notifications-api';
import { type SubmitRequest, type SubmitResponse, submitForReview } from '../api/review-api';
import { AppShell, SHELL_PATHS } from '../layout/app-shell';
import { noticeAgo, useInboxText } from './inbox-messages';
import { type ReviewNotice, ReviewNoticeCard, type SubmitStep, SubmitFix, SubmitSent, SubmitSteps } from './submit-panels';
import { type SubmitError, type SubmitMessageKey, submitErrorOf, useSubmitText } from './submit-messages';
import type { ScreenTranslate } from './space-messages';
import './submit-screen.css';

type Phase = { kind: 'sending' } | { kind: 'sent'; result: SubmitResponse } | { kind: 'failed'; error: SubmitError };

/** Placement and tags a link to this screen asks for (C04). */
export function submitRequestOf(search: string): SubmitRequest {
  const query = new URLSearchParams(search);
  const space = query.get('space');
  const collection = query.get('collection');
  const tags = query.getAll('tags').filter(Boolean);
  return { ...(space ? { space } : {}), ...(collection ? { collection } : {}), ...(tags.length > 0 ? { tags } : {}) };
}

/** The four steps of a submission in each phase (C06 A). */
export function submitSteps(t: ScreenTranslate<SubmitMessageKey>, phase: Phase, doc: DocumentView | null): { steps: SubmitStep[]; percent: number } {
  const office = doc?.document.type === 'office';
  const extract: SubmitStep = {
    name: office ? t('submit.step.extractOffice') : t('submit.step.extract'),
    sub: office ? t('submit.step.extractOffice.done', { name: doc?.file?.name ?? doc?.document.title ?? '' }) : t('submit.step.extract.done', { count: doc?.chunks.length ?? 0 }),
    state: 'done',
  };
  const save: SubmitStep = { name: t('submit.step.save'), sub: t('submit.step.save.done'), state: 'done' };
  if (phase.kind === 'sent') {
    return {
      percent: 100,
      steps: [
        save,
        extract,
        { name: t('submit.step.jev'), sub: phase.result.preReviewed ? t('submit.step.jev.done') : t('submit.step.jev.off'), state: 'done' },
        { name: t('submit.step.queue'), sub: t('submit.step.queue.done', { n: phase.result.queuePosition }), state: 'done' },
      ],
    };
  }
  if (phase.kind === 'failed') {
    return {
      percent: 50,
      steps: [save, extract, { name: t('submit.step.jev'), sub: t('submit.step.queue.wait'), state: 'wait' }, { name: t('submit.step.queue'), sub: t('submit.step.queue.failed'), state: 'failed' }],
    };
  }
  return {
    percent: 50,
    steps: [save, extract, { name: t('submit.step.jev'), sub: t('submit.step.jev.run'), state: 'run' }, { name: t('submit.step.queue'), sub: t('submit.step.queue.wait'), state: 'wait' }],
  };
}

/** The review results of `documentId` in the inbox, the latest first, as C06's cards. */
export function reviewNotices(
  t: ScreenTranslate<SubmitMessageKey>,
  ago: (iso: string) => string,
  place: string,
  documentId: string,
  notifications: readonly AppNotification[],
): ReviewNotice[] {
  const doc = `/d/${encodeURIComponent(documentId)}`;
  return notifications.flatMap((n): ReviewNotice[] => {
    const p = n.payload;
    if (n.documentId !== documentId || p.kind !== 'review' || p.action === 'submitted') return [];
    const kicker = t('submit.notice.at', { when: ago(n.createdAt) });
    const by = p.by ?? '';
    if (p.action === 'approved') {
      return [{ kind: 'approved', kicker, title: t('submit.notice.approved'), line: t('submit.notice.approvedLine', { by, place }), action: { label: t('submit.notice.share'), href: doc } }];
    }
    const reason = p.reason ?? '';
    return [
      {
        kind: p.action === 'rejected' ? 'rejected' : 'changes',
        kicker,
        title: p.action === 'rejected' ? t('submit.notice.rejected', { reason: reason.slice(0, 40) }) : t('submit.notice.changes', { reason: reason.slice(0, 40) }),
        line: t('submit.notice.reasonLine', { reason, by }),
        action: p.action === 'rejected' ? { label: t('submit.notice.status'), href: SHELL_PATHS.mine } : { label: t('submit.notice.resubmit'), href: `${doc}/edit` },
      },
    ];
  });
}

export function SubmitScreen({ id }: { id: string }): ReactNode {
  const { t, locale } = useSubmitText();
  const inbox = useInboxText();
  const [doc, setDoc] = useState<DocumentView | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'sending' });
  const [retrying, setRetrying] = useState(false);
  const [notices, setNotices] = useState<{ items: AppNotification[]; now: number }>({ items: [], now: 0 });
  const started = useRef(false);

  const send = useCallback(() => {
    setPhase({ kind: 'sending' });
    return submitForReview(id, submitRequestOf(window.location.search)).then(
      (result) => setPhase({ kind: 'sent', result }),
      (error: unknown) => setPhase({ kind: 'failed', error: submitErrorOf(error instanceof ApiError ? error.code : NETWORK_ERROR) }),
    );
  }, [id]);

  useEffect(() => {
    // Once per visit (React's development double run aside): a reload would send it again, and the server says so.
    if (started.current) return;
    started.current = true;
    fetchDocument(id)
      .then(setDoc, () => undefined)
      .finally(() => void send());
    fetchInbox({ kind: 'review' }).then(
      (box) => setNotices({ items: box.notifications, now: Date.now() }),
      () => undefined,
    );
  }, [id, send]);

  const retry = (): void => {
    setRetrying(true);
    void send().finally(() => setRetrying(false));
  };

  const { steps, percent } = submitSteps(t, phase, doc);
  const space = doc ? (locale === 'vi' ? doc.document.space.nameVi : doc.document.space.nameEn) : null;
  const collection = doc?.document.collection ? (locale === 'vi' ? doc.document.collection.nameVi : doc.document.collection.nameEn) : null;
  const place = [space, collection].filter(Boolean).join(' › ');
  const cards = reviewNotices(t, (iso) => noticeAgo(inbox.t, iso, notices.now), place, id, notices.items).slice(0, 2);

  return (
    <AppShell
      screen="C06"
      rail="mine"
      className="submit-shell"
      breadcrumb={[
        { label: 'Universe', href: SHELL_PATHS.universe },
        ...(doc && space ? [{ label: space, href: `/s/${encodeURIComponent(doc.document.space.slug)}` }] : []),
        { label: t('submit.crumb') },
      ]}
    >
      <div className="submit-screen" data-id="submit-screen" data-state={phase.kind}>
        <div className="submit-content">
          <div className="submit-slot submit-slot-a">
            <SubmitSteps steps={steps} percent={percent} />
          </div>
          {phase.kind === 'sent' && (
            <div className="submit-slot submit-slot-b">
              <SubmitSent />
            </div>
          )}
          {phase.kind === 'failed' && (
            <div className="submit-slot submit-slot-b">
              <SubmitFix error={phase.error} documentId={id} onRetry={retry} retrying={retrying} />
            </div>
          )}
          {cards.length > 0 && (
            <section aria-label={t('submit.notices')} className="submit-notices">
              {cards.map((notice) => (
                <ReviewNoticeCard key={`${notice.kind}-${notice.kicker}`} notice={notice} />
              ))}
            </section>
          )}
        </div>
      </div>
    </AppShell>
  );
}
