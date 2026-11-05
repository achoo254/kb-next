import type { ReactNode } from 'react';

/** How an icon is drawn: outlined with `currentColor` (most) or filled (the sparkles and the four-point star). */
interface IconShape {
  body: ReactNode;
  fill?: boolean;
  /** Stroke width of the mock for this icon when it differs from 2. */
  stroke?: number;
  cap?: 'round';
  join?: 'round';
}

/** The icons of the mock boards (24×24, paths copied from the boards). */
const ICONS = {
  orbit: { body: <><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" /><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" /></>, join: 'round' },
  cube: { body: <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />, join: 'round' },
  graph: {
    body: (
      <>
        <circle cx="6" cy="6" r="2" />
        <circle cx="18" cy="6" r="2" />
        <circle cx="6" cy="18" r="2" />
        <circle cx="18" cy="18" r="2" />
        <circle cx="12" cy="12" r="2" />
        <path d="M8 8l2.5 2.5M16 8l-2.5 2.5M8 16l2.5-2.5M16 16l-2.5-2.5" />
      </>
    ),
    cap: 'round',
  },
  'graph-mini': { body: <><circle cx="6" cy="6" r="2" /><circle cx="18" cy="18" r="2" /><path d="M8 8l8 8" /></> },
  'graph-tree': { body: <><circle cx="6" cy="6" r="2" /><circle cx="18" cy="6" r="2" /><circle cx="12" cy="18" r="2" /><path d="M8 6h8M7 8l4 8M17 8l-4 8" /></> },
  canvas: { body: <><path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4" /><rect x="9" y="9" width="6" height="6" rx="1" /></>, cap: 'round' },
  'canvas-mini': { body: <rect x="5" y="5" width="14" height="14" rx="2" /> },
  docs: { body: <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4M9 13h6M9 17h4" /></>, cap: 'round' },
  'docs-mini': { body: <path d="M6 3h8l4 4v14H6z" /> },
  home: { body: <path d="M4 11l8-7 8 7v9H4z" />, join: 'round' },
  plus: { body: <path d="M12 5v14M5 12h14" />, stroke: 2.4, cap: 'round' },
  search: { body: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></>, cap: 'round' },
  sparkles: { body: <path d="M10 2l1.8 5.5L17 9.3l-5.2 1.8L10 16.5l-1.8-5.4L3 9.3l5.2-1.8zM18 13l.9 2.6 2.6.9-2.6.9L18 20l-.9-2.6-2.6-.9 2.6-.9z" />, fill: true },
  sparkle: { body: <path d="M10 2l1.8 5.5L17 9.3l-5.2 1.8L10 16.5l-1.8-5.4L3 9.3l5.2-1.8z" />, fill: true },
  star: { body: <path d="M12 2l2.2 6.8L21 11l-6.8 2.2L12 20l-2.2-6.8L3 11l6.8-2.2z" />, fill: true },
  bars: { body: <path d="M5 20V10M12 20V4M19 20v-7" />, cap: 'round' },
  settings: { body: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2" /></> },
  bell: { body: <path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8M10 20a2 2 0 0 0 4 0" />, cap: 'round' },
  expand: { body: <path d="M14 4h6v6M20 4l-7 7M10 20H4v-6M4 20l7-7" />, stroke: 2.2, cap: 'round' },
  send: { body: <path d="M4 12l16-8-6 16-3-7z" />, stroke: 2.2, cap: 'round', join: 'round' },
  community: { body: <><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2.5" /><path d="M3 20c0-3 3-5 6-5s6 2 6 5M15 15c3 0 6 1.5 6 4" /></>, stroke: 2.4 },
  lock: { body: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>, stroke: 2.4 },
  'lock-open': { body: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>, stroke: 2.2, cap: 'round' },
  clock: { body: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>, stroke: 2.4, cap: 'round' },
  check: { body: <path d="M5 12l5 5 9-10" />, stroke: 3, cap: 'round', join: 'round' },
  info: { body: <path d="M12 8v.5M12 11v6" />, stroke: 3, cap: 'round', join: 'round' },
  alert: { body: <path d="M12 7v6M12 16v.5" />, stroke: 3, cap: 'round', join: 'round' },
  cross: { body: <path d="M7 7l10 10M17 7L7 17" />, stroke: 3, cap: 'round', join: 'round' },
  undo: { body: <path d="M9 14l-4-4 4-4M5 10h9a5 5 0 0 1 0 10h-3" />, stroke: 3, cap: 'round', join: 'round' },
  close: { body: <path d="M6 6l12 12M18 6L6 18" />, stroke: 2.4, cap: 'round' },
  warning: { body: <path d="M12 3l10 18H2zM12 10v4M12 17v.5" />, cap: 'round' },
  'error-circle': { body: <><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16v.5" /></>, stroke: 2.4, cap: 'round' },
  trash: { body: <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />, stroke: 2.2, cap: 'round' },
  retry: { body: <path d="M21 12a9 9 0 1 1-3-6.7M21 4v5h-5" />, stroke: 2.2, cap: 'round' },
  pencil: { body: <path d="M4 20h4L19 9l-4-4L4 16z" />, stroke: 2.4, cap: 'round', join: 'round' },
  'lock-small': { body: <path d="M6 11h12v9H6zM9 11V8a3 3 0 0 1 6 0v3" />, stroke: 2.4, cap: 'round', join: 'round' },
  link: {
    body: <path d="M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1 1M14 10a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1-1" />,
    stroke: 2.4,
    cap: 'round',
    join: 'round',
  },
  offline: { body: <path d="M3 3l18 18M8.5 16a5 5 0 0 1 7 0M12 19.5v.5" />, stroke: 2.4, cap: 'round', join: 'round' },
  translate: { body: <path d="M4 5h8M8 3v2M6 5c0 4 3 7 6 8M10 5c0 3-3 7-6 8M13 21l4-9 4 9M14.5 18h5" />, stroke: 2.4, cap: 'round', join: 'round' },
  sun: { body: <path d="M12 4V2M12 22v-2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z" />, cap: 'round' },
  moon: { body: <path d="M20 14A8 8 0 0 1 10 4a8 8 0 1 0 10 10z" />, cap: 'round' },
  globe: { body: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" /></>, stroke: 2.1, cap: 'round' },
  monitor: { body: <><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8" /></> },
  cloud: { body: <path d="M7 18a5 5 0 1 1 1-9.9A6 6 0 0 1 19 10a4 4 0 0 1-1 8z" /> },
  bookmark: { body: <path d="M6 3h12v18l-6-4-6 4z" />, cap: 'round', join: 'round' },
  chevron: { body: <path d="M3 11l9-8 9 8" />, stroke: 2.4, cap: 'round' },
  /* the Space crystals of board C09 */
  'space-networking': { body: <path d="M5 6a2 2 0 1 0 0 .1M19 6a2 2 0 1 0 0 .1M12 19a2 2 0 1 0 0 .1M6.5 7.5l4.5 9.5M17.5 7.5L13 17M7 6h10" />, stroke: 2.1, cap: 'round', join: 'round' },
  'space-kubernetes': { body: <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 8v8M8.5 10l7 4M15.5 10l-7 4" />, stroke: 2.1, cap: 'round', join: 'round' },
  'space-linux': { body: <path d="M4 5h16v14H4zM7 9l3 3-3 3M12 15h5" />, stroke: 2.1, cap: 'round', join: 'round' },
  'space-observability': { body: <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" />, stroke: 2.1, cap: 'round', join: 'round' },
  'space-docker': { body: <path d="M3 13h18v5H3zM6 13V9h4v4M10 9V6h4v7M14 13V9h4v4" />, stroke: 2.1, cap: 'round', join: 'round' },
  'space-weekly': { body: <path d="M4 6h16v14H4zM4 10h16M9 3v4M15 3v4" />, stroke: 2.1, cap: 'round', join: 'round' },
  'space-personal': { body: <path d="M12 3l2.5 5 5.5.8-4 3.9.9 5.5L12 15.6 7.1 18.2 8 12.7 4 8.8 9.5 8z" />, stroke: 2.1, cap: 'round', join: 'round' },
  /* Interaction board: the navigation layers */
  'layer-universe': { body: <path d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM2 14c3 2 17-2 20-6" />, cap: 'round', join: 'round' },
  'layer-space': { body: <path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18" />, cap: 'round', join: 'round' },
  'layer-collection': { body: <path d="M4 7h16M4 12h16M4 17h10" />, cap: 'round', join: 'round' },
  'layer-document': { body: <path d="M6 3h8l4 4v14H6zM14 3v4h4" />, cap: 'round', join: 'round' },
  /* Start and error screens (S01, S02, X02): the sign-in arrow of S01's button and the stacked layers of the orb */
  'sign-in': { body: <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3" />, stroke: 2.2, cap: 'round', join: 'round' },
  layers: { body: <><path d="M12 3l9 5-9 5-9-5z" /><path d="M3 13l9 5 9-5" /><path d="M3 9l9 5 9-5" /></>, stroke: 1.8, join: 'round' },
  /* Universe screen (C09): the crystal icon of the Cloud Space (the cloud of the board's AI answer, crystal stroke) */
  'space-cloud': { body: <path d="M7 18a5 5 0 1 1 1-9.9A6 6 0 0 1 19 10a4 4 0 0 1-1 8z" />, stroke: 2.1, cap: 'round', join: 'round' },
  /* the ways to start of the empty Universe (S05): upload an Office file, make a journey */
  upload: { body: <path d="M12 16V4M7 9l5-5 5 5M4 20h16" />, cap: 'round', join: 'round' },
  journey: { body: <path d="M5 18a2.5 2.5 0 1 0 0 .1M19 6a2.5 2.5 0 1 0 0 .1M7 16c4-1 3-7 10-9" />, cap: 'round', join: 'round' },
  /* search (C12, F01): the mode chips "Tất cả" and "Từ khoá", the notice, a row's way forward */
  menu: { body: <path d="M4 6h16M4 12h16M4 18h16" />, cap: 'round' },
  type: { body: <path d="M4 7V5h16v2M9 19h6M12 5v14" />, cap: 'round' },
  'info-circle': { body: <><circle cx="12" cy="12" r="9" /><path d="M12 8v.5M12 11v5" /></>, cap: 'round' },
  'chevron-right': { body: <path d="M9 6l6 6-6 6" />, stroke: 2.4, cap: 'round' },
  'chevron-left': { body: <path d="M15 6l-6 6 6 6" />, stroke: 2.4, cap: 'round' },
  /* C14 answer vote (the thumbs-down is this one turned over) */
  thumb: { body: <path d="M7 11v9H4v-9zM7 11l4-8a2 2 0 0 1 3 2l-1 5h6a2 2 0 0 1 2 2l-2 7a2 2 0 0 1-2 1H7" />, cap: 'round', join: 'round' },
  'doc-plus': { body: <path d="M6 3h8l4 4v14H6zM12 11v6M9 14h6" />, stroke: 2.2, cap: 'round' },
  /* C02 editor: undo and redo of its top bar, preview, the "/" blocks and the AI writing actions */
  'undo-arrow': { body: <path d="M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3" />, cap: 'round' },
  'redo-arrow': { body: <path d="M15 14l5-5-5-5M20 9H9a5 5 0 0 0 0 10h3" />, cap: 'round' },
  eye: { body: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></> },
  'block-paragraph': { body: <path d="M4 6h16M4 12h16M4 18h10" />, cap: 'round', join: 'round' },
  'block-heading': { body: <path d="M5 5v14M15 5v14M5 12h10" />, cap: 'round', join: 'round' },
  'block-list': { body: <path d="M9 6h11M9 12h11M9 18h11M4 6h.1M4 12h.1M4 18h.1" />, cap: 'round', join: 'round' },
  'block-image': { body: <path d="M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4" />, cap: 'round', join: 'round' },
  'block-diagram': { body: <path d="M5 4h6v5H5zM13 15h6v5h-6zM8 9v4h8v2" />, cap: 'round', join: 'round' },
  'block-table': { body: <path d="M4 5h16v14H4zM4 10h16M4 15h16M10 5v14" />, cap: 'round', join: 'round' },
  'block-office': { body: <path d="M6 3h8l4 4v14H6zM14 3v4h4" />, cap: 'round', join: 'round' },
  'arrow-right': { body: <path d="M4 12h12M12 6l6 6-6 6" />, cap: 'round', join: 'round' },
  shorten: { body: <path d="M4 7h16M4 12h10M4 17h6" />, cap: 'round', join: 'round' },
  question: { body: <path d="M12 18h.01M9 9a3 3 0 1 1 4 2.8c-.6.3-1 .9-1 1.6V14" />, cap: 'round', join: 'round' },
  'arrow-up-right': { body: <path d="M7 17L17 7M9 7h8v8" />, cap: 'round' },
  /* C17: the two versions compared */
  swap: { body: <path d="M7 7h12l-3-3M17 17H5l3 3" />, cap: 'round' },
  /* C01: the ring of things to create */
  'create-note': { body: <path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4" />, stroke: 2.1, cap: 'round', join: 'round' },
  'create-template': { body: <path d="M5 3h14v18H5zM9 7h6M9 11h6M9 15h4" />, stroke: 2.1, cap: 'round', join: 'round' },
  'create-space': { body: <path d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM2 14c3 2 17-2 20-6" />, stroke: 2.1, cap: 'round', join: 'round' },
  'create-collection': { body: <path d="M4 7h16M4 12h16M4 17h10" />, stroke: 2.1, cap: 'round', join: 'round' },
  'create-office': { body: <path d="M12 16V4M7 9l5-5 5 5M5 20h14" />, stroke: 2.1, cap: 'round', join: 'round' },
  'create-bulk': { body: <path d="M4 6h6l2 2h8v10H4zM12 11v5M9.5 13.5L12 11l2.5 2.5" />, stroke: 2.1, cap: 'round', join: 'round' },
  'create-url': {
    body: <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />,
    stroke: 2.1,
    cap: 'round',
    join: 'round',
  },
  'create-journey': { body: <path d="M5 18a2.5 2.5 0 1 0 0 .1M19 6a2.5 2.5 0 1 0 0 .1M7 16c4-1 3-7 10-9" />, stroke: 2.1, cap: 'round', join: 'round' },
  /* C08: a favourite (outlined; filled by CSS once on) and a text an admin hid */
  favorite: { body: <path d="M12 2l3 7 7 .6-5.3 4.7 1.6 7.2L12 17.8 5.7 21.5l1.6-7.2L2 9.6 9 9z" /> },
  'eye-off': { body: <path d="M3 3l18 18M10.6 6.1A10 10 0 0 1 22 12s-1.2 2.2-3.3 4M6.6 6.6C3.8 8.3 2 12 2 12s4 7 10 7c1.6 0 3-.4 4.3-1" />, stroke: 2.4, cap: 'round' },
  'create-canvas': { body: <path d="M4 4h7v7H4zM13 13h7v7h-7zM11 7.5h3.5a2 2 0 0 1 2 2V13" />, stroke: 2.1, cap: 'round', join: 'round' },
  /* C03, C16: the processing details link; H04: the connection banner, the conflict mark and the server copy */
  lines: { body: <path d="M4 6h16M4 12h10M4 18h6" />, cap: 'round' },
  'wifi-off': { body: <path d="M2 9a15 15 0 0 1 6-3.3M22 9a15 15 0 0 0-8-3.9M8.5 16a5 5 0 0 1 7 0M12 19.5v.5M3 3l18 18" />, stroke: 2.2, cap: 'round' },
  wifi: { body: <path d="M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 19.5v.5" />, stroke: 2.2, cap: 'round' },
  reconnect: { body: <path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5" />, stroke: 2.2, cap: 'round' },
  conflict: { body: <path d="M7 4v10M17 10v10M4 7l3-3 3 3M14 17l3 3 3-3" />, stroke: 2.2, cap: 'round' },
  'cloud-copy': { body: <path d="M7 18a4 4 0 0 1-1-7.9A6 6 0 0 1 17.7 9 4.5 4.5 0 0 1 17 18z" /> },
} satisfies Record<string, IconShape>;

export type IconName = keyof typeof ICONS;

interface IconProps {
  name: IconName;
  /** Width and height in px (the boards use 13–28). */
  size?: number;
  /** Overrides the mock's stroke width for this icon. */
  strokeWidth?: number;
  className?: string;
}

/** A decorative icon of the mock: hidden from assistive technology, coloured by `currentColor`. */
export function Icon({ name, size = 18, strokeWidth, className }: IconProps): ReactNode {
  const shape: IconShape = ICONS[name];
  const paint = shape.fill
    ? { fill: 'currentColor' }
    : { fill: 'none', stroke: 'currentColor', strokeWidth: strokeWidth ?? shape.stroke ?? 2, strokeLinecap: shape.cap, strokeLinejoin: shape.join };
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...paint}>
      {shape.body}
    </svg>
  );
}

/* X03-StatesCoverage board */
/** The shield of the "permission changed" notice (board X03, stroke 2.2, round caps), decorative like `Icon`. */
export function ShieldIcon({ size = 16, className }: { size?: number; className?: string }): ReactNode {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
      <path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z" />
    </svg>
  );
}
