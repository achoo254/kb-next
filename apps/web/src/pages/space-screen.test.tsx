import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DocumentSummary, SpaceDetail } from '../api/content-api';
import { renderWithI18n } from '../test/render';
import { visibleDocuments } from './space-documents';
import { cardKind, originOf, progressText, relevanceText } from './space-labels';
import { spaceEn } from './space-messages';
import { SpaceScreen } from './space-screen';

const NET = { slug: 'networking', nameVi: 'Networking', nameEn: 'Networking', tint: '#C4B5FD', glow: '#8B5CF6' };
const T = '2026-11-03T14:05:00.000Z';

function doc(id: string, title: string, extra: Partial<DocumentSummary> = {}): DocumentSummary {
  return {
    id,
    title,
    type: 'lab',
    origin: 'official',
    status: 'approved',
    lang: 'vi',
    aiTranslated: false,
    updatedAt: T,
    authorName: 'Đạt',
    translations: ['vi'],
    collectionId: 'c1',
    space: NET,
    readProgress: 0,
    ...extra,
  };
}

function card(slug: string, name: string, caption: string) {
  return {
    slug,
    nameVi: name,
    nameEn: name,
    tint: '#A5F3FC',
    glow: '#22D3EE',
    art: `/art/crystal-${slug}.webp`,
    kind: 'public' as const,
    caption: { vi: caption, en: caption },
    documentCount: 3,
    collectionCount: 3,
  };
}

function detail(overrides: Partial<SpaceDetail> = {}): SpaceDetail {
  return {
    space: {
      ...NET,
      art: '/art/crystal-networking.webp',
      kind: 'public',
      caption: { vi: '8 lab', en: '8 labs' },
      documentCount: 12,
      collectionCount: 2,
      descriptionVi: 'Máy tính nói chuyện với nhau thế nào, từ cắm dây tới mở web.',
      descriptionEn: 'How computers talk to each other, from plugging in a cable to opening a web page.',
    },
    members: [
      { name: 'Đạt', picture: null, role: 'admin', documentCount: 7 },
      { name: 'Linh', picture: null, role: 'reviewer', documentCount: 0 },
      { name: 'Minh', picture: null, role: 'member', documentCount: 1 },
      { name: 'An', picture: null, role: 'member', documentCount: 1 },
    ],
    permissions: { canCreate: true, canReview: false, canAdmin: false },
    collections: [
      {
        id: 'c1',
        nameVi: 'Giao thức nền tảng',
        nameEn: 'Core protocols',
        tint: '#C4B5FD',
        glow: '#8B5CF6',
        art: '/art/crystal-networking.webp',
        documentCount: 4,
        documents: [
          doc('arp', 'Giao thức ARP', { readProgress: 100 }),
          doc('dhcp', 'Giao thức DHCP', { readProgress: 72 }),
          doc('spoof', 'Ghi chú: DHCP giả mạo', { type: 'note', origin: 'community', authorName: 'Minh' }),
          doc('ndp', 'So sánh ARP và NDP', { type: 'note', origin: 'community', status: 'pending', authorName: 'Bạn' }),
        ],
      },
      { id: 'c2', nameVi: 'Địa chỉ', nameEn: 'Addressing', tint: '#F0ABFC', glow: '#C026D3', art: '/art/crystal-weekly.webp', documentCount: 0, documents: [] },
    ],
    uncollected: [],
    related: [
      { ...card('linux', 'Linux', '3 exercises'), relevance: 70 },
      { ...card('observability', 'Observability', '1 lab'), relevance: 60 },
    ],
    ...overrides,
  };
}

let fetchMock: ReturnType<typeof vi.fn>;

