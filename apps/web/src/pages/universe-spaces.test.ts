import { describe, expect, it } from 'vitest';
import { EXTRA_SLOTS, SCENE_SLOTS, placeSpaces, sceneCapacity } from '../layout/universe-scene';
import { orbitSpaces, sceneSpaces, spaceKindOf } from './universe-spaces';
import { BOARD_SPACES, space } from './universe-test-data';

describe('spaceKindOf', () => {
  it('reads the kind from the reader’s own Space, the crystal file, then the slug', () => {
    expect(spaceKindOf(space('personal-u1', { kind: 'personal', art: '/art/crystal-personal.webp' }))).toBe('personal');
    expect(spaceKindOf(space('containers', { art: '/art/crystal-docker.webp' }))).toBe('docker');
    expect(spaceKindOf(space('cloud', { art: '/art/orb-universe.webp' }))).toBe('cloud');
    expect(spaceKindOf(space('security', { art: '/art/crystal-security.webp' }))).toBeUndefined();
  });
});

describe('sceneSpaces', () => {
  it('names each Space and its caption in the reader’s language and keeps its own art and tints', () => {
    const [networking] = sceneSpaces(BOARD_SPACES, 'en');
    expect(networking).toMatchObject({ key: 'networking', kind: 'networking', name: 'Networking', count: '8 labs', href: '/s/networking' });
    expect(networking?.art).toBe('/art/crystal-networking.webp');
    expect(networking?.glow).toBe('var(--glow-net)');
    expect(sceneSpaces([space('weekly', { nameVi: 'Học hàng tuần' })], 'vi')[0]?.name).toBe('Học hàng tuần');
  });
});

describe('placeSpaces', () => {
  it('puts the board’s Spaces on the board’s slots and orders them clockwise from Networking', () => {
    const placed = placeSpaces(sceneSpaces(BOARD_SPACES, 'vi'));
    expect(placed.map((entry) => entry.space.kind)).toEqual(['networking', 'kubernetes', 'observability', 'personal', 'weekly', 'docker', 'linux']);
    expect(placed[0]).toMatchObject(SCENE_SLOTS.networking);
  });

  it('gives Cloud its own slot and a Space of an unknown kind the next free one; Spaces beyond the slots stay off', () => {
    const extra = [space('cloud', { art: '/art/orb-universe.webp' }), space('security', { art: '/x.webp' }), space('more', { art: '/y.webp' })];
    const placed = placeSpaces(sceneSpaces([...BOARD_SPACES, ...extra], 'vi'));
    expect(placed.find((entry) => entry.space.key === 'cloud')).toMatchObject(SCENE_SLOTS.cloud);
    expect(placed.find((entry) => entry.space.key === 'security')).toMatchObject(EXTRA_SLOTS[0] ?? {});
    expect(placed).toHaveLength(BOARD_SPACES.length + 1 + EXTRA_SLOTS.length);
    expect(placed.some((entry) => entry.space.key === 'more')).toBe(false);
  });
});

describe('orbitSpaces', () => {
  const at = (day: number): string => `2026-11-${String(day).padStart(2, '0')}T10:00:00Z`;

  it('keeps every Space while the orbit has room', () => {
    expect(orbitSpaces(BOARD_SPACES, sceneCapacity())).toEqual(BOARD_SPACES);
  });

  it('keeps the reader’s own Space, then the ones with the newest texts, in the API’s order', () => {
    const spaces = [
      space('a', { updatedAt: at(1) }),
      space('b', { updatedAt: null }),
      space('personal-u1', { kind: 'personal', updatedAt: at(1) }),
      space('c', { updatedAt: at(7) }),
      space('d', { updatedAt: at(5) }),
    ];
    expect(orbitSpaces(spaces, 3).map((s) => s.slug)).toEqual(['personal-u1', 'c', 'd']);
    expect(orbitSpaces(spaces, 4).map((s) => s.slug)).toEqual(['a', 'personal-u1', 'c', 'd']);
  });
});

describe('placeSpaces with Spaces of no known kind', () => {
  it('puts them on the extra slots, then on the slots of kinds that are not on the scene', () => {
    const spaces = sceneSpaces([space('networking'), space('ky-nang', { art: '/art/orb-universe.webp' }), space('doi-song', { art: '/art/orb-universe.webp' })], 'vi');
    const placed = placeSpaces(spaces);
    expect(placed).toHaveLength(3);
    const where = new Map(placed.map((p) => [p.space.key, { x: p.x, y: p.y }]));
    expect(where.get('networking')).toEqual(SCENE_SLOTS.networking);
    expect(where.get('ky-nang')).toEqual(EXTRA_SLOTS[0]);
    expect(where.get('doi-song')).toEqual(SCENE_SLOTS.kubernetes);
  });

  it('fills the whole scene, one Space per slot, when there are as many Spaces as slots', () => {
    const many = Array.from({ length: sceneCapacity() + 2 }, (_, i) => space(`topic-${i}`, { art: '/art/orb-universe.webp' }));
    const placed = placeSpaces(sceneSpaces(many, 'vi'));
    expect(placed).toHaveLength(sceneCapacity());
    expect(new Set(placed.map((p) => `${p.x},${p.y}`)).size).toBe(sceneCapacity());
  });
});
