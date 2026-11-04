import { type ComponentType, type MouseEvent, type PointerEvent, type ReactNode, type RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type DocumentSummary, type SpaceListItem, fetchDocument } from '../api/content-api';
import { type Translate, useI18n } from '../i18n/i18n';
import { AppShell, SHELL_PATHS } from '../layout/app-shell';
import { signedInUser, useSessionState } from '../layout/session-context';
import { type SceneOrb, type SceneSpace, UniverseScene, placeSpaces } from '../layout/universe-scene';
import { GradientTitle } from '../ui/gradient-title';
import { StageCards } from '../ui/stage-cards';
import type { CrystalSprite, SceneClock, Universe3dLayerProps } from '../universe3d/universe-3d-layer';
import { type Fallback2dReason, REDUCED_MOTION_QUERY, reasonFor2d } from '../universe3d/three-support';
import { UniverseAiPanel } from './universe-ai-panel';
import { isEmptyUniverse, useUniverseData } from './universe-data';
import { continueReading, dockCards } from './universe-dock';
import { sceneSpaces } from './universe-spaces';
import { OfflineBanner, UniverseEmpty, UniverseSkeleton } from './universe-states';
import './universe-screen.css';

/** `?shared=1`: the Universe (C09) even when nothing in it has a text yet (S05's "khám phá Universe chung"). */
export const SHARED_PARAM = 'shared';
/** How long the warp into a Space plays before the Space opens (Esc opens it at once). */
export const WARP_MS = 650;
/** Performance marks of the first 2D frame and the first 3D frame of the Universe (measured in e2e). */
export const MARK_2D = 'kb-universe-2d';
export const MARK_3D = 'kb-universe-3d';

type Layer = ComponentType<Universe3dLayerProps>;

function orbOf(t: Translate, count: number): SceneOrb {
  return {
    title: t('landing.orbTitle'),
    chips: [t('landing.orbSpaces', { count }), 'VI · EN'],
    label: t('universe.orbLabel'),
    href: SHELL_PATHS.universe,
  };
}

function wantsShared(): boolean {
  return new URLSearchParams(window.location.search).get(SHARED_PARAM) === '1';
}

function opensElsewhere(event: MouseEvent<HTMLElement>): boolean {
  return event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
}

/** The CSS animation running on `element` (the 2D float, spin or dot run), if the browser exposes it. */
function cssAnimationOf(element: Element | null): Animation | undefined {
  if (!element || typeof element.getAnimations !== 'function') return undefined;
  return element.getAnimations().find((animation) => typeof animation.currentTime === 'number');
}

/** `performance.now()` at which an element's CSS animation had its own time 0 (start plus delay). */
function animationOrigin(element: Element | null, delayMs = 0): number {
  const animation = cssAnimationOf(element);
  const current = animation?.currentTime;
  return performance.now() - (typeof current === 'number' ? current - delayMs : 0);
}

/**
 * Reads the 2D scene as drawn (art, filters, orbit tints, where each animation is) so the 3D layer takes over without
 * a jump. The crystals are in the scene's order, the order of placeSpaces.
 */
function readScene(root: HTMLElement, spaces: readonly SceneSpace[]): { crystals: CrystalSprite[]; orb: { src: string; filter: string }; clock: SceneClock } | null {
  const placed = placeSpaces(spaces);
  const floats = root.querySelectorAll<HTMLElement>('.kf-scene-crystal');
  const tints = root.querySelectorAll<SVGElement>('.kf-orbit-tint');
  const orbArt = root.querySelector<HTMLImageElement>('.kf-scene-orb-art');
  if (!orbArt || floats.length !== placed.length) return null;
  const crystals = placed.map(({ space, x, y, floatDelay }, index): CrystalSprite => {
    const float = floats[index] ?? null;
    const art = float?.querySelector<HTMLImageElement>('.kf-crystal-art');
    const tint = tints[index];
    return {
      key: space.key,
      src: art?.currentSrc || art?.src || '',
      filter: art ? getComputedStyle(art).filter : 'none',
      cx: x + 70,
      cy: y + 70,
      tint: tint ? getComputedStyle(tint).stroke : 'currentColor',
      floatOrigin: animationOrigin(float, floatDelay * 1000),
    };
  });
  return {
    crystals,
    orb: { src: orbArt.currentSrc || orbArt.src, filter: getComputedStyle(orbArt).filter },
    clock: { dots: animationOrigin(root.querySelector('.kf-orbit-dot')), orb: animationOrigin(orbArt) },
  };
}

