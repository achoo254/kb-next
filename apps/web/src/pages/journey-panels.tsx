/**
 * The three panels of the journey builder (board C07): what to add (Jev's next steps, the documents of the universe),
 * the steps themselves, and the selected step with the journey's story card.
 */
import { type CSSProperties, type DragEvent, type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { MAX_STEPS, type NextStep, type PoolDocument, STEP_KINDS, STEP_NOTE_MAX, STEP_TITLE_MAX, type StepKind } from '../api/journey-api';
import { brand } from '../brand';
import type { Locale } from '../i18n/i18n';
import { CRYSTAL_ART, ILLUSTRATIONS } from '../ui/art';
import { Icon, type IconName } from '../ui/icon';
import { type BuilderState, type EditStep, type StepPatch, totalMinutes } from './journey-model';
import type { JourneyMessageKey } from './journey-messages';
import { relevanceText } from './space-labels';
import type { ScreenTranslate } from './space-messages';
import { spaceName, tintStyle } from './space-panels';

type T = ScreenTranslate<JourneyMessageKey>;

/** How each kind of step looks: its name, the crystal of its row, the icon of a suggestion. */
export const KIND_LOOK: Record<StepKind, { label: JourneyMessageKey; crystal: string; icon: IconName }> = {
  read: { label: 'journey.kind.read', crystal: CRYSTAL_ART.networking, icon: 'lines' },
  lab: { label: 'journey.kind.lab', crystal: CRYSTAL_ART.docker, icon: 'pulse' },
  quiz: { label: 'journey.kind.quiz', crystal: CRYSTAL_ART.weekly, icon: 'question' },
  note: { label: 'journey.kind.note', crystal: CRYSTAL_ART.personal, icon: 'pencil' },
};

/** The kind a document is added as (a lab is done as a lab). */
const kindOfDocument = (doc: Pick<PoolDocument, 'type'>): StepKind => (doc.type === 'lab' ? 'lab' : 'read');

export type SuggestionsLoad = { status: 'off' } | { status: 'loading' } | { status: 'ready'; items: NextStep[] } | { status: 'failed' };

interface SourcesProps {
  t: T;
  locale: Locale;
  state: BuilderState;
  pool: { status: 'loading' } | { status: 'ready'; documents: PoolDocument[] } | { status: 'failed' };
  suggestions: SuggestionsLoad;
  onRetry(): void;
  onAdd(doc: PoolDocument | NextStep): void;
}

/** Left: Jev's next steps (hidden when Jev is off on this server) and the documents to pick from. */
export function StepSources({ t, locale, state, pool, suggestions, onRetry, onAdd }: SourcesProps): ReactNode {
  const used = new Set(state.steps.flatMap((s) => (s.documentId ? [s.documentId] : [])));
  const full = state.steps.length >= MAX_STEPS;
  const last = state.steps.at(-1);
  return (
    <aside className="jb-panel jb-sources" aria-label={t('journey.add')} data-id="journey-sources">
      {suggestions.status !== 'off' && (
        <div className="jb-jev" data-id="journey-jev" data-state={suggestions.status}>
          <span className="jb-jev-title">
            <Icon name="sparkle" size={14} />
            {t('journey.jev.title')}
          </span>
          {suggestions.status === 'loading' && <span className="jb-jev-note">{t('journey.jev.loading')}</span>}
          {suggestions.status === 'failed' && (
            <span className="jb-jev-note">
              {t('journey.jev.failed')}{' '}
              <button type="button" className="jb-link-button" onClick={onRetry}>
                {t('journey.jev.retry')}
              </button>
            </span>
          )}
          {suggestions.status === 'ready' && suggestions.items.length === 0 && <span className="jb-jev-note">{t('journey.jev.none')}</span>}
          {suggestions.status === 'ready' &&
            suggestions.items.map((item) => {
              const kind = kindOfDocument(item);
              const isUsed = used.has(item.id);
              const score = relevanceText(locale, item.probability * 100);
              return (
                <div key={item.id} className="jb-jev-item" data-kind={kind} data-id="journey-suggestion">
                  <span className="jb-jev-icon" aria-hidden="true">
                    <Icon name={KIND_LOOK[kind].icon} size={14} />
                  </span>
                  <span className="jb-jev-text">
                    <span className="jb-jev-name">{item.title}</span>
                    <span className="jb-jev-why">{last ? t('journey.jev.after', { step: last.title, score }) : t('journey.jev.first', { score })}</span>
                  </span>
                  <button
                    type="button"
                    className="jb-round"
                    data-used={isUsed}
                    disabled={isUsed || full}
                    aria-label={t(isUsed ? 'journey.jev.added' : 'journey.jev.add', { title: item.title })}
                    onClick={() => onAdd(item)}
                  >
                    <Icon name={isUsed ? 'check' : 'plus'} size={16} />
                  </button>
                </div>
              );
            })}
        </div>
      )}
      <span className="jb-pool-title" id="journey-pool-title">
        {t('journey.pool')}
      </span>
      <div className="jb-pool" role="group" aria-labelledby="journey-pool-title" data-id="journey-pool" data-state={pool.status}>
        {pool.status === 'loading' && <span className="jb-jev-note">{t('journey.pool.loading')}</span>}
        {pool.status === 'failed' && <span className="jb-jev-note">{t('journey.pool.failed')}</span>}
        {pool.status === 'ready' && pool.documents.length === 0 && <span className="jb-jev-note">{t('journey.pool.empty')}</span>}
        {pool.status === 'ready' &&
          pool.documents.map((doc) => {
            const isUsed = used.has(doc.id);
            return (
              <button
                key={doc.id}
                type="button"
                className="jb-pool-item"
                data-used={isUsed}
                disabled={isUsed || full}
                aria-label={t(isUsed ? 'journey.pool.used' : 'journey.pool.add', { title: doc.title })}
                onClick={() => onAdd(doc)}
                style={tintStyle(doc.space)}
              >
                <span className="jb-pool-dot" aria-hidden="true" />
                <span className="jb-pool-name">{doc.title}</span>
                <span className="jb-pool-space">{spaceName(locale, doc.space)}</span>
              </button>
            );
          })}
      </div>
    </aside>
  );
}

interface ListProps {
  t: T;
  state: BuilderState;
  /** The key of the selected step. */
  selected: string | null;
  documents: ReadonlyMap<string, PoolDocument>;
  onTitle(title: string): void;
  onSelect(key: string): void;
  onMove(from: number, to: number): void;
  onRemove(index: number): void;
}

type Control = 'pick' | 'up' | 'down';

/** What a step row says under its title: its source document, or a note's first words. */
function sourceOf(t: T, step: EditStep, documents: ReadonlyMap<string, PoolDocument>): string {
  if (step.kind === 'note') return step.note?.trim() || t('journey.kind.note');
  const doc = step.documentId ? documents.get(step.documentId) : undefined;
  return doc?.title ?? t('journey.step.noSource');
}

/** Middle: the journey's name, its total, and its steps joined by glowing wires. */
export function StepList({ t, state, selected, documents, onTitle, onSelect, onMove, onRemove }: ListProps): ReactNode {
  const [drag, setDrag] = useState<{ from: number; over: number } | null>(null);
  const controls = useRef(new Map<string, HTMLButtonElement>());
  const refocus = useRef<string | null>(null);
  // A step moved by keyboard keeps the focus on the control that moved it.
  useEffect(() => {
    if (refocus.current === null) return;
    controls.current.get(refocus.current)?.focus();
    refocus.current = null;
  }, [state.steps]);
  const bind = (key: string, control: Control) => (el: HTMLButtonElement | null) => {
    if (el) controls.current.set(`${key}:${control}`, el);
    else controls.current.delete(`${key}:${control}`);
  };
  const moveBy = (index: number, by: number, key: string, control: Control): void => {
    refocus.current = `${key}:${control}`;
    onMove(index, index + by);
  };
  const onRowKey = (event: KeyboardEvent<HTMLButtonElement>, index: number, key: string): void => {
    if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
    event.preventDefault();
    moveBy(index, event.key === 'ArrowUp' ? -1 : 1, key, 'pick');
  };
  const onDragOver = (event: DragEvent<HTMLLIElement>, index: number): void => {
    if (!drag) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    if (drag.over !== index) setDrag({ ...drag, over: index });
  };
  const onDrop = (event: DragEvent<HTMLLIElement>, index: number): void => {
    event.preventDefault();
    if (drag) onMove(drag.from, index);
    setDrag(null);
  };
  const total = totalMinutes(state.steps);
  return (
    <section className="jb-panel jb-steps" aria-label={t('journey.steps')} data-id="journey-steps">
      <div className="jb-steps-head">
        <input
          className="jb-title"
          type="text"
          value={state.title}
          maxLength={200}
          aria-label={t('journey.titleLabel')}
          placeholder={t('journey.titlePlaceholder')}
          onChange={(event) => onTitle(event.target.value.replace(/[\r\n]+/g, ' '))}
          data-id="journey-title"
        />
        <span className="jb-total" data-id="journey-total">
          {t('journey.total', { count: state.steps.length, minutes: total })}
        </span>
      </div>
      <div className="jb-legend">
        <span>{t('journey.kinds')}</span>
        {STEP_KINDS.map((kind) => (
          <span key={kind} className="jb-legend-kind" data-kind={kind}>
            ● {t(KIND_LOOK[kind].label)}
          </span>
        ))}
      </div>
      {state.steps.length === 0 ? (
        <div className="jb-empty" data-id="journey-empty">
          <img src={ILLUSTRATIONS['journey-path']} alt="" aria-hidden="true" width={150} height={150} />
          <span className="jb-empty-title">{t('journey.empty.title')}</span>
          <span className="jb-empty-text">{t('journey.empty.text')}</span>
        </div>
      ) : (
        <ol className="jb-list" data-id="journey-step-list">
          {state.steps.map((step, i) => {
            const on = step.key === selected;
            const previous = state.steps[i - 1];
            return (
              <li
                key={step.key}
                className="jb-step"
                data-kind={step.kind}
                data-selected={on}
                data-drop={drag !== null && drag.over === i && drag.from !== i}
                data-id="journey-step"
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData('text/plain', step.title);
                  setDrag({ from: i, over: i });
                }}
                onDragOver={(event) => onDragOver(event, i)}
                onDrop={(event) => onDrop(event, i)}
                onDragEnd={() => setDrag(null)}
              >
                {previous && <span className="jb-wire" aria-hidden="true" style={{ '--wire-from': `var(--journey-${previous.kind})` } as CSSProperties} />}
                <div className="jb-step-row">
                  <button
                    ref={bind(step.key, 'pick')}
                    type="button"
                    className="jb-step-pick"
                    aria-label={t('journey.step.pick', { n: i + 1 })}
                    aria-describedby="journey-step-hint"
                    aria-current={on ? 'step' : undefined}
                    onClick={() => onSelect(step.key)}
                    onKeyDown={(event) => onRowKey(event, i, step.key)}
                  >
                    <span className="jb-crystal" aria-hidden="true">
                      <img src={KIND_LOOK[step.kind].crystal} alt="" width={44} height={48} />
                      <span className="jb-crystal-n">{i + 1}</span>
                    </span>
                    <span className="jb-step-text">
                      <span className="jb-step-name">{step.title || t('journey.stepUntitled', { n: i + 1 })}</span>
                      <span className="jb-step-meta">
                        <span className="jb-tag">{t(KIND_LOOK[step.kind].label)}</span>
                        {t('journey.step.minutes', { minutes: step.minutes })} · {sourceOf(t, step, documents)}
                      </span>
                    </span>
                  </button>
                  {on && (
                    <span className="jb-step-actions">
                      <button ref={bind(step.key, 'up')} type="button" className="jb-square" aria-label={t('journey.step.up')} disabled={i === 0} onClick={() => moveBy(i, -1, step.key, 'up')}>
                        <Icon name="step-up" size={14} />
                      </button>
                      <button
                        ref={bind(step.key, 'down')}
                        type="button"
                        className="jb-square"
                        aria-label={t('journey.step.down')}
                        disabled={i === state.steps.length - 1}
                        onClick={() => moveBy(i, 1, step.key, 'down')}
                      >
                        <Icon name="step-down" size={14} />
                      </button>
                      <button type="button" className="jb-square jb-square-warn" aria-label={t('journey.step.remove')} onClick={() => onRemove(i)} data-id="journey-step-remove">
                        <Icon name="close" size={14} />
                      </button>
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <span id="journey-step-hint" className="jb-live">
        {t('journey.step.hint')}
      </span>
    </section>
  );
}

interface EditorProps {
  t: T;
  state: BuilderState;
  index: number;
  step: EditStep | undefined;
  documents: ReadonlyMap<string, PoolDocument>;
  onChange(patch: StepPatch): void;
  onCover(): void;
}

/** Right: the selected step's fields, then the journey's story card and its cover colour. */
export function StepEditor({ t, state, index, step, documents, onChange, onCover }: EditorProps): ReactNode {
  const options = [...documents.values()];
  return (
    <aside className="jb-panel jb-editor" aria-label={t('journey.edit.panel')} data-id="journey-editor">
      {step ? (
        <>
          <span className="jb-editor-step">{t('journey.edit.step', { n: index + 1 })}</span>
          <label className="jb-field">
            {t('journey.edit.title')}
            <input
              type="text"
              value={step.title}
              maxLength={STEP_TITLE_MAX}
              onChange={(event) => onChange({ title: event.target.value.replace(/[\r\n]+/g, ' ') })}
              data-id="journey-step-title"
            />
          </label>
          <div className="jb-field">
            <span id="journey-kind-label">{t('journey.edit.kind')}</span>
            <div className="jb-kinds" role="group" aria-labelledby="journey-kind-label">
              {STEP_KINDS.map((kind) => (
                <button key={kind} type="button" className="jb-kind" data-kind={kind} aria-pressed={step.kind === kind} onClick={() => onChange({ kind })}>
                  {t(KIND_LOOK[kind].label)}
                </button>
              ))}
            </div>
          </div>
          <div className="jb-time">
            <span className="jb-time-label">{t('journey.edit.time')}</span>
            <button type="button" className="jb-round" aria-label={t('journey.edit.less')} disabled={step.minutes <= 1} onClick={() => onChange({ minutes: step.minutes - 1 })}>
              −
            </button>
            <span className="jb-time-value" data-id="journey-step-minutes">
              {t('journey.edit.minutes', { minutes: step.minutes })}
            </span>
            <button type="button" className="jb-round" aria-label={t('journey.edit.more')} onClick={() => onChange({ minutes: step.minutes + 1 })}>
              +
            </button>
          </div>
          {step.kind === 'note' ? (
            <label className="jb-field">
              {t('journey.edit.note')}
              <textarea
                value={step.note ?? ''}
                maxLength={STEP_NOTE_MAX}
                rows={2}
                placeholder={t('journey.edit.notePlaceholder')}
                onChange={(event) => onChange({ note: event.target.value })}
                data-id="journey-step-note"
              />
            </label>
          ) : (
            <label className="jb-field">
              {t('journey.edit.source')}
              <select value={step.documentId ?? ''} onChange={(event) => onChange({ documentId: event.target.value || null })} data-id="journey-step-source">
                <option value="">{t('journey.edit.noSource')}</option>
                {options.map((doc) => (
                  <option key={doc.id} value={doc.id}>
                    {doc.title}
                  </option>
                ))}
              </select>
            </label>
          )}
        </>
      ) : (
        <span className="jb-editor-none">{t('journey.edit.none')}</span>
      )}
      <span className="jb-story-title">{t('journey.story')}</span>
      <div className="jb-story-row">
        <div className="jb-story" data-planet={state.planet ?? 'violet'} data-id="journey-story" aria-hidden="true">
          <span className="jb-story-brand">{t('journey.story.brand', { app: brand.appName })}</span>
          <span className="jb-story-name">{state.title.trim() || t('journey.untitled')}</span>
          {state.steps.map((s, i) => (
            <span key={s.key} className="jb-story-step" data-kind={s.kind}>
              <span className="jb-story-swatch" />
              {s.title || t('journey.stepUntitled', { n: i + 1 })}
            </span>
          ))}
          <img className="jb-story-art" src={ILLUSTRATIONS['journey-path']} alt="" width={78} height={78} />
          <span className="jb-story-minutes">{t('journey.story.minutes', { minutes: totalMinutes(state.steps) })}</span>
        </div>
        <div className="jb-story-text">
          <span>{t('journey.story.auto')}</span>
          <span>{t('journey.story.after')}</span>
          <button type="button" className="jb-cover" onClick={onCover} data-id="journey-cover">
            {t('journey.story.colour')}
          </button>
        </div>
      </div>
    </aside>
  );
}
