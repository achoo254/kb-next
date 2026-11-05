/**
 * The two forms of the create ring's panel (C01): the personal Space (an account has one, made here or with its first
 * note) and a new Collection (in the personal Space; admins may pick a public one too).
 */
import { type FormEvent, type ReactNode, useCallback, useEffect, useId, useState } from 'react';
import { ApiError, NETWORK_ERROR } from '../api/api-client';
import { createCollection, ensurePersonalSpace } from '../api/authoring-api';
import { fetchMe, fetchSpaces } from '../api/content-api';
import { CRYSTAL_ART } from '../ui/art';
import { Button } from '../ui/button';
import { Icon } from '../ui/icon';
import { type CreateMessageKey, useCreateText } from './create-messages';
import { spaceName } from './space-panels';

/** A Space a Collection may go in. */
export interface PlaceSpace {
  slug: string;
  nameVi: string;
  nameEn: string;
}

export interface Places {
  /** The account's personal Space; null until it is made. */
  personal: PlaceSpace | null;
  /** Public Spaces: only an admin adds Collections to them. */
  shared: PlaceSpace[];
  isAdmin: boolean;
}

export type PlacesState = { status: 'loading' } | { status: 'failed'; retry(): void } | { status: 'ready'; places: Places; setPersonal(space: PlaceSpace): void };

type PlacesResult = { attempt: number; places: Places | null };

/** The Spaces and whether the account is an admin, loaded when a form opens. */
export function usePlaces(active: boolean): PlacesState {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<PlacesResult | null>(null);
  useEffect(() => {
    if (!active) return;
    let current = true;
    Promise.all([fetchSpaces(), fetchMe()]).then(
      ([spaces, me]) => {
        if (!current) return;
        const brief = ({ slug, nameVi, nameEn }: PlaceSpace): PlaceSpace => ({ slug, nameVi, nameEn });
        const personal = spaces.find((space) => space.kind === 'personal');
        setResult({ attempt, places: { personal: personal ? brief(personal) : null, shared: spaces.filter((space) => space.kind === 'public').map(brief), isAdmin: me.isAdmin } });
      },
      () => current && setResult({ attempt, places: null }),
    );
    return () => {
      current = false;
    };
  }, [active, attempt]);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  if (!result || result.attempt !== attempt) return { status: 'loading' };
  const { places } = result;
  if (!places) return { status: 'failed', retry };
  return { status: 'ready', places, setPersonal: (space) => setResult({ attempt, places: { ...places, personal: space } }) };
}

function failureKey(error: unknown): CreateMessageKey {
  return error instanceof ApiError && error.code === NETWORK_ERROR ? 'create.offline' : 'create.failed';
}

function PlacesWaiting({ state }: { state: Exclude<PlacesState, { status: 'ready' }> }): ReactNode {
  const { t } = useCreateText();
  if (state.status === 'loading') {
    return (
      <p className="create-form-note" role="status">
        {t('create.loading')}
      </p>
    );
  }
  return (
    <div className="create-form-row">
      <p className="create-form-error" role="alert">
        {t('create.collectionPane.loadFailed')}
      </p>
      <Button variant="glass" size="xl" onClick={state.retry} dataId="create-places-retry">
        {t('create.retry')}
      </Button>
    </div>
  );
}

interface SpacePaneProps {
  places: PlacesState;
  onCancel(): void;
  onCollection(): void;
}

/** "Space cá nhân mới": makes the account's personal Space, or shows the one it has. */
export function SpacePane({ places, onCancel, onCollection }: SpacePaneProps): ReactNode {
  const { t, locale } = useCreateText();
  const [work, setWork] = useState<{ status: 'idle' | 'working' | 'done' } | { status: 'failed'; key: CreateMessageKey }>({ status: 'idle' });
  if (places.status !== 'ready') return <PlacesWaiting state={places} />;
  const { personal } = places.places;

  const create = (): void => {
    setWork({ status: 'working' });
    ensurePersonalSpace().then(
      ({ space }) => {
        places.setPersonal({ slug: space.slug, nameVi: space.nameVi, nameEn: space.nameEn });
        setWork({ status: 'done' });
      },
      (error: unknown) => setWork({ status: 'failed', key: failureKey(error) }),
    );
  };

  return (
    <div className="create-form" data-id="create-space-pane" data-state={personal ? 'have' : 'new'}>
      <div className="create-space-head">
        <span className="create-space-planet" aria-hidden="true">
          <img src={CRYSTAL_ART.personal} alt="" />
        </span>
        <div className="create-space-text">
          <span className="create-form-title">{personal ? spaceName(locale, personal) : t('create.spacePane.newTitle')}</span>
          <span className="create-form-sub">{personal ? t('create.spacePane.haveSub') : t('create.spacePane.newSub')}</span>
        </div>
      </div>
      {personal && work.status !== 'done' && <p className="create-form-note">{t('create.spacePane.haveText')}</p>}
      <p className="create-form-note">{t('create.spacePane.note')}</p>
      <div className="create-form-row">
        {personal ? (
          <>
            <Button variant="rim" size="xl" href={`/s/${encodeURIComponent(personal.slug)}`} dataId="create-space-open">
              {t('create.spacePane.open')}
            </Button>
            <Button variant="glass" size="xl" onClick={onCollection} dataId="create-space-collection">
              {t('create.spacePane.toCollection')}
            </Button>
          </>
        ) : (
          <>
            <Button variant="rim" size="xl" onClick={create} disabled={work.status === 'working'} dataId="create-space-submit">
              {work.status === 'working' ? t('create.working') : t('create.spacePane.create')}
            </Button>
            <Button variant="glass" size="xl" onClick={onCancel}>
              {t('create.cancel')}
            </Button>
          </>
        )}
        {work.status === 'done' && (
          <span className="create-form-done" role="status" data-id="create-space-done">
            <Icon name="check" size={14} strokeWidth={3} />
            {t('create.spacePane.done')}
          </span>
        )}
      </div>
      {work.status === 'failed' && (
        <p className="create-form-error" role="alert">
          {t(work.key)}
        </p>
      )}
    </div>
  );
}

