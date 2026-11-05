/**
 * The Graph of a Space (board C13) at /graph?space=<slug>: its documents as nodes (sized by links, tinted by Space),
 * the links between them as labelled edges, Space chips and the source filter, zoom and pan, the minimap, the node
 * panel and "Khám phá liên quan" (reading path, Jev's suggested edges). States: loading ("Đang dựng đồ thị…"), the
 * graph, no node matching the filters, a Space without documents, and the Space not found / not allowed / failed
 * (X02 panels). Without `space`, the first Space of the Universe opens.
 */
import { useDevice } from '../layout/device';
import { usePhoneText } from './phone-messages';
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, NETWORK_ERROR } from '../api/api-client';
import { fetchSpaces, readErrorOf } from '../api/content-api';
import { type EdgeSuggestion, type Graph, type GraphEdge, addEdge, fetchEdgeSuggestions, fetchGraph, removeEdge } from '../api/graph-api';
import { AppShell, type BreadcrumbItem, SHELL_PATHS } from '../layout/app-shell';
import { ErrorPanel } from './error-screen';
import { type PlacedNode, layoutGraph, spaceSpots } from './graph-layout';
import { type GraphFilter, NO_FILTER, SOURCE_FILTERS, type SourceFilter, visibleNodeIds } from './graph-model';
import { type GraphMessageKey, useGraphText } from './graph-messages';
import { GraphPanel, type SuggestionState } from './graph-panel';
import { FIT_VIEW, GraphView, type SpaceColours, type View } from './graph-view';
import { spaceName } from './space-panels';
import './graph-screen.css';

/** The query parameter naming the Space (`/graph?space=networking`). */
export const SPACE_PARAM = 'space';

type GraphLoad = { status: 'loading' } | { status: 'ready'; graph: Graph } | { status: 'failed'; error: 'not-found' | 'no-access' | 'server' };

function spaceFromUrl(): string | null {
  const slug = new URLSearchParams(window.location.search).get(SPACE_PARAM);
  return slug && /^[a-z0-9][a-z0-9-]{0,119}$/.test(slug) ? slug : null;
}

function loadError(error: unknown): 'not-found' | 'no-access' | 'server' {
  const code = readErrorOf(error);
  if (code === 'no-access' || code === 'hidden') return 'no-access';
  if (code === 'not-found') return 'not-found';
  if (!(error instanceof ApiError)) console.error('graph load failed', error);
  return 'server';
}

/** The Space asked for, else the first one of the Universe (written into the address). */
function useSpaceSlug(): string | null | 'none' {
  const [slug, setSlug] = useState<string | null | 'none'>(spaceFromUrl);
  useEffect(() => {
    if (slug !== null) return;
    let current = true;
    fetchSpaces().then(
      (spaces) => {
        const first = spaces.find((s) => s.kind === 'public') ?? spaces[0];
        if (!current) return;
        if (!first) {
          setSlug('none');
          return;
        }
        const url = new URL(window.location.href);
        url.searchParams.set(SPACE_PARAM, first.slug);
        window.history.replaceState(window.history.state, '', url);
        setSlug(first.slug);
      },
      (error: unknown) => {
        if (!(error instanceof ApiError)) console.error('spaces load failed', error);
        if (current) setSlug('none');
      },
    );
    return () => {
      current = false;
    };
  }, [slug]);
  return slug;
}

function useGraph(slug: string | null, locale: 'vi' | 'en'): { load: GraphLoad; reload(): void } {
  const key = `${slug ?? ''}|${locale}`;
  const [result, setResult] = useState<{ key: string; load: GraphLoad } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!slug) return;
    let current = true;
    fetchGraph(slug, locale).then(
      (graph) => {
        if (current) setResult({ key, load: { status: 'ready', graph } });
      },
      (error: unknown) => {
        if (current) setResult({ key, load: { status: 'failed', error: loadError(error) } });
      },
    );
    return () => {
      current = false;
    };
  }, [slug, locale, key, attempt]);
  const reload = useCallback(() => {
    setResult(null);
    setAttempt((n) => n + 1);
  }, []);
  return { load: result?.key === key ? result.load : { status: 'loading' }, reload };
}

