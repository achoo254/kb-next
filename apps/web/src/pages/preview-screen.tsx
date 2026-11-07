/**
 * Previewing a text before publishing it (board C05, /d/:id/preview): as a guest will see it once published, or as
 * its author sees it now; on a desktop, tablet or phone frame. On the left, where it sits in the Universe (in the
 * author's own Universe until published) and the card a chat app shows when its share link is pasted
 * (`ill-doc-planet`, the share page's og:image). "Sửa tiếp" opens the editor, "Đăng" opens C04 (where it goes, then
 * publishing).
 *
 * States: loading, failed (not found, no access, server), and the preview in each role and device.
 */
import { type ReactNode, useEffect, useState } from 'react';
import { type DocumentView, fetchDocument } from '../api/content-api';
import { brand } from '../brand';
import { AppShell, SHELL_PATHS } from '../layout/app-shell';
import { publishPath } from '../layout/shell-paths';
import { CRYSTAL_ART, ILLUSTRATIONS } from '../ui/art';
import { Icon } from '../ui/icon';
import { ErrorPanel } from './error-screen';
import { type PublishMessageKey, usePublishText } from './publish-messages';
import { type ReaderFailure, readerLoadError } from './reader-states';
import './preview-screen.css';

export type PreviewRole = 'guest' | 'me';
export type PreviewDevice = 'desktop' | 'tablet' | 'phone';
const DEVICES: readonly PreviewDevice[] = ['desktop', 'tablet', 'phone'];

type Load = { status: 'loading' } | { status: 'failed'; error: ReaderFailure } | { status: 'ready'; view: DocumentView };

