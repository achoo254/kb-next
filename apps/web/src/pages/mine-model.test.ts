/** "Của tôi" (C08) without React: statuses, filters, rings and where each planet sits, the first pick, times. */
import { describe, expect, it } from 'vitest';
import { ME, NET, myDoc } from './mine-test-data';
import { ago, canvasItem, daysLeft, documentMatches, firstPick, itemStatusOf, matches, mineItems, orbitLayout, personalUniverseEmpty, ringOf } from './mine-model';

describe('statuses', () => {
  it('tell a hidden published text and one sent back apart from the API’s statuses', () => {
    expect(itemStatusOf({ status: 'approved', hidden: true })).toBe('hidden');
    expect(itemStatusOf({ status: 'approved', hidden: false })).toBe('approved');
    expect(itemStatusOf({ status: 'changes_requested', hidden: false })).toBe('changes');
    expect(itemStatusOf({ status: 'private', hidden: false })).toBe('private');
  });

  it('put each step of review on its ring, refused texts apart', () => {
    expect([ringOf('draft'), ringOf('private'), ringOf('pending'), ringOf('changes'), ringOf('approved'), ringOf('hidden'), ringOf('rejected')]).toEqual([1, 1, 2, 2, 3, 3, 4]);
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
      ['note', 'note', 'changes'],
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

  it('filter by type and by review status together', () => {
    const items = mineItems(docs, canvases, [NET]);
    expect(items.filter((i) => matches(i, { type: 'note', status: 'all' })).map((i) => i.key)).toEqual(['note', 'lab']);
    expect(items.filter((i) => matches(i, { type: 'all', status: 'private' })).map((i) => i.key)).toEqual(['docx', 'canvas:cv']);
    expect(items.filter((i) => matches(i, { type: 'office', status: 'approved' }))).toEqual([]);
    expect(documentMatches(myDoc('x', { status: 'approved', hidden: true }), { type: 'all', status: 'hidden' })).toBe(true);
    expect(documentMatches(myDoc('x', { type: 'web' }), { type: 'note', status: 'draft' })).toBe(true);
  });

  it('pick first what a reviewer sent back, else the last changed; nothing in an empty list', () => {
    expect(firstPick(mineItems(docs, [], []))).toBe('note');
    expect(firstPick(mineItems(docs.slice(1), [], []))).toBe('lab');
    expect(firstPick([])).toBeNull();
  });
});

describe('the orbits', () => {
  it('spread each ring’s planets from its own turn, and line refused ones up in their box', () => {
    const items = mineItems(
      [myDoc('a', { status: 'private' }), myDoc('b', { status: 'pending' }), myDoc('c', { status: 'changes_requested' }), myDoc('d', { status: 'rejected' }), myDoc('e', { status: 'rejected' })],
      [],
      [],
    );
    const placed = Object.fromEntries(orbitLayout(items).map((p) => [p.item.key, [p.x, p.y, p.size]]));
    // Ring 1 alone: 35° on the 150 × 92 ellipse around (486, 278), less half the planet.
    expect(placed.a).toEqual([Math.round(486 + 150 * Math.cos((35 * Math.PI) / 180) - 23), Math.round(278 + 92 * Math.sin((35 * Math.PI) / 180) - 23), 46]);
    // Ring 2, two planets: 70° and 250°.
    expect(placed.b).toEqual([Math.round(486 + 270 * Math.cos((70 * Math.PI) / 180) - 23), Math.round(278 + 160 * Math.sin((70 * Math.PI) / 180) - 23), 46]);
    expect(placed.c).toEqual([Math.round(486 + 270 * Math.cos((250 * Math.PI) / 180) - 23), Math.round(278 + 160 * Math.sin((250 * Math.PI) / 180) - 23), 46]);
    expect(placed.d).toEqual([846, 48, 40]);
    expect(placed.e).toEqual([906, 48, 40]);
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
