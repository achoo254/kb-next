/**
 * Publishing a text (board C04, /d/:id/publish): a sheet over the editor with two tabs.
 *
 * Xuất bản: who sees it (only "Riêng tư" or "Gửi duyệt"), its Space and Collection, its original language, its tags
 * (at most 8), and an AI translation into the other language on the author's own key; the card on the right shows
 * how the text will look. "Gửi duyệt" is the only place a submission starts: it shows C06's steps in place (the
 * address becomes /d/:id/submit, which never sends on its own). "Lưu riêng tư" keeps it to the author (C08).
 *
 * Chia sẻ: locked until the text is approved (and shown); then the way to its share link (C18).
 *
 * States: loading, failed (not found, no access, server), the form (a text without a title or body says what to fix
 * and cannot be sent), waiting for review (only "Riêng tư" takes it back), published (read-only, Chia sẻ open),
 * saving, and a save that failed.
 */
import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react';
import { ApiError, NETWORK_ERROR } from '../api/api-client';
import { type DocumentView, type SpaceListItem, fetchDocument, fetchSpaces } from '../api/content-api';
import { type KeysResponse, fetchKeys } from '../api/keys-api';
import { type SubmitRequest, keepPrivate } from '../api/review-api';
import { AppShell, SHELL_PATHS } from '../layout/app-shell';
import { previewPath, sharePagePath, submitPath } from '../layout/shell-paths';
import { CRYSTAL_ART, ORB_ART } from '../ui/art';
import { Icon } from '../ui/icon';
import { ErrorPanel } from './error-screen';
import { PROVIDERS } from './keys-messages';
import { MAX_TAGS, type PublishMessageKey, usePublishText } from './publish-messages';
import { type ReaderFailure, readerLoadError } from './reader-screen';
import { SubmitScreen } from './submit-screen';
import './publish-screen.css';

type Lang = 'vi' | 'en';
type Visibility = 'private' | 'review';
type Tab = 'publish' | 'share';

type Load = { status: 'loading' } | { status: 'failed'; error: ReaderFailure } | { status: 'ready'; view: DocumentView; spaces: SpaceListItem[]; keys: KeysResponse | null };

/** What the form holds. */
export interface PublishChoice {
  visibility: Visibility;
  space: string;
  collection: string | null;
  lang: Lang;
  tags: string[];
  translate: boolean;
}

/** Spaces the text may go to: public ones for review, the author's own Universe too when it stays private. */
export function spacesFor(spaces: readonly SpaceListItem[], visibility: Visibility): SpaceListItem[] {
  return spaces.filter((s) => s.kind === 'public' || visibility === 'private');
}

/** The form as it opens: where the text is now (a public Space for review, else the first public one). */
export function initialChoice(view: DocumentView, spaces: readonly SpaceListItem[]): PublishChoice {
  const doc = view.document;
  const visibility: Visibility = doc.status === 'private' ? 'private' : 'review';
  const current = spaces.find((s) => s.slug === doc.space.slug);
  const space = current && (current.kind === 'public' || visibility === 'private') ? current : (spacesFor(spaces, visibility)[0] ?? current);
  return {
    visibility,
    space: space?.slug ?? doc.space.slug,
    collection: space?.slug === doc.space.slug ? (doc.collection?.id ?? null) : null,
    lang: doc.lang,
    tags: (doc.tags ?? []).slice(0, MAX_TAGS),
    translate: false,
  };
}

/** What stops it being sent (C04's warning): no title, no text. */
export function blockers(view: DocumentView): Array<'noTitle' | 'noBody'> {
  const found: Array<'noTitle' | 'noBody'> = [];
  if (!view.document.title.trim()) found.push('noTitle');
  if (view.document.type !== 'office' && !view.chunks.some((c) => c.markdown.trim())) found.push('noBody');
  return found;
}

/** The request C04 sends (or keeps private with). */
export function requestOf(choice: PublishChoice): SubmitRequest {
  return { space: choice.space, ...(choice.collection ? { collection: choice.collection } : {}), tags: choice.tags, lang: choice.lang };
}

