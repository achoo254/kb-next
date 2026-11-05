/**
 * "Key riêng" (board F03) at /settings/keys: the account's own AI keys (OpenAI, Gemini, Claude), each a card with its
 * state (Chưa có, Hợp lệ ••••last4, Bị từ chối, Hết credit) and "Xoá key"; the form that saves a key after one free
 * check call; "Dùng key nào" (the provider and model the Copilot and translation use) and the key-state legend.
 * States: loading, ready, failed (X02 server panel), and own keys switched off on the server (`available: false`).
 *
 * Keys are write-only: the API never answers more than the last 4 characters, and the field is cleared once saved.
 * Questions and source passages go to the provider picked here; the page says so under its title.
 */
import { type FormEvent, type ReactNode, useCallback, useEffect, useId, useState } from 'react';
import { ApiError, NETWORK_ERROR } from '../api/api-client';
import { AI_PROVIDERS, type AiProvider, type KeyEntry, type KeysResponse, deleteKey, fetchKeys, saveKey, saveKeyPrefs } from '../api/keys-api';
import { useI18n } from '../i18n/i18n';
import { AppShell } from '../layout/app-shell';
import { ILLUSTRATIONS } from '../ui/art';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Icon } from '../ui/icon';
import { Loader } from '../ui/loader';
import { Modal } from '../ui/modal';
import { RimPanel } from '../ui/rim-panel';
import { Skeleton } from '../ui/skeleton';
import { TextField } from '../ui/text-field';
import { ErrorPanel } from './error-screen';
import { type KeysMessageKey, PROVIDERS, checkedTime, modelOption, useKeysText } from './keys-messages';
import type { ScreenTranslate } from './space-messages';
import './keys-screen.css';

type T = ScreenTranslate<KeysMessageKey>;
type KeysLoad = { status: 'loading' } | { status: 'ready'; data: KeysResponse } | { status: 'failed' };
/** What a card shows: a key's status, or `none` without a key. */
type CardStatus = KeyEntry['status'] | 'none';

function useKeys(): { load: KeysLoad; setData(data: KeysResponse): void; refresh(): Promise<void>; reload(): Promise<void> } {
  const [load, setLoad] = useState<KeysLoad>({ status: 'loading' });
  const request = useCallback(async (): Promise<KeysLoad> => {
    try {
      return { status: 'ready', data: await fetchKeys() };
    } catch (error) {
      if (!(error instanceof ApiError)) console.error('keys load failed', error);
      return { status: 'failed' };
    }
  }, []);
  useEffect(() => {
    let current = true;
    void request().then((next) => {
      if (current) setLoad(next);
    });
    return () => {
      current = false;
    };
  }, [request]);
  const setData = useCallback((data: KeysResponse) => setLoad({ status: 'ready', data }), []);
  // After a change: the server's view of the keys (active provider, statuses); the shown data stays on failure.
  const refresh = useCallback(async () => {
    try {
      setData(await fetchKeys());
    } catch (error) {
      console.error('keys refresh failed', error);
    }
  }, [setData]);
  const reload = useCallback(async () => {
    setLoad({ status: 'loading' });
    setLoad(await request());
  }, [request]);
  return { load, setData, refresh, reload };
}

function entryOf(data: KeysResponse, provider: AiProvider): KeyEntry | undefined {
  return data.keys.find((entry) => entry.provider === provider);
}

/** The form opens on the first provider without a working key (the board's "Thêm key Gemini"), else the active one. */
export function defaultFormProvider(data: KeysResponse): AiProvider {
  return AI_PROVIDERS.find((provider) => entryOf(data, provider)?.status !== 'ok') ?? data.active?.provider ?? 'openai';
}

const STATUS_LABEL: Record<CardStatus, KeysMessageKey> = {
  none: 'keys.status.none',
  ok: 'keys.status.ok',
  invalid: 'keys.status.invalid',
  quota: 'keys.status.quota',
  unreadable: 'keys.status.unreadable',
};

function StatusChip({ status, t, last4 }: { status: CardStatus; t: T; last4?: string }): ReactNode {
  const tone = status === 'ok' ? 'success' : status === 'none' ? 'neutral' : 'warn';
  return (
    <Badge variant="pill" tone={tone} className="keys-chip">
      <span className="keys-chip-dot" aria-hidden="true" />
      {status === 'ok' && last4 ? t('keys.status.okLast4', { last4 }) : t(STATUS_LABEL[status])}
    </Badge>
  );
}

interface CardsProps {
  data: KeysResponse;
  formProvider: AiProvider;
  onPick(provider: AiProvider): void;
  onDelete(entry: KeyEntry): void;
}

