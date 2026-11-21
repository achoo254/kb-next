/**
 * The planet drawn for a Collection that has no art of its own. Collections are "planets" of a Space (a crystal), so
 * each shows one of the planet pictures in the web's `art/` folder, picked from its id: the same Collection always gets
 * the same planet, neighbours in a Space usually differ, and nothing is stored (a Collection given `art` keeps it).
 */

export interface PlanetLook {
  art: string;
  /** Pale and strong colours of the planet, the pair a Collection draws its cluster glow with. */
  tint: string;
  glow: string;
}

const BLUE: PlanetLook = { art: '/art/planet-blue.webp', tint: '#BFDBFE', glow: '#2563EB' };

export const PLANET_LOOKS: readonly PlanetLook[] = [
  BLUE,
  { art: '/art/planet-cyan.webp', tint: '#A5F3FC', glow: '#06B6D4' },
  { art: '/art/planet-emerald.webp', tint: '#A7F3D0', glow: '#10B981' },
  { art: '/art/planet-gold.webp', tint: '#FDE68A', glow: '#F59E0B' },
  { art: '/art/planet-ember.webp', tint: '#FDBA74', glow: '#EA580C' },
  { art: '/art/planet-rose.webp', tint: '#FBCFE8', glow: '#F472B6' },
  { art: '/art/planet-ice.webp', tint: '#E0F2FE', glow: '#7DD3FC' },
];

/** The planet of the Collection with this id. */
export function planetFor(collectionId: string): PlanetLook {
  const hash = [...collectionId].reduce((sum, ch) => (sum * 31 + ch.charCodeAt(0)) >>> 0, 7);
  return PLANET_LOOKS[hash % PLANET_LOOKS.length] ?? BLUE;
}