/** Its first paragraph, as plain text (the card's line). */
function firstLine(view: DocumentView): string {
  const text = view.chunks.find((c) => c.markdown.trim())?.markdown ?? '';
  const line = text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/[#*_`>[\]]/g, '').replace(/\(([^)]*)\)/g, '').replace(/\s+/g, ' ').trim())
    .find((p) => p.length > 0);
  return line && line.length > 120 ? `${line.slice(0, 119).trimEnd()}…` : (line ?? '');
}

function spaceName(space: { nameVi: string; nameEn: string }, locale: Lang): string {
  return locale === 'vi' ? space.nameVi : space.nameEn;
}

function useLoad(id: string): Load {
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  useEffect(() => {
    let live = true;
    Promise.all([fetchDocument(id), fetchSpaces(), fetchKeys().catch(() => null)]).then(
      ([view, spaces, keys]) => live && setLoad({ status: 'ready', view, spaces, keys }),
      (error: unknown) => live && setLoad({ status: 'failed', error: readerLoadError(error) }),
    );
    return () => {
      live = false;
    };
  }, [id]);
  return load;
}

export function PublishScreen({ id }: { id: string }): ReactNode {
  const { t } = usePublishText();
  const load = useLoad(id);
  const [sending, setSending] = useState<{ request: SubmitRequest; translateTo?: Lang } | null>(null);

  if (sending) return <SubmitScreen id={id} request={sending.request} translateTo={sending.translateTo} />;

  return (
    <AppShell screen="C04" view="docs" veil="strong" stars={false} docHref={`/d/${encodeURIComponent(id)}`} className="publish-shell">
      <div className="publish-screen" data-id="publish-screen" data-state={load.status}>
        <div className="publish-ghost" aria-hidden="true">
          <div className="publish-ghost-card">
            <div className="publish-ghost-title">{load.status === 'ready' ? load.view.document.title : ''}</div>
            <div className="publish-ghost-line" />
            <div className="publish-ghost-block" />
          </div>
        </div>
        <div className="publish-dim" aria-hidden="true" />
        {load.status === 'loading' && (
          <p className="publish-loading" role="status">
            {t('publish.loading')}
          </p>
        )}
        {load.status === 'failed' && (
          <div className="publish-error">
            <ErrorPanel kind={load.error === 'no-access' || load.error === 'hidden' ? 'forbidden' : load.error === 'not-found' ? 'not-found' : 'server'} />
          </div>
        )}
        {load.status === 'ready' && (
          <PublishSheet
            view={load.view}
            spaces={load.spaces}
            keys={load.keys}
            onSend={(request, translateTo) => {
              // The address of C06 from now on: a reload there shows the text waiting, it never sends again.
              window.history.replaceState(null, '', submitPath(id));
              setSending({ request, translateTo });
            }}
          />
        )}
      </div>
    </AppShell>
  );
}

interface SheetProps {
  view: DocumentView;
  spaces: SpaceListItem[];
  keys: KeysResponse | null;
  onSend(request: SubmitRequest, translateTo?: Lang): void;
}

function PublishSheet({ view, spaces, keys, onSend }: SheetProps): ReactNode {
  const { t } = usePublishText();
  const doc = view.document;
  const published = doc.status === 'approved';
  const [tab, setTab] = useState<Tab>(published ? 'share' : 'publish');
  const [choice, setChoice] = useState<PublishChoice>(() => initialChoice(view, spaces));
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const docHref = `/d/${encodeURIComponent(doc.id)}`;

  const keepIt = (): void => {
    setSaving(true);
    setFailed(null);
    keepPrivate(doc.id, requestOf(choice)).then(
      () => window.location.assign(SHELL_PATHS.mine),
      (error: unknown) => {
        setSaving(false);
        setFailed(error instanceof ApiError && error.code === NETWORK_ERROR ? t('publish.failed.network') : t('publish.failed.other'));
      },
    );
  };

  return (
    <section className="publish-sheet" role="dialog" aria-modal="true" aria-label={t('publish.dialog')} data-id="publish-sheet">
      <div className="publish-main">
        <div className="publish-head">
          <h1 className="publish-title">{t('publish.title')}</h1>
          <div role="tablist" aria-label={t('publish.tabs')} className="publish-tabs">
            {(['publish', 'share'] as const).map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                className="publish-tab"
                onClick={() => setTab(id)}
                data-id={`publish-tab-${id}`}
              >
                <Icon name={id === 'publish' ? 'publish' : 'share-up'} size={16} />
                {t(`publish.tab.${id}`)}
              </button>
            ))}
          </div>
          <span className="publish-fill" />
          <a className="publish-close" href={docHref} aria-label={t('publish.close')}>
            <Icon name="close" size={18} />
          </a>
        </div>
        <Scopes tab={tab} status={doc.status} visibility={choice.visibility} />
        {tab === 'publish' ? (
          <PublishForm
            view={view}
            spaces={spaces}
            keys={keys}
            choice={choice}
            onChange={setChoice}
            saving={saving}
            failed={failed}
            onSend={() => onSend(requestOf(choice), choice.translate ? (choice.lang === 'vi' ? 'en' : 'vi') : undefined)}
            onKeepPrivate={keepIt}
          />
        ) : (
          <ShareTab view={view} onPublish={() => setTab('publish')} />
        )}
      </div>
      <PreviewCard view={view} spaces={spaces} choice={choice} />
    </section>
  );
}