function ProviderCards({ data, formProvider, onPick, onDelete }: CardsProps): ReactNode {
  const { t } = useKeysText();
  return (
    <ul className="keys-cards" aria-label={t('keys.providers')} data-id="keys-cards">
      {AI_PROVIDERS.map((provider) => {
        const info = PROVIDERS[provider];
        const entry = entryOf(data, provider);
        const status: CardStatus = entry?.status ?? 'none';
        return (
          <li key={provider} className="keys-card" data-provider={provider} data-active={data.active?.provider === provider || undefined} data-id={`keys-card-${provider}`}>
            <button type="button" className="keys-orb" aria-label={t('keys.pick', { provider: info.name })} aria-pressed={formProvider === provider} onClick={() => onPick(provider)}>
              {info.mark}
            </button>
            <span className="keys-card-name">{info.name}</span>
            <StatusChip status={status} t={t} last4={entry?.last4} />
            <span className="keys-card-sub">{entry ? t('keys.sub.checked', { time: checkedTime(entry.lastCheckedAt ?? entry.updatedAt) }) : t('keys.sub.none')}</span>
            {entry && (
              <Button variant="ghost" size="lg" className="keys-delete" onClick={() => onDelete(entry)} dataId={`keys-delete-${provider}`}>
                {t('keys.delete')}
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

type FormState = { phase: 'idle' } | { phase: 'checking' } | { phase: 'saved' } | { phase: 'failed'; message: KeysMessageKey };

/** The sentence under the form for a refused save (ApiError codes of PUT /api/me/keys/:provider). */
export function saveErrorMessage(error: unknown): KeysMessageKey {
  const code = error instanceof ApiError ? error.code : null;
  switch (code) {
    case 'KEY_FORMAT':
      return 'keys.msg.format';
    case 'KEY_REJECTED':
      return 'keys.msg.rejected';
    case 'KEY_NO_CREDIT':
      return 'keys.msg.noCredit';
    case 'KEY_NO_MODEL':
      return 'keys.msg.noModel';
    case 'KEY_CHECK_FAILED':
      return 'keys.msg.checkFailed';
    case 'rate-limited':
      return 'keys.msg.rateLimited';
    case NETWORK_ERROR:
      return 'keys.msg.network';
    default:
      return 'keys.msg.other';
  }
}

interface KeyFormProps {
  provider: AiProvider;
  hasKey: boolean;
  onSaved(entry: KeyEntry): Promise<void>;
  /** The server said own keys are off (503 USER_KEYS_DISABLED): show the page's off state. */
  onDisabled(): Promise<void>;
}

function KeyForm({ provider, hasKey, onSaved, onDisabled }: KeyFormProps): ReactNode {
  const { t } = useKeysText();
  const info = PROVIDERS[provider];
  const [value, setValue] = useState('');
  const [form, setForm] = useState<FormState>({ phase: 'idle' });
  const title = t(hasKey ? 'keys.form.replace' : 'keys.form.add', { provider: info.name });

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (form.phase === 'checking') return;
    const key = value.trim();
    if (!key) {
      setForm({ phase: 'failed', message: 'keys.msg.empty' });
      return;
    }
    setForm({ phase: 'checking' });
    try {
      const entry = await saveKey(provider, key);
      // The key never stays in the page once the server has it.
      setValue('');
      setForm({ phase: 'saved' });
      await onSaved(entry);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'USER_KEYS_DISABLED') {
        await onDisabled();
        return;
      }
      if (!(error instanceof ApiError)) console.error('key save failed', error);
      setForm({ phase: 'failed', message: saveErrorMessage(error) });
    }
  }

  const message =
    form.phase === 'idle' ? t('keys.msg.idle', { company: info.company }) : form.phase === 'checking' ? t('keys.msg.checking', { company: info.company }) : form.phase === 'saved' ? t('keys.msg.saved') : t(form.message, { company: info.company });
  const button = form.phase === 'checking' ? t('keys.form.checking') : form.phase === 'saved' ? t('keys.form.saved') : form.phase === 'failed' ? t('keys.form.retry') : t('keys.form.save');

  return (
    <RimPanel variant="soft" radius="section" className="keys-form" label={title} dataId="keys-form">
      <form className="keys-form-body" data-phase={form.phase} onSubmit={(event) => void submit(event)} noValidate>
        <div className="keys-form-head">
          <span className="keys-form-orb" data-provider={provider} aria-hidden="true" />
          <h2 className="keys-form-title">{title}</h2>
        </div>
        <div className="keys-form-row">
          <TextField
            label={t('keys.form.label')}
            type="password"
            name={`${provider}-api-key`}
            autoComplete="off"
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              if (form.phase !== 'checking') setForm({ phase: 'idle' });
            }}
            variant="well"
            className="keys-field"
            dataId="keys-input"
          />
          <Button type="submit" variant="primary" size="xxl" className="keys-save" disabled={form.phase === 'checking'} dataId="keys-save">
            {form.phase === 'checking' && <Loader variant="spinner" label={button} hideLabel />}
            {form.phase === 'saved' && <Icon name="check" size={16} />}
            {button}
          </Button>
        </div>
        <span role="status" className="keys-form-message" data-id="keys-message">
          {message}
        </span>
        <a href={info.keysUrl} className="keys-where" target="_blank" rel="noopener noreferrer" data-id="keys-where">
          {t('keys.where', { provider: info.name })}
        </a>
      </form>
    </RimPanel>
  );
}

function KeysOff(): ReactNode {
  const { t } = useKeysText();
  return (
    <RimPanel variant="soft" radius="section" className="keys-form keys-off" tone="warn" dataId="keys-off">
      <div role="status" className="keys-off-body">
        <Icon name="lock" size={22} />
        <h2 className="keys-form-title">{t('keys.off.title')}</h2>
        <p className="keys-off-text">{t('keys.off.text')}</p>
      </div>
    </RimPanel>
  );
}

const USE_NOTE: Record<Exclude<CardStatus, 'ok'>, KeysMessageKey> = {
  none: 'keys.use.none',
  invalid: 'keys.use.invalid',
  quota: 'keys.use.quota',
  unreadable: 'keys.use.unreadable',
};

/** The model a provider would use: the active one, else the saved choice, else its default (listed first). */
function modelFor(data: KeysResponse, provider: AiProvider): string | undefined {
  if (data.active?.provider === provider) return data.active.model;
  if (data.prefs?.provider === provider) return data.prefs.model;
  return data.models[provider][0]?.id;
}

function UsePanel({ data, onChange }: { data: KeysResponse; onChange(data: KeysResponse): void }): ReactNode {
  const { t } = useKeysText();
  const selectId = useId();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const shown: AiProvider = data.active?.provider ?? data.prefs?.provider ?? 'openai';
  const models = data.models[shown];

  async function choose(provider: AiProvider, model: string | undefined): Promise<void> {
    if (!model) return;
    setPending(true);
    setFailed(false);
    try {
      onChange(await saveKeyPrefs({ provider, model }));
    } catch (error) {
      if (!(error instanceof ApiError)) console.error('key prefs failed', error);
      setFailed(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <RimPanel variant="soft" radius="section" className="keys-use" label={t('keys.use.title')} dataId="keys-use">
      <h2 className="keys-use-title">{t('keys.use.title')}</h2>
      <span className="keys-use-lead">{t('keys.use.lead')}</span>
      <fieldset className="keys-radios" disabled={!data.available || pending}>
        <legend className="kf-visually-hidden">{t('keys.use.providers')}</legend>
        {AI_PROVIDERS.map((provider) => {
          const status: CardStatus = entryOf(data, provider)?.status ?? 'none';
          const usable = status === 'ok';
          return (
            <label key={provider} className="keys-radio" data-on={data.active?.provider === provider || undefined} data-usable={usable || undefined}>
              <input type="radio" name="keys-provider" checked={data.active?.provider === provider} disabled={!usable} onChange={() => void choose(provider, modelFor(data, provider))} />
              <span className="keys-radio-name">{PROVIDERS[provider].name}</span>
              <span className="keys-radio-note">{usable ? modelFor(data, provider) : t(USE_NOTE[status])}</span>
            </label>
          );
        })}
      </fieldset>
      <label className="keys-model" htmlFor={selectId}>
        {t('keys.use.model')}
        <select id={selectId} value={data.active?.model ?? models[0]?.id ?? ''} disabled={!data.active || pending} onChange={(event) => void choose(shown, event.target.value)} data-id="keys-model">
          {models.map((model) => (
            <option key={model.id} value={model.id}>
              {modelOption(t, model)}
            </option>
          ))}
        </select>
      </label>
      {failed && (
        <span role="alert" className="keys-use-failed">
          {t('keys.use.failed')}
        </span>
      )}
      <div className="keys-legend">
        <span className="keys-legend-title">{t('keys.legend')}</span>
        <span className="keys-legend-chips">
          {(['none', 'ok', 'invalid', 'quota'] as const).map((status) => (
            <span key={status} className="keys-legend-chip" data-status={status}>
              {t(STATUS_LABEL[status])}
            </span>
          ))}
        </span>
      </div>
      {/* Not on the board: where the questions go, next to the choice that decides it (phase 7 asks for it). */}
      <p className="keys-use-privacy">{t('keys.privacy')}</p>
    </RimPanel>
  );
}

function DeleteDialog({ entry, onClose, onDeleted }: { entry: KeyEntry | null; onClose(): void; onDeleted(): Promise<void> }): ReactNode {
  const { t } = useKeysText();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const name = entry ? PROVIDERS[entry.provider].name : '';

  async function confirm(): Promise<void> {
    if (!entry) return;
    setBusy(true);
    setFailed(false);
    try {
      await deleteKey(entry.provider);
      await onDeleted();
      onClose();
    } catch (error) {
      if (!(error instanceof ApiError)) console.error('key delete failed', error);
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={entry !== null}
      onClose={() => {
        setFailed(false);
        onClose();
      }}
      title={t('keys.delete.title', { provider: name, last4: entry?.last4 ?? '' })}
      description={t('keys.delete.text')}
      actionsLayout="stretch"
      dataId="keys-delete-dialog"
      actions={
        <>
          <Button variant="warn" size="lg" disabled={busy} onClick={() => void confirm()} dataId="keys-delete-confirm">
            {t('keys.delete')}
          </Button>
          <Button variant="ghost" size="lg" onClick={onClose} dataId="keys-delete-keep">
            {t('keys.delete.keep')}
          </Button>
        </>
      }
    >
      {failed && (
        <span role="alert" className="keys-delete-failed">
          {t('keys.delete.failed')}
        </span>
      )}
    </Modal>
  );
}

function KeysLoading(): ReactNode {
  const { t } = useKeysText();
  return (
    <div className="keys-cards keys-loading" aria-busy="true" aria-label={t('keys.loading')} data-id="keys-loading">
      {AI_PROVIDERS.map((provider) => (
        <div key={provider} className="keys-card">
          <Skeleton width={84} height={84} circle tone="glow" />
          <Skeleton width="50%" height={18} radius={8} tone="glow" />
          <Skeleton width="60%" height={28} radius={14} tone="glow" />
        </div>
      ))}
    </div>
  );
}

interface ReadyProps {
  data: KeysResponse;
  setData(data: KeysResponse): void;
  refresh(): Promise<void>;
  reload(): Promise<void>;
  onDelete(entry: KeyEntry): void;
}

function KeysReady({ data, setData, refresh, reload, onDelete }: ReadyProps): ReactNode {
  const [picked, setPicked] = useState<AiProvider | null>(null);
  const formProvider = picked ?? defaultFormProvider(data);

  async function saved(entry: KeyEntry): Promise<void> {
    // Stay on this provider (the default would move on to the next one without a key) and show the new state at once.
    setPicked(entry.provider);
    setData({ ...data, keys: [...data.keys.filter((k) => k.provider !== entry.provider), entry] });
    await refresh();
  }

  return (
    <>
      <ProviderCards data={data} formProvider={formProvider} onPick={setPicked} onDelete={onDelete} />
      {data.available ? <KeyForm key={formProvider} provider={formProvider} hasKey={entryOf(data, formProvider) !== undefined} onSaved={saved} onDisabled={reload} /> : <KeysOff />}
      <UsePanel data={data} onChange={setData} />
    </>
  );
}

export function KeysScreen(): ReactNode {
  const { t } = useKeysText();
  const { t: appText } = useI18n();
  const { load, setData, refresh, reload } = useKeys();
  const [deleting, setDeleting] = useState<KeyEntry | null>(null);
  const state = load.status === 'ready' ? (load.data.available ? 'ready' : 'off') : load.status;
  return (
    <AppShell screen="F03" rail="settings" veil="radial" stars={false} className="keys-shell">
      <div className="keys-screen" data-id="keys-screen" data-state={state}>
        <div className="keys-board">
          <img className="keys-art" src={ILLUSTRATIONS['key-crystal']} alt="" aria-hidden="true" width={120} height={120} />
          <header className="keys-head">
            <h1 className="keys-title">{appText('screen.F03')}</h1>
            <p className="keys-lead">{t('keys.lead')}</p>
          </header>
          {load.status === 'loading' && <KeysLoading />}
          {load.status === 'failed' && (
            <div className="keys-error">
              <ErrorPanel kind="server" onRetry={reload} />
            </div>
          )}
          {load.status === 'ready' && <KeysReady data={load.data} setData={setData} refresh={refresh} reload={reload} onDelete={setDeleting} />}
        </div>
        {/* Outside the scaled board layer: its transform would hold the dialog's fixed backdrop. */}
        <DeleteDialog entry={deleting} onClose={() => setDeleting(null)} onDeleted={refresh} />
      </div>
    </AppShell>
  );
}
