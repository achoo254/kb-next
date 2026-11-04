import type { IconName } from './icon';

/**
 * The Spaces of the Universe and their art: each Space has an AI-drawn crystal (apps/web/public/art) and a tint
 * (KIT §0; the colours are tokens --tint-<space>/--glow-<space> in tokens.css).
 */
export const SPACE_KINDS = ['networking', 'kubernetes', 'linux', 'observability', 'docker', 'weekly', 'personal'] as const;
export type SpaceKind = (typeof SPACE_KINDS)[number];

export const CRYSTAL_ART: Record<SpaceKind, string> = {
  networking: '/art/crystal-networking.webp',
  kubernetes: '/art/crystal-kubernetes.webp',
  linux: '/art/crystal-linux.webp',
  observability: '/art/crystal-observability.webp',
  docker: '/art/crystal-docker.webp',
  weekly: '/art/crystal-weekly.webp',
  personal: '/art/crystal-personal.webp',
};

export const SPACE_ICON: Record<SpaceKind, IconName> = {
  networking: 'space-networking',
  kubernetes: 'space-kubernetes',
  linux: 'space-linux',
  observability: 'space-observability',
  docker: 'space-docker',
  weekly: 'space-weekly',
  personal: 'space-personal',
};

/** The central orb and the neon stage of C09. */
export const ORB_ART = '/art/orb-universe.webp';
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
