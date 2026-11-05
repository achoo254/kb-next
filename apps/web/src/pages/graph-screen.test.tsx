import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Graph } from '../api/graph-api';
import { answer } from '../test/api-fakes';
import { renderWithI18n } from '../test/render';
import { GraphScreen } from './graph-screen';

const NET = { slug: 'networking', nameVi: 'Networking', nameEn: 'Networking', tint: '#C4B5FD', glow: '#8B5CF6' };

function graphOf(overrides: Partial<Graph> = {}): Graph {
  return {
    space: NET,
    spaces: [
      { ...NET, kind: 'public' },
      { slug: 'linux', nameVi: 'Linux', nameEn: 'Linux', tint: '#A5F3FC', glow: '#22D3EE', kind: 'public' },
      { slug: 'personal-me', nameVi: 'Vũ trụ của bạn', nameEn: 'Your universe', tint: '#F9A8D4', glow: '#EC4899', kind: 'personal' },
    ],
    nodes: [
      { id: 'dhcp', title: 'Giao thức DHCP', type: 'lab', origin: 'official', status: 'approved', spaceSlug: 'networking', summary: 'Máy mới vào mạng chưa có IP.', degree: 3, backlinks: 2 },
      { id: 'arp', title: 'Giao thức ARP', type: 'lab', origin: 'official', status: 'approved', spaceSlug: 'networking', summary: null, degree: 2, backlinks: 1 },
      { id: 'dns', title: 'Tìm hiểu DNS', type: 'lab', origin: 'official', status: 'approved', spaceSlug: 'networking', summary: null, degree: 1, backlinks: 1 },
      { id: 'spoof', title: 'Ghi chú: DHCP giả mạo', type: 'note', origin: 'community', status: 'approved', spaceSlug: 'networking', summary: null, degree: 0, backlinks: 0 },
      { id: 'syslog', title: 'syslog', type: 'lab', origin: 'official', status: 'approved', spaceSlug: 'linux', summary: null, degree: 1, backlinks: 0 },
      { id: 'notes', title: 'lab-notes.docx', type: 'office', origin: 'own', status: 'private', spaceSlug: 'personal-me', summary: null, degree: 1, backlinks: 0 },
    ],
    edges: [
      { id: 'e1', source: 'dhcp', target: 'arp', type: 'leads-to', label: null, removable: false },
      { id: 'e2', source: 'arp', target: 'dns', type: 'leads-to', label: null, removable: false },
      { id: 'e3', source: 'notes', target: 'dhcp', type: 'related', label: 'ví dụ', removable: true },
      { id: 'e4', source: 'syslog', target: 'dns', type: 'related', label: null, removable: false },
    ],
    suggestions: false,
    ...overrides,
  };
}

let fetchMock: ReturnType<typeof vi.fn>;

function route(handlers: Record<string, (init?: RequestInit) => Response | Promise<Response>>): void {
  fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
    const key = Object.keys(handlers).find((prefix) => String(path).startsWith(prefix));
    return key ? handlers[key]?.(init) : answer(404, { error: 'not-found' });
  });
  vi.stubGlobal('fetch', fetchMock);
}

