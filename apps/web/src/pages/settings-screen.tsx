/**
 * "Trạm điều khiển" (board H03, /settings): the account's own settings around its orb.
 * - The hoandat account (name, email), the other hoandat apps on the same account, and the way to the workspace
 *   settings (admins, C19) or the review queue (reviewers, A01).
 * - Language (the UI and the account's reading language), theme Tối / Sáng / Theo hệ thống and "Giảm chuyển động":
 *   applied at once to every screen, kept per account on the server and in this browser for the first paint
 *   (ui/display-prefs.ts). The theme switch lives only here.
 * - How C08 and A02 open on this device (orbit or list), what is kept offline here (Office copies and unsent drafts)
 *   with "Xoá bộ nhớ đệm" (synced copies only), the own keys (F03), signing out, and "Xoá dữ liệu của tôi" (a typed
 *   confirmation; what goes and what stays is listed before anything happens).
 */
import { type CSSProperties, type ReactNode, useCallback, useEffect, useId, useRef, useState } from 'react';
import { writePreference } from '@achoo254/app-shell/preferences';
import { fetchMe, type Me, updateMe } from '../api/content-api';
import { type KeysResponse, fetchKeys } from '../api/keys-api';
import { REMEMBERED_ACCOUNT_KEY, signOut } from '../api/session-api';
import { deleteMyData } from '../api/workspace-api';
import { brand } from '../brand';
import { type Locale, useI18n } from '../i18n/i18n';
import { AppShell, SHELL_PATHS, accountInitial } from '../layout/app-shell';
import { signedInUser, useSessionState } from '../layout/session-context';
import { Button } from '../ui/button';
import { type DefaultView, type DisplayPrefs, type ThemeChoice, applyPrefs, readDefaultView, readStoredPrefs, storeDefaultView } from '../ui/display-prefs';
import { Modal } from '../ui/modal';
import { useTheme } from '../ui/theme';
import { Toast } from '../ui/toast';
import { deleteDraft, listDrafts } from './editor-drafts';
import { PROVIDERS } from './keys-messages';
import { type StorageStatus, clearSyncedCopies, forgetAccountFiles, listEntries, pending, storageStatus } from './office-store';
import { type SettingsMessageKey, sizeText, useSettingsText } from './settings-messages';
import type { ScreenTranslate } from './space-messages';
import './settings-screen.css';

type T = ScreenTranslate<SettingsMessageKey>;

/** The other apps of the hoandat account (their own subdomains), in the board's order. */
export const HOANDAT_APPS = [
  { id: 'scribe', name: 'Scribe', href: 'https://scribe.hoandat.com', tone: 'cyan' },
  { id: 'chat', name: 'Chat', href: 'https://chat.hoandat.com', tone: 'emerald' },
  { id: 'localman', name: 'Localman', href: 'https://localman.hoandat.com', tone: 'amber' },
  { id: 'miu', name: 'Miu', href: 'https://miu.hoandat.com', tone: 'pink' },
] as const;

/** The board's centre and the six cards its dashed lines run to (board coordinates, before the stage's scale). */
const CENTRE = { x: 720, y: 440 };
const LINE_ENDS: ReadonlyArray<readonly [number, number]> = [
  [300, 230],
  [1140, 230],
  [250, 520],
  [1190, 520],
  [450, 740],
  [990, 740],
];
const LINES = LINE_ENDS.map(([x, y]) => {
  const dx = x - CENTRE.x;
  const dy = y - CENTRE.y;
  return { length: Math.sqrt(dx * dx + dy * dy), angle: (Math.atan2(dy, dx) * 180) / Math.PI };
});

/** The 70 stars of board H03 (its own formula, not C09's). */
const STATION_STARS = Array.from({ length: 70 }, (_, j) => ({ x: (j * 211) % 1440, y: (j * 97 + 31) % 900, r: j % 4 === 0 ? 2 : 1 }));

const THEME_ICON: Record<ThemeChoice, string> = {
  dark: 'M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10z',
  light: 'M12 4V2M12 22v-2M4 12H2M22 12h-2M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z',
  system: 'M3 5h18v11H3zM8 20h8M12 16v4',
};

const LANGUAGE_NAMES: Record<Locale, string> = { vi: 'Tiếng Việt', en: 'English' };

/**
 * The account as the server keeps it; the screen works from the session and this browser's copy until it answers.
 * `onArrive` sees it first (the server's display settings win over this browser's copy, unless already changed here).
 */
