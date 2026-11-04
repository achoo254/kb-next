/**
 * The screen of a Space (board C10) at /s/:slug: the crystal and header, the collections, the documents of the picked
 * collection, members and permissions, related Spaces. States: loading, normal, an empty collection, no access (and
 * not found or failed, as X02 panels).
 *
 * Z02 makes C10 hybrid (3D crystal layer over this layout). This is the 2D layer, which is also what reduced motion,
 * phones and browsers without WebGL keep; the 3D layer arrives with C09's lazily loaded scene.
 */
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { ApiError } from '../api/api-client';
import { type SpaceDetail, fetchSpace, readErrorOf } from '../api/content-api';
import { useI18n } from '../i18n/i18n';
import { AppShell, type BreadcrumbItem, SHELL_PATHS } from '../layout/app-shell';
import { ErrorPanel } from './error-screen';
import { CollectionGrid, DocumentPanel, SpaceLoading } from './space-documents';
import { useSpaceText } from './space-messages';
import { MembersPanel, RelatedSpacesPanel, SpaceCrystal, SpaceHeader, spaceName } from './space-panels';
import './space-screen.css';

type SpaceLoad = { status: 'loading' } | { status: 'ready'; detail: SpaceDetail } | { status: 'failed'; error: 'not-found' | 'no-access' | 'server' };

/** The query parameter holding the picked collection (`/s/networking?c=<id>`), so a link can open one. */
export const COLLECTION_PARAM = 'c';

function collectionFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get(COLLECTION_PARAM);
}

/** The screen state of a failed load: X02's 403 or 404 for a Space that cannot be opened, else a server error. */
export function spaceLoadError(error: unknown): 'not-found' | 'no-access' | 'server' {
  const code = readErrorOf(error);
  if (code === 'no-access' || code === 'hidden') return 'no-access';
  if (code === 'not-found') return 'not-found';
  return 'server';
}

function useSpace(slug: string): { load: SpaceLoad; reload(): Promise<void> } {
  const { locale } = useI18n();
  const key = `${slug}|${locale}`;
  // The answer for the Space and language asked; anything else (a new slug, a retry) shows as loading.
  const [result, setResult] = useState<{ key: string; load: SpaceLoad } | null>(null);
  const request = useCallback(async (): Promise<SpaceLoad> => {
    try {
      return { status: 'ready', detail: await fetchSpace(slug, locale) };
    } catch (error) {
      if (!(error instanceof ApiError)) console.error('space load failed', error);
      return { status: 'failed', error: spaceLoadError(error) };
    }
  }, [slug, locale]);
  useEffect(() => {
    let current = true;
    void request().then((load) => {
      if (current) setResult({ key, load });
    });
    return () => {
      current = false;
    };
  }, [request, key]);
  const reload = useCallback(async () => {
    setResult(null);
    setResult({ key, load: await request() });
  }, [request, key]);
  return { load: result?.key === key ? result.load : { status: 'loading' }, reload };
}

export function SpaceScreen({ slug }: { slug: string }): ReactNode {
  const { t, locale } = useSpaceText();
  const { load, reload } = useSpace(slug);
  const [picked, setPicked] = useState<string | null>(collectionFromUrl);

  const detail = load.status === 'ready' ? load.detail : null;
  const collection = detail?.collections.find((c) => c.id === picked) ?? detail?.collections[0] ?? null;

  function pick(id: string): void {
    setPicked(id);
    const url = new URL(window.location.href);
    url.searchParams.set(COLLECTION_PARAM, id);
    window.history.replaceState(window.history.state, '', url);
  }

  const breadcrumb: BreadcrumbItem[] = [{ label: 'Universe', href: SHELL_PATHS.universe }];
  if (detail) breadcrumb.push({ label: spaceName(locale, detail.space) });
  if (collection) breadcrumb.push({ label: spaceName(locale, collection) });

  return (
    <AppShell screen="C10" rail="spaces" breadcrumb={breadcrumb} spaceHref={`/s/${encodeURIComponent(slug)}`} className="space-shell">
      <div className="space-screen" data-id="space-screen" data-state={load.status === 'ready' ? (collection && collection.documents.length === 0 ? 'empty' : 'ready') : load.status === 'failed' ? load.error : 'loading'}>
        {load.status === 'loading' && <SpaceLoading />}
        {load.status === 'failed' && (
          <div className="space-error">
            <ErrorPanel kind={load.error === 'no-access' ? 'forbidden' : load.error} onRetry={reload} />
          </div>
        )}
        {detail && (
          <>
            <SpaceCrystal detail={detail} locale={locale} t={t} />
            <SpaceHeader detail={detail} locale={locale} t={t} />
            {detail.collections.length > 0 && <CollectionGrid collections={detail.collections} selectedId={collection?.id ?? null} onSelect={pick} />}
            <DocumentPanel
              key={collection?.id ?? 'uncollected'}
              title={collection ? spaceName(locale, collection) : t('space.allDocuments')}
              documents={collection ? collection.documents : detail.uncollected}
              permissions={detail.permissions}
            />
            <MembersPanel detail={detail} />
            <RelatedSpacesPanel detail={detail} />
          </>
        )}
      </div>
    </AppShell>
  );
}