function Scopes({ tab, status, visibility }: { tab: Tab; status: DocumentView['document']['status']; visibility: Visibility }): ReactNode {
  const { t } = usePublishText();
  const published = status === 'approved';
  const on = {
    private: !published && tab === 'publish' && visibility === 'private',
    pending: !published && tab === 'publish' && visibility === 'review',
    public: published || tab === 'share',
  };
  return (
    <div className="publish-scopes" aria-hidden="true">
      {(['private', 'pending', 'public'] as const).map((scope) => (
        <div key={scope} className="publish-scope" data-scope={scope} data-on={on[scope] || undefined}>
          <span className="publish-scope-name">
            <span className="publish-scope-dot" />
            {t(`publish.scope.${scope}`)}
          </span>
          <span className="publish-scope-text">{t(`publish.scope.${scope}.text`)}</span>
        </div>
      ))}
    </div>
  );
}

interface FormProps {
  view: DocumentView;
  spaces: SpaceListItem[];
  keys: KeysResponse | null;
  choice: PublishChoice;
  onChange(choice: PublishChoice): void;
  saving: boolean;
  failed: string | null;
  onSend(): void;
  onKeepPrivate(): void;
}

function PublishForm({ view, spaces, keys, choice, onChange, saving, failed, onSend, onKeepPrivate }: FormProps): ReactNode {
  const { t, locale } = usePublishText();
  const doc = view.document;
  const published = doc.status === 'approved';
  const pending = doc.status === 'pending';
  const problems = blockers(view);
  const options = spacesFor(spaces, choice.visibility);
  const space = spaces.find((s) => s.slug === choice.space);
  const langFixed = view.translations.length > 1;
  const other: Lang = choice.lang === 'vi' ? 'en' : 'vi';
  const key = keys?.available ? keys.active : null;
  const set = (patch: Partial<PublishChoice>): void => onChange({ ...choice, ...patch });

  const pickVisibility = (visibility: Visibility): void => {
    if (published) return;
    // Private goes to the author's own Universe (board C04); for review, a public Space (the current one if it is).
    const personal = spaces.find((s) => s.kind === 'personal');
    const publicOnes = spacesFor(spaces, 'review');
    const next =
      visibility === 'private'
        ? (personal?.slug ?? choice.space)
        : publicOnes.some((s) => s.slug === choice.space)
          ? choice.space
          : (publicOnes[0]?.slug ?? choice.space);
    onChange({ ...choice, visibility, space: next, collection: next === choice.space ? choice.collection : null, translate: visibility === 'private' ? false : choice.translate });
  };

  const note = published ? t('publish.note.approved') : pending && choice.visibility === 'review' ? t('publish.note.pending') : t(`publish.note.${choice.visibility}`);
  const cta: { label: PublishMessageKey; disabled: boolean; run?: () => void; href?: string } = published
    ? { label: 'publish.cta.share', disabled: false, href: sharePagePath(doc.id) }
    : choice.visibility === 'private'
      ? { label: 'publish.cta.private', disabled: saving, run: onKeepPrivate }
      : pending
        ? { label: 'publish.cta.pending', disabled: true }
        : { label: 'publish.cta.review', disabled: problems.length > 0, run: onSend };

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (!cta.disabled) cta.run?.();
  };

  return (
    <form className="publish-form" onSubmit={submit} data-id="publish-form">
      {problems.length > 0 && !published && choice.visibility === 'review' && (
        <div className="publish-alert" role="alert" data-id="publish-blockers">
          <span className="publish-alert-title">{t('publish.err.title', { n: problems.length })}</span>
          {problems.map((p) => (
            <span key={p}>• {t(`publish.err.${p}`)}</span>
          ))}
        </div>
      )}
      {failed && (
        <div className="publish-alert" role="alert" data-id="publish-failed">
          <span className="publish-alert-title">{t('publish.failed', { reason: failed })}</span>
        </div>
      )}
      <fieldset className="publish-who" disabled={published}>
        <legend className="publish-label">{t('publish.who')}</legend>
        <div role="radiogroup" aria-label={t('publish.who')} className="publish-vis">
          {(['private', 'review'] as const).map((v) => (
            <button key={v} type="button" role="radio" aria-checked={choice.visibility === v} className="publish-vis-card" data-vis={v} onClick={() => pickVisibility(v)} data-id={`publish-vis-${v}`}>
              <span className="publish-vis-orb" aria-hidden="true">
                <span className="publish-vis-ball" />
                {v === 'review' && <span className="publish-vis-ring" />}
              </span>
              <span className="publish-vis-text">
                <span className="publish-vis-name">{t(`publish.vis.${v}`)}</span>
                <span className="publish-vis-sub">{t(`publish.vis.${v}.text`)}</span>
              </span>
            </button>
          ))}
        </div>
        <span className="publish-note">{note}</span>
      </fieldset>
      <div className="publish-row3">
        <label className="publish-field">
          <span className="publish-label">{t('publish.space')}</span>
          <span className="publish-hint">&nbsp;</span>
          <select className="publish-select" value={choice.space} disabled={published} onChange={(e) => set({ space: e.target.value, collection: null })} data-id="publish-space">
            {options.map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.kind === 'personal' ? t('publish.space.personal') : t('publish.space.public', { name: spaceName(s, locale) })}
              </option>
            ))}
          </select>
        </label>
        <label className="publish-field">
          <span className="publish-label">{t('publish.collection')}</span>
          <span className="publish-hint">{t('publish.collection.hint')}</span>
          <select className="publish-select" value={choice.collection ?? ''} disabled={published} onChange={(e) => set({ collection: e.target.value || null })} data-id="publish-collection">
            {space?.collections.map((c) => (
              <option key={c.id} value={c.id}>
                {spaceName(c, locale)}
              </option>
            ))}
            <option value="">{t('publish.collection.none')}</option>
          </select>
        </label>
        <div className="publish-field">
          <span className="publish-label" id="publish-lang">
            {t('publish.lang')}
          </span>
          <div role="radiogroup" aria-labelledby="publish-lang" className="publish-langs" title={langFixed ? t('publish.lang.fixed') : undefined}>
            {(['vi', 'en'] as const).map((l) => (
              <button key={l} type="button" role="radio" aria-checked={choice.lang === l} className="publish-lang" disabled={published || langFixed} onClick={() => set({ lang: l })}>
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>
      <Tags tags={choice.tags} disabled={published} onChange={(tags) => set({ tags })} />
      <div className="publish-row2">
        <div className="publish-switch-row">
          <div className="publish-switch-text">
            <div className="publish-switch-name">{t('publish.translate', { lang: other.toUpperCase() })}</div>
            <div className="publish-switch-sub" data-on={choice.translate || undefined}>
              {key
                ? t(choice.translate ? 'publish.translate.on' : 'publish.translate.idle', { provider: PROVIDERS[key.provider].name, last4: key.last4 })
                : t('publish.translate.off')}
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={choice.translate}
            aria-label={t('publish.translate', { lang: other.toUpperCase() })}
            className="publish-switch"
            data-tone="success"
            disabled={!key || published || choice.visibility === 'private'}
            onClick={() => set({ translate: !choice.translate })}
            data-id="publish-translate"
          >
            <span className="publish-switch-knob" />
          </button>
        </div>
        <div className="publish-switch-row">
          <div className="publish-switch-text">
            <div className="publish-switch-name">{t('publish.remix')}</div>
            <div className="publish-switch-sub publish-switch-sub-plain">{t('publish.remix.text')}</div>
          </div>
          <button type="button" role="switch" aria-checked={false} aria-label={t('publish.remix')} className="publish-switch" disabled>
            <span className="publish-switch-knob" />
          </button>
        </div>
      </div>
      <div className="publish-fill" />
      <div className="publish-actions">
        <span className="publish-fill" />
        <a className="publish-link" href={`/d/${encodeURIComponent(doc.id)}/edit`}>
          {t('publish.draft')}
        </a>
        <a className="publish-glass" href={previewPath(doc.id)} data-id="publish-preview">
          {t('publish.preview')}
        </a>
        {cta.href ? (
          <a className="publish-cta" href={cta.href} data-id="publish-cta">
            <Icon name="share-up" size={18} />
            {t(cta.label)}
          </a>
        ) : (
          <button type="submit" className="publish-cta" disabled={cta.disabled} data-id="publish-cta">
            <Icon name={choice.visibility === 'private' ? 'check' : 'publish'} size={18} strokeWidth={2.2} />
            {saving ? t('publish.cta.saving') : t(cta.label)}
          </button>
        )}
      </div>
    </form>
  );
}

/** Tags as typed: trimmed, without repeats, at most MAX_TAGS; Enter or a comma adds one. */
function Tags({ tags, disabled, onChange }: { tags: string[]; disabled: boolean; onChange(tags: string[]): void }): ReactNode {
  const { t } = usePublishText();
  const [draft, setDraft] = useState('');
  const add = (): void => {
    const tag = draft.trim().replace(/,+$/, '').trim().slice(0, 60);
    setDraft('');
    if (!tag || tags.includes(tag) || tags.length >= MAX_TAGS) return;
    onChange([...tags, tag]);
  };
  return (
    <div className="publish-tags-field">
      <span className="publish-label">
        {t('publish.tags')} <span className="publish-label-plain">{t('publish.tags.count', { n: tags.length, max: MAX_TAGS })}</span>
      </span>
      <div className="publish-tags">
        {tags.map((tag) => (
          <span key={tag} className="publish-tag">
            {tag}
            <button type="button" className="publish-tag-remove" aria-label={t('publish.tags.remove', { tag })} disabled={disabled} onClick={() => onChange(tags.filter((x) => x !== tag))}>
              ×
            </button>
          </span>
        ))}
        {tags.length < MAX_TAGS && !disabled && (
          <label className="publish-tag-add">
            <span className="kf-visually-hidden">{t('publish.tags.addLabel')}</span>
            <input
              type="text"
              value={draft}
              placeholder={t('publish.tags.add')}
              maxLength={60}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') {
                  e.preventDefault();
                  add();
                }
              }}
              onBlur={add}
              data-id="publish-tag-input"
            />
          </label>
        )}
      </div>
    </div>
  );
}

