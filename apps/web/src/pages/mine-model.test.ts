/** "Của tôi" (C08) without React: statuses, filters, rings and where each planet sits, the first pick, times. */
import { describe, expect, it } from 'vitest';
import { ME, NET, myDoc } from './mine-test-data';
import { ago, canvasItem, daysLeft, documentMatches, firstPick, itemStatusOf, matches, mineItems, NAMED_PLANETS, orbitLayout, personalUniverseEmpty, RING_CAPACITY, ringOf } from './mine-model';

describe('statuses', () => {
  it('tell a hidden published text apart, and read texts left from the review gate as private', () => {
    expect(itemStatusOf({ status: 'approved', hidden: true })).toBe('hidden');
    expect(itemStatusOf({ status: 'approved', hidden: false })).toBe('approved');
    expect(itemStatusOf({ status: 'draft', hidden: false })).toBe('draft');
    expect(itemStatusOf({ status: 'private', hidden: false })).toBe('private');
    expect(itemStatusOf({ status: 'pending', hidden: false })).toBe('private');
    expect(itemStatusOf({ status: 'changes_requested', hidden: false })).toBe('private');
    expect(itemStatusOf({ status: 'rejected', hidden: false })).toBe('private');
  });

  it('put drafts, private texts and published ones on their own rings', () => {
    expect([ringOf('draft'), ringOf('private'), ringOf('approved'), ringOf('hidden')]).toEqual([1, 2, 3, 3]);
  });
});

describe('items and filters', () => {
  const docs = [
    myDoc('note', { status: 'changes_requested' }),
    myDoc('lab', { type: 'lab', status: 'approved', origin: 'community', space: NET, collection: { id: 'c', nameVi: 'Web', nameEn: 'Web' } }),
    myDoc('docx', { type: 'office', title: 'lab-notes.docx', status: 'private' }),
    myDoc('path', { type: 'journey', status: 'approved', hidden: true }),
  ];
  const canvases = [{ id: 'cv', title: 'DHCP từ A đến Z', updatedAt: '2026-11-03T14:05:00.000Z', spaceSlug: 'networking', cards: 7 }];

  it('lists documents first, then canvases (private, in their Space)', () => {
    const items = mineItems(docs, canvases, [NET, ME]);
    expect(items.map((i) => [i.key, i.type, i.status])).toEqual([
      ['note', 'note', 'private'],
      ['lab', 'note', 'approved'],
      ['docx', 'office', 'private'],
      ['path', 'journey', 'hidden'],
      ['canvas:cv', 'canvas', 'private'],
    ]);
    const [canvas] = canvases;
    if (!canvas) throw new Error('no canvas');
    expect(canvasItem(canvas, [NET])).toMatchObject({ href: '/canvas/cv', space: NET, favorite: false });
    expect(items[0]?.href).toBe('/d/note');
  });

  it('filter by type and by status together', () => {
    const items = mineItems(docs, canvases, [NET]);
    expect(items.filter((i) => matches(i, { type: 'note', status: 'all' })).map((i) => i.key)).toEqual(['note', 'lab']);
    expect(items.filter((i) => matches(i, { type: 'all', status: 'private' })).map((i) => i.key)).toEqual(['note', 'docx', 'canvas:cv']);
    expect(items.filter((i) => matches(i, { type: 'office', status: 'approved' }))).toEqual([]);
    expect(documentMatches(myDoc('x', { status: 'approved', hidden: true }), { type: 'all', status: 'hidden' })).toBe(true);
    expect(documentMatches(myDoc('x', { type: 'web' }), { type: 'note', status: 'draft' })).toBe(true);
  });

  it('pick the last changed first; nothing in an empty list', () => {
    expect(firstPick(mineItems(docs, [], []))).toBe('note');
    expect(firstPick(mineItems(docs.slice(1), [], []))).toBe('lab');
    expect(firstPick([])).toBeNull();
  });
});

