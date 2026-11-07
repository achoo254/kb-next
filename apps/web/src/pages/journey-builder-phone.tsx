/**
 * The journey builder on a phone (/journey/new and /journey/:id/edit up to 640px; no phone board, drawn from C07 with
 * the phone kit of M02/M03): a top bar (back, the journey's Space, the autosave chip, "Xuất bản" to the phone publish,
 * M03), the journey's name and total, its steps as cards moved with up/down buttons, and "Thêm bước" at the bottom.
 * Adding a step (search over the documents, Jev's next steps) and editing one (title, kind, minutes, source or note,
 * remove) happen in sheets. The working state and autosave are the desktop builder's (journey-builder-state.ts).
 */
import { type ReactNode, useId, useState } from 'react';
import { type Journey, MAX_STEPS, type NextStep, type PoolDocument } from '../api/journey-api';
import { PhoneShell } from '../layout/phone-shell';
import { PhoneSheet } from '../layout/phone-sheet';
import { SHELL_PATHS, journeyPath, publishPath } from '../layout/shell-paths';
import { ILLUSTRATIONS } from '../ui/art';
import { Icon } from '../ui/icon';
import { type JourneyBuilder, type PoolLoad, SAVE_LABEL, saveStatusLine } from './journey-builder-state';
import { totalMinutes } from './journey-model';
import { type JourneyMessageKey, useJourneyText } from './journey-messages';
import { KIND_LOOK, StepFields, type SuggestionsLoad, kindOfDocument, sourceOf } from './journey-panels';
import { relevanceText } from './space-labels';
import type { ScreenTranslate } from './space-messages';
import { spaceName, tintStyle } from './space-panels';
import type { Locale } from '../i18n/i18n';
import './journey-builder-phone.css';

type T = ScreenTranslate<JourneyMessageKey>;

/** Text folded for a search: lower case, without Vietnamese marks ("Định tuyến" finds "dinh"). */
export function foldForSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase();
}

/** The documents whose title holds every word of `query` (all of them for an empty query). */
export function matchingDocuments<D extends Pick<PoolDocument, 'title'>>(documents: readonly D[], query: string): D[] {
  const words = foldForSearch(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...documents];
  return documents.filter((doc) => {
    const title = foldForSearch(doc.title);
    return words.every((word) => title.includes(word));
  });
}

interface AddSheetProps {
  t: T;
  locale: Locale;
  builder: JourneyBuilder;
  onClose(): void;
}

/** "Thêm bước": a search over the documents, Jev's next steps (when this server has Jev) and the documents to pick. */
function AddSheet({ t, locale, builder, onClose }: AddSheetProps): ReactNode {
  const [query, setQuery] = useState('');
  const searchId = useId();
  const { state, pool, suggestions } = builder;
  const used = new Set(state.steps.flatMap((s) => (s.documentId ? [s.documentId] : [])));
  const full = state.steps.length >= MAX_STEPS;
  const last = state.steps.at(-1);
  const jevItems = suggestions.load.status === 'ready' ? matchingDocuments(suggestions.load.items, query) : [];
  const poolItems = pool.status === 'ready' ? matchingDocuments(pool.documents, query) : [];
  const searching = query.trim() !== '';

  const row = (doc: PoolDocument | NextStep, why: string, jev: boolean): ReactNode => {
    const isUsed = used.has(doc.id);
    const kind = kindOfDocument(doc);
    return (
      <li key={`${jev ? 'jev' : 'pool'}-${doc.id}`}>
        <button
          type="button"
          className="jbp-pick"
          data-kind={kind}
          data-used={isUsed}
          disabled={isUsed || full}
          aria-label={t(isUsed ? 'journey.pool.used' : 'journey.pool.add', { title: doc.title })}
          onClick={() => builder.add(doc)}
          style={tintStyle(doc.space)}
          data-id={jev ? 'journey-suggestion' : 'journey-pool-item'}
        >
          <span className="jbp-pick-icon" aria-hidden="true">
            {jev ? <Icon name={KIND_LOOK[kind].icon} size={14} /> : <span className="jbp-pick-dot" />}
          </span>
          <span className="jbp-pick-text">
            <span className="jbp-pick-name">{doc.title}</span>
            <span className="jbp-pick-why">{why}</span>
          </span>
          <span className="jbp-pick-add" aria-hidden="true">
            <Icon name={isUsed ? 'check' : 'plus'} size={16} />
          </span>
        </button>
      </li>
    );
  };

  return (
    <PhoneSheet title={t('journey.add')} closeLabel={t('journey.phone.close')} onClose={onClose} dataId="journey-add-sheet">
      <label className="jbp-search" htmlFor={searchId}>
        <Icon name="search" size={18} />
        <input
          id={searchId}
          type="search"
          value={query}
          placeholder={t('journey.phone.search')}
          aria-label={t('journey.phone.search')}
          onChange={(event) => setQuery(event.target.value)}
          data-id="journey-search"
        />
      </label>
      {full && <p className="jbp-note">{t('journey.phone.full', { max: MAX_STEPS })}</p>}
      {suggestions.load.status !== 'off' && (
        <section className="jbp-group" aria-label={t('journey.jev.title')} data-id="journey-jev" data-state={suggestions.load.status}>
          <span className="jbp-group-title">
            <Icon name="sparkle" size={14} />
            {t('journey.jev.title')}
          </span>
          <SuggestionsNote t={t} load={suggestions.load} onRetry={suggestions.refresh} />
          {suggestions.load.status === 'ready' && suggestions.load.items.length > 0 && (
            <ul className="jbp-picks">
              {jevItems.map((item) => {
                const score = relevanceText(locale, item.probability * 100);
                return row(item, last ? t('journey.jev.after', { step: last.title, score }) : t('journey.jev.first', { score }), true);
              })}
            </ul>
          )}
        </section>
      )}
      <section className="jbp-group" aria-label={t('journey.pool')} data-id="journey-pool" data-state={pool.status}>
        <span className="jbp-group-title">{t('journey.pool')}</span>
        <PoolNote t={t} pool={pool} />
        {poolItems.length > 0 && <ul className="jbp-picks">{poolItems.map((doc) => row(doc, spaceName(locale, doc.space), false))}</ul>}
        {searching && pool.status === 'ready' && poolItems.length === 0 && jevItems.length === 0 && <p className="jbp-note">{t('journey.phone.noMatch', { query: query.trim() })}</p>}
      </section>
    </PhoneSheet>
  );
}