function useMe(onArrive: (me: Me) => void): { me: Me | null; setMe(me: Me): void } {
  const [me, setMe] = useState<Me | null>(null);
  const arrive = useRef(onArrive);
  useEffect(() => {
    arrive.current = onArrive;
  }, [onArrive]);
  useEffect(() => {
    let live = true;
    fetchMe().then(
      (next) => {
        if (!live) return;
        arrive.current(next);
        setMe(next);
      },
      (error: unknown) => console.warn('settings: account not loaded', error),
    );
    return () => {
      live = false;
    };
  }, []);
  return { me, setMe };
}

function useKeysSummary(): KeysResponse | null | 'loading' {
  const [keys, setKeys] = useState<KeysResponse | null | 'loading'>('loading');
  useEffect(() => {
    let live = true;
    fetchKeys().then(
      (next) => live && setKeys(next),
      () => live && setKeys(null),
    );
    return () => {
      live = false;
    };
  }, []);
  return keys;
}

interface OfflineState {
  storage: StorageStatus | null;
  files: number;
  drafts: number;
}

async function readOffline(userId: string | null): Promise<OfflineState> {
  const [storage, entries, drafts] = await Promise.all([storageStatus(), userId ? listEntries(userId) : [], userId ? listDrafts(userId) : []]);
  return { storage, files: entries.length, drafts: drafts.length + pending(entries).length };
}

function useOffline(userId: string | null): { state: OfflineState; reload(): Promise<void> } {
  const [state, setState] = useState<OfflineState>({ storage: null, files: 0, drafts: 0 });
  useEffect(() => {
    let live = true;
    readOffline(userId).then(
      (next) => live && setState(next),
      (error: unknown) => console.warn('offline storage not read', error),
    );
    return () => {
      live = false;
    };
  }, [userId]);
  const reload = useCallback(async () => setState(await readOffline(userId)), [userId]);
  return { state, reload };
}

