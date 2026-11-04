import type { SpaceListItem } from '../api/content-api';
import type { Locale } from '../i18n/i18n';
import type { SceneSpace } from '../layout/universe-scene';
import { SPACE_KINDS, type SpaceKind } from '../ui/art';

/** The Space's address in the app (C10). */
export function spaceHref(slug: string): string {
  return `/s/${encodeURIComponent(slug)}`;
}

function isSpaceKind(value: string | undefined): value is SpaceKind {
  return value !== undefined && (SPACE_KINDS as readonly string[]).includes(value);
}

/**
 * The kind of a Space from its data: the reader's own Space is `personal`; otherwise the crystal file names it
 * (`/art/crystal-docker.webp`), else the slug does (`cloud`). A Space with neither is drawn from its data alone.
 */
export function spaceKindOf(space: Pick<SpaceListItem, 'kind' | 'art' | 'slug'>): SpaceKind | undefined {
  if (space.kind === 'personal') return 'personal';
  const fromArt = /\/crystal-([a-z]+)\.webp$/.exec(space.art)?.[1];
  if (isSpaceKind(fromArt)) return fromArt;
  return isSpaceKind(space.slug) ? space.slug : undefined;
}

export function spaceName(space: Pick<SpaceListItem, 'nameVi' | 'nameEn'>, locale: Locale): string {
  return locale === 'vi' ? space.nameVi : space.nameEn;
}

/** The Spaces of the API as crystals of the scene: name and Jev's caption in the reader's language, art and tints. */
export function sceneSpaces(spaces: readonly SpaceListItem[], locale: Locale): SceneSpace[] {
  return spaces.map((space) => ({
    key: space.slug,
    kind: spaceKindOf(space),
    art: space.art,
    tint: space.tint,
    glow: space.glow,
    name: spaceName(space, locale),
    count: space.caption[locale],
    href: spaceHref(space.slug),
  }));
}