function answer(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

beforeEach(() => {
  window.history.replaceState(null, '', '/s/networking');
  fetchMock = vi.fn(async () => answer(200, detail()));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SpaceScreen', () => {
  it('shows the Space: header, collections, documents with origin and progress, members, related Spaces', async () => {
    renderWithI18n(<SpaceScreen slug="networking" />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Networking' })).toBeTruthy();
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('/api/spaces/networking?lang=en');
    expect(screen.getByText('8 labs · 2 collections · VI')).toBeTruthy();
    expect(screen.getByText('How computers talk to each other, from plugging in a cable to opening a web page.')).toBeTruthy();

    const views = screen.getByRole('navigation', { name: 'Ways to view the Space' });
    expect(within(views).getByRole('link', { name: 'Overview' }).getAttribute('aria-current')).toBe('page');
    expect(within(views).getByRole('link', { name: 'Canvas' }).getAttribute('href')).toBe('/canvas?space=networking');
    expect(within(views).getByRole('link', { name: 'Graph' }).getAttribute('href')).toBe('/graph?space=networking');

    const docs = screen.getByRole('region', { name: /Core protocols/ });
    const titles = within(docs)
      .getAllByRole('link')
      .map((link) => link.querySelector('.space-doc-title')?.textContent);
    expect(titles).toEqual(['Giao thức ARP', 'Giao thức DHCP', 'Ghi chú: DHCP giả mạo', 'So sánh ARP và NDP']);
    expect(within(docs).getAllByRole('link')[1]?.getAttribute('href')).toBe('/d/dhcp');
    expect(within(docs).getByText('Read')).toBeTruthy();
    expect(within(docs).getByText('72%')).toBeTruthy();
    expect(within(docs).getByText('Note · Minh')).toBeTruthy();
    expect(within(docs).getByText('Awaiting review')).toBeTruthy();

    const members = screen.getByRole('complementary', { name: 'Members and permissions' });
    expect(within(members).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['ĐĐạtAdmin', 'LLinhReviewer', 'MMinhMember', 'AAnMember']);
    expect(within(members).getByText('Đạt, Linh')).toBeTruthy();

    const related = screen.getByRole('complementary', { name: 'Related Spaces' });
    expect(within(related).getByRole('link', { name: 'Linux, 3 exercises, relevance 0.70' }).getAttribute('href')).toBe('/s/linux');

    const crumbs = screen.getByRole('navigation', { name: 'You are here' });
    expect(within(crumbs).getByRole('link', { name: 'Universe' }).getAttribute('href')).toBe('/u');
    expect(within(crumbs).getByText('Core protocols').getAttribute('aria-current')).toBe('page');
  });

  it('opens another collection, keeps it in the address, and shows an empty one with a way to write', async () => {
    renderWithI18n(<SpaceScreen slug="networking" />);
    fireEvent.click(await screen.findByRole('button', { name: /Addressing/ }));
    expect(window.location.search).toBe('?c=c2');
    expect(screen.getByRole('button', { name: /Addressing/ }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('This collection is empty')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Write the first piece' }).getAttribute('href')).toBe('/me');
    expect(document.querySelector('[data-id="space-screen"]')?.getAttribute('data-state')).toBe('empty');
  });

  it('opens the collection named in the address, without a write button for a guest', async () => {
    window.history.replaceState(null, '', '/s/networking?c=c2');
    fetchMock.mockImplementation(async () => answer(200, detail({ permissions: { canCreate: false, canReview: false, canAdmin: false } })));
    renderWithI18n(<SpaceScreen slug="networking" />);
    expect(await screen.findByText('This collection is empty')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Write the first piece' })).toBeNull();
  });

  it('filters by origin and puts the documents being read first', async () => {
    renderWithI18n(<SpaceScreen slug="networking" />);
    await screen.findByRole('heading', { level: 1, name: 'Networking' });
    fireEvent.click(screen.getByRole('button', { name: 'Community' }));
    const docs = screen.getByRole('region', { name: /Core protocols/ });
    expect(within(docs).getAllByRole('link')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    fireEvent.click(screen.getByRole('button', { name: spaceEn['space.sortInProgress'] }));
    expect(within(docs).getAllByRole('link')[0]?.getAttribute('href')).toBe('/d/dhcp');
  });

  it('shows the loading shapes until the Space arrives', async () => {
    let release: (value: Response) => void = () => undefined;
    fetchMock.mockImplementation(() => new Promise<Response>((resolve) => (release = resolve)));
    renderWithI18n(<SpaceScreen slug="networking" />);
    expect(screen.getByLabelText('Loading the Space').getAttribute('aria-busy')).toBe('true');
    expect(screen.getByRole('status').textContent).toBe('Opening the Space…');
    release(answer(200, detail()));
    expect(await screen.findByRole('heading', { level: 1, name: 'Networking' })).toBeTruthy();
  });

  it('shows the 403 panel for a Space the reader may not see, and 404 for an unknown one', async () => {
    fetchMock.mockImplementation(async () => answer(403, { error: 'no-access' }));
    const { unmount } = renderWithI18n(<SpaceScreen slug="personal-x" />);
    await waitFor(() => expect(document.querySelector('[data-id="error-forbidden"]')).toBeTruthy());
    expect(screen.getByText('403')).toBeTruthy();
    unmount();

    fetchMock.mockImplementation(async () => answer(404, { error: 'not-found' }));
    renderWithI18n(<SpaceScreen slug="nope" />);
    await waitFor(() => expect(document.querySelector('[data-id="error-not-found"]')).toBeTruthy());
  });

  it('retries after a failed load', async () => {
    fetchMock.mockImplementationOnce(async () => answer(500, { error: 'boom' }));
    renderWithI18n(<SpaceScreen slug="networking" />);
    fireEvent.click(await screen.findByRole('button', { name: /Try again|Retry/ }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Networking' })).toBeTruthy();
  });
});

describe('space labels', () => {
  const t = (key: keyof typeof spaceEn, vars?: Record<string, string | number>): string => spaceEn[key].replace(/\{(\w+)\}/g, (_, name: string) => String(vars?.[name] ?? ''));

  it('names the origin, kind and progress as the cards show them', () => {
    expect(originOf({ origin: 'community', status: 'pending' })).toBe('pending');
    expect(originOf({ origin: 'own', status: 'private' })).toBe('private');
    expect(originOf({ origin: 'official', status: 'approved' })).toBe('official');
    expect(cardKind(t, doc('x', 'subnet.xlsx', { type: 'office', origin: 'own' }))).toBe('Excel file');
    expect(cardKind(t, doc('x', 'Path', { type: 'journey' }))).toBe('Path');
    expect(progressText(t, null)).toBeNull();
    expect(progressText(t, 0)).toBe('Not read');
    expect(progressText(t, 45.4)).toBe('45%');
    expect(progressText(t, 100)).toBe('Read');
    expect(relevanceText('vi', 92)).toBe('0,92');
    expect(relevanceText('en', 7)).toBe('0.07');
  });

  it('keeps the filter and sorts unfinished documents first', () => {
    const list = [doc('a', 'A', { readProgress: 100 }), doc('b', 'B', { readProgress: 30, origin: 'community' }), doc('c', 'C', { readProgress: 0 })];
    expect(visibleDocuments(list, 'official', false).map((d) => d.id)).toEqual(['a', 'c']);
    expect(visibleDocuments(list, 'all', true).map((d) => d.id)).toEqual(['b', 'a', 'c']);
  });
});