/**
 * The 3D layer of the Universe (Z02): after the 2D scene is on screen, loads the 3D chunk unless the device asks for
 * 2D (reduced motion, no WebGL); swaps when its first frame is drawn; goes back to 2D for good when the frame rate
 * stays under 30 for 2 s or the GPU is lost.
 */
function use3dLayer(sceneRef: RefObject<HTMLDivElement | null>, spaces: readonly SceneSpace[]) {
  // Decided once, on the first render: reduced motion or no WebGL keeps the 2D scene.
  const [initialReason] = useState(reasonFor2d);
  const [Layer, setLayer] = useState<Layer | null>(null);
  const [mode, setMode] = useState<'2d' | 'loading' | '3d'>(initialReason ? '2d' : 'loading');
  const [fallback, setFallback] = useState<Fallback2dReason | null>(initialReason);
  const [scene, setScene] = useState<ReturnType<typeof readScene>>(null);
  const [fps, setFps] = useState<number | null>(null);

  const goBack = useCallback((reason: Fallback2dReason) => {
    setFallback(reason);
    setMode('2d');
    setLayer(null);
  }, []);

  useEffect(() => {
    if (initialReason) return undefined;
    let live = true;
    import('../universe3d/universe-3d-layer')
      .then((module) => {
        if (!live) return;
        const root = sceneRef.current;
        const read = root ? readScene(root, spaces) : null;
        if (!read) {
          goBack('load-failed');
          return;
        }
        setScene(read);
        setLayer(() => module.default);
      })
      .catch(() => live && goBack('load-failed'));
    return () => {
      live = false;
    };
  }, [initialReason, sceneRef, spaces, goBack]);

  // Turning on reduced motion while the 3D scene runs hands back to 2D.
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const media = window.matchMedia(REDUCED_MOTION_QUERY);
    const change = (): void => {
      if (media.matches) goBack('reduced-motion');
    };
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, [goBack]);

  const onReady = useCallback(() => {
    performance.mark(MARK_3D);
    setMode('3d');
  }, []);

  return { Layer, scene, mode, fallback, fps, onReady, onFallback: goBack, onFps: setFps };
}

/** The text read on (or the latest one) and how many texts relate to it (C11 "Liên quan"). */
function useRelatedCount(focus: DocumentSummary | undefined): number | null {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    if (!focus) return undefined;
    let live = true;
    fetchDocument(focus.id)
      .then((view) => live && setCount(view.related.length))
      .catch(() => live && setCount(null));
    return () => {
      live = false;
    };
  }, [focus]);
  return count;
}

interface UniverseMainProps {
  spaces: readonly SpaceListItem[];
  recent: readonly DocumentSummary[];
}

