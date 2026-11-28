/**
 * "Trí nhớ" (/memory, no board): what the account's AI in Chat remembered, as private notes of the "Trí nhớ"
 * Collection in the personal Space. Two switches (pause memory; also remember sensitive topics), the topics in two
 * groups (general, by conversation) to open, edit or move to the trash, "Xoá toàn bộ trí nhớ", and, from an undo link
 * (`?undo=<token>`), a card that takes back the last save when its button is pressed. Built from the kit and tokens,
 * a reading column like /spaces; narrow windows stack the rows.
 */
import { type ReactNode, useEffect, useState } from 'react';
import { trashDocument } from '../api/authoring-api';
import { type Memory, type MemorySettings, type MemoryTopic, fetchMemory, forgetAllMemory, saveMemorySettings } from '../api/memory-api';
import { AppShell, SHELL_PATHS } from '../layout/app-shell';
import { Button } from '../ui/button';
import { GradientTitle } from '../ui/gradient-title';
import { Modal } from '../ui/modal';
import { Toast, type ToastTone } from '../ui/toast';
import { useMemoryText } from './memory-messages';
import { MemorySwitches } from './memory-switches';
import { TopicGroup, groupTopics } from './memory-topics';
import { MemoryUndoCard, UNDO_PARAM } from './memory-undo-card';
import './memory-screen.css';

type MemoryLoad = { status: 'loading' } | { status: 'ready'; memory: Memory; now: number } | { status: 'failed' };
type Confirm = { kind: 'one'; topic: MemoryTopic } | { kind: 'all' } | null;

export function MemoryScreen(): ReactNode {
  const { t, locale } = useMemoryText();
  const [undoToken] = useState(() => new URLSearchParams(window.location.search).get(UNDO_PARAM));
  const [load, setLoad] = useState<MemoryLoad>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [toast, setToast] = useState<{ message: string; tone: ToastTone } | null>(null);

  // The token stays in state for the card; off the address, so a reload or a copied link never shows it again.
  useEffect(() => {
    if (!undoToken) return;
    const url = new URL(window.location.href);
    url.searchParams.delete(UNDO_PARAM);
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }, [undoToken]);

  useEffect(() => {
    let live = true;
    fetchMemory().then(
      (memory) => live && setLoad({ status: 'ready', memory, now: Date.now() }),
      () => live && setLoad((current) => (current.status === 'ready' ? current : { status: 'failed' })),
    );
    return () => {
      live = false;
    };
  }, [attempt]);
  const reload = (): void => setAttempt((n) => n + 1);
  const retry = (): void => {
    setLoad({ status: 'loading' });
    reload();
  };

  const memory = load.status === 'ready' ? load.memory : null;

  /** Applies a switch at once; a failed save puts it back and says so. */
  const changeSetting = (change: Partial<MemorySettings>): void => {
    if (!memory) return;
    const before: MemorySettings = { paused: memory.paused, sensitive: memory.sensitive };
    const patch = (settings: MemorySettings): void => setLoad((current) => (current.status === 'ready' ? { ...current, memory: { ...current.memory, ...settings } } : current));
    patch({ ...before, ...change });
    saveMemorySettings(change).then(patch, () => {
      patch(before);
      setToast({ message: t('memory.saveFailed'), tone: 'error' });
    });
  };

  const runConfirmed = (): void => {
    const target = confirm;
    setConfirm(null);
    if (!target) return;
    const work: Promise<string> =
      target.kind === 'one'
        ? trashDocument(target.topic.id).then(() => t('memory.deleteOne.done', { title: target.topic.title }))
        : forgetAllMemory().then((result) => t('memory.deleteAll.done', { count: result.trashed }));
    work.then(
      (message) => {
        setToast({ message, tone: 'success' });
        reload();
      },
      () => setToast({ message: t('memory.actionFailed'), tone: 'error' }),
    );
  };

  const groups = memory ? groupTopics(memory.topics) : null;
  return (
    <AppShell screen="Memory" rail="settings" veil="strong" breadcrumb={[{ label: 'Universe', href: SHELL_PATHS.universe }, { label: t('memory.title') }]}>
      <div className="memory-screen" data-id="memory-screen" data-state={load.status}>
        <GradientTitle size={36} className="memory-title">
          {t('memory.title')}
        </GradientTitle>
        <p className="memory-muted">{t('memory.sub')}</p>
        {undoToken && <MemoryUndoCard token={undoToken} t={t} onUndone={reload} />}
        {load.status === 'loading' && (
          <p className="memory-muted" role="status">
            {t('memory.loading')}
          </p>
        )}
        {load.status === 'failed' && (
          <p className="memory-muted" role="alert">
            {t('memory.failed')}{' '}
            <Button variant="glass" onClick={retry} dataId="memory-retry">
              {t('memory.retry')}
            </Button>
          </p>
        )}
        {memory && groups && load.status === 'ready' && (
          <>
            <MemorySwitches settings={memory} t={t} onChange={changeSetting} />
            {memory.topics.length === 0 ? (
              <p className="memory-muted memory-empty" data-id="memory-empty">
                {t('memory.empty')}
              </p>
            ) : (
              <>
                <TopicGroup id="general" topics={groups.general} t={t} locale={locale} now={load.now} onDelete={(topic) => setConfirm({ kind: 'one', topic })} />
                <TopicGroup id="chats" topics={groups.chats} t={t} locale={locale} now={load.now} onDelete={(topic) => setConfirm({ kind: 'one', topic })} />
                <div className="memory-footer">
                  <Button variant="danger" icon="trash" onClick={() => setConfirm({ kind: 'all' })} dataId="memory-delete-all">
                    {t('memory.deleteAll')}
                  </Button>
                </div>
              </>
            )}
          </>
        )}
      </div>
      <Modal
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        tone="danger"
        title={confirm?.kind === 'one' ? t('memory.deleteOne.title', { title: confirm.topic.title }) : t('memory.deleteAll.title')}
        description={confirm?.kind === 'one' ? t('memory.deleteOne.text') : t('memory.deleteAll.text')}
        actionsLayout="stretch"
        dataId="memory-confirm"
        actions={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              {t('memory.cancel')}
            </Button>
            <Button variant="danger-solid" onClick={runConfirmed} dataId="memory-confirm-run">
              {confirm?.kind === 'one' ? t('memory.delete') : t('memory.deleteAll')}
            </Button>
          </>
        }
      />
      {toast && <Toast tone={toast.tone} message={toast.message} onClose={() => setToast(null)} className="memory-toast" dataId="memory-toast" />}
    </AppShell>
  );
}
