/**
 * The planet a node of the Graph is drawn as: the AI-drawn planet (apps/web/public/art) whose colour is nearest the
 * hue of its Space's glow, so every node of a Space shares one planet and neighbouring Spaces differ. A pale glow
 * (little saturation) gets the ice planet.
 */

const PLANETS: ReadonlyArray<{ art: string; hue: number }> = [
  { art: '/art/planet-crimson.webp', hue: 0 },
  { art: '/art/planet-ember.webp', hue: 21 },
  { art: '/art/planet-gold.webp', hue: 38 },
  { art: '/art/planet-lime.webp', hue: 84 },
  { art: '/art/planet-emerald.webp', hue: 160 },
  { art: '/art/planet-cyan.webp', hue: 189 },
  { art: '/art/planet-blue.webp', hue: 221 },
  { art: '/art/planet-indigo.webp', hue: 243 },
  { art: '/art/planet-violet.webp', hue: 258 },
  { art: '/art/planet-magenta.webp', hue: 292 },
  { art: '/art/planet-rose.webp', hue: 330 },
];
export const ICE_PLANET = '/art/planet-ice.webp';
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

/** The planet art for a Space's glow colour; the ice planet for a pale or unknown colour. */
export function planetForColour(glow: string | undefined): string {
  const colour = glow ? hueOf(glow) : null;
  if (!colour || colour.chroma < PALE) return ICE_PLANET;
  const distance = (hue: number): number => Math.min(Math.abs(hue - colour.hue), 360 - Math.abs(hue - colour.hue));
  return PLANETS.reduce((best, planet) => (distance(planet.hue) < distance(best.hue) ? planet : best)).art;
}