/** The message of a failed suggestion or link request. */
function requestMessage(error: unknown, fallback: GraphMessageKey): GraphMessageKey {
  if (!(error instanceof ApiError)) {
    console.error('graph request failed', error);
    return fallback;
  }
  if (error.code === NETWORK_ERROR) return 'graph.suggest.offline';
  if (error.code === 'rate-limited') return 'graph.suggest.limited';
  if (error.code === 'exists') return 'graph.suggest.exists';
  if (error.code === 'not-allowed') return 'graph.suggest.notAllowed';
  return fallback;
}

/** Ghost orbs while the graph loads (board C13 "Đang dựng đồ thị"): fixed spots of the board's layout. */
const GHOSTS: ReadonlyArray<readonly [number, number, number]> = [
  [110, 170, 16], [270, 250, 36], [230, 400, 24], [430, 150, 20], [580, 250, 28], [580, 420, 20], [390, 510, 16],
  [420, 330, 20], [90, 330, 16], [250, 70, 16], [720, 330, 16], [170, 560, 16], [760, 110, 20], [910, 80, 20],
  [970, 200, 20], [880, 300, 20], [760, 470, 24], [830, 570, 16], [960, 410, 24], [980, 540, 16],
];

export function GraphScreen(): ReactNode {
  const { t, locale } = useGraphText();
  const phone = usePhoneText();
  const device = useDevice();
  const slug = useSpaceSlug();
  const { load, reload } = useGraph(slug === 'none' ? null : slug, locale);
  const graph = load.status === 'ready' ? load.graph : null;

  const [filter, setFilter] = useState<GraphFilter>(NO_FILTER);
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<View>(FIT_VIEW);
  // Edges and counts as changed here (a link accepted or erased) on top of the loaded graph; reset with each load.
  const [changes, setChanges] = useState<{ graph: Graph; edges: GraphEdge[]; nodes: Graph['nodes'] } | null>(null);
  const [suggestions, setSuggestions] = useState<SuggestionState>({ status: 'idle' });
  const [notice, setNotice] = useState<string | null>(null);

  const current = useMemo(() => (changes && changes.graph === graph ? changes : graph ? { graph, edges: graph.edges, nodes: graph.nodes } : null), [changes, graph]);
  const nodes = useMemo(() => current?.nodes ?? [], [current]);
  const edges = current?.edges ?? [];

  // Laid out once per loaded graph: accepting a link does not move the nodes.
  const positions = useMemo(() => {
    if (!graph) return new Map<string, PlacedNode>();
    const spots = spaceSpots(
      graph.spaces.map((s) => ({ slug: s.slug, personal: s.kind === 'personal' })),
      graph.space.slug,
    );
    return layoutGraph(
      graph.nodes.map((n) => ({ id: n.id, space: n.spaceSlug, degree: n.degree })),
      graph.edges,
      spots,
    );
  }, [graph]);

  const colours = useMemo(() => {
    const map = new Map<string, SpaceColours>();
    for (const s of graph?.spaces ?? []) map.set(s.slug, { tint: s.tint, glow: s.glow, name: s.kind === 'personal' ? t('graph.yours') : spaceName(locale, s) });
    return map;
  }, [graph, locale, t]);

  const visible = useMemo(() => (current ? visibleNodeIds({ nodes }, filter) : new Set<string>()), [current, nodes, filter]);
  const selectedNode = selected && visible.has(selected) ? (nodes.find((n) => n.id === selected) ?? null) : null;

  function update(change: (edges: GraphEdge[], nodes: Graph['nodes']) => { edges: GraphEdge[]; nodes: Graph['nodes'] }): void {
    if (!graph || !current) return;
    setChanges({ graph, ...change(current.edges, current.nodes) });
  }

  function select(id: string | null): void {
    setSelected(id);
    setNotice(null);
  }

  async function suggest(): Promise<void> {
    if (!selectedNode) return;
    const node = selectedNode.id;
    setSuggestions({ status: 'loading', node });
    try {
      const items = await fetchEdgeSuggestions(node, locale);
      setSuggestions({ status: 'ready', node, items });
    } catch (error) {
      setSuggestions({ status: 'failed', node, message: requestMessage(error, 'graph.suggest.failed') });
    }
  }

  async function accept(item: EdgeSuggestion): Promise<void> {
    if (!selectedNode) return;
    const node = selectedNode.id;
    try {
      const edge = await addEdge(node, item.id);
      update((list, all) => ({
        edges: [...list, edge],
        nodes: all.map((n) => (n.id === edge.source || n.id === edge.target ? { ...n, degree: n.degree + 1, backlinks: n.id === edge.target ? n.backlinks + 1 : n.backlinks } : n)),
      }));
      setSuggestions((s) => (s.status === 'ready' && s.node === node ? { ...s, items: s.items.filter((i) => i.id !== item.id) } : s));
      setNotice(t('graph.suggest.accepted', { title: item.title }));
    } catch (error) {
      setNotice(t(requestMessage(error, 'graph.suggest.acceptFailed')));
    }
  }

  async function unlink(edge: GraphEdge, title: string): Promise<void> {
    try {
      await removeEdge(edge.id);
      update((list, all) => ({
        edges: list.filter((e) => e.id !== edge.id),
        nodes: all.map((n) => (n.id === edge.source || n.id === edge.target ? { ...n, degree: Math.max(0, n.degree - 1), backlinks: n.id === edge.target ? Math.max(0, n.backlinks - 1) : n.backlinks } : n)),
      }));
      setNotice(null);
    } catch (error) {
      console.warn('unlink failed', title, error);
      setNotice(t('graph.unlinkFailed'));
    }
  }

  const spaceSlug = graph?.space.slug ?? (slug === 'none' ? null : slug);
  const breadcrumb: BreadcrumbItem[] = [{ label: 'Universe', href: SHELL_PATHS.universe }];
  if (graph) breadcrumb.push({ label: spaceName(locale, graph.space), href: `/s/${encodeURIComponent(graph.space.slug)}` });
  breadcrumb.push({ label: t('graph.crumb') });
  const views = spaceSlug ? (
    <nav className="graph-views" aria-label={t('graph.views')} data-id="graph-views">
      <a href={`/s/${encodeURIComponent(spaceSlug)}`}>{t('graph.view.overview')}</a>
      <a href={`${SHELL_PATHS.canvas}?${new URLSearchParams({ space: spaceSlug }).toString()}`}>{t('graph.view.canvas')}</a>
      <span aria-current="page">{t('graph.view.graph')}</span>
    </nav>
  ) : undefined;

  let state: string = load.status === 'failed' ? load.error : load.status;
  if (slug === 'none') state = 'empty';
  else if (graph && graph.nodes.length === 0) state = 'empty';
  else if (graph && visible.size === 0) state = 'filtered-empty';

  return (
    <AppShell screen="C13" rail="graph" view="graph" breadcrumb={breadcrumb} crumbAction={views} spaceHref={spaceSlug ? `/s/${encodeURIComponent(spaceSlug)}` : undefined} className="graph-shell">
      <div className="graph-screen" data-id="graph-screen" data-state={state}>
        <section className="graph-section" aria-label={t('graph.label')}>
          {state === 'empty' && (
            <div className="graph-center graph-card" data-id="graph-empty">
              <span className="graph-ring" aria-hidden="true" />
              <h2 className="graph-card-title">{t('graph.empty.title')}</h2>
              <p className="graph-muted">{t('graph.empty.text')}</p>
              {spaceSlug && (
                <a className="graph-primary" href={`/s/${encodeURIComponent(spaceSlug)}`}>
                  {t('graph.empty.action')}
                </a>
              )}
            </div>
          )}
          {load.status === 'loading' && slug !== 'none' && (
            <>
              <div className="graph-world-clip" aria-hidden="true">
                {GHOSTS.map(([x, y, r], i) => (
                  <span key={`${x}-${y}`} className="graph-ghost" style={{ left: x - r, top: y - r, width: r * 2, height: r * 2, animationDelay: `${(i % 6) * 0.15}s` }} />
                ))}
              </div>
              <div className="graph-center graph-card graph-loading" role="status" data-id="graph-loading">
                <span className="graph-card-title">{t('graph.loading')}</span>
                <span className="graph-muted graph-small">{t('graph.loadingText')}</span>
                <span className="graph-progress" aria-hidden="true" />
              </div>
            </>
          )}
          {load.status === 'failed' && (
            <div className="graph-center" data-id="graph-error">
              <ErrorPanel kind={load.error === 'no-access' ? 'forbidden' : load.error} onRetry={reload} />
            </div>
          )}
          {graph && graph.nodes.length > 0 && (
            <GraphView t={t} nodes={nodes} edges={edges} positions={positions} visible={visible} selected={selectedNode?.id ?? null} colours={colours} view={view} onView={setView} onSelect={select}>
              <Filters t={t} graph={graph} colours={colours} filter={filter} onFilter={setFilter} />
              <Legend t={t} />
              {visible.size === 0 && (
                <div className="graph-center graph-card" data-id="graph-filtered-empty">
                  <span className="graph-ring" aria-hidden="true" />
                  <h2 className="graph-card-title">{t('graph.emptyFilter.title')}</h2>
                  <p className="graph-muted">{t('graph.emptyFilter.text')}</p>
                  <button type="button" className="graph-primary" onClick={() => setFilter(NO_FILTER)} data-id="graph-clear-filters">
                    {t('graph.emptyFilter.action')}
                  </button>
                </div>
              )}
            </GraphView>
          )}
        </section>
        <GraphPanel
          t={t}
          nodes={nodes}
          edges={edges}
          visible={visible}
          selected={selectedNode}
          colours={colours}
          focusSpace={graph?.space.slug ?? ''}
          jev={graph?.suggestions ?? false}
          suggestions={suggestions}
          notice={notice}
          onSelect={select}
          onSuggest={() => void suggest()}
          onAccept={(item) => void accept(item)}
          onUnlink={(edge, title) => void unlink(edge, title)}
          viewOnly={device === 'phone' ? phone.t('limit.graph') : undefined}
        />
      </div>
    </AppShell>
  );
}