beforeEach(() => {
  window.history.replaceState(null, '', '/graph?space=networking');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const node = (name: RegExp): HTMLElement => screen.getByRole('button', { name });

describe('GraphScreen', () => {
  it('draws the Space: nodes as buttons by link count, chips, legend, and the counts before a pick', async () => {
    route({ '/api/graph': () => answer(200, graphOf()) });
    renderWithI18n(<GraphScreen />);
    expect(await screen.findByRole('button', { name: 'Giao thức DHCP, Networking, 3 links' })).toBeTruthy();
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('/api/graph?space=networking&lang=en');
    const nodes = within(screen.getByRole('group', { name: 'Nodes of the graph' })).getAllByRole('button');
    expect(nodes).toHaveLength(6);
    // One node in the tab order at a time.
    expect(nodes.filter((b) => b.tabIndex === 0)).toHaveLength(1);
    // The reader's own Space is "Yours"; the chips are pressed (on).
    const chips = screen.getAllByRole('button', { pressed: true }).map((b) => b.textContent);
    expect(chips).toEqual(['Networking', 'Linux', 'Yours']);
    const panel = screen.getByRole('complementary', { name: 'Node details' });
    expect(within(panel).getByRole('heading', { name: 'Pick a node' })).toBeTruthy();
    expect(panel.querySelector('[data-id="graph-count-nodes"]')?.textContent).toBe('6');
    expect(panel.querySelector('[data-id="graph-count-edges"]')?.textContent).toBe('4');
    // Without a pick, the path starts at the Space's most linked node.
    expect(within(panel).getByRole('list', { name: 'Suggested path' }).textContent).toContain('Giao thức DHCP');
    expect(within(panel).getByRole('heading', { name: 'Explore related' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Legend' })).toBeTruthy();
    const views = screen.getByRole('navigation', { name: 'Ways to view the Space' });
    expect(within(views).getByRole('link', { name: 'Canvas' }).getAttribute('href')).toBe('/canvas?space=networking');
    expect(screen.getByRole('main').closest('[data-veil]')).toBeTruthy();
    expect(document.querySelector('[data-id="graph-screen"]')?.getAttribute('data-state')).toBe('ready');
  });

  it('shows a picked node: its line, links, open and ask, its neighbours and the reading path', async () => {
    route({ '/api/graph': () => answer(200, graphOf()) });
    renderWithI18n(<GraphScreen />);
    fireEvent.click(await screen.findByRole('button', { name: /^Giao thức DHCP,/ }));
    const panel = screen.getByRole('complementary', { name: 'Node details' });
    expect(within(panel).getByRole('heading', { name: 'Giao thức DHCP' })).toBeTruthy();
    expect(within(panel).getByText('Networking · Lab')).toBeTruthy();
    expect(within(panel).getByText('Official')).toBeTruthy();
    expect(within(panel).getByText('Máy mới vào mạng chưa có IP.')).toBeTruthy();
    expect(within(panel).getByRole('link', { name: 'Open' }).getAttribute('href')).toBe('/d/dhcp');
    expect(within(panel).getByRole('link', { name: 'Ask Copilot' }).getAttribute('href')).toContain('scope=document%3Adhcp');
    expect(within(panel).getAllByRole('button', { name: /·/ }).map((b) => b.textContent)).toEqual(['Giao thức ARP · leads to', 'lab-notes.docx · ví dụ']);
    expect(within(panel).getByRole('list', { name: 'Suggested path' }).textContent).toBe('Giao thức DHCP→Giao thức ARP→Tìm hiểu DNS');
    expect(within(panel).getByRole('link', { name: 'Follow this path' }).getAttribute('href')).toBe('/d/arp');
    expect(node(/^Giao thức DHCP,/).getAttribute('aria-pressed')).toBe('true');
    // Jev is off on this server: no suggestion button.
    expect(screen.queryByRole('button', { name: 'Jev suggests links' })).toBeNull();
    // A neighbour picks that node; Escape on a node clears the pick.
    fireEvent.click(within(panel).getByRole('button', { name: 'Giao thức ARP · leads to' }));
    expect(within(panel).getByRole('heading', { name: 'Giao thức ARP' })).toBeTruthy();
    fireEvent.keyDown(node(/^Giao thức ARP,/), { key: 'Escape' });
    expect(within(panel).getByRole('heading', { name: 'Pick a node' })).toBeTruthy();
  });

  it('filters by Space and source down to "No node matches the filter", and clears the filters', async () => {
    route({ '/api/graph': () => answer(200, graphOf()) });
    renderWithI18n(<GraphScreen />);
    await screen.findByRole('button', { name: /^Giao thức DHCP,/ });
    fireEvent.click(screen.getByRole('button', { name: 'Linux', pressed: true }));
    expect(screen.queryByRole('button', { name: /^syslog,/ })).toBeNull();
    fireEvent.change(screen.getByRole('combobox', { name: 'Source' }), { target: { value: 'community' } });
    expect(within(screen.getByRole('group', { name: 'Nodes of the graph' })).getAllByRole('button')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Networking', pressed: true }));
    expect(screen.getByRole('heading', { name: 'No node matches the filter' })).toBeTruthy();
    expect(document.querySelector('[data-id="graph-screen"]')?.getAttribute('data-state')).toBe('filtered-empty');
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(within(screen.getByRole('group', { name: 'Nodes of the graph' })).getAllByRole('button')).toHaveLength(6);
  });

  it('moves between nodes with the arrow keys and zooms with the buttons and keys', async () => {
    route({ '/api/graph': () => answer(200, graphOf()) });
    renderWithI18n(<GraphScreen />);
    await screen.findByRole('button', { name: /^Giao thức DHCP,/ });
    const nodes = within(screen.getByRole('group', { name: 'Nodes of the graph' })).getAllByRole('button');
    const start = nodes.find((b) => b.tabIndex === 0);
    if (!start) throw new Error('no node in the tab order');
    start.focus();
    let moved = false;
    for (const key of ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp']) {
      fireEvent.keyDown(document.activeElement ?? start, { key });
      if (document.activeElement !== start) moved = true;
    }
    expect(moved).toBe(true);
    expect(nodes.filter((b) => b.tabIndex === 0)).toHaveLength(1);
    const level = (): string | null | undefined => document.querySelector('[data-id="graph-zoom-level"]')?.textContent;
    expect(level()).toBe('100%');
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(level()).toBe('120%');
    fireEvent.keyDown(start, { key: '-' });
    fireEvent.keyDown(start, { key: '-' });
    expect(level()).toBe('80%');
    fireEvent.click(screen.getByRole('button', { name: 'Fit' }));
    expect(level()).toBe('100%');
    fireEvent.click(screen.getByRole('button', { name: 'Move left' }));
    expect(document.querySelector<HTMLElement>('[data-id="graph-world"]')?.style.transform).toBe('translate(80px, 0px) scale(1)');
  });

  it('asks Jev for edges on demand and links one only when accepted', async () => {
    const posted: unknown[] = [];
    route({
      '/api/graph/suggestions': () => answer(200, { suggestions: [{ id: 'spoof', title: 'Ghi chú: DHCP giả mạo', spaceSlug: 'networking', relevance: 82 }] }),
      '/api/graph/edges': (init) => {
        posted.push(JSON.parse(String(init?.body)));
        return answer(201, { edge: { id: 'e9', source: 'dhcp', target: 'spoof', type: 'related', label: null, removable: true } });
      },
      '/api/graph': () => answer(200, graphOf({ suggestions: true })),
    });
    renderWithI18n(<GraphScreen />);
    fireEvent.click(await screen.findByRole('button', { name: /^Giao thức DHCP,/ }));
    const panel = screen.getByRole('complementary', { name: 'Node details' });
    expect(within(panel).getByRole('heading', { name: 'Explore related · Jev suggests' })).toBeTruthy();
    fireEvent.click(within(panel).getByRole('button', { name: 'Jev suggests links' }));
    const list = await within(panel).findByRole('list', { name: 'Jev suggests linking' });
    expect(list.textContent).toContain('0.82');
    expect(posted).toEqual([]);
    fireEvent.click(within(list).getByRole('button', { name: 'Link Ghi chú: DHCP giả mạo with this text' }));
    expect(await within(panel).findByText('Linked with Ghi chú: DHCP giả mạo.')).toBeTruthy();
    expect(posted).toEqual([{ sourceId: 'dhcp', targetId: 'spoof', label: null }]);
    expect(within(panel).getByRole('button', { name: 'Ghi chú: DHCP giả mạo · related' })).toBeTruthy();
    expect(within(panel).getByText('4')).toBeTruthy();
  });

  it('says why suggestions are missing: Jev failing, too many asks, offline', async () => {
    let reply: () => Response | Promise<Response> = () => answer(502, { error: 'jev-failed' });
    route({ '/api/graph/suggestions': () => reply(), '/api/graph': () => answer(200, graphOf({ suggestions: true })) });
    renderWithI18n(<GraphScreen />);
    fireEvent.click(await screen.findByRole('button', { name: /^Giao thức DHCP,/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Jev suggests links' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Jev did not answer, try again later.');
    reply = () => answer(429, { error: 'rate-limited' });
    fireEvent.click(screen.getByRole('button', { name: /^Giao thức ARP,/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Jev suggests links' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Too many suggestions asked, wait a minute and try again.');
    reply = () => Promise.reject(new TypeError('offline'));
    fireEvent.click(screen.getByRole('button', { name: /^Tìm hiểu DNS,/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Jev suggests links' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Offline: Jev cannot be asked.');
    reply = () => answer(200, { suggestions: [] });
    fireEvent.click(screen.getByRole('button', { name: /^Giao thức DHCP,/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Jev suggests links' }));
    expect(await screen.findByText('Jev found nothing more to link with this text.')).toBeTruthy();
  });

  it('erases a user-made edge the reader may erase', async () => {
    const deleted: string[] = [];
    route({
      '/api/graph/edges/': () => {
        deleted.push('e3');
        return new Response(null, { status: 204 });
      },
      '/api/graph': () => answer(200, graphOf()),
    });
    renderWithI18n(<GraphScreen />);
    fireEvent.click(await screen.findByRole('button', { name: /^Giao thức DHCP,/ }));
    const panel = screen.getByRole('complementary', { name: 'Node details' });
    // Only the user-made edge has the button.
    expect(within(panel).getAllByRole('button', { name: /^Unlink from/ })).toHaveLength(1);
    fireEvent.click(within(panel).getByRole('button', { name: 'Unlink from lab-notes.docx' }));
    await waitFor(() => expect(within(panel).queryByRole('button', { name: /lab-notes.docx/ })).toBeNull());
    expect(deleted).toEqual(['e3']);
  });

  it.each([
    [404, 'not-found', 'not-found'],
    [403, 'no-access', 'no-access'],
    [500, 'internal', 'server'],
  ])('shows the X02 panel when the graph answers %i', async (status, code, state) => {
    route({ '/api/graph': () => answer(status, { error: code }) });
    renderWithI18n(<GraphScreen />);
    await waitFor(() => expect(document.querySelector('[data-id="graph-screen"]')?.getAttribute('data-state')).toBe(state));
    expect(document.querySelector('[data-id="graph-error"]')).toBeTruthy();
  });

  it('builds the graph while it loads, then a Space without documents says so', async () => {
    let release: (r: Response) => void = () => undefined;
    route({ '/api/graph': () => new Promise<Response>((resolve) => (release = resolve)) });
    renderWithI18n(<GraphScreen />);
    expect(screen.getByRole('status').textContent).toContain('Building the graph…');
    expect(document.querySelector('[data-id="graph-screen"]')?.getAttribute('data-state')).toBe('loading');
    await act(async () => release(answer(200, graphOf({ nodes: [], edges: [] }))));
    expect(await screen.findByRole('heading', { name: 'This Space has no documents yet' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Back to the Space' }).getAttribute('href')).toBe('/s/networking');
  });

  it('opens the first Space of the Universe without ?space=', async () => {
    window.history.replaceState(null, '', '/graph');
    route({
      '/api/spaces': () => answer(200, { spaces: [] }),
      '/api/graph': () => answer(200, graphOf()),
    });
    renderWithI18n(<GraphScreen />);
    expect(await screen.findByRole('heading', { name: 'This Space has no documents yet' })).toBeTruthy();
    expect(fetchMock.mock.calls.some(([path]) => String(path).startsWith('/api/graph'))).toBe(false);
  });
});
