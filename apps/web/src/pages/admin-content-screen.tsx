/**
 * Published texts (board A02, /admin/content): clustered by Space as planets around their crystal (or as a list),
 * filtered by source and state, searched by title; the picked one in a panel with its facts, the "Đang hiện" switch,
 * its collection and tags, and "Gỡ hẳn" (to the trash, after a confirmation that offers hiding instead). Several can
 * be hidden or shown at once.
 */
import { type CSSProperties, type ReactNode, useEffect, useMemo, useState } from 'react';
import { trashDocument } from '../api/authoring-api';
import { type SpaceListItem, fetchSpaces } from '../api/content-api';
import { type PostPatch, type PublishedItem, fetchPublished, updatePublished } from '../api/review-api';
import { AppShell } from '../layout/app-shell';
import { Button } from '../ui/button';
import { Icon } from '../ui/icon';
import { Loader } from '../ui/loader';
import { Toast } from '../ui/toast';
import { dayText, useAdminText } from './admin-messages';
import './admin-screens.css';

type Source = 'all' | 'official' | 'community';
type State = 'all' | 'visible' | 'hidden';
type Load = { state: 'loading' } | { state: 'failed' } | { state: 'ready'; items: PublishedItem[] };

/** Where the clusters sit in the 920 × 716 field, largest Space first (the board's four, then room for more). */
const SLOTS = [
  { x: 260, y: 330, r: 200 },
  { x: 650, y: 190, r: 120 },
  { x: 700, y: 480, r: 120 },
  { x: 470, y: 610, r: 80 },
  { x: 840, y: 640, r: 70 },
  { x: 110, y: 640, r: 70 },
  { x: 860, y: 90, r: 70 },
] as const;
const PLANET = 44;

/**
 * Board A02's hand placements of a ring of 2, 3 and 6 texts, as offsets from the cluster's centre per unit of its
 * radius (Kubernetes, Linux, Networking around its middle text): clockwise from the top or the upper left.
 */
const PRESETS: Readonly<Record<number, ReadonlyArray<readonly [number, number]>>> = {
  2: [
    [-50 / 120, -30 / 120],
    [55 / 120, 30 / 120],
  ],
  3: [
    [-60 / 120, -30 / 120],
    [50 / 120, -40 / 120],
    [10 / 120, 50 / 120],
  ],
  6: [
    [0, -110 / 200],
    [110 / 200, -50 / 200],
    [120 / 200, 70 / 200],
    [10 / 200, 130 / 200],
    [-100 / 200, 90 / 200],
    [-120 / 200, -40 / 200],
  ],
};
const BIG_PLANET = 54;

export interface Cluster {
  slug: string;
  name: string;
  tint: string;
  glow: string;
  x: number;
  y: number;
  r: number;
  planets: Array<{ item: PublishedItem; x: number; y: number; d: number }>;
}

/**
 * The Spaces as clusters: the most texts first in the largest slot. A cluster's texts sit on a ring around its centre
 * (the board's placements for 2, 3 and 6, else evenly at 55–60% of its radius from the top); with seven or more, the
 * last sits in the middle, larger. Spaces past the slots are
 * left out of the field (the list view has them all).
 */