function Filters({ t, graph, colours, filter, onFilter }: { t: ReturnType<typeof useGraphText>['t']; graph: Graph; colours: ReadonlyMap<string, SpaceColours>; filter: GraphFilter; onFilter(filter: GraphFilter): void }): ReactNode {
  const labels: Record<SourceFilter, GraphMessageKey> = { all: 'graph.filter.all', official: 'graph.filter.official', community: 'graph.filter.community', own: 'graph.filter.own' };
  return (
    <div className="graph-filters" data-id="graph-filters">
      <span className="graph-filter-label">{t('graph.filter.space')}</span>
      {graph.spaces.map((space) => {
        const on = !filter.off.has(space.slug);
        const colour = colours.get(space.slug);
        return (
          <button
            key={space.slug}
            type="button"
            className="graph-chip"
            aria-pressed={on}
            style={{ borderColor: on ? colour?.tint : undefined }}
            onClick={() => {
              const off = new Set(filter.off);
              if (on) off.add(space.slug);
              else off.delete(space.slug);
              onFilter({ ...filter, off });
            }}
            data-id={`graph-chip-${space.slug}`}
          >
            <span className="graph-dot graph-chip-dot" style={{ background: colour?.tint }} aria-hidden="true" />
            {colour?.name}
          </button>
        );
      })}
      <label className="graph-filter-label graph-source">
        {t('graph.filter.source')}
        <select value={filter.source} onChange={(event) => onFilter({ ...filter, source: SOURCE_FILTERS.find((s) => s === event.target.value) ?? 'all' })} data-id="graph-source">
          {SOURCE_FILTERS.map((source) => (
            <option key={source} value={source}>
              {t(labels[source])}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function Legend({ t }: { t: ReturnType<typeof useGraphText>['t'] }): ReactNode {
  return (
    <div className="graph-legend" aria-label={t('graph.legend')} role="group">
      <span className="graph-legend-head">{t('graph.legend.relations')}</span>
      <span className="graph-legend-row">
        <span className="graph-legend-line" data-type="leads-to" aria-hidden="true" />
        {t('graph.rel.leads-to')}
      </span>
      <span className="graph-legend-row">
        <span className="graph-legend-line" data-type="prerequisite" aria-hidden="true" />
        {t('graph.rel.prerequisite')}
      </span>
      <span className="graph-legend-row">
        <span className="graph-legend-line" data-type="related" aria-hidden="true" />
        {t('graph.rel.related')}
      </span>
      <span className="graph-legend-head graph-legend-gap">{t('graph.legend.size')}</span>
      <span className="graph-legend-note">{t('graph.legend.sizeText')}</span>
      <span className="graph-legend-head graph-legend-gap">{t('graph.legend.border')}</span>
      <span className="graph-legend-row">
        <span className="graph-legend-ring" aria-hidden="true" />
        {t('graph.legend.official')}
      </span>
      <span className="graph-legend-row">
        <span className="graph-legend-ring" data-dashed="true" aria-hidden="true" />
        {t('graph.legend.others')}
      </span>
    </div>
  );
}
