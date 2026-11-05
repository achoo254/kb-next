/**
 * The right column of the Graph (board C13): the picked node (orb, name, Space and kind, origin, one line, links and
 * backlinks, open and ask Copilot, its direct neighbours), or "Chọn một nút" with the counts; and below, "Khám phá
 * liên quan": the reading path through the node (from the edges, in code) and, when the server has Jev, Jev's
 * suggested edges for the node, each linked only when the reader accepts it.
 */
import type { CSSProperties, ReactNode } from 'react';
import type { EdgeSuggestion, GraphEdge, GraphNode } from '../api/graph-api';
import { useI18n } from '../i18n/i18n';
import { Icon } from '../ui/icon';
import { copilotHref } from './copilot-links';
import { type Neighbour, neighboursOf, readingPath, startingNode } from './graph-model';
import type { GraphMessageKey } from './graph-messages';
import type { SpaceColours } from './graph-view';
import { kindLabel, originOf, relevanceText } from './space-labels';
import { type ScreenTranslate, useSpaceText } from './space-messages';

/** Jev's suggestions for one node: not asked yet, being asked, answered, or failed (with the message to show). */
export type SuggestionState =
  | { status: 'idle' }
  | { status: 'loading'; node: string }
  | { status: 'ready'; node: string; items: EdgeSuggestion[] }
  | { status: 'failed'; node: string; message: GraphMessageKey };

interface GraphPanelProps {
  t: ScreenTranslate<GraphMessageKey>;
  nodes: readonly GraphNode[];
  edges: readonly GraphEdge[];
  visible: ReadonlySet<string>;
  selected: GraphNode | null;
  colours: ReadonlyMap<string, SpaceColours>;
  focusSpace: string;
  /** Whether the server can ask Jev (else no suggestions, and the box is only the path). */
  jev: boolean;
  suggestions: SuggestionState;
  /** A message after linking or unlinking (shown in the box, read out politely). */
  notice: string | null;
  onSelect(id: string): void;
  onSuggest(): void;
  onAccept(suggestion: EdgeSuggestion): void;
  onUnlink(edge: GraphEdge, title: string): void;
  /** The Graph for viewing only (a phone, Z02): no linking or unlinking; `viewOnly` says why. */
  viewOnly?: string;
}

function orbStyle(colour: SpaceColours | undefined): CSSProperties {
  return { '--node-tint': colour?.tint, '--node-glow': colour?.glow } as CSSProperties;
}

function relationText(t: ScreenTranslate<GraphMessageKey>, neighbour: Neighbour): string {
  if (neighbour.relation === 'from') return t('graph.rel.from');
  if (neighbour.relation === 'needed-before') return t('graph.rel.neededBefore');
  return neighbour.edge.label ?? t(`graph.rel.${neighbour.relation}`);
}

export function GraphPanel(props: GraphPanelProps): ReactNode {
  const { t, nodes, edges, visible, selected, colours } = props;
  return (
    <aside className="graph-panel" aria-label={t('graph.detail')} data-id="graph-panel">
      {selected ? (
        <NodeDetail {...props} node={selected} />
      ) : (
        <div className="graph-pick" data-id="graph-pick">
          <h2 className="graph-pick-title">{t('graph.pick.title')}</h2>
          <p className="graph-muted">{t('graph.pick.text')}</p>
          <div className="graph-stats">
            <span className="graph-stat">
              <span className="graph-stat-value" data-id="graph-count-nodes">
                {visible.size}
              </span>
              <span className="graph-stat-label">{t('graph.count.nodes')}</span>
            </span>
            <span className="graph-stat">
              <span className="graph-stat-value" data-id="graph-count-edges">
                {edges.filter((e) => visible.has(e.source) && visible.has(e.target)).length}
              </span>
              <span className="graph-stat-label">{t('graph.count.edges')}</span>
            </span>
          </div>
        </div>
      )}
      <span className="graph-panel-spacer" />
      <ExploreBox {...props} nodes={nodes} colours={colours} />
    </aside>
  );
}

