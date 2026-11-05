/**
 * The Canvas dialogs (C15): editing a card (its text, its kind among the free cards, a diagram's steps, a link's
 * address, its connections, deleting it) and adding a document of the canvas's Space or a web link.
 */
import { type ReactNode, useEffect, useId, useState } from 'react';
import { ApiError } from '../api/api-client';
import type { Card, CardKind, Connection } from '../api/canvas-api';
import { type DocumentSummary, fetchSpace } from '../api/content-api';
import { Button } from '../ui/button';
import { Modal } from '../ui/modal';
import { TextField } from '../ui/text-field';
import { KIND_LOOK } from './canvas-model';
import type { CanvasMessageKey } from './canvas-messages';
import type { ScreenTranslate } from './space-messages';

/** The kinds a free card can be switched between (documents, links, diagrams and AI answers keep theirs). */
const FREE_KINDS: readonly CardKind[] = ['note', 'idea', 'risk'];

export function isWebUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

/** A diagram's steps as typed: "D, O, R, A" → ["D", "O", "R", "A"] (at most 8, each up to 24 characters). */
export function parseSteps(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim().slice(0, 24))
    .filter(Boolean)
    .slice(0, 8);
}

interface EditCardDialogProps {
  t: ScreenTranslate<CanvasMessageKey>;
  card: Card;
  /** The card's title as shown (a document card shows its document's). */
  shownTitle: string;
  connections: readonly Connection[];
  titleOf(cardId: string): string;
  onSave(change: Partial<Omit<Card, 'id'>>): void;
  onDisconnect(connectionId: string): void;
  onDelete(): void;
  onClose(): void;
}