export function clustersOf(items: readonly PublishedItem[], locale: 'vi' | 'en'): Cluster[] {
  const bySpace = new Map<string, PublishedItem[]>();
  for (const item of items) bySpace.set(item.space.slug, [...(bySpace.get(item.space.slug) ?? []), item]);
  const ordered = [...bySpace.values()].sort((a, b) => b.length - a.length);
  return ordered.slice(0, SLOTS.length).flatMap((group, i) => {
    const slot = SLOTS[i];
    const first = group[0];
    if (!slot || !first) return [];
    const centred = group.length >= 7 ? group.at(-1) : undefined;
    const ring = centred ? group.slice(0, -1) : group;
    const radius = slot.r * (centred ? 0.6 : 0.55);
    // The board's own placements for rings of two, three and six (per unit of radius); others evenly from the top.
    const preset = PRESETS[ring.length];
    const planets = ring.map((item, n) => {
      const at = preset?.[n];
      if (at) return { item, x: slot.x + at[0] * slot.r, y: slot.y + at[1] * slot.r, d: PLANET };
      const angle = -Math.PI / 2 + (2 * Math.PI * n) / ring.length;
      const one = ring.length === 1 && !centred;
      return { item, x: slot.x + (one ? 0 : Math.cos(angle) * radius), y: slot.y + (one ? 0 : Math.sin(angle) * radius), d: PLANET };
    });
    if (centred) planets.push({ item: centred, x: slot.x, y: slot.y, d: BIG_PLANET });
    return [{ slug: first.space.slug, name: locale === 'vi' ? first.space.nameVi : first.space.nameEn, tint: first.space.tint, glow: first.space.glow, x: slot.x, y: slot.y, r: slot.r, planets }];
  });
}

/**
 * A short name for a planet: the title without its leading kind ("Bài tập: ", "Giao thức "), cut after the last whole
 * word that fits in 12 letters ("TCP vs UDP bằng hình" → "TCP vs UDP"); a first word longer than that is kept whole.
 */
export function shortTitle(title: string): string {
  const bare = title.replace(/^(Bài tập|Ghi chú|Lối đi|Lab)\s*:\s*/i, '').replace(/^(Tìm hiểu giao thức|Giao thức|Tìm hiểu)\s+/i, '');
  const words = bare.split(/\s+/);
  let short = words[0] ?? '';
  for (const word of words.slice(1)) {
    if (`${short} ${word}`.length > 12) break;
    short = `${short} ${word}`;
  }
  return short;
}

