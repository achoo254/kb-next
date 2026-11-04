import type { IconName } from './icon';

/**
 * The Spaces of the Universe and their art: each Space has an AI-drawn crystal (apps/web/public/art) and a tint
 * (KIT §0; the colours are tokens --tint-<space>/--glow-<space> in tokens.css). A Space is data: its art, tint and glow
 * come from the API, so the kind only picks the icon, the board slot and the fallback look.
 */
export const SPACE_KINDS = ['networking', 'kubernetes', 'linux', 'observability', 'docker', 'weekly', 'personal', 'cloud'] as const;
export type SpaceKind = (typeof SPACE_KINDS)[number];

export const CRYSTAL_ART: Record<SpaceKind, string> = {
  networking: '/art/crystal-networking.webp',
  kubernetes: '/art/crystal-kubernetes.webp',
  linux: '/art/crystal-linux.webp',
  observability: '/art/crystal-observability.webp',
  docker: '/art/crystal-docker.webp',
  weekly: '/art/crystal-weekly.webp',
  personal: '/art/crystal-personal.webp',
  // No crystal drawn for Cloud yet: the orb stands in, as in the import curation (content/hoc-cloud/curation.json).
  cloud: '/art/orb-universe.webp',
};

export const SPACE_ICON: Record<SpaceKind, IconName> = {
  networking: 'space-networking',
  kubernetes: 'space-kubernetes',
  linux: 'space-linux',
  observability: 'space-observability',
  docker: 'space-docker',
  weekly: 'space-weekly',
  personal: 'space-personal',
  cloud: 'space-cloud',
};

/** The central orb and the neon stage of C09. */
export const ORB_ART = '/art/orb-universe.webp';

/**
 * The crystal art (480px; the orb standing in for Cloud is 768px) shows at 168px, so each also has a 336px copy
 * (`-336.webp`, 2× the crystal) the browser picks on 1× and 2× screens. Art from the API without a copy keeps one src.
 */
const CRYSTAL_ART_WIDTH: Readonly<Record<string, number>> = {
  ...Object.fromEntries(Object.values(CRYSTAL_ART).map((src) => [src, 480])),
  [ORB_ART]: 768,
};

/** The srcset of a crystal's art, or undefined when the art has no smaller copy. */
export function crystalSrcSet(src: string): string | undefined {
  const width = CRYSTAL_ART_WIDTH[src];
  return width ? `${src.replace(/\.webp$/, '-336.webp')} 336w, ${src} ${width}w` : undefined;
}
export const STAGE_ART = '/art/stage-platform.webp';

/** The AI-drawn state illustrations (phase 2 table): never redrawn in CSS. */
export const ILLUSTRATIONS = {
  blackhole: '/art/ill-blackhole.webp',
  'vault-lock': '/art/ill-vault-lock.webp',
  'satellite-repair': '/art/ill-satellite-repair.webp',
  'crystal-cracked': '/art/ill-crystal-cracked.webp',
  'comet-sent': '/art/ill-comet-sent.webp',
  'planet-offline': '/art/ill-planet-offline.webp',
  'telescope-empty': '/art/ill-telescope-empty.webp',
  'ai-core': '/art/ill-ai-core.webp',
  'key-crystal': '/art/ill-key-crystal.webp',
  'twin-moons-translate': '/art/ill-twin-moons-translate.webp',
  'wormhole-gate': '/art/ill-wormhole-gate.webp',
  'doc-planet': '/art/ill-doc-planet.webp',
  'journey-path': '/art/ill-journey-path.webp',
} as const;
export type IllustrationName = keyof typeof ILLUSTRATIONS;

/** Art an empty state or dialog can show: an illustration, or a Space crystal (X01 "Chưa có ghi chú"). */
export type StateArt = IllustrationName | `crystal-${SpaceKind}`;

function isIllustration(art: string): art is IllustrationName {
  return Object.hasOwn(ILLUSTRATIONS, art);
}

export function stateArtSrc(art: StateArt): string {
  if (isIllustration(art)) return ILLUSTRATIONS[art];
  const space = SPACE_KINDS.find((kind) => art === `crystal-${kind}`);
  return space ? CRYSTAL_ART[space] : ILLUSTRATIONS['crystal-cracked'];
}