/** The first paragraph of the text as plain words (the card's and the frame's lead line). */
export function leadOf(view: DocumentView): string {
  const text = view.chunks.find((c) => c.markdown.trim())?.markdown ?? '';
  return (
    text
      .split(/\n\s*\n/)
      .map((p) => p.replace(/\[\[|\]\]/g, '').replace(/[#*_`>|]/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\s+/g, ' ').trim())
      .find((p) => p.length > 0 && !/^\d+\./.test(p)) ?? ''
  );
}

/** Its `##` sections, at most four (the frame's step cards). */
export function stepsOf(view: DocumentView): string[] {
  return view.toc.flatMap((entry) => (entry.level === 2 && entry.title ? [entry.title] : [])).slice(0, 4);
}

export function PreviewScreen({ id }: { id: string }): ReactNode {
  const { t, locale } = usePublishText();
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [role, setRole] = useState<PreviewRole>('me');
  const [device, setDevice] = useState<PreviewDevice>('desktop');

  useEffect(() => {
    let live = true;
    fetchDocument(id).then(
      (view) => live && setLoad({ status: 'ready', view }),
      (error: unknown) => live && setLoad({ status: 'failed', error: readerLoadError(error) }),
    );
    return () => {
      live = false;
    };
  }, [id]);

  const doc = load.status === 'ready' ? load.view.document : null;
  const spaceName = doc ? (locale === 'vi' ? doc.space.nameVi : doc.space.nameEn) : '';
  const statusKey: PublishMessageKey = doc?.status === 'approved' ? 'preview.status.approved' : 'preview.status';

  return (
    <AppShell
      screen="C05"
      veil="strong"
      stars={false}
      className="preview-shell"
      docHref={`/d/${encodeURIComponent(id)}`}
      breadcrumb={[
        { label: 'Universe', href: SHELL_PATHS.universe },
        ...(doc ? [{ label: spaceName, href: `/s/${encodeURIComponent(doc.space.slug)}` }] : []),
        { label: t('preview.crumb.drafts'), href: `/d/${encodeURIComponent(id)}/edit` },
        { label: t('preview.crumb') },
      ]}
    >
      <div className="preview-screen" data-id="preview-screen" data-state={load.status} data-role={role} data-device={device}>
        <div className="preview-content">
          <div className="preview-bar">
            <span className="preview-status">
              <span className="preview-status-dot" />
              {t(statusKey)}
            </span>
            <div role="group" aria-label={t('preview.as')} className="preview-switch">
              {(['guest', 'me'] as const).map((r) => (
                <button key={r} type="button" aria-pressed={role === r} onClick={() => setRole(r)} data-id={`preview-as-${r}`}>
                  {t(`preview.as.${r}`)}
                </button>
              ))}
            </div>
            <div role="group" aria-label={t('preview.device')} className="preview-switch">
              {DEVICES.map((d) => (
                <button key={d} type="button" aria-pressed={device === d} onClick={() => setDevice(d)} data-id={`preview-device-${d}`}>
                  <Icon name={`device-${d}`} size={15} />
                  {t(`preview.device.${d}`)}
                </button>
              ))}
            </div>
            <span className="preview-fill" />
            <a className="preview-edit" href={`/d/${encodeURIComponent(id)}/edit`}>
              {t('preview.edit')}
            </a>
            {doc && doc.status !== 'approved' && (
              <a className="preview-submit" href={publishPath(id)} data-id="preview-submit">
                {t('preview.submit')}
              </a>
            )}
          </div>
          {load.status === 'loading' && (
            <p className="preview-loading" role="status">
              {t('publish.loading')}
            </p>
          )}
          {load.status === 'failed' && (
            <div className="preview-error">
              <ErrorPanel kind={load.error === 'no-access' || load.error === 'hidden' ? 'forbidden' : load.error === 'not-found' ? 'not-found' : 'server'} />
            </div>
          )}
          {load.status === 'ready' && <PreviewBody view={load.view} role={role} device={device} />}
        </div>
      </div>
    </AppShell>
  );
}

function PreviewBody({ view, role, device }: { view: DocumentView; role: PreviewRole; device: PreviewDevice }): ReactNode {
  const { t, locale } = usePublishText();
  const doc = view.document;
  const published = doc.status === 'approved';
  const locked = role === 'me' && !published;
  const lead = leadOf(view);
  const steps = stepsOf(view);
  const host = window.location.host;
  const address = `${host}/d/${doc.id}`;
  const space = locale === 'vi' ? doc.space.nameVi : doc.space.nameEn;
  const collection = doc.collection ? (locale === 'vi' ? doc.collection.nameVi : doc.collection.nameEn) : null;
  const place = [space, collection].filter(Boolean).join(' › ');
  return (
    <>
      <section className="preview-side" aria-label={t('preview.universe')}>
        <div className="preview-orbit" data-locked={locked || undefined} data-id="preview-orbit">
          <span className="preview-kicker">{t('preview.universe')}</span>
          <span className="preview-orbit-ring" aria-hidden="true" />
          <img src={CRYSTAL_ART.networking} alt="" aria-hidden="true" className="preview-orbit-crystal" data-n="1" />
          <img src={CRYSTAL_ART.linux} alt="" aria-hidden="true" className="preview-orbit-crystal" data-n="2" />
          <img src={CRYSTAL_ART.docker} alt="" aria-hidden="true" className="preview-orbit-crystal" data-n="3" />
          <div className="preview-orbit-planet">
            <span className="preview-orbit-planet-ring" aria-hidden="true" />
            <img src={ILLUSTRATIONS['doc-planet']} alt="" aria-hidden="true" />
            {locked && <Icon name="lock" size={28} className="preview-orbit-lock" strokeWidth={2.2} />}
          </div>
          <span className="preview-orbit-note">{locked ? t('preview.universe.me') : t('preview.universe.guest', { space })}</span>
        </div>
        <div className="preview-og" data-id="preview-og">
          <span className="preview-kicker">{t('preview.og')}</span>
          <div className="preview-bubble">{t('preview.og.message', { link: address })}</div>
          <div className="preview-og-card">
            <div className="preview-og-art">
              <img src={ILLUSTRATIONS['doc-planet']} alt="" aria-hidden="true" />
              <span className="preview-og-brand">{brand.appName}</span>
            </div>
            <div className="preview-og-text">
              <span className="preview-og-host">{host}</span>
              <span className="preview-og-title">{doc.title}</span>
              {lead && <span className="preview-og-lead">{lead}</span>}
            </div>
          </div>
          <span className="preview-og-note">{published ? t('preview.og.note.approved') : t('preview.og.note.private')}</span>
        </div>
      </section>
      <section className="preview-stage" aria-label={t('preview.device')} data-id="preview-stage">
        <div className="preview-device" data-device={device}>
          {device === 'desktop' && (
            <div className="preview-device-bar" aria-hidden="true">
              <span className="preview-device-dot" data-tone="amber" />
              <span className="preview-device-dot" data-tone="green" />
              <span className="preview-device-url">{address}</span>
            </div>
          )}
          <div className="preview-page">
            <div className="preview-page-meta">
              <span className="preview-page-badge" data-role={locked ? 'me' : 'guest'}>
                {locked ? t('preview.badge.mine') : t('preview.badge.guest')}
              </span>
              <span className="preview-page-place">{t('preview.meta', { place, author: doc.authorName ?? '', minutes: doc.readingMinutes })}</span>
            </div>
            <h2 className="preview-page-title">{doc.title}</h2>
            {lead ? <p className="preview-page-lead">{lead}</p> : <p className="preview-page-lead">{t('preview.empty')}</p>}
            {steps.length > 0 && (
              <div className="preview-page-steps">
                {steps.map((step, i) => (
                  <div key={`${i}-${step}`} className="preview-page-step" data-n={i % 2}>
                    <span className="preview-page-step-k">{Array.from(step)[0]?.toLocaleUpperCase() ?? ''}</span>
                    <span className="preview-page-step-n">{step}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="preview-page-actions" aria-hidden="true">
              <span className="preview-page-chip" data-main="true">
                {locked ? t('preview.page.edit') : t('preview.page.save')}
              </span>
              <span className="preview-page-chip">{locked ? t('preview.submit') : t('preview.page.ask')}</span>
            </div>
            <div className="preview-page-line" data-w="90" />
            <div className="preview-page-line" data-w="76" />
          </div>
        </div>
      </section>
      <span className="preview-device-label">{t(`preview.device.size.${device}`)}</span>
    </>
  );
}