function SuggestionsNote({ t, load, onRetry }: { t: T; load: SuggestionsLoad; onRetry(): void }): ReactNode {
  if (load.status === 'loading') return <p className="jbp-note">{t('journey.jev.loading')}</p>;
  if (load.status === 'ready' && load.items.length === 0) return <p className="jbp-note">{t('journey.jev.none')}</p>;
  if (load.status !== 'failed') return null;
  return (
    <p className="jbp-note">
      {t('journey.jev.failed')}{' '}
      <button type="button" className="jbp-text-button" onClick={onRetry}>
        {t('journey.jev.retry')}
      </button>
    </p>
  );
}

function PoolNote({ t, pool }: { t: T; pool: PoolLoad }): ReactNode {
  if (pool.status === 'loading') return <p className="jbp-note">{t('journey.pool.loading')}</p>;
  if (pool.status === 'failed') return <p className="jbp-note">{t('journey.pool.failed')}</p>;
  if (pool.documents.length === 0) return <p className="jbp-note">{t('journey.pool.empty')}</p>;
  return null;
}

/** The selected step in a sheet: its fields, "Bỏ bước" and "Xong". */
function StepSheet({ t, builder, onClose }: { t: T; builder: JourneyBuilder; onClose(): void }): ReactNode {
  const { current, index, documents } = builder;
  if (!current) return null;
  return (
    <PhoneSheet title={t('journey.edit.step', { n: index + 1 })} closeLabel={t('journey.phone.close')} onClose={onClose} dataId="journey-step-sheet">
      <div className="jbp-fields" data-kind={current.kind}>
        <StepFields t={t} step={current} documents={documents} onChange={builder.change} />
      </div>
      <div className="jbp-sheet-actions">
        <button
          type="button"
          className="phone-button"
          data-tone="ghost"
          onClick={() => {
            builder.remove(index);
            onClose();
          }}
          data-id="journey-step-remove"
        >
          {t('journey.step.remove')}
        </button>
        <button type="button" className="phone-button" data-tone="rim" onClick={onClose} data-id="journey-step-done">
          {t('journey.phone.done')}
        </button>
      </div>
    </PhoneSheet>
  );
}

type Sheet = 'none' | 'add' | 'step';

