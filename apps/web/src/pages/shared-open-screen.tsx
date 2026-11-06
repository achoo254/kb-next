/**
 * Opening a share link (board H02, /l/:token), signed in or not. The server logs each opening (when, and the account
 * or a guest).
 *
 * - Signed out: the text's card (title, author, its sections, reading time), "Đăng nhập để mở" (back here after
 *   signing in) and a peek at its first section.
 * - Signed in: the text opened in the reader's Universe: its sections as stops, "Lưu vào vũ trụ của bạn" (a
 *   favourite), "Remix" when the link allows it (a draft copy, then the editor), "Đọc" (the reader, C11).
 * - Expired or revoked: "Link này đã tắt".
 * - Private: the text is no longer published (an admin hid it, say) and the viewer may not read it: "Hành tinh riêng
 *   tư", nothing about the text.
 * - No such link, and a failed load (with Thử lại).
 */
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { ApiError, NETWORK_ERROR } from '../api/api-client';
import { setFavorite } from '../api/authoring-api';
import { LOGIN_PATH } from '../api/session-api';
import { type SharedPreview, openSharedLink, remixShared } from '../api/share-api';
import { AppShell, SHELL_PATHS } from '../layout/app-shell';
import { LegalLinks } from '../layout/legal-links';
import { ILLUSTRATIONS, type IllustrationName } from '../ui/art';
import { Icon } from '../ui/icon';
import { type ShareMessageKey, useShareText } from './share-messages';
import './shared-open-screen.css';
import { navigate } from '../router/navigation';

export type OpenState = 'loading' | 'guest' | 'member' | 'expired' | 'revoked' | 'private' | 'not-found' | 'failed';
type Load = { state: 'loading' } | { state: 'guest' | 'member'; preview: SharedPreview } | { state: Exclude<OpenState, 'loading' | 'guest' | 'member'> };

/** The screen's state for an API error code. */
export function openStateOf(code: string): Exclude<OpenState, 'loading' | 'guest' | 'member'> {
  if (code === 'link-expired') return 'expired';
  if (code === 'link-revoked') return 'revoked';
  if (code === 'private') return 'private';
  if (code === 'not-found') return 'not-found';
  return 'failed';
}

/** Where a stop of the signed-in view sits (the board's five), its colour cycling. */
const STOPS: ReadonlyArray<readonly [number, number]> = [
  [230, 600],
  [480, 420],
  [760, 540],
  [1010, 360],
  [1250, 520],
];
const TONES = ['violet', 'cyan', 'teal', 'amber', 'emerald'] as const;

export function SharedOpenScreen({ token }: { token: string }): ReactNode {
  const { t } = useShareText();
  const [load, setLoad] = useState<Load>({ state: 'loading' });

  const open = useCallback(
    () =>
      openSharedLink(token).then(
        (preview) => setLoad({ state: preview.signedIn ? 'member' : 'guest', preview }),
        (error: unknown) => setLoad({ state: openStateOf(error instanceof ApiError ? error.code : NETWORK_ERROR) }),
      ),
    [token],
  );
  useEffect(() => {
    void open();
  }, [open]);

  return (
    <AppShell screen="H02" view="docs" veil="radial" stars={false} className="open-shell">
      <div className="open-screen" data-id="open-screen" data-state={load.state}>
        <div className="open-address">
          <Icon name="link" size={16} strokeWidth={2} />
          <span aria-label={t('open.linkAddress')}>
            {window.location.host}/l/{token.slice(0, 4)}…
          </span>
        </div>
        <div className="open-content">
          {load.state === 'loading' && (
            <p className="open-loading" role="status">
              {t('share.loading')}
            </p>
          )}
          {load.state === 'guest' && <GuestCard token={token} preview={load.preview} />}
          {load.state === 'member' && <MemberView token={token} preview={load.preview} />}
          {load.state === 'expired' && <OffState art="vault-lock" grey title="open.expired.title" text="open.expired.text" />}
          {load.state === 'revoked' && <OffState art="vault-lock" grey title="open.expired.title" text="open.revoked.text" />}
          {load.state === 'private' && <OffState art="vault-lock" ring title="open.private.title" text="open.private.text" />}
          {load.state === 'not-found' && <OffState art="blackhole" title="open.notFound.title" text="open.notFound.text" />}
          {load.state === 'failed' && <OffState art="crystal-cracked" title="open.failed.title" text="open.failed.text" onRetry={() => void open()} />}
        </div>
        <LegalLinks className="open-legal" />
      </div>
    </AppShell>
  );
}

