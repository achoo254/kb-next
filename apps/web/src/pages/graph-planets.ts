/**
 * The planet a node of the Graph is drawn as: an AI-drawn planet (apps/web/public/art) in the colour nearest the hue
 * of its Space's glow, so a Space keeps one colour and neighbouring Spaces differ. Each colour comes in three kinds
 * (ringed with light streaks, a banded gas giant with a moon, a cracked rocky world), and the node's id picks the
 * kind, so the nodes of one Space are not all the same planet and each node keeps its own from visit to visit. A pale
 * glow gets the ice planets.
 */

/** The colours, by hue (0–360); `planet-<colour>.webp` and its kinds. */
const COLOURS: ReadonlyArray<{ name: string; hue: number }> = [
  { name: 'crimson', hue: 0 },
  { name: 'ember', hue: 21 },
  { name: 'gold', hue: 38 },
  { name: 'lime', hue: 84 },
  { name: 'emerald', hue: 160 },
  { name: 'cyan', hue: 189 },
  { name: 'blue', hue: 221 },
  { name: 'indigo', hue: 243 },
  { name: 'violet', hue: 258 },
  { name: 'magenta', hue: 292 },
  { name: 'rose', hue: 330 },
];
const ICE = 'ice';
/** The kinds of each colour: '' is the ringed planet, `planet-<colour>.webp`; the others are `planet-<colour>-<kind>.webp`. */
export const PLANET_KINDS = ['', 'banded', 'rocky'] as const;
/**
 * Below this chroma (0–1: the gap between the strongest and weakest channel) a colour reads as white or grey, not as
 * a hue. Chroma, not HSL saturation: a near-white lavender (the CI/CD Space's tint) has full saturation.
 */
const PALE = 0.2;

/** Hue (0–360) and chroma (0–1) of a `#rrggbb` colour, or null when it is not one. */
export function hueOf(hex: string): { hue: number; chroma: number } | null {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!m) return null;
  const [r, g, b] = [m[1], m[2], m[3]].map((part) => parseInt(part ?? '0', 16) / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const chroma = max - Math.min(r, g, b);
  if (chroma === 0) return { hue: 0, chroma };
  const sector = max === r ? ((g - b) / chroma) % 6 : max === g ? (b - r) / chroma + 2 : (r - g) / chroma + 4;
  return { hue: (sector * 60 + 360) % 360, chroma };
}

/** The planet colour for a Space's glow: the nearest hue, or ice for a pale or unknown colour. */
export function planetColour(glow: string | undefined): string {
  const colour = glow ? hueOf(glow) : null;
  if (!colour || colour.chroma < PALE) return ICE;
  const distance = (hue: number): number => Math.min(Math.abs(hue - colour.hue), 360 - Math.abs(hue - colour.hue));
  return COLOURS.reduce((best, c) => (distance(c.hue) < distance(best.hue) ? c : best)).name;
}

/** The planet art of a node: its Space's colour, the kind picked from the node's id. */
export function planetFor(glow: string | undefined, nodeId: string): string {
  const hash = [...nodeId].reduce((sum, ch) => (sum * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const kind = PLANET_KINDS[hash % PLANET_KINDS.length] ?? '';
  return `/art/planet-${planetColour(glow)}${kind ? `-${kind}` : ''}.webp`;
}

/** Every planet picture the Graph can show (the test checks each is in public/art). */
export function allPlanetArt(): string[] {
  return [...COLOURS.map((c) => c.name), ICE].flatMap((name) => PLANET_KINDS.map((kind) => `/art/planet-${name}${kind ? `-${kind}` : ''}.webp`));
}
