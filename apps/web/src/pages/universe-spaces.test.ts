import { describe, expect, it } from 'vitest';
import { EXTRA_SLOTS, SCENE_SLOTS, placeSpaces } from '../layout/universe-scene';
import { sceneSpaces, spaceKindOf } from './universe-spaces';
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