export function AdminContentScreen(): ReactNode {
  const { t, locale } = useAdminText();
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [spaces, setSpaces] = useState<SpaceListItem[]>([]);
  const [source, setSource] = useState<Source>('all');
  const [state, setState] = useState<State>('all');
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'galaxy' | 'list'>('galaxy');
  const [picked, setPicked] = useState<string | null>(null);
  const [bulk, setBulk] = useState(false);
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  const [removing, setRemoving] = useState(false);
  const [tagDraft, setTagDraft] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    fetchPublished().then(
      (items) => {
        if (live) setLoad({ state: 'ready', items });
      },
      () => {
        if (live) setLoad({ state: 'failed' });
      },
    );
    fetchSpaces().then(
      (list) => {
        if (live) setSpaces(list.filter((s) => s.kind === 'public'));
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [attempt]);

  const all = useMemo(() => (load.state === 'ready' ? load.items : []), [load]);
  const shown = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    return all.filter(
      (item) =>
        (source === 'all' || (source === 'official' ? item.origin === 'official' : item.origin !== 'official')) &&
        (state === 'all' || item.hidden === (state === 'hidden')) &&
        (!q || item.title.toLocaleLowerCase().includes(q)),
    );
  }, [all, source, state, query]);
  const clusters = useMemo(() => clustersOf(shown, locale), [shown, locale]);
  const current = shown.find((i) => i.id === picked) ?? clusters[0]?.planets[0]?.item ?? shown[0] ?? null;

  const replace = (next: PublishedItem): void => {
    setLoad((l) => (l.state === 'ready' ? { state: 'ready', items: l.items.map((i) => (i.id === next.id ? { ...next, opens: i.opens, aiMade: i.aiMade } : i)) } : l));
  };

  const patch = (item: PublishedItem, change: PostPatch): Promise<void> =>
    updatePublished(item.id, change).then(replace, () => {
      setToast(t('content.failed'));
    });

  const pick = (item: PublishedItem): void => {
    if (!bulk) {
      setPicked(item.id);
      setTagDraft(null);
      return;
    }
    setChosen((current) => {
      const next = new Set(current);
      if (next.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      return next;
    });
  };

  const bulkSet = (hidden: boolean): void => {
    const targets = all.filter((i) => chosen.has(i.id) && i.hidden !== hidden);
    void Promise.all(targets.map((item) => patch(item, { hidden }))).then(() => setChosen(new Set()));
  };

  const remove = (item: PublishedItem): void => {
    setRemoving(false);
    trashDocument(item.id).then(
      () => setLoad((l) => (l.state === 'ready' ? { state: 'ready', items: l.items.filter((i) => i.id !== item.id) } : l)),
      () => setToast(t('content.failed')),
    );
  };

  const addTag = (item: PublishedItem): void => {
    const tag = tagDraft?.trim();
    setTagDraft(null);
    if (tag && !item.tags.includes(tag)) void patch(item, { tags: [...item.tags, tag] });
  };

  const chip = <T extends string>(value: T, on: T, set: (v: T) => void, label: string, extra = ''): ReactNode => (
    <button key={value} type="button" aria-pressed={value === on} className={`admin-chip a02-chip ${extra}`.trim()} onClick={() => set(value)}>
      {label}
    </button>
  );

  const name = (item: PublishedItem): string => (locale === 'vi' ? item.space.nameVi : item.space.nameEn);
  const place = (item: PublishedItem): string => [name(item), item.collection ? (locale === 'vi' ? item.collection.nameVi : item.collection.nameEn) : null].filter(Boolean).join(' › ');

  return (
    <AppShell screen="A02" rail="content" admin veil="strong" className="admin-shell">
      <div className="admin-screen" data-id="admin-content" data-state={load.state}>
        <div className="admin-glass a02-bar">
          <label className="a02-search">
            <Icon name="search" size={16} className="a02-search-icon" />
            <span className="admin-sr">{t('content.search')}</span>
            <input type="search" value={query} placeholder={t('content.searchPlaceholder')} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <span className="a02-bar-label">{t('content.source')}</span>
          {chip('all', source, setSource, t('content.source.all'))}
          {chip('official', source, setSource, t('content.source.official'), 'a02-chip-official')}
          {chip('community', source, setSource, t('content.source.community'))}
          <span className="a02-bar-label a02-bar-gap">{t('content.state')}</span>
          {chip('all', state, setState, t('content.state.all'))}
          {chip('visible', state, setState, t('content.state.visible'))}
          {chip('hidden', state, setState, t('content.state.hidden'))}
          <span className="admin-fill" />
          <button
            type="button"
            aria-pressed={bulk}
            className="a02-bulk"
            onClick={() => {
              setBulk((b) => !b);
              setChosen(new Set());
            }}
          >
            {bulk ? t('content.bulkExit') : t('content.bulk')}
          </button>
          <div role="group" aria-label={t('content.view')} className="a02-views">
            <button type="button" aria-pressed={view === 'galaxy'} onClick={() => setView('galaxy')}>
              {t('content.view.galaxy')}
            </button>
            <button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')}>
              {t('content.view.list')}
            </button>
          </div>
        </div>

        {load.state === 'loading' && (
          <div className="a02-field a02-center">
            <Loader variant="spinner" label={t('admin.loading')} />
          </div>
        )}
        {load.state === 'failed' && (
          <div className="a02-field a02-center" role="alert">
            {t('admin.failed')}
            <Button variant="glass" size="md" onClick={() => setAttempt((n) => n + 1)}>
              {t('admin.retry')}
            </Button>
          </div>
        )}
        {load.state === 'ready' && shown.length === 0 && <div className="a02-field a02-center">{t('content.empty')}</div>}

        {load.state === 'ready' && shown.length > 0 && view === 'galaxy' && (
          <div className="a02-field" data-id="content-galaxy">
            {clusters.map((c) => (
              <div key={c.slug} style={{ '--cluster': c.glow, '--cluster-hi': c.tint } as CSSProperties}>
                <div className="a02-ring" aria-hidden="true" style={{ left: c.x - c.r, top: c.y - c.r, width: c.r * 2, height: c.r * 2 }} />
                <div className="a02-ring-inner" aria-hidden="true" style={{ left: c.x - c.r * 0.62, top: c.y - c.r * 0.62, width: c.r * 1.24, height: c.r * 1.24 }} />
                <span className="a02-cluster-name" style={{ left: c.x, top: c.y - c.r - 22 }}>
                  {t('content.cluster', { name: c.name, count: c.planets.length })}
                </span>
                {c.planets.map(({ item, x, y, d }) => {
                  const on = !bulk && item.id === current?.id;
                  return (
                    <div key={item.id} className="a02-planet" data-hidden={item.hidden || undefined} style={{ left: x - d / 2, top: y - d / 2, width: d, height: d }}>
                      <button type="button" className="a02-planet-btn" aria-label={item.title} aria-pressed={bulk ? chosen.has(item.id) : on} data-on={on || undefined} onClick={() => pick(item)} data-id={`content-planet-${item.id}`}>
                        <img src={item.space.art} alt="" aria-hidden="true" style={{ width: d + 22, height: d + 22 }} />
                        {item.origin === 'official' && item.aiMade && <span className="a02-badge-ai">AI</span>}
                        {item.origin !== 'official' && <span className="a02-badge-user">{(Array.from(item.authorName ?? '·')[0] ?? '·').toLocaleUpperCase()}</span>}
                        {bulk && chosen.has(item.id) && <span className="a02-badge-check" aria-hidden="true" />}
                      </button>
                      <span className="a02-planet-name">{shortTitle(item.title)}</span>
                    </div>
                  );
                })}
              </div>
            ))}
            <div className="admin-glass a02-legend">
              <span className="a02-legend-official">
                <span className="a02-legend-ai">AI</span>
                {t('content.legend.official')}
              </span>
              <span>
                <span className="a02-legend-dot a02-legend-community" />
                {t('content.legend.community')}
              </span>
              <span>
                <span className="a02-legend-dot a02-legend-hidden" />
                {t('content.legend.hidden')}
              </span>
            </div>
          </div>
        )}

        {load.state === 'ready' && shown.length > 0 && view === 'list' && (
          <ul className="admin-glass a02-field a02-list" data-id="content-list">
            {shown.map((item) => (
              <li key={item.id}>
                <button type="button" className="a02-row" aria-pressed={bulk ? chosen.has(item.id) : item.id === current?.id} data-hidden={item.hidden || undefined} onClick={() => pick(item)}>
                  <span className="a02-row-dot" style={{ background: item.space.glow }} />
                  <span className="a02-row-title">{item.title}</span>
                  <span className="a02-row-col">{place(item)}</span>
                  <span className="a02-row-src">{item.origin === 'official' ? t('content.source.official') : t('content.source.community')}</span>
                  <span className="a02-row-vis">{item.hidden ? t('content.state.hidden') : t('content.state.visible')}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {bulk && (
          <div className="admin-glass a02-side a02-bulk-panel" data-id="content-bulk">
            <span className="a02-bulk-title">{t('content.picked', { count: chosen.size })}</span>
            <span className="a02-muted">{t('content.pickHint')}</span>
            <div className="a02-bulk-actions">
              <button type="button" className="a02-outline" disabled={chosen.size === 0} onClick={() => bulkSet(true)}>
                {t('content.bulkHide')}
              </button>
              <button type="button" className="a02-show" disabled={chosen.size === 0} onClick={() => bulkSet(false)}>
                {t('content.bulkShow')}
              </button>
            </div>
          </div>
        )}

        {!bulk && current && (
          <aside aria-label={t('content.detail')} className="admin-glass a02-side" key={current.id} data-id="content-detail">
            <div className="a02-detail-head">
              <span className="a02-detail-orb" data-hidden={current.hidden || undefined} style={{ '--cluster': current.space.glow, '--cluster-hi': current.space.tint } as CSSProperties} />
              <div className="a02-detail-title">
                <span className="a02-detail-name">{current.title}</span>
                <span className="a02-muted">{place(current)}</span>
              </div>
            </div>
            <div className="a02-facts">
              <div className="a02-fact">
                <div className="a02-muted">{t('content.fact.source')}</div>
                <div className="a02-fact-value">{current.origin === 'official' ? t('content.src.official') : t('content.src.community')}</div>
              </div>
              <div className="a02-fact">
                <div className="a02-muted">{t('content.fact.date')}</div>
                <div className="a02-fact-value">{dayText(current.createdAt)}</div>
              </div>
              <div className="a02-fact">
                <div className="a02-muted">{t('content.fact.opens')}</div>
                <div className="a02-fact-value">{current.opens}</div>
              </div>
              <div className="a02-fact">
                <div className="a02-muted">{t('content.fact.lang')}</div>
                <div className="a02-fact-value">{current.translations.map((l) => l.toUpperCase()).join(' · ')}</div>
              </div>
            </div>
            <button type="button" role="switch" aria-checked={!current.hidden} className="a02-switch" onClick={() => void patch(current, { hidden: !current.hidden })} data-id="content-visible">
              <span className="a02-switch-text">
                <span className="a02-switch-label">{current.hidden ? t('content.hidden') : t('content.shown')}</span>
                <span className="a02-muted a02-small">{current.hidden ? t('content.hidden.hint') : t('content.shown.hint')}</span>
              </span>
              <span className="a02-toggle">
                <span className="a02-knob" />
              </span>
            </button>
            <div className="a02-meta">
              <span className="a02-meta-head">{t('content.meta')}</span>
              <label className="a02-select">
                {t('content.collection')}
                <select
                  value={current.space.slug}
                  onChange={(e) => {
                    if (e.target.value !== current.space.slug) void patch(current, { space: e.target.value });
                  }}
                >
                  <option value={current.space.slug}>{place(current)}</option>
                  {spaces
                    .filter((s) => s.slug !== current.space.slug)
                    .map((s) => (
                      <option key={s.slug} value={s.slug}>
                        {locale === 'vi' ? s.nameVi : s.nameEn}
                      </option>
                    ))}
                </select>
              </label>
              <div className="a02-tags">
                {current.tags.map((tag) => (
                  <span key={tag} className="admin-tag a02-tag">
                    {tag}
                  </span>
                ))}
                {tagDraft === null ? (
                  <button type="button" className="a02-add-tag" onClick={() => setTagDraft('')}>
                    {t('content.addTag')}
                  </button>
                ) : (
                  <input
                    className="a02-tag-input"
                    aria-label={t('content.tagLabel')}
                    value={tagDraft}
                    maxLength={60}
                    onChange={(e) => setTagDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') addTag(current);
                      if (e.key === 'Escape') setTagDraft(null);
                    }}
                    onBlur={() => addTag(current)}
                  />
                )}
              </div>
            </div>
            <div className="admin-fill" />
            <a href={`/d/${encodeURIComponent(current.id)}`} className="a02-reader">
              {t('content.openReader')}
            </a>
            <button type="button" className="a02-remove" onClick={() => setRemoving(true)} data-id="content-remove">
              {t('content.remove')}
            </button>
          </aside>
        )}

        {removing && current && (
          <div className="a02-overlay">
            <div role="dialog" aria-modal="true" aria-label={t('content.remove.title', { title: current.title })} className="admin-glass a02-dialog">
              <span className="a02-dialog-title">{t('content.remove.title', { title: current.title })}</span>
              <span className="a02-dialog-text">{t('content.remove.text')}</span>
              <div className="a02-dialog-actions">
                <button type="button" className="a02-outline" onClick={() => setRemoving(false)}>
                  {t('content.remove.cancel')}
                </button>
                <button
                  type="button"
                  className="a02-hide-instead"
                  onClick={() => {
                    setRemoving(false);
                    void patch(current, { hidden: true });
                  }}
                >
                  {t('content.remove.hide')}
                </button>
                <button type="button" className="a02-confirm-remove" onClick={() => remove(current)} data-id="content-remove-confirm">
                  {t('content.remove.confirm')}
                </button>
              </div>
            </div>
          </div>
        )}
        {toast && <Toast tone="error" message={toast} onClose={() => setToast(null)} className="admin-toast" />}
      </div>
    </AppShell>
  );
}
