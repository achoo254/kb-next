/**
 * Publishing a text (board C06, /d/:id/submit): the three steps while it goes (saved, content ready, published), then
 * "Đã đăng" with the ways on (the text, its share page) or what to fix. Publishing is the author's own choice and the
 * text is public at once (chủ dự án chốt 07/11/2026: no review); a text an admin hid stays hidden, and the card says so.
 *
 * A publication only ever starts from an explicit action: C04's "Đăng công khai" renders this screen with its
 * `request` (placement, tags, language) and puts /submit in the address bar. Opening /d/:id/submit itself (a visit, a
 * reload, a link) publishes nothing: a published text shows its "Đã đăng" state, any other goes to C04.
 */
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, NETWORK_ERROR } from '../api/api-client';
import { type DocumentView, fetchDocument } from '../api/content-api';
import { type PublishRequest, publishDocument } from '../api/review-api';
import { AppShell, SHELL_PATHS } from '../layout/app-shell';
import { useDevice } from '../layout/device';
import { publishPath } from '../layout/shell-paths';
import { type SubmitPhase as Phase, type SubmitStep, SubmitFix, SubmitSent, SubmitSteps } from './submit-panels';
import { type SubmitMessageKey, submitErrorOf, useSubmitText } from './submit-messages';
import type { ScreenTranslate } from './space-messages';
import { SubmitPhone } from './submit-phone';
import './submit-screen.css';
import { navigate } from '../router/navigation';

/** The three steps of a publication in each phase (C06 A). */
export function submitSteps(t: ScreenTranslate<SubmitMessageKey>, phase: Phase, doc: DocumentView | null): { steps: SubmitStep[]; percent: number } {
  const office = doc?.document.type === 'office';
  const extract: SubmitStep = {
    name: office ? t('submit.step.extractOffice') : t('submit.step.extract'),
    sub: office ? t('submit.step.extractOffice.done', { name: doc?.file?.name ?? doc?.document.title ?? '' }) : t('submit.step.extract.done', { count: doc?.chunks.length ?? 0 }),
    state: 'done',
  };
  const save: SubmitStep = { name: t('submit.step.save'), sub: t('submit.step.save.done'), state: 'done' };
  const name = t('submit.step.publish');
  if (phase.kind === 'sent') {
    const sub = phase.result?.hidden ? t('submit.step.publish.hidden') : t('submit.step.publish.done');
    return { percent: 100, steps: [save, extract, { name, sub, state: 'done' }] };
  }
  if (phase.kind === 'failed') {
    return { percent: 67, steps: [save, extract, { name, sub: t('submit.step.publish.failed'), state: 'failed' }] };
  }
  return { percent: 67, steps: [save, extract, { name, sub: t('submit.step.publish.run'), state: 'run' }] };
}

interface SubmitScreenProps {
  id: string;
  /** What C04's "Đăng công khai" publishes with; without it the screen only shows where the text stands (header). */
  request?: PublishRequest;
  /** The language C04 asked an AI translation into: offered once it is published. */
  translateTo?: 'vi' | 'en';
}

export function SubmitScreen({ id, request, translateTo }: SubmitScreenProps): ReactNode {
  const { t, locale } = useSubmitText();
  const device = useDevice();
  const [doc, setDoc] = useState<DocumentView | null>(null);
  const [phase, setPhase] = useState<Phase>(request ? { kind: 'sending' } : { kind: 'checking' });
  const [retrying, setRetrying] = useState(false);
  const started = useRef(false);

  const send = useCallback(
    (what: PublishRequest) => {
      setPhase({ kind: 'sending' });
      return publishDocument(id, what).then(
        (result) => setPhase({ kind: 'sent', result }),
        (error: unknown) => {
          const code = error instanceof ApiError ? error.code : NETWORK_ERROR;
          // Published already (another tab, a double click): its published state, not an error.
          if (code === 'already-published') setPhase({ kind: 'sent', result: null });
          else setPhase({ kind: 'failed', error: submitErrorOf(code) });
        },
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
        if (view.document.status === 'approved') setPhase({ kind: 'sent', result: null });
        // Not published: nothing was published from here. Choosing where it goes and publishing it is C04's.
        else navigate(publishPath(id), { replace: true });
      });
    }
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
  const hidden = phase.kind === 'sent' && phase.result?.hidden === true;

  if (device === 'phone') {
    return <SubmitPhone id={id} phase={phase} steps={steps} retry={retry} retrying={retrying} translate={translate} hidden={hidden} />;
  }

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
              <SubmitSent documentId={id} hidden={hidden} translate={translate} />
            </div>
          )}
          {phase.kind === 'failed' && (
            <div className="submit-slot submit-slot-b">
              <SubmitFix error={phase.error} documentId={id} onRetry={retry} retrying={retrying} />
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
