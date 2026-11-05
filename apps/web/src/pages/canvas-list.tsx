/**
 * The account's canvases at /canvas (no board of its own: the entry to C15): a new canvas (in the Space of
 * `?space=` when given), the list of canvases (that Space's only, with `?space=`), and deleting one after a confirm.
 * States: loading, failed (retry), empty.
 */
import { type FormEvent, type ReactNode, useEffect, useState } from 'react';
import { ApiError } from '../api/api-client';
import { type CanvasListItem, createCanvas, deleteCanvas, fetchCanvases } from '../api/canvas-api';
import { AppShell, type BreadcrumbItem, SHELL_PATHS } from '../layout/app-shell';
import { Button } from '../ui/button';
import { Modal } from '../ui/modal';
import { RimPanel } from '../ui/rim-panel';
import { TextField } from '../ui/text-field';
import { useCanvasText } from './canvas-messages';
import { shortDate } from './reader-messages';

type ListLoad = { status: 'loading' } | { status: 'ready'; canvases: CanvasListItem[] } | { status: 'failed' };

function spaceFromUrl(): string | null {
  const slug = new URLSearchParams(window.location.search).get('space');
  return slug && /^[a-z0-9][a-z0-9-]{0,119}$/.test(slug) ? slug : null;
}

export function CanvasList(): ReactNode {
  const { t, locale } = useCanvasText();
  const [space] = useState(spaceFromUrl);
  const [load, setLoad] = useState<ListLoad>({ status: 'loading' });
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<CanvasListItem | null>(null);

  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let current = true;
    fetchCanvases(space ?? undefined).then(
      (canvases) => {
        if (current) setLoad({ status: 'ready', canvases });
      },
      (error: unknown) => {
        if (!(error instanceof ApiError)) console.error('canvas list failed', error);
        if (current) setLoad({ status: 'failed' });
      },
    );
    return () => {
      current = false;
    };
  }, [space, attempt]);

  function refresh(): void {
    setLoad({ status: 'loading' });
    setAttempt((n) => n + 1);
  }

  async function create(event: FormEvent): Promise<void> {
    event.preventDefault();
    const name = title.trim();
    if (!name || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const made = await createCanvas(name.slice(0, 120), space);
      window.location.assign(`${SHELL_PATHS.canvas}/${encodeURIComponent(made.id)}`);
    } catch (error) {
      if (!(error instanceof ApiError)) console.error('canvas create failed', error);
      setMessage(t('canvas.list.createFailed'));
      setBusy(false);
    }
  }

  async function remove(item: CanvasListItem): Promise<void> {
    setDeleting(null);
    try {
      await deleteCanvas(item.id);
      setLoad((current) => (current.status === 'ready' ? { status: 'ready', canvases: current.canvases.filter((c) => c.id !== item.id) } : current));
    } catch (error) {
      if (!(error instanceof ApiError)) console.error('canvas delete failed', error);
      setMessage(t('canvas.list.deleteFailed'));
    }
  }

  const breadcrumb: BreadcrumbItem[] = [{ label: 'Universe', href: SHELL_PATHS.universe }];
  if (space) breadcrumb.push({ label: space, href: `/s/${encodeURIComponent(space)}` });
  breadcrumb.push({ label: t('canvas.crumbList') });

  return (
    <AppShell screen="C15" rail="spaces" view="canvas" breadcrumb={breadcrumb} veil="strong" stars={false} spaceHref={space ? `/s/${encodeURIComponent(space)}` : undefined} className="canvas-shell">
      <div className="canvas-list" data-id="canvas-list" data-state={load.status === 'ready' ? (load.canvases.length === 0 ? 'empty' : 'ready') : load.status}>
        <RimPanel label={t('canvas.list.title')} className="canvas-list-panel">
          <h1 className="canvas-list-title">{space ? t('canvas.list.inSpace', { space }) : t('canvas.list.title')}</h1>
          <p className="canvas-list-lead">{t('canvas.list.lead')}</p>
          <form className="canvas-list-create" onSubmit={(event) => void create(event)}>
            <TextField label={t('canvas.list.newTitle')} value={title} onChange={(e) => setTitle(e.target.value)} variant="compact" dataId="canvas-new-title" />
            <Button type="submit" variant="rim" size="lg" icon="plus" disabled={!title.trim() || busy} dataId="canvas-create">
              {t('canvas.list.create')}
            </Button>
          </form>
          {message && (
            <p className="canvas-list-message" role="alert">
              {message}
            </p>
          )}
          {load.status === 'loading' && (
            <p className="canvas-list-muted" role="status">
              {t('canvas.list.loading')}
            </p>
          )}
          {load.status === 'failed' && (
            <p className="canvas-list-muted" role="alert">
              {t('canvas.list.failed')}{' '}
              <Button variant="ghost" size="sm" icon="retry" onClick={refresh}>
                {t('canvas.save.retry')}
              </Button>
            </p>
          )}
          {load.status === 'ready' && load.canvases.length === 0 && <p className="canvas-list-muted">{t('canvas.list.empty')}</p>}
          {load.status === 'ready' && load.canvases.length > 0 && (
            <ul className="canvas-list-rows">
              {load.canvases.map((item) => (
                <li key={item.id} className="canvas-list-row">
                  <a href={`${SHELL_PATHS.canvas}/${encodeURIComponent(item.id)}`} className="canvas-list-link" data-id={`canvas-open-${item.id}`}>
                    <span className="canvas-list-name">{item.title}</span>
                    <span className="canvas-list-meta">
                      {t('canvas.list.cards', { count: item.cards })} · {shortDate(locale, item.updatedAt)}
                    </span>
                  </a>
                  <Button variant="ghost" size="sm" icon="trash" aria-label={t('canvas.list.delete', { title: item.title })} onClick={() => setDeleting(item)} />
                </li>
              ))}
            </ul>
          )}
        </RimPanel>
        {deleting && (
          <Modal
            open
            onClose={() => setDeleting(null)}
            tone="danger"
            size="lg"
            title={t('canvas.list.deleteConfirm', { title: deleting.title })}
            description={t('canvas.list.deleteText')}
            dataId="canvas-delete"
            actions={
              <>
                <Button variant="ghost" size="md" onClick={() => setDeleting(null)}>
                  {t('canvas.dialog.cancel')}
                </Button>
                <Button variant="danger-solid" size="md" onClick={() => void remove(deleting)} dataId="canvas-delete-confirm">
                  {t('canvas.delete')}
                </Button>
              </>
            }
          />
        )}
      </div>
    </AppShell>
  );
}