/** The value of the personal Space in the Space picker before it exists (made with the Collection). */
const NEW_PERSONAL = '';

/** "Collection mới": a name and the Space it goes in. */
export function CollectionPane({ places, onCancel }: { places: PlacesState; onCancel(): void }): ReactNode {
  const { t, locale } = useCreateText();
  const spaceId = useId();
  const nameId = useId();
  const errorId = useId();
  const [space, setSpace] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [work, setWork] = useState<{ status: 'idle' | 'working' } | { status: 'done'; space: string } | { status: 'failed'; key: CreateMessageKey }>({ status: 'idle' });
  if (places.status !== 'ready') return <PlacesWaiting state={places} />;
  const { personal, shared, isAdmin } = places.places;
  const personalName = personal ? spaceName(locale, personal) : t('create.collectionPane.personalDefault');
  const chosen = space ?? personal?.slug ?? NEW_PERSONAL;

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setWork({ status: 'failed', key: 'create.collectionPane.nameRequired' });
      return;
    }
    setWork({ status: 'working' });
    const target = async (): Promise<PlaceSpace> => {
      if (chosen !== NEW_PERSONAL) {
        const found = chosen === personal?.slug ? personal : shared.find((s) => s.slug === chosen);
        if (found) return found;
      }
      const made = (await ensurePersonalSpace()).space;
      const brief = { slug: made.slug, nameVi: made.nameVi, nameEn: made.nameEn };
      places.setPersonal(brief);
      return brief;
    };
    target()
      .then(async (where) => {
        await createCollection(where.slug, trimmed);
        setName('');
        setWork({ status: 'done', space: spaceName(locale, where) });
      })
      .catch((error: unknown) => setWork({ status: 'failed', key: failureKey(error) }));
  };

  const failed = work.status === 'failed';
  return (
    <form className="create-form" onSubmit={submit} data-id="create-collection-pane" noValidate>
      <span className="create-form-title">{t('create.collectionPane.title')}</span>
      <label className="create-field" htmlFor={spaceId}>
        {t('create.collectionPane.space')}
        <select id={spaceId} className="create-input create-select" value={chosen} onChange={(event) => setSpace(event.target.value)} data-id="create-collection-space">
          <option value={personal?.slug ?? NEW_PERSONAL}>{t('create.collectionPane.personal', { name: personalName })}</option>
          {shared.map((s) => (
            <option key={s.slug} value={s.slug} disabled={!isAdmin}>
              {isAdmin ? spaceName(locale, s) : t('create.collectionPane.adminOnly', { name: spaceName(locale, s) })}
            </option>
          ))}
        </select>
      </label>
      <label className="create-field" htmlFor={nameId}>
        {t('create.collectionPane.name')}
        <input
          id={nameId}
          className="create-input"
          type="text"
          value={name}
          maxLength={80}
          placeholder={t('create.collectionPane.placeholder')}
          onChange={(event) => setName(event.target.value)}
          aria-invalid={failed && work.key === 'create.collectionPane.nameRequired'}
          aria-describedby={failed ? errorId : undefined}
          data-id="create-collection-name"
        />
      </label>
      <p className="create-form-note">{t('create.collectionPane.note')}</p>
      <div className="create-form-row">
        <Button variant="rim" size="xl" type="submit" disabled={work.status === 'working'} dataId="create-collection-submit">
          {work.status === 'working' ? t('create.working') : t('create.collectionPane.create')}
        </Button>
        <Button variant="glass" size="xl" onClick={onCancel}>
          {t('create.cancel')}
        </Button>
        {work.status === 'done' && (
          <span className="create-form-done" role="status" data-id="create-collection-done">
            <Icon name="check" size={14} strokeWidth={3} />
            {t('create.collectionPane.done', { space: work.space })}
          </span>
        )}
      </div>
      {failed && (
        <p className="create-form-error" id={errorId} role="alert">
          {t(work.key)}
        </p>
      )}
    </form>
  );
}
