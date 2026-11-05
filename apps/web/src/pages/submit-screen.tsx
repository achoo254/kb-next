/**
 * Sending a text for review (board C06, /d/:id/submit): the four steps while it goes (saved, content ready, Jev's
 * pre-review, into the queue), then "Đã gửi duyệt" or what to fix, and the latest review results of this text from
 * the inbox. Jev's scores never show here: they are for admins (A01).
 *
 * A submission only ever starts from an explicit action: C04's "Gửi duyệt" renders this screen with its `request`
 * (placement, tags, language) and puts /submit in the address bar. Opening /d/:id/submit itself (a visit, a reload,
 * a link) sends nothing: a text waiting for review shows its "Đã gửi duyệt" state, any other goes to C04.
 */
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, NETWORK_ERROR } from '../api/api-client';
import { type DocumentView, fetchDocument } from '../api/content-api';
import { type AppNotification, fetchInbox } from '../api/notifications-api';
import { type SubmitRequest, type SubmitResponse, submitForReview } from '../api/review-api';
import { AppShell, SHELL_PATHS } from '../layout/app-shell';
import { publishPath } from '../layout/shell-paths';
import { noticeAgo, useInboxText } from './inbox-messages';
import { type ReviewNotice, ReviewNoticeCard, type SubmitStep, SubmitFix, SubmitSent, SubmitSteps } from './submit-panels';
import { type SubmitError, type SubmitMessageKey, submitErrorOf, useSubmitText } from './submit-messages';
import type { ScreenTranslate } from './space-messages';
import './submit-screen.css';

/**
 * `checking`: a visit of /submit, reading the text's status; `sent` without a result: a text already waiting (its
 * place in the queue and Jev's run belong to the submission, not shown again).
 */
type Phase = { kind: 'checking' } | { kind: 'sending' } | { kind: 'sent'; result: SubmitResponse | null } | { kind: 'failed'; error: SubmitError };

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
    const { result } = phase;
    const jev = result === null ? t('submit.step.jev.sent') : result.preReviewed ? t('submit.step.jev.done') : t('submit.step.jev.off');
    const queue = result === null ? t('submit.step.queue.in') : t('submit.step.queue.done', { n: result.queuePosition });
    return {
      percent: 100,
      steps: [save, extract, { name: t('submit.step.jev'), sub: jev, state: 'done' }, { name: t('submit.step.queue'), sub: queue, state: 'done' }],
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

interface SubmitScreenProps {
  id: string;
  /** What C04's "Gửi duyệt" sends; without it the screen only shows where the text stands (see the header). */
  request?: SubmitRequest;
  /** The language C04 asked an AI translation into: offered once it is sent. */
  translateTo?: 'vi' | 'en';
}

export function SubmitScreen({ id, request, translateTo }: SubmitScreenProps): ReactNode {
  const { t, locale } = useSubmitText();
  const inbox = useInboxText();
  const [doc, setDoc] = useState<DocumentView | null>(null);
  const [phase, setPhase] = useState<Phase>(request ? { kind: 'sending' } : { kind: 'checking' });
  const [retrying, setRetrying] = useState(false);
  const [notices, setNotices] = useState<{ items: AppNotification[]; now: number }>({ items: [], now: 0 });
  const started = useRef(false);

  const send = useCallback(
    (what: SubmitRequest) => {
      setPhase({ kind: 'sending' });
      return submitForReview(id, what).then(
        (result) => setPhase({ kind: 'sent', result }),
        (error: unknown) => setPhase({ kind: 'failed', error: submitErrorOf(error instanceof ApiError ? error.code : NETWORK_ERROR) }),
      );
    },
    [id],
  );

  useEffect(() => {
    // Once per mount (React's development double run aside).
    if (started.current) return;
    started.current = true;
    const loaded = fetchDocument(id).then(
      (view) => {
        setDoc(view);
        return view;
      },
      (error: unknown) => {
        if (!request) setPhase({ kind: 'failed', error: submitErrorOf(error instanceof ApiError ? error.code : NETWORK_ERROR) });
        return null;
      },
    );
    if (request) {
      void loaded.finally(() => void send(request));
    } else {
      void loaded.then((view) => {
        if (!view) return;
        if (view.document.status === 'pending') setPhase({ kind: 'sent', result: null });
        // Not waiting: nothing was sent from here. Choosing where it goes and sending it is C04's.
        else window.location.replace(publishPath(id));
      });
    }
    fetchInbox({ kind: 'review' }).then(
      (box) => setNotices({ items: box.notifications, now: Date.now() }),
      () => undefined,
    );
  }, [id, request, send]);

  const retry = request
    ? (): void => {
        setRetrying(true);
        void send(request).finally(() => setRetrying(false));
      }
    : undefined;

  const { steps, percent } = submitSteps(t, phase, doc);
  const translate = translateTo ? { href: `/d/${encodeURIComponent(id)}/translate?to=${translateTo}`, lang: translateTo.toUpperCase() } : undefined;
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
          {phase.kind === 'checking' ? (
            <p className="submit-slot submit-slot-a submit-checking" role="status">
              {t('submit.loading')}
            </p>
          ) : (
            <div className="submit-slot submit-slot-a">
              <SubmitSteps steps={steps} percent={percent} />
            </div>
          )}
          {phase.kind === 'sent' && (
            <div className="submit-slot submit-slot-b">
              <SubmitSent translate={translate} />
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