/** Board C09: the Universe with its Spaces, the AI panel and the "Gần đây" stage, in 2D then 3D. */
function UniverseMain({ spaces, recent }: UniverseMainProps): ReactNode {
  const { t, locale } = useI18n();
  const scene = useMemo(() => sceneSpaces(spaces, locale), [spaces, locale]);
  const sceneRef = useRef<HTMLDivElement>(null);
  const layer = use3dLayer(sceneRef, scene);
  const focus = continueReading(recent) ?? recent[0];
  const relatedCount = useRelatedCount(focus);
  const [hovered, setHovered] = useState<string | null>(null);
  const [warp, setWarp] = useState<{ href: string; x: number; y: number } | null>(null);
  const [skip, setSkip] = useState(false);
  // "Đã N ngày" counts from when the Universe opened.
  const [now] = useState(Date.now);
  const placed = useMemo(() => placeSpaces(scene), [scene]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => performance.mark(MARK_2D));
    return () => cancelAnimationFrame(frame);
  }, []);

  // Esc skips the transitions: the warp opens its Space at once, the swap to 3D and the panel's rise end now.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      setSkip(true);
      if (warp) window.location.assign(warp.href);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [warp]);

  useEffect(() => {
    if (!warp) return undefined;
    const timer = window.setTimeout(() => window.location.assign(warp.href), WARP_MS);
    return () => window.clearTimeout(timer);
  }, [warp]);

  const open = (space: SceneSpace, event: MouseEvent<HTMLElement>): void => {
    if (opensElsewhere(event) || reasonFor2d() === 'reduced-motion') return;
    const spot = placed.find((entry) => entry.space.key === space.key);
    event.preventDefault();
    setWarp({ href: space.href, x: (spot?.x ?? 630) + 70, y: (spot?.y ?? 265) + 70 });
  };

  const track = (event: PointerEvent<HTMLDivElement>): void => {
    const float = (event.target as Element).closest('.kf-scene-crystal');
    const index = float ? Array.from(sceneRef.current?.querySelectorAll('.kf-scene-crystal') ?? []).indexOf(float) : -1;
    setHovered(placed[index]?.space.key ?? null);
  };

  const { Layer } = layer;
  return (
    <div className="universe-main" data-mode={layer.mode} data-fallback={layer.fallback ?? undefined} data-skip={skip || undefined} data-warp={warp ? true : undefined}>
      <div
        className="universe-world"
        ref={sceneRef}
        style={warp ? { transformOrigin: `${warp.x}px ${warp.y}px` } : undefined}
        onPointerOver={track}
        onPointerLeave={() => setHovered(null)}
      >
        {Layer && layer.scene && (
          <div className="universe-3d" data-fps={layer.fps === null ? undefined : Math.round(layer.fps)}>
            <Layer
              crystals={layer.scene.crystals}
              orb={layer.scene.orb}
              clock={layer.scene.clock}
              hovered={hovered}
              onReady={layer.onReady}
              onFallback={layer.onFallback}
              onFps={layer.onFps}
            />
          </div>
        )}
        <UniverseScene spaces={scene} orb={orbOf(t, placed.length)} onOpen={open} className="universe-scene" />
      </div>
      <div className="universe-hero">
        <span className="universe-kicker">Knowledge OS</span>
        <GradientTitle size={40} className="universe-title">
          {t('universe.title')}
        </GradientTitle>
        <p className="universe-sub">{t('universe.sub')}</p>
      </div>
      <StageCards
        cards={dockCards({ recent, relatedCount, now }, t)}
        more={{ href: SHELL_PATHS.mine, label: t('universe.dock.more') }}
        className="universe-stage"
      />
      <UniverseAiPanel spaces={spaces} recent={recent} focus={focus} />
    </div>
  );
}

/**
 * /u (board C09) and its states: loading (S04), nothing to read in any Space yet (S05; a reader without a Space of
 * their own gets C09), offline (S05 with the offline planet), a failed load (S04 with "Thử lại"). Lost connection after loading keeps the Universe and shows the
 * offline banner.
 */
export function UniverseScreen(): ReactNode {
  const { t, locale } = useI18n();
  const user = signedInUser(useSessionState());
  const { data, online, retry } = useUniverseData();
  const [shared] = useState(wantsShared);
  const sharedHref = `${SHELL_PATHS.universe}?${SHARED_PARAM}=1`;

  let state: 'loading' | 'failed' | 'offline' | 'empty' | 'ready';
  let body: ReactNode;
  if (data.status === 'loading' || data.status === 'failed') {
    state = data.status;
    body = <UniverseSkeleton slow={data.status === 'loading' && data.slow} failed={data.status === 'failed'} onRetry={retry} />;
  } else if (data.status === 'offline') {
    state = 'offline';
    body = <UniverseEmpty spaces={[]} recent={[]} orb={orbOf(t, 0)} name={user?.name ?? null} offline sharedHref={sharedHref} />;
  } else if (isEmptyUniverse(data.spaces) && !shared) {
    state = 'empty';
    const spaces = sceneSpaces(data.spaces, locale);
    body = <UniverseEmpty spaces={spaces} recent={data.recent} orb={orbOf(t, spaces.length)} name={user?.name ?? null} offline={false} sharedHref={sharedHref} />;
  } else {
    state = 'ready';
    body = <UniverseMain spaces={data.spaces} recent={data.recent} />;
  }

  return (
    <AppShell screen="C09" rail="universe" view="orbit">
      <div className="universe-board" data-state={state} data-id="universe-screen">
        {body}
        {(!online || state === 'offline') && <OfflineBanner />}
      </div>
    </AppShell>
  );
}