function ShareTab({ view, onPublish }: { view: DocumentView; onPublish(): void }): ReactNode {
  const { t } = usePublishText();
  const doc = view.document;
  if (doc.status !== 'approved') {
    return (
      <div className="publish-locked" data-id="publish-share-locked">
        <span className="publish-locked-art" aria-hidden="true">
          <img src={CRYSTAL_ART.docker} alt="" />
        </span>
        <span className="publish-locked-title">{t('publish.share.locked.title')}</span>
        <span className="publish-locked-text">{t('publish.share.locked.text')}</span>
        <div className="publish-locked-actions">
          <button type="button" className="publish-cta publish-cta-sm" onClick={onPublish}>
            {t('publish.share.toPublish')}
          </button>
          <a className="publish-glass publish-glass-sm" href={SHELL_PATHS.mine}>
            {t('publish.share.status')}
          </a>
        </div>
      </div>
    );
  }
  return (
    <div className="publish-share-open" data-id="publish-share-open">
      <span className="publish-label">{t('publish.share.open')}</span>
      <a className="publish-share-row" href={sharePagePath(doc.id)} data-id="publish-share-manage">
        <span className="publish-fill">{t('publish.share.manage')}</span>
        <Icon name="chevron-right" size={18} />
      </a>
    </div>
  );
}

