import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { listDocuments, listSpaces } from '../access/content';
import { listRecentDocuments } from '../access/reading';
import { GUEST, viewerFor } from '../access/viewer';
import { type DbHandle, openPglite } from './client';
import { assertSeedAllowed, seedDatabase } from './seed';

let database: DbHandle;

beforeAll(async () => {
  database = await openPglite();
});

afterAll(async () => {
  await database.close();
});

describe('dev seed', () => {
  it('refuses production', () => {
    expect(() => assertSeedAllowed('production')).toThrow(/dev only/);
    expect(() => assertSeedAllowed('development')).not.toThrow();
  });

  it('gives the Universe of the mock: 7 Spaces, their captions and Networking as in C10', async () => {
    const first = await seedDatabase(database.db, 'dev:me');
    const again = await seedDatabase(database.db, 'dev:me');
    expect(again).toEqual(first);

    const me = await viewerFor(database.db, new Set(), first.ownerId);
    const spaces = await listSpaces(database.db, me);
    expect(spaces.map((s) => s.nameEn)).toEqual(['Networking', 'Kubernetes', 'Linux', 'Observability', 'Docker', 'Weekly learning', 'Your universe']);
    expect(spaces.map((s) => s.art)).toEqual([
      '/art/crystal-networking.webp',
      '/art/crystal-kubernetes.webp',
      '/art/crystal-linux.webp',
      '/art/crystal-observability.webp',
      '/art/crystal-docker.webp',
      '/art/crystal-weekly.webp',
      '/art/crystal-personal.webp',
    ]);

    // Crystal captions of C09: what each Space counts.
    const caption = async (slug: string, type?: string): Promise<number> => {
      const space = spaces.find((s) => s.slug === slug || (slug === 'personal' && s.kind === 'personal'));
      if (!space) throw new Error(`no Space ${slug}`);
      const docs = await listDocuments(database.db, me, { spaceId: space.id });
      return docs.filter((d) => !type || d.type === type).length;
    };
    expect(await caption('networking', 'lab')).toBe(8);
    expect(await caption('kubernetes')).toBe(2);
    expect(await caption('linux')).toBe(3);
    expect(await caption('observability')).toBe(1);
    expect(await caption('docker')).toBe(3);
    expect(await caption('weekly')).toBe(5);
    // "3 tệp · riêng tư": the three files; the draft note of C02 sits beside them.
    expect(await caption('personal', 'office')).toBe(3);
    expect(await caption('personal', 'note')).toBe(1);

    // A guest sees neither the personal Space nor the private and pending notes.
    const guestSpaces = await listSpaces(database.db, GUEST);
    expect(guestSpaces).toHaveLength(6);
    const networking = guestSpaces.find((s) => s.slug === 'networking');
    if (!networking) throw new Error('no Networking');
    const titles = (await listDocuments(database.db, GUEST, { spaceId: networking.id })).map((d) => d.title);
    expect(titles).toContain('Ghi chú: DHCP giả mạo');
    expect(titles).not.toContain('DHCP trên router nhà');
    expect(titles).not.toContain('So sánh ARP và NDP');
  });

  it('dates documents one apart, in the order of C09’s "Gần đây" stage', async () => {
    const { ownerId } = await seedDatabase(database.db, 'dev:me');
    const recent = await listRecentDocuments(database.db, await viewerFor(database.db, new Set(), ownerId), 40);
    expect(recent.slice(0, 2).map((d) => d.title)).toEqual(['Giao thức DHCP', 'Kiến trúc cụm K8s']);
    expect(recent[0]?.updatedAt.toISOString()).toBe('2026-11-03T14:05:00.000Z');
    expect(new Set(recent.map((d) => d.updatedAt.getTime())).size).toBe(recent.length);
  });
});
