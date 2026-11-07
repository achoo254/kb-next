/**
 * The list of all Spaces (/spaces, no board): every Space the reader can open, the one with the newest text first. The
 * Universe orbit only has room for a few (universe-spaces.ts `orbitSpaces`); this page has every one. Open to guests.
 */
import { type ReactNode, useEffect, useState } from 'react';
import { type SpaceListItem, fetchSpaces } from '../api/content-api';
import { useI18n } from '../i18n/i18n';
import { AppShell, SHELL_PATHS } from '../layout/app-shell';
import { Button } from '../ui/button';
import { Crystal } from '../ui/crystal';
import { GradientTitle } from '../ui/gradient-title';
import { spaceHref, spaceKindOf, spaceName } from './universe-spaces';
import './spaces-screen.css';

type SpacesLoad = { status: 'loading' } | { status: 'ready'; spaces: SpaceListItem[] } | { status: 'failed' };

/** Newest text first; a Space without texts last; the API's order otherwise. */
export function byLatest(spaces: readonly SpaceListItem[]): SpaceListItem[] {
  const at = (space: SpaceListItem): number => (space.updatedAt ? Date.parse(space.updatedAt) : Number.NEGATIVE_INFINITY);
  return spaces
    .map((space, index) => ({ space, index }))
    .sort((a, b) => at(b.space) - at(a.space) || a.index - b.index)
    .map((entry) => entry.space);
}

export function SpacesScreen(): ReactNode {
  const { t, locale } = useI18n();
  const [load, setLoad] = useState<SpacesLoad>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    fetchSpaces().then(
      (spaces) => live && setLoad({ status: 'ready', spaces: byLatest(spaces) }),
      () => live && setLoad({ status: 'failed' }),
    );
    return () => {
      live = false;
    };
  }, [attempt]);
  const reload = (): void => {
    setLoad({ status: 'loading' });
    setAttempt((n) => n + 1);
  };

  return (
    <AppShell screen="Spaces" rail="spaces" veil="strong" breadcrumb={[{ label: 'Universe', href: SHELL_PATHS.universe }, { label: t('spaces.title') }]}>
      <div className="spaces-screen" data-id="spaces-screen" data-state={load.status}>
        <GradientTitle size={36} className="spaces-title">
          {t('spaces.title')}
        </GradientTitle>
        <p className="spaces-sub">{t('spaces.sub')}</p>
        {load.status === 'failed' && (
          <p className="spaces-note" role="alert">
            {t('spaces.failed')}{' '}
            <Button variant="glass" onClick={reload} dataId="spaces-retry">
              {t('spaces.retry')}
            </Button>
          </p>
        )}
        {load.status === 'ready' && load.spaces.length === 0 && <p className="spaces-note">{t('spaces.empty')}</p>}
        {load.status === 'ready' && load.spaces.length > 0 && (
          <ul className="spaces-grid" aria-label={t('spaces.title')}>
            {load.spaces.map((space) => (
              <li key={space.slug} className="spaces-item" data-id={`spaces-item-${space.slug}`}>
                <Crystal
                  space={spaceKindOf(space) ?? 'cloud'}
                  art={space.art}
                  tint={space.tint}
                  glow={space.glow}
                  name={spaceName(space, locale)}
                  count={space.caption[locale]}
                  href={spaceHref(space.slug)}
                />
                <span className="spaces-planets">{t('spaces.planets', { count: space.collectionCount })}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