function NodeDetail({ t, node, edges, nodes, visible, colours, onSelect, onUnlink, viewOnly }: GraphPanelProps & { node: GraphNode }): ReactNode {
  const { t: appT } = useI18n();
  const space = useSpaceText();
  const colour = colours.get(node.spaceSlug);
  const origin = originOf(node);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const neighbours = neighboursOf(node.id, edges, visible);
  return (
    <div className="graph-detail" key={node.id} data-id="graph-detail">
      <div className="graph-detail-head">
        <span className="graph-detail-orb" style={orbStyle(colour)} aria-hidden="true" />
        <div className="graph-detail-names">
          <h2 className="graph-detail-title">{node.title}</h2>
          <span className="graph-detail-meta">
            {colour?.name} · {kindLabel(space.t, node)}
          </span>
        </div>
      </div>
      <span className="graph-origin" data-origin={origin}>
        {appT(`origin.${origin}`)}
      </span>
      {node.summary && <p className="graph-detail-line">{node.summary}</p>}
      <div className="graph-stats">
        <span className="graph-stat">
          <span className="graph-stat-value">{node.degree}</span>
          <span className="graph-stat-label">{t('graph.stat.links')}</span>
        </span>
        <span className="graph-stat">
          <span className="graph-stat-value">{node.backlinks}</span>
          <span className="graph-stat-label">{t('graph.stat.backlinks')}</span>
        </span>
      </div>
      <div className="graph-detail-actions">
        <a className="graph-open" href={`/d/${encodeURIComponent(node.id)}`} data-id="graph-open">
          {t('graph.open')}
        </a>
        <a className="graph-ask" href={copilotHref(undefined, { scope: { kind: 'document', id: node.id }, from: node.id })} data-id="graph-ask">
          <Icon name="sparkle" size={14} />
          {t('graph.askCopilot')}
        </a>
      </div>
      <h3 className="graph-section-title">{t('graph.neighbours')}</h3>
      {neighbours.length === 0 ? (
        <p className="graph-muted graph-small">{t('graph.neighboursNone')}</p>
      ) : (
        <ul className="graph-neighbours">
          {neighbours.map((neighbour) => {
            const other = byId.get(neighbour.id);
            if (!other) return null;
            return (
              <li key={neighbour.edge.id} className="graph-neighbour">
                <button type="button" className="graph-neighbour-pick" onClick={() => onSelect(other.id)} data-id={`graph-neighbour-${other.id}`}>
                  <span className="graph-dot" style={{ background: colours.get(other.spaceSlug)?.tint }} aria-hidden="true" />
                  {other.title} <span className="graph-neighbour-rel">· {relationText(t, neighbour)}</span>
                </button>
                {neighbour.edge.removable && !viewOnly && (
                  <button
                    type="button"
                    className="graph-unlink"
                    aria-label={t('graph.unlink', { title: other.title })}
                    title={t('graph.unlink', { title: other.title })}
                    onClick={() => onUnlink(neighbour.edge, other.title)}
                    data-id={`graph-unlink-${other.id}`}
                  >
                    <Icon name="close" size={12} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ExploreBox({ t, nodes, edges, visible, selected, colours, focusSpace, jev, suggestions, notice, onSelect, onSuggest, onAccept, viewOnly }: GraphPanelProps): ReactNode {
  const { locale } = useI18n();
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const start = selected ? null : startingNode(nodes, focusSpace, visible);
  const anchor = selected ?? start;
  const path = anchor ? readingPath(anchor.id, edges, visible) : [];
  let note = '';
  if (selected) note = path.length > 1 ? t('graph.path.note') : t('graph.path.none');
  else if (start) note = path.length > 1 ? t('graph.path.note') : t('graph.path.start', { title: start.title });
  const at = anchor ? path.indexOf(anchor.id) : -1;
  const follow = path[at + 1] ?? path[0];
  const forThis = selected && suggestions.status !== 'idle' && suggestions.node === selected.id ? suggestions : null;
  return (
    <section className="graph-explore" aria-labelledby="graph-explore-title" data-id="graph-explore">
      <h2 id="graph-explore-title" className="graph-explore-title">
        <Icon name="sparkle" size={14} />
        {t(jev ? 'graph.exploreJev' : 'graph.explore')}
      </h2>
      {path.length > 0 && (
        <ol className="graph-path" aria-label={t('graph.path.label')}>
          {path.map((id, i) => {
            const node = byId.get(id);
            if (!node) return null;
            return (
              <li key={id}>
                <button type="button" className="graph-path-step" style={{ borderColor: colours.get(node.spaceSlug)?.tint }} onClick={() => onSelect(id)}>
                  {node.title}
                </button>
                {i < path.length - 1 && (
                  <span className="graph-muted" aria-hidden="true">
                    →
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {note && <p className="graph-explore-note">{note}</p>}
      {follow && (
        <a className="graph-follow" href={`/d/${encodeURIComponent(follow)}`} data-id="graph-follow">
          {t('graph.path.follow')}
        </a>
      )}
      {viewOnly && (
        <p className="graph-explore-note" data-id="graph-view-only">
          {viewOnly}
        </p>
      )}
      {jev && selected && !forThis && !viewOnly && (
        <button type="button" className="graph-suggest" onClick={onSuggest} data-id="graph-suggest">
          <Icon name="sparkles" size={14} />
          {t('graph.suggest.ask')}
        </button>
      )}
      {forThis?.status === 'loading' && (
        <p className="graph-explore-note" role="status" data-id="graph-suggest-loading">
          {t('graph.suggest.loading')}
        </p>
      )}
      {forThis?.status === 'failed' && (
        <p className="graph-explore-note graph-warn" role="alert" data-id="graph-suggest-failed">
          {t(forThis.message)}
        </p>
      )}
      {forThis?.status === 'ready' &&
        (forThis.items.length === 0 ? (
          <p className="graph-explore-note" data-id="graph-suggest-none">
            {t('graph.suggest.none')}
          </p>
        ) : (
          <ul className="graph-suggestions" aria-label={t('graph.suggest.title')} data-id="graph-suggestions">
            {forThis.items.map((item) => (
              <li key={item.id} className="graph-suggestion">
                <span className="graph-suggestion-title">{item.title}</span>
                <span className="graph-suggestion-score">{relevanceText(locale, item.relevance)}</span>
                <button type="button" className="graph-suggestion-accept" aria-label={t('graph.suggest.acceptLabel', { title: item.title })} onClick={() => onAccept(item)}>
                  {t('graph.suggest.accept')}
                </button>
              </li>
            ))}
          </ul>
        ))}
      {notice && (
        <p className="graph-explore-note" role="status" data-id="graph-notice">
          {notice}
        </p>
      )}
    </section>
  );
}
