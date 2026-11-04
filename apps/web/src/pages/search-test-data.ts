/** Search answers for the C12 and ⌘K palette tests, in the API's shape (api/search-api.ts). */
import type { SearchGroup, SearchResponse, SearchResult } from '../api/search-api';

export const NET_SPACE: SearchGroup['space'] = { slug: 'networking', nameVi: 'Networking', nameEn: 'Networking', tint: 'var(--tint-net)', glow: 'var(--glow-net)', kind: 'public', art: '/art/crystal-networking.webp' };
export const LINUX_SPACE: SearchGroup['space'] = { slug: 'linux', nameVi: 'Linux', nameEn: 'Linux', tint: 'var(--tint-linux)', glow: 'var(--glow-linux)', kind: 'public', art: '/art/crystal-linux.webp' };

export function searchResult(id: string, title: string, extra: Partial<SearchResult> = {}): SearchResult {
  const { slug, nameVi, nameEn, tint, glow } = extra.space ?? NET_SPACE;
  return {
    id,
    title,
    type: 'lab',
    origin: 'official',
    status: 'approved',
    lang: 'vi',
    aiTranslated: false,
    updatedAt: '2026-11-03T14:05:00.000Z',
    authorName: 'Đạt',
    translations: ['vi'],
    collectionId: 'c1',
    readProgress: 0,
    collection: { id: 'c1', nameVi: 'Giao thức nền tảng', nameEn: 'Core protocols' },
    anchor: 'tong-quan',
    heading: null,
    titleParts: [{ text: title, hit: false }],
    snippet: [{ text: `About ${title}`, hit: false }],
    match: 'keyword',
    relevance: null,
    ...extra,
    space: { slug, nameVi, nameEn, tint, glow },
  };
}

export function searchResponse(query: string, groups: SearchGroup[], extra: Partial<SearchResponse> = {}): SearchResponse {
  const total = groups.reduce((n, g) => n + g.results.length, 0);
  return {
    query,
    exact: false,
    keyword: 'ok',
    meaning: 'ok',
    total,
    groups,
    origins: { official: total, community: 0, own: 0 },
    variants: null,
    suggestions: [],
    ...extra,
  };
}

/** "dhcp": two keyword results in Networking, one result by meaning in Linux. */
export const DHCP_ANSWER: SearchResponse = searchResponse(
  'dhcp',
  [
    {
      space: NET_SPACE,
      results: [
        searchResult('dhcp', 'Giao thức DHCP', {
          titleParts: [
            { text: 'Giao thức ', hit: false },
            { text: 'DHCP', hit: true },
          ],
          snippet: [
            { text: 'Máy mới xin IP qua 4 bước ', hit: false },
            { text: 'DHCP', hit: true },
          ],
        }),
        searchResult('spoof', 'Ghi chú: DHCP giả mạo', { type: 'note', origin: 'community', authorName: 'Minh' }),
      ],
    },
    { space: LINUX_SPACE, results: [searchResult('syslog', 'syslog', { space: LINUX_SPACE, match: 'meaning', relevance: 0.64, heading: 'Đọc log dhclient' })] },
  ],
  { origins: { official: 2, community: 1, own: 0 }, suggestions: ['DHCP lease', 'IP tĩnh và IP động'] },
);