describe('the orbits', () => {
  it('spread each ring’s planets from its own turn', () => {
    const items = mineItems([myDoc('a', { status: 'draft' }), myDoc('b', { status: 'private' }), myDoc('c', { status: 'pending' }), myDoc('d', { status: 'approved' })], [], []);
    const placed = Object.fromEntries(orbitLayout(items).planets.map((p) => [p.item.key, [p.x, p.y, p.size]]));
    // Ring 1 alone: 35° on the 150 × 92 ellipse around (486, 278), less half the planet.
    expect(placed.a).toEqual([Math.round(486 + 150 * Math.cos((35 * Math.PI) / 180) - 23), Math.round(278 + 92 * Math.sin((35 * Math.PI) / 180) - 23), 46]);
    // Ring 2, two planets (a text left waiting for review is private): 70° and 250°.
    expect(placed.b).toEqual([Math.round(486 + 270 * Math.cos((70 * Math.PI) / 180) - 23), Math.round(278 + 160 * Math.sin((70 * Math.PI) / 180) - 23), 46]);
    expect(placed.c).toEqual([Math.round(486 + 270 * Math.cos((250 * Math.PI) / 180) - 23), Math.round(278 + 160 * Math.sin((250 * Math.PI) / 180) - 23), 46]);
    // Ring 3 alone: 105°.
    expect(placed.d).toEqual([Math.round(486 + 400 * Math.cos((105 * Math.PI) / 180) - 23), Math.round(278 + 240 * Math.sin((105 * Math.PI) / 180) - 23), 46]);
  });
});

describe('a crowded ring', () => {
  const many = (count: number, status: 'approved' | 'draft') => mineItems(Array.from({ length: count }, (_, i) => myDoc(`p${String(i).padStart(2, '0')}`, { status })), [], []);

  it('draws at most its capacity, latest first, and counts the rest on its "+N" in the next place', () => {
    const items = many(40, 'approved');
    const { planets, more } = orbitLayout(items);
    expect(planets).toHaveLength(RING_CAPACITY[3]);
    expect(planets.map((p) => p.item.key)).toEqual(items.slice(0, RING_CAPACITY[3]).map((item) => item.key));
    expect(more).toEqual([{ ring: 3, count: 40 - RING_CAPACITY[3], x: expect.any(Number), y: expect.any(Number), size: 46 }]);
    // names on hover only: more planets than NAMED_PLANETS
    expect(planets.every((p) => !p.named)).toBe(true);
  });

  it('keeps the picked planet on its ring', () => {
    const items = many(40, 'approved');
    const last = items.at(-1)?.key ?? '';
    const { planets } = orbitLayout(items, last);
    expect(planets.map((p) => p.item.key)).toContain(last);
    expect(planets).toHaveLength(RING_CAPACITY[3]);
  });

  it('names every planet of a quiet ring, and has no "+N" when all fit', () => {
    const { planets, more } = orbitLayout(many(NAMED_PLANETS, 'draft'));
    expect(planets).toHaveLength(Math.min(NAMED_PLANETS, RING_CAPACITY[1]));
    expect(more).toEqual([{ ring: 1, count: NAMED_PLANETS - RING_CAPACITY[1], x: expect.any(Number), y: expect.any(Number), size: 46 }]);
    expect(planets.every((p) => p.named)).toBe(true);
    expect(orbitLayout(many(3, 'draft')).more).toEqual([]);
  });
});

describe('the own universe', () => {
  it('is empty without a personal Space, or with one holding no text', () => {
    expect(personalUniverseEmpty([myDoc('a', { space: NET })], null)).toBe(true);
    expect(personalUniverseEmpty([myDoc('a', { space: NET })], 'personal-me')).toBe(true);
    expect(personalUniverseEmpty([myDoc('a')], 'personal-me')).toBe(false);
  });
});

describe('times', () => {
  const now = new Date('2026-11-03T14:05:00.000Z').getTime();

  it('say how long ago, by the day and the week', () => {
    expect(ago('vi', '2026-11-02T14:00:00.000Z', now)).toBe('hôm qua');
    expect(ago('vi', '2026-11-01T14:00:00.000Z', now)).toBe('hôm kia');
    expect(ago('vi', '2026-10-31T14:00:00.000Z', now)).toBe('3 ngày trước');
    expect(ago('vi', '2026-10-27T14:00:00.000Z', now)).toBe('tuần trước');
    expect(ago('vi', '2026-11-03T13:05:00.000Z', now)).toBe('1 giờ trước');
    expect(ago('en', '2026-11-02T14:00:00.000Z', now)).toBe('yesterday');
  });

  it('count the days a trashed text has left, never below zero', () => {
    expect(daysLeft({ purgeAt: '2026-11-30T14:05:00.000Z' }, now)).toBe(27);
    expect(daysLeft({ purgeAt: '2026-11-06T14:05:00.000Z' }, now)).toBe(3);
    expect(daysLeft({ purgeAt: '2026-11-01T00:00:00.000Z' }, now)).toBe(0);
  });
});