function GuestCard({ token, preview }: { token: string; preview: SharedPreview }): ReactNode {
  const { t } = useShareText();
  const [peek, setPeek] = useState(false);
  const doc = preview.document;
  const author = doc.authorName ?? '';
  const login = `${LOGIN_PATH}?${new URLSearchParams({ return: `/l/${token}` }).toString()}`;
  return (
    <>
      <img src={ILLUSTRATIONS['wormhole-gate']} alt="" aria-hidden="true" className="open-portal" />
      <div className="open-portal-ring" aria-hidden="true">
        <span />
      </div>
      <section className="open-card" aria-label={doc.title} data-id="open-card">
        <span className="open-badge">{t('open.badge')}</span>
        <h1 className="open-title">{doc.title}</h1>
        <div className="open-meta">
          <span className="open-avatar" aria-hidden="true">
            {Array.from(author || '·')[0]?.toLocaleUpperCase()}
          </span>
          <span className="open-author">{author}</span>
          <span className="open-meta-sub">{t('open.meta', { sections: doc.sections.length, minutes: doc.readingMinutes })}</span>
        </div>
        {doc.sections.length > 0 && (
          <div className="open-steps">
            {doc.sections.slice(0, 5).map((section, i) => (
              <span key={`${i}-${section}`} className="open-step" data-tone={TONES[i % TONES.length]} data-first={i === 0 || undefined}>
                {section}
              </span>
            ))}
          </div>
        )}
        <div className="open-actions">
          <a className="open-primary" href={login} data-id="open-sign-in">
            {t('open.signIn')}
          </a>
          {doc.peek && (
            <button type="button" className="open-ghost" aria-expanded={peek} onClick={() => setPeek(!peek)} data-id="open-peek">
              {peek ? t('open.peekHide') : t('open.peek')}
            </button>
          )}
        </div>
        {peek && doc.peek && (
          <div className="open-peek" data-id="open-peek-text">
            <span className="open-peek-label">{Array.from(doc.peek.heading ?? doc.title).slice(0, 6).join('')}</span>
            <span className="open-peek-text">{doc.peek.text}</span>
          </div>
        )}
        <span className="open-note">{t('open.signInNote')}</span>
      </section>
    </>
  );
}

function MemberView({ token, preview }: { token: string; preview: SharedPreview }): ReactNode {
  const { t } = useShareText();
  const doc = preview.document;
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const stops = doc.sections.slice(0, STOPS.length);

  const act = async (action: () => Promise<void>): Promise<void> => {
    setBusy(true);
    setFailed(false);
    try {
      await action();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="open-path" aria-hidden="true">
        {stops.slice(1).map((_, i) => {
          const from = STOPS[i] ?? [0, 0];
          const to = STOPS[i + 1] ?? from;
          const dx = to[0] - from[0];
          const dy = to[1] - from[1];
          return (
            <span
              key={`seg-${i}`}
              className="open-seg"
              data-tone={TONES[(i + 1) % TONES.length]}
              style={{ left: from[0], top: from[1], width: Math.hypot(dx, dy), transform: `rotate(${(Math.atan2(dy, dx) * 180) / Math.PI}deg)` }}
            />
          );
        })}
        {stops.map((section, i) => {
          const [x, y] = STOPS[i] ?? [0, 0];
          return (
            <span key={`stop-${i}`} className="open-stop" data-tone={TONES[i % TONES.length]} style={{ left: x - 48, top: y - 48 }}>
              {Array.from(section).slice(0, 10).join('')}
            </span>
          );
        })}
      </div>
      <section className="open-bar" aria-label={doc.title} data-id="open-member">
        <div className="open-bar-text">
          <h1 className="open-bar-title">{doc.title}</h1>
          <span className="open-bar-sub">{t('open.by', { name: doc.authorName ?? '' })}</span>
        </div>
        <button
          type="button"
          className="open-save"
          data-saved={saved || undefined}
          disabled={busy || saved}
          onClick={() =>
            void act(async () => {
              await setFavorite(doc.id, true);
              setSaved(true);
            })
          }
          data-id="open-save"
        >
          <Icon name={saved ? 'check' : 'plus'} size={16} strokeWidth={2.4} />
          {saved ? t('open.saved') : t('open.save')}
        </button>
        {preview.canRemix && (
          <button
            type="button"
            className="open-outline"
            disabled={busy}
            onClick={() =>
              void act(async () => {
                const id = await remixShared(token);
                navigate(`/d/${encodeURIComponent(id)}/edit`);
              })
            }
            data-id="open-remix"
          >
            {busy ? t('open.remixing') : t('open.remix')}
          </button>
        )}
        <a className="open-run" href={`/d/${encodeURIComponent(doc.id)}`} data-id="open-read">
          <Icon name="play" size={14} />
          {t('open.read')}
        </a>
      </section>
      {failed && (
        <p className="open-failed" role="alert">
          {t('open.failed')}
        </p>
      )}
    </>
  );
}

interface OffProps {
  art: IllustrationName;
  title: ShareMessageKey;
  text: ShareMessageKey;
  /** The expired look: the art greyed out. */
  grey?: boolean;
  /** The private look: a dashed amber ring around the art. */
  ring?: boolean;
  onRetry?: () => void;
}

function OffState({ art, title, text, grey = false, ring = false, onRetry }: OffProps): ReactNode {
  const { t } = useShareText();
  return (
    <section className="open-off" data-ring={ring || undefined} aria-labelledby="open-off-title" data-id="open-off">
      <div className="open-off-art" aria-hidden="true">
        {ring && <span className="open-off-ring" />}
        <img src={ILLUSTRATIONS[art]} alt="" data-grey={grey || undefined} />
      </div>
      <h1 className="open-off-title" id="open-off-title">
        {t(title)}
      </h1>
      <span className="open-off-text">{t(text)}</span>
      <div className="open-off-actions">
        {onRetry ? (
          <button type="button" className="open-primary open-primary-sm" onClick={onRetry}>
            {t('open.retry')}
          </button>
        ) : (
          <a className="open-primary open-primary-sm" href={SHELL_PATHS.universe}>
            {t('open.home')}
          </a>
        )}
        <a className="open-ghost open-ghost-sm" href={SHELL_PATHS.search}>
          {t('open.similar')}
        </a>
      </div>
    </section>
  );
}