export function JourneyBuilderPhone({ journey, builder }: { journey: Journey; builder: JourneyBuilder }): ReactNode {
  const { t, locale } = useJourneyText();
  const [sheet, setSheet] = useState<Sheet>('none');
  const { state, autosave, documents } = builder;
  const status = autosave.status;
  const statusLine = saveStatusLine(status);
  const full = state.steps.length >= MAX_STEPS;
  const close = (): void => setSheet('none');

  return (
    <PhoneShell screen="C07" tabBar={false} stars={false}>
      <div className="jbp" data-id="journey-builder" data-state={state.steps.length === 0 ? 'empty' : 'ready'}>
        <div className="jbp-top">
          <a className="phone-round" href={SHELL_PATHS.mine} aria-label={t('journey.phone.back')} data-id="journey-back">
            <Icon name="chevron-left" size={20} />
          </a>
          <span className="jbp-kind">{t('journey.phone.kind', { space: spaceName(locale, journey.space) })}</span>
          <button type="button" className="jbp-save" onClick={autosave.saveNow} disabled={status === 'stale' || status === 'saving'} data-id="journey-save" data-state={status}>
            <span className="jbp-save-dot" aria-hidden="true" />
            {t(SAVE_LABEL[status])}
          </button>
          <a className="jbp-submit" href={publishPath(journey.id)} data-id="journey-submit">
            {t('journey.submit')}
          </a>
        </div>

        <div className="jbp-scroll">
          <label className="jbp-title">
            <span>{t('journey.titleLabel')}</span>
            <input
              type="text"
              value={state.title}
              maxLength={200}
              placeholder={t('journey.titlePlaceholder')}
              onChange={(event) => builder.setTitle(event.target.value.replace(/[\r\n]+/g, ' '))}
              data-id="journey-title"
            />
          </label>
          <div className="jbp-meta">
            <span className="jbp-total" data-id="journey-total">
              {t('journey.total', { count: state.steps.length, minutes: totalMinutes(state.steps) })}
            </span>
            <a className="jbp-preview" href={journeyPath(journey.id)} data-id="journey-preview">
              <Icon name="play" size={14} />
              {t('journey.preview')}
            </a>
          </div>
          <p className="jbp-status" role="status" aria-live="polite" data-id="journey-save-status" data-state={status}>
            {statusLine ? t(statusLine) : ''}
            {status === 'stale' && (
              <button type="button" className="jbp-text-button" onClick={() => window.location.reload()}>
                {t('journey.status.reload')}
              </button>
            )}
          </p>
          <p className="jb-live" aria-live="polite">
            {builder.announce}
          </p>

          {state.steps.length === 0 ? (
            <div className="jbp-empty" data-id="journey-empty">
              <img src={ILLUSTRATIONS['journey-path']} alt="" aria-hidden="true" width={120} height={120} />
              <span className="jbp-empty-title">{t('journey.empty.title')}</span>
              <span className="jbp-empty-text">{t('journey.phone.empty')}</span>
            </div>
          ) : (
            <ol className="jbp-steps" aria-label={t('journey.steps')} data-id="journey-step-list">
              {state.steps.map((step, i) => {
                const title = step.title || t('journey.stepUntitled', { n: i + 1 });
                return (
                  <li key={step.key} className="jbp-step" data-kind={step.kind} data-selected={step.key === builder.selected} data-id="journey-step">
                    <button
                      type="button"
                      className="jbp-step-main"
                      aria-label={t('journey.phone.edit', { n: i + 1, title })}
                      onClick={() => {
                        builder.select(step.key);
                        setSheet('step');
                      }}
                    >
                      <span className="jbp-crystal" aria-hidden="true">
                        <img src={KIND_LOOK[step.kind].crystal} alt="" width={40} height={44} />
                        <span className="jbp-crystal-n">{i + 1}</span>
                      </span>
                      <span className="jbp-step-text">
                        <span className="jbp-step-name">{title}</span>
                        <span className="jbp-step-meta">
                          <span className="jbp-tag">{t(KIND_LOOK[step.kind].label)}</span>
                          {t('journey.step.minutes', { minutes: step.minutes })} · {sourceOf(t, step, documents)}
                        </span>
                      </span>
                    </button>
                    <span className="jbp-step-moves">
                      <button type="button" className="jbp-move" aria-label={t('journey.phone.up', { n: i + 1 })} disabled={i === 0} onClick={() => builder.move(i, i - 1)} data-id="journey-step-up">
                        <Icon name="step-up" size={16} />
                      </button>
                      <button
                        type="button"
                        className="jbp-move"
                        aria-label={t('journey.phone.down', { n: i + 1 })}
                        disabled={i === state.steps.length - 1}
                        onClick={() => builder.move(i, i + 1)}
                        data-id="journey-step-down"
                      >
                        <Icon name="step-down" size={16} />
                      </button>
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        <div className="jbp-bar">
          <button type="button" className="phone-button" data-tone="rim" aria-haspopup="dialog" disabled={full} onClick={() => setSheet('add')} data-id="journey-add">
            <Icon name="plus" size={18} />
            {t('journey.add')}
          </button>
        </div>

        {sheet === 'add' && <AddSheet t={t} locale={locale} builder={builder} onClose={close} />}
        {sheet === 'step' && <StepSheet t={t} builder={builder} onClose={close} />}
      </div>
    </PhoneShell>
  );
}
