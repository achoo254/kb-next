import { describe, expect, it } from 'vitest';
import { neighbours, relevance, spaceRelevance, termsOf } from './relevance';

const doc = (id: string, collectionId: string | null, words: string[], spaceId = 'net') => ({ id, spaceId, collectionId, terms: termsOf(words) });

describe('relevance', () => {
  it('folds words: no diacritics, no short or common words', () => {
    expect([...termsOf(['Giao thức DHCP', 'Thời hạn thuê và gia hạn'])]).toEqual(['giao', 'thuc', 'dhcp', 'thoi', 'han', 'thue', 'gia']);
  });

  it('adds a link, shared neighbours, the same place and shared words, up to 100', () => {
    const dhcp = doc('dhcp', 'core', ['Giao thức DHCP']);
    const arp = doc('arp', 'core', ['Giao thức ARP']);
    const http = doc('http', 'web', ['Tìm hiểu HTTP']);
    const k8s = doc('k8s', null, ['Kiến trúc cụm'], 'k8s');
    const graph = neighbours([
      ['dhcp', 'arp'],
      ['journey', 'dhcp'],
      ['journey', 'arp'],
    ]);
    // Linked 40 + one shared neighbour 10 + same collection 20 + 2 of 4 words 15.
    expect(relevance(dhcp, arp, graph)).toBe(85);
    expect(relevance(arp, dhcp, graph)).toBe(85);
    // Same Space only.
    expect(relevance(dhcp, http, graph)).toBe(10);
    expect(relevance(dhcp, k8s, graph)).toBe(0);
    const same = doc('x', 'core', ['Giao thức DHCP']);
    expect(relevance(dhcp, same, neighbours([['dhcp', 'x'], ['a', 'dhcp'], ['a', 'x'], ['b', 'dhcp'], ['b', 'x'], ['c', 'dhcp'], ['c', 'x']]))).toBe(100);
  });

  it('rates Spaces by the links between them', () => {
    expect([0, 1, 3, 9].map(spaceRelevance)).toEqual([0, 60, 80, 100]);
  });
});