export function EditCardDialog({ t, card, shownTitle, connections, titleOf, onSave, onDisconnect, onDelete, onClose }: EditCardDialogProps): ReactNode {
  const free = card.kind !== 'document';
  const [title, setTitle] = useState(card.title);
  const [body, setBody] = useState(card.body ?? '');
  const [kind, setKind] = useState<CardKind>(card.kind);
  const [steps, setSteps] = useState((card.steps ?? []).join(', '));
  const [url, setUrl] = useState(card.url ?? '');
  const bodyId = useId();
  const kindId = useId();
  const urlError = card.kind === 'link' && !isWebUrl(url.trim()) ? t('canvas.dialog.urlInvalid') : undefined;
  const mine = connections.filter((c) => c.from === card.id || c.to === card.id);

  function save(): void {
    if (urlError) return;
    const change: Partial<Omit<Card, 'id'>> = { title: title.trim().slice(0, 200) };
    if (card.kind !== 'diagram' && card.kind !== 'link') change.body = body.trim() ? body.trim().slice(0, 1000) : undefined;
    if (FREE_KINDS.includes(card.kind)) change.kind = kind;
    if (card.kind === 'diagram') change.steps = parseSteps(steps);
    if (card.kind === 'link') change.url = url.trim();
    onSave(change);
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={free ? t('canvas.dialog.edit') : shownTitle}
      size="lg"
      dataId="canvas-edit"
      actions={
        <>
          <Button variant="danger" size="md" onClick={onDelete} dataId="canvas-edit-delete">
            {t('canvas.delete')}
          </Button>
          <Button variant="ghost" size="md" onClick={onClose}>
            {t('canvas.dialog.cancel')}
          </Button>
          {free && (
            <Button variant="rim" size="md" onClick={save} disabled={Boolean(urlError)} dataId="canvas-edit-save">
              {t('canvas.dialog.save')}
            </Button>
          )}
        </>
      }
    >
      <div className="canvas-dialog-fields">
        {free && <TextField label={t('canvas.dialog.title')} value={title} onChange={(e) => setTitle(e.target.value)} variant="compact" dataId="canvas-edit-title" />}
        {FREE_KINDS.includes(card.kind) && (
          <label className="kf-field" htmlFor={kindId}>
            <span className="kf-field-label">{t('canvas.dialog.kind')}</span>
            <select id={kindId} className="kf-field-input canvas-dialog-select" value={kind} onChange={(e) => setKind(FREE_KINDS.find((k) => k === e.target.value) ?? card.kind)}>
              {FREE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(KIND_LOOK[k].label)}
                </option>
              ))}
            </select>
          </label>
        )}
        {free && card.kind !== 'diagram' && card.kind !== 'link' && (
          <label className="kf-field" htmlFor={bodyId}>
            <span className="kf-field-label">{t('canvas.dialog.body')}</span>
            <textarea id={bodyId} className="kf-field-input canvas-dialog-text" value={body} maxLength={1000} onChange={(e) => setBody(e.target.value)} />
          </label>
        )}
        {card.kind === 'diagram' && <TextField label={t('canvas.dialog.steps')} value={steps} onChange={(e) => setSteps(e.target.value)} variant="compact" />}
        {card.kind === 'link' && <TextField label={t('canvas.dialog.url')} type="url" value={url} onChange={(e) => setUrl(e.target.value)} error={urlError} variant="compact" />}
        <div className="canvas-dialog-connections">
          <span className="kf-field-label">{t('canvas.dialog.connections')}</span>
          {mine.length === 0 ? (
            <span className="canvas-dialog-muted">{t('canvas.dialog.noConnections')}</span>
          ) : (
            <ul>
              {mine.map((c) => {
                const other = titleOf(c.from === card.id ? c.to : c.from);
                return (
                  <li key={c.id}>
                    <span>{other}</span>
                    <Button variant="ghost" size="xs" icon="close" aria-label={t('canvas.dialog.disconnect', { title: other })} onClick={() => onDisconnect(c.id)} />
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}

type DocumentsLoad = { status: 'loading' } | { status: 'ready'; documents: DocumentSummary[] } | { status: 'failed' };

interface AddDialogProps {
  t: ScreenTranslate<CanvasMessageKey>;
  /** The canvas's Space (documents are picked from it); null: links only. */
  space: string | null;
  /** Documents already on the board. */
  onBoard: ReadonlySet<string>;
  onAddDocument(doc: DocumentSummary): void;
  onAddLink(url: string): void;
  onClose(): void;
}

export function AddDialog({ t, space, onBoard, onAddDocument, onAddLink, onClose }: AddDialogProps): ReactNode {
  const [load, setLoad] = useState<DocumentsLoad>(space ? { status: 'loading' } : { status: 'ready', documents: [] });
  const [query, setQuery] = useState('');
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!space) return;
    let current = true;
    fetchSpace(space).then(
      (detail) => {
        if (current) setLoad({ status: 'ready', documents: [...detail.collections.flatMap((c) => c.documents), ...detail.uncollected] });
      },
      (error: unknown) => {
        if (!(error instanceof ApiError)) console.error('canvas documents failed', error);
        if (current) setLoad({ status: 'failed' });
      },
    );
    return () => {
      current = false;
    };
  }, [space]);
  const needle = query.trim().toLocaleLowerCase();
  const shown = load.status === 'ready' ? load.documents.filter((d) => !onBoard.has(d.id) && d.title.toLocaleLowerCase().includes(needle)) : [];
  const urlOk = isWebUrl(url.trim());

  return (
    <Modal open onClose={onClose} title={t('canvas.add.title')} size="lg" dataId="canvas-add">
      <div className="canvas-dialog-fields">
        {space ? (
          <>
            <TextField label={t('canvas.add.search')} type="search" value={query} onChange={(e) => setQuery(e.target.value)} variant="compact" dataId="canvas-add-search" />
            {load.status === 'loading' && <span className="canvas-dialog-muted">{t('canvas.add.loading')}</span>}
            {load.status === 'failed' && (
              <span className="canvas-dialog-muted" role="alert">
                {t('canvas.add.failed')}
              </span>
            )}
            {load.status === 'ready' && shown.length === 0 && <span className="canvas-dialog-muted">{t('canvas.add.none')}</span>}
            {shown.length > 0 && (
              <ul className="canvas-dialog-documents">
                {shown.map((doc) => (
                  <li key={doc.id}>
                    <button type="button" className="canvas-dialog-document" onClick={() => onAddDocument(doc)} data-id={`canvas-add-${doc.id}`}>
                      {doc.title}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <span className="canvas-dialog-muted">{t('canvas.add.noSpace')}</span>
        )}
        <TextField label={t('canvas.add.link')} type="url" value={url} onChange={(e) => setUrl(e.target.value)} variant="compact" placeholder="https://" dataId="canvas-add-url" />
        <Button variant="rim" size="md" disabled={!urlOk} onClick={() => onAddLink(url.trim())} dataId="canvas-add-link">
          {t('canvas.add.linkAction')}
        </Button>
      </div>
    </Modal>
  );
}