function Svg({ d, size = 18, strokeWidth = 2 }: { d: string; size?: number; strokeWidth?: number }): ReactNode {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

function StaffLink({ me, t }: { me: Me | null; t: T }): ReactNode {
  if (!me?.canReview) return null;
  const admin = me.isAdmin;
  return (
    <a className="h03-staff" href={admin ? SHELL_PATHS.workspace : SHELL_PATHS.adminReview} data-id="settings-staff">
      <Svg d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z" />
      <span className="h03-fill">{admin ? t('settings.workspace') : t('settings.review')}</span>
      <span className="h03-staff-badge">{admin ? t('settings.workspace.badge') : t('settings.review.badge')}</span>
    </a>
  );
}

function DeleteDialog({ open, onClose, userId, t }: { open: boolean; onClose(): void; userId: string | null; t: T }): ReactNode {
  const word = t('settings.delete.word');
  const [typed, setTyped] = useState('');
  const [removePublished, setRemovePublished] = useState(false);
  const [state, setState] = useState<{ kind: 'idle' } | { kind: 'busy' } | { kind: 'failed' } | { kind: 'done'; count: number }>({ kind: 'idle' });
  const inputId = useId();
  const close = (): void => {
    if (state.kind === 'busy' || state.kind === 'done') return;
    setTyped('');
    setRemovePublished(false);
    setState({ kind: 'idle' });
    onClose();
  };
  const confirmed = typed.trim().toLocaleUpperCase() === word.toLocaleUpperCase();
  async function remove(): Promise<void> {
    if (!confirmed || state.kind === 'busy') return;
    setState({ kind: 'busy' });
    try {
      const result = await deleteMyData(typed.trim(), removePublished);
      // What this browser kept of the account goes too: its offline copies and drafts, the remembered account.
      if (userId) {
        await forgetAccountFiles(userId).catch((error: unknown) => console.warn('offline copies not cleared', error));
        for (const draft of await listDrafts(userId).catch(() => [])) await deleteDraft(draft.id).catch(() => undefined);
      }
      try {
        localStorage.removeItem(REMEMBERED_ACCOUNT_KEY);
      } catch {
        // Storage blocked: nothing was remembered.
      }
      setState({ kind: 'done', count: result.deletedDocuments });
      window.setTimeout(() => window.location.assign('/'), 1500);
    } catch (error) {
      console.error('delete my data failed', error);
      setState({ kind: 'failed' });
    }
  }
  return (
    <Modal
      open={open}
      onClose={close}
      tone="danger"
      title={t('settings.delete.title')}
      description={t('settings.delete.text')}
      dataId="settings-delete-dialog"
      actions={
        <>
          <Button variant="ghost" onClick={close} disabled={state.kind === 'busy' || state.kind === 'done'}>
            {t('settings.delete.cancel')}
          </Button>
          <Button variant="danger-solid" onClick={() => void remove()} disabled={!confirmed || state.kind === 'busy' || state.kind === 'done'} dataId="settings-delete-confirm">
            {state.kind === 'busy' ? t('settings.delete.busy') : t('settings.delete.confirm')}
          </Button>
        </>
      }
    >
      <dl className="h03-delete-list">
        <dt>{t('settings.delete.gone')}</dt>
        <dd>{t('settings.delete.gone.list')}</dd>
        <dt>{t('settings.delete.kept')}</dt>
        <dd>{t('settings.delete.kept.list')}</dd>
      </dl>
      <label className="h03-delete-check">
        <input type="checkbox" checked={removePublished} onChange={(event) => setRemovePublished(event.target.checked)} data-id="settings-delete-published" />
        {t('settings.delete.published')}
      </label>
      <label className="h03-delete-type" htmlFor={inputId}>
        {t('settings.delete.type', { word })}
      </label>
      <input id={inputId} className="h03-delete-input" value={typed} autoComplete="off" spellCheck={false} onChange={(event) => setTyped(event.target.value)} data-id="settings-delete-input" />
      {state.kind === 'failed' && (
        <span role="alert" className="h03-delete-error">
          {t('settings.delete.failed')}
        </span>
      )}
      {state.kind === 'done' && (
        <span role="status" className="h03-delete-done">
          {t('settings.delete.done', { count: state.count })}
        </span>
      )}
    </Modal>
  );
}

export function SettingsScreen(): ReactNode {
  const { t, locale } = useSettingsText();
  const { setLocale } = useI18n();
  const user = signedInUser(useSessionState());
  const userId = user?.id ?? null;
  // What the person picked here; until then the server's settings, and this browser's copy before they arrive.
  const [chosen, setChosen] = useState<DisplayPrefs | null>(null);
  const chosenRef = useRef(false);
  const { me, setMe } = useMe(
    useCallback((arrived: Me) => {
      if (!chosenRef.current) applyPrefs({ theme: arrived.theme, reducedMotion: arrived.reducedMotion });
    }, []),
  );
  const keys = useKeysSummary();
  const offline = useOffline(userId);
  const resolved = useTheme();
  const [stored] = useState<DisplayPrefs>(readStoredPrefs);
  const prefs: DisplayPrefs = chosen ?? (me ? { theme: me.theme, reducedMotion: me.reducedMotion } : stored);
  const [view, setView] = useState<DefaultView>(readDefaultView);
  const [toast, setToast] = useState<string | null>(null);
  const [cleared, setCleared] = useState(false);
  const [logout, setLogout] = useState(false);
  const [deleting, setDeleting] = useState(false);

  /** Applies a change at once, then keeps it on the server; a failed save keeps it here and says so. */
  async function change(next: DisplayPrefs): Promise<void> {
    chosenRef.current = true;
    setChosen(next);
    applyPrefs(next);
    try {
      setMe(await updateMe({ theme: next.theme, reducedMotion: next.reducedMotion }));
    } catch (error) {
      console.warn('settings not saved', error);
      setToast(t('settings.saveFailed'));
    }
  }

  async function chooseLanguage(next: Locale): Promise<void> {
    if (next === locale) return;
    writePreference('lang', next, { domain: brand.primaryTenant.domain });
    setLocale(next);
    try {
      setMe(await updateMe({ lang: next }));
    } catch (error) {
      console.warn('language not saved', error);
      setToast(t('settings.saveFailed'));
    }
  }

  function chooseView(next: DefaultView): void {
    setView(next);
    storeDefaultView(next);
  }

  async function clearCache(): Promise<void> {
    if (!userId) return;
    try {
      await clearSyncedCopies(userId);
      setCleared(true);
      await offline.reload();
    } catch (error) {
      console.error('cache not cleared', error);
      setToast(t('settings.offline.clearFailed'));
    }
  }

  async function doSignOut(): Promise<void> {
    try {
      await signOut();
      window.location.assign('/');
    } catch (error) {
      console.error('sign-out failed', error);
      setLogout(false);
      setToast(t('settings.logout.failed'));
    }
  }

  const name = me?.name ?? user?.name ?? null;
  const email = me?.email ?? user?.email ?? null;
  const initial = user ? accountInitial(user) : '·';
  const { storage } = offline.state;
  const percent = storage?.usage !== null && storage?.usable ? Math.min(100, Math.round((storage.usage / storage.usable) * 100)) : 0;
  const keyLine = keys === 'loading' ? t('settings.keys.loading') : keys?.active ? t('settings.keys.active', { provider: PROVIDERS[keys.active.provider].name, last4: keys.active.last4 }) : t('settings.keys.none');

  return (
    <AppShell screen="H03" rail="settings" veil="station" stars={false} className="h03-shell">
      {STATION_STARS.map((star, index) => {
        const style: CSSProperties = { left: star.x, top: star.y, width: star.r, height: star.r };
        return <span key={index} className="h03-star" aria-hidden="true" style={style} />;
      })}
      <div className="h03-stage" data-id="settings-stage">
        <h1 className="h03-title">{t('settings.title')}</h1>
        <a className="h03-back" href={SHELL_PATHS.universe}>
          <Svg d="M6 6l12 12M18 6L6 18" size={16} strokeWidth={2.4} />
          {t('settings.back')}
        </a>

        {LINES.map((line, index) => (
          <span key={index} className="h03-line" aria-hidden="true" style={{ width: line.length, transform: `rotate(${line.angle}deg)` }} />
        ))}
        <span className="h03-ring" aria-hidden="true">
          <span className="h03-ring-dot" />
        </span>
        <div className="h03-orb" aria-hidden="true">
          <span className="h03-orb-initial">{initial}</span>
          <span className="h03-orb-name">{name ?? ''}</span>
        </div>

        <section className="h03-card h03-account" aria-label={t('settings.account')} data-id="settings-account">
          <span className="h03-label">{t('settings.account')}</span>
          <div className="h03-who">
            {user?.picture ? <img className="h03-avatar" src={user.picture} alt="" /> : <span className="h03-avatar" aria-hidden="true">{initial}</span>}
            <div className="h03-who-text">
              <span className="h03-name">{name ?? t('settings.account.noName')}</span>
              <span className="h03-email">{email ?? t('settings.account.noEmail')}</span>
            </div>
          </div>
          <span className="h03-label h03-label-plain">{t('settings.apps')}</span>
          <div className="h03-apps">
            {HOANDAT_APPS.map((app) => (
              <a key={app.id} className="h03-app" href={app.href} aria-label={t('settings.apps.open', { name: app.name })} data-tone={app.tone}>
                <span className="h03-app-orb" />
                {app.name}
              </a>
            ))}
          </div>
          <StaffLink me={me} t={t} />
        </section>

        <section className="h03-card h03-look" aria-label={`${t('settings.lang')} · ${t('settings.motion')}`} data-id="settings-look">
          <span className="h03-label">{t('settings.lang')}</span>
          <div role="group" aria-label={t('settings.lang')} className="h03-pair">
            {(['vi', 'en'] as const).map((l) => (
              <button key={l} type="button" className="h03-choice h03-lang" aria-pressed={locale === l} onClick={() => void chooseLanguage(l)} data-id={`settings-lang-${l}`}>
                {LANGUAGE_NAMES[l]}
              </button>
            ))}
          </div>
          <span className="h03-label">{t('settings.theme')}</span>
          <div role="radiogroup" aria-label={t('settings.theme')} className="h03-pair">
            {(['dark', 'light', 'system'] as const).map((theme) => (
              <button
                key={theme}
                type="button"
                role="radio"
                aria-checked={prefs.theme === theme}
                className="h03-choice h03-theme"
                onClick={() => void change({ ...prefs, theme })}
                data-id={`settings-theme-${theme}`}
              >
                <Svg d={THEME_ICON[theme]} size={15} strokeWidth={2.2} />
                {t(`settings.theme.${theme}`)}
              </button>
            ))}
          </div>
          {prefs.theme === 'system' && (
            <span className="h03-note" data-id="settings-theme-follows">
              {t('settings.theme.follows', { theme: t(`settings.theme.${resolved}`) })}
            </span>
          )}
          <div className="h03-motion">
            <div className="h03-motion-text">
              <span className="h03-motion-title">{t('settings.motion')}</span>
              <span className="h03-note">{t('settings.motion.sub')}</span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={prefs.reducedMotion}
              aria-label={t('settings.motion')}
              className="h03-switch"
              onClick={() => void change({ ...prefs, reducedMotion: !prefs.reducedMotion })}
              data-id="settings-motion"
            >
              <span className="h03-knob" />
            </button>
          </div>
          {prefs.reducedMotion && <span className="h03-motion-on">{t('settings.motion.on')}</span>}
        </section>

        <section className="h03-card h03-view" aria-label={t('settings.view')} data-id="settings-view">
          <span className="h03-label">{t('settings.view')}</span>
          <div className="h03-views">
            <button type="button" className="h03-view-choice" aria-pressed={view === 'orbit'} onClick={() => chooseView('orbit')} data-id="settings-view-orbit">
              <span className="h03-view-orbit" aria-hidden="true">
                <span />
                <span />
              </span>
              {t('settings.view.orbit')}
            </button>
            <button type="button" className="h03-view-choice" aria-pressed={view === 'list'} onClick={() => chooseView('list')} data-id="settings-view-list">
              <span className="h03-view-list" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
              {t('settings.view.list')}
            </button>
          </div>
          <span className="h03-note">{t('settings.view.note')}</span>
        </section>

        <section className="h03-card h03-offline" aria-label={t('settings.offline')} data-id="settings-offline">
          <span className="h03-label">{t('settings.offline')}</span>
          {storage?.usage !== null && storage?.usable ? (
            <div className="h03-used">
              <span className="h03-used-size">{sizeText(storage.usage, locale)}</span>
              <span className="h03-note">{t('settings.offline.allowed', { size: sizeText(storage.usable, locale) })}</span>
            </div>
          ) : (
            <span className="h03-note">{t('settings.offline.unknown')}</span>
          )}
          <div role="progressbar" aria-label={t('settings.offline.usage')} aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} className="h03-bar">
            <span style={{ width: `${percent}%` }} />
          </div>
          <span className="h03-note" role="status">
            {cleared ? t('settings.offline.cleared') : t('settings.offline.note', { files: offline.state.files, drafts: offline.state.drafts })}
          </span>
          <button type="button" className="h03-clear" onClick={() => void clearCache()} disabled={!userId} data-id="settings-clear-cache">
            {t('settings.offline.clear')}
          </button>
        </section>

        <a className="h03-card h03-row h03-keys" href={SHELL_PATHS.keys} data-id="settings-keys">
          <span className="h03-row-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <circle cx="8" cy="15" r="4" />
              <path d="M11 12l9-9M17 6l3 3M15 8l2 2" />
            </svg>
          </span>
          <span className="h03-row-text">
            <span className="h03-row-title">{t('settings.keys')}</span>
            <span className="h03-note">{keyLine}</span>
          </span>
          <Svg d="M9 6l6 6-6 6" strokeWidth={2.4} />
        </a>

        <button type="button" className="h03-card h03-row h03-logout" onClick={() => setLogout(true)} data-id="settings-logout">
          <span className="h03-row-icon">
            <Svg d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10" size={22} />
          </span>
          <span className="h03-row-text">
            <span className="h03-row-title">{t('settings.logout')}</span>
            <span className="h03-note">{t('settings.logout.sub')}</span>
          </span>
        </button>

        <button type="button" className="h03-delete" onClick={() => setDeleting(true)} data-id="settings-delete">
          <Svg d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" size={14} />
          {t('settings.delete')}
        </button>
      </div>

      <Modal
        open={logout}
        onClose={() => setLogout(false)}
        title={t('settings.logout.title')}
        description={t('settings.logout.text')}
        actionsLayout="stretch"
        dataId="settings-logout-dialog"
        actions={
          <>
            <Button variant="ghost" onClick={() => setLogout(false)}>
              {t('settings.logout.stay')}
            </Button>
            <Button variant="danger-solid" onClick={() => void doSignOut()} dataId="settings-logout-confirm">
              {t('settings.logout')}
            </Button>
          </>
        }
      />
      <DeleteDialog open={deleting} onClose={() => setDeleting(false)} userId={userId} t={t} />
      {toast && <Toast tone="error" message={toast} onClose={() => setToast(null)} className="h03-toast" />}
    </AppShell>
  );
}