function PreviewCard({ view, spaces, choice }: { view: DocumentView; spaces: SpaceListItem[]; choice: PublishChoice }): ReactNode {
  const { t, locale } = usePublishText();
  const doc = view.document;
  const published = doc.status === 'approved';
  const state: 'private' | 'review' | 'approved' = published ? 'approved' : choice.visibility;
  const space = spaces.find((s) => s.slug === choice.space);
  const collection = space?.collections.find((c) => c.id === choice.collection);
  const place = choice.visibility === 'private' && space?.kind === 'personal' ? t('publish.card.space.private') : [space ? spaceName(space, locale) : '', collection ? spaceName(collection, locale) : ''].filter(Boolean).join(' › ');
  const langName = (l: Lang): string => t(`publish.card.lang.${l}`);
  const other: Lang = choice.lang === 'vi' ? 'en' : 'vi';
  const lang = choice.translate ? t('publish.card.lang.withTranslation', { lang: choice.lang.toUpperCase(), other: other.toUpperCase() }) : langName(choice.lang);
  const line = useMemo(() => firstLine(view), [view]);
  const where: PublishMessageKey = state === 'private' ? 'publish.card.where.private' : 'publish.card.where.review';
  return (
    <aside className="publish-card" aria-label={t('publish.card')} data-id="publish-card" data-state={state}>
      <span className="publish-card-where">{t(where)}</span>
      <div className="publish-card-orb">
        <span className="publish-card-ring" aria-hidden="true" />
        <img src={ORB_ART} alt="" aria-hidden="true" />
      </div>
      <span className="publish-card-badge">
        <span className="publish-card-badge-dot" />
        {t(state === 'approved' ? 'publish.card.badge.approved' : state === 'private' ? 'publish.card.badge.private' : 'publish.card.badge.review')}
      </span>
      <span className="publish-card-title">{doc.title.trim() || t('publish.card.untitled')}</span>
      {line && <span className="publish-card-line">{line}</span>}
      <div className="publish-card-tags">
        {choice.tags.slice(0, 3).map((tag) => (
          <span key={tag} className="publish-card-tag">
            {tag}
          </span>
        ))}
      </div>
      <div className="publish-card-meta">
        <span>{lang}</span>
        <span>·</span>
        <span>{place}</span>
      </div>
      <span className="publish-card-note">{t(state === 'approved' ? 'publish.card.note.approved' : state === 'private' ? 'publish.card.note.private' : 'publish.card.note.review')}</span>
    </aside>
  );
}
