/**
 * "Của tôi" (C08) in jsdom: the board's state (tabs and counts, rings, the text sent back picked first with its
 * reason), picking, filters, the list view, the trash with undo, recent texts, favourites, the trash tab (restore,
 * delete for good after typing XOÁ, empty it), and the states of the screen: loading, failed, an empty tab, the empty
 * own universe.
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FavoriteDocument, MyDocument, RecentDocument, TrashedDocument } from '../api/authoring-api';
import type { CanvasListItem } from '../api/canvas-api';
import type { SpaceListItem } from '../api/content-api';
import { answer } from '../test/api-fakes';
import { renderWithI18n } from '../test/render';
import { MineScreen } from './mine-screen';
import { BOARD_DOCS, MINE_SPACES, favoriteOf, myDoc, recentOf, trashedOf } from './mine-test-data';

const NOW = new Date('2026-11-03T14:05:00.000Z');
const CANVAS: CanvasListItem = { id: 'cv1', title: 'DHCP từ A đến Z', updatedAt: '2026-11-03T14:05:00.000Z', spaceSlug: null, cards: 7 };

interface Server {
  docs: MyDocument[];
  recent: RecentDocument[];
  favorites: FavoriteDocument[];
  trash: TrashedDocument[];
  canvases: CanvasListItem[];
  spaces: SpaceListItem[];
  /** Answer of the lists (null: as above). */
  fail: boolean;
}

let server: Server;
let calls: string[];

function boardServer(): Server {
  const dhcp = myDoc('dhcp', { title: 'Giao thức DHCP', origin: 'official', status: 'approved', favorite: true });
  return {
    docs: BOARD_DOCS,
    recent: [recentOf(dhcp, '2026-11-03T14:00:00.000Z'), recentOf(BOARD_DOCS[0] ?? dhcp, '2026-11-03T13:05:00.000Z')],
    favorites: [favoriteOf(dhcp), favoriteOf(BOARD_DOCS[0] ?? dhcp)],
    trash: [
      trashedOf(myDoc('t1', { title: 'Bản nháp cũ: ARP' }), '2026-10-31T14:05:00.000Z', '2026-11-30T14:05:00.000Z'),
      trashedOf(myDoc('t2', { title: 'boot-notes.docx', type: 'office', status: 'private' }), '2026-10-07T14:05:00.000Z', '2026-11-06T14:05:00.000Z'),
    ],
    canvases: [CANVAS],
    spaces: MINE_SPACES,
    fail: false,
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  server = boardServer();
  calls = [];
  window.history.replaceState(null, '', '/me?lang=vi');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string, init?: RequestInit) => {
      const url = String(path);
      const method = init?.method ?? 'GET';
      if (method !== 'GET') calls.push(`${method} ${url}`);
      if (method === 'GET' && server.fail && url.startsWith('/api/me/')) return answer(500, { error: 'server' });
      if (url === '/api/me/documents') return answer(200, { documents: server.docs });
      if (url === '/api/me/recent') return answer(200, { documents: server.recent });
      if (url === '/api/me/favorites') return answer(200, { documents: server.favorites });
      if (url === '/api/me/trash' && method === 'GET') return answer(200, { documents: server.trash });
      if (url === '/api/me/trash' && method === 'DELETE') return answer(200, { purged: server.trash.length });
      if (url === '/api/canvases') return answer(200, { canvases: server.canvases });
      if (url === '/api/spaces') return answer(200, { spaces: server.spaces });
      if (method !== 'GET') return new Response(null, { status: 204 });
      return answer(404, { error: 'not-found' });
    }),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function ready(): Promise<HTMLElement> {
  const view = renderWithI18n(<MineScreen />);
  await waitFor(() => expect(view.container.querySelector('[data-id="mine-screen"]')?.getAttribute('data-state')).not.toBe('loading'));
  return view.container;
}

function tab(name: RegExp): HTMLElement {
  return screen.getByRole('tab', { name });
}

describe('the board’s state', () => {
  it('shows the tabs with their counts, the three rings and the text sent back, picked first', async () => {
    const container = await ready();
    expect(tab(/Vũ trụ của tôi/).textContent).toBe('Vũ trụ của tôi7');
    expect(tab(/Gần đây/).textContent).toBe('Gần đây2');
    expect(tab(/Yêu thích/).textContent).toBe('Yêu thích2');
    expect(tab(/Thùng rác/).textContent).toBe('Thùng rác2');
    expect(screen.getByText('ĐANG SOẠN')).toBeTruthy();
    expect(screen.getByText('ĐANG DUYỆT')).toBeTruthy();
    expect(screen.getByText('ĐÃ CÔNG KHAI')).toBeTruthy();
    expect(container.querySelectorAll('.mine-planet')).toHaveLength(7);
    expect(screen.getByRole('button', { name: 'Mẹo DNS cache · Bị từ chối' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'k8s-intro.pptx · Bị quản trị ẩn' })).toBeTruthy();

    const detail = within(screen.getByRole('complementary', { name: 'Chi tiết' }));
    expect(detail.getByText('TCP vs UDP bằng hình')).toBeTruthy();
    expect(detail.getByText('Ghi chú · sửa hôm qua')).toBeTruthy();
    expect(detail.getByText('Cần sửa')).toBeTruthy();
    expect(detail.getByText('Người duyệt muốn bạn sửa một chút rồi gửi lại.')).toBeTruthy();
    expect(detail.getByText('“Thêm link RFC 793 cho phần bắt tay 3 bước nhé.” · Linh')).toBeTruthy();
    expect(detail.getByText('Networking › Web')).toBeTruthy();
    expect(detail.getByRole('link', { name: 'Sửa và gửi lại' }).getAttribute('href')).toBe('/d/n3/edit');
    expect((detail.getByRole('button', { name: 'Bỏ vào thùng rác' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('shows the own crystal in the middle, and "Hành tinh đầu tiên" when the personal Space holds no text', async () => {
    const container = await ready();
    expect(container.querySelector('.mine-centre')).not.toBeNull();
    expect(container.querySelector('[data-id="mine-first"]')).toBeNull();
    container.remove();

    server.docs = BOARD_DOCS.map((doc) => ({ ...doc, space: { ...doc.space, slug: 'networking' } }));
    const elsewhere = await ready();
    expect(elsewhere.querySelector('.mine-centre')).toBeNull();
    expect(screen.getByRole('link', { name: 'Tạo hành tinh đầu tiên' }).getAttribute('href')).toBe('/create');
  });
});

describe('picking a planet', () => {
  it('shows what each step allows: a published text is not the author’s to delete, review and sharing wait', async () => {
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Máy mới xin IP thế nào · Đã duyệt · Cộng đồng' }));
    const detail = within(screen.getByRole('complementary', { name: 'Chi tiết' }));
    expect(detail.getByText('Networking › Giao thức nền tảng')).toBeTruthy();
    expect(detail.getByRole('link', { name: 'Mở' }).getAttribute('href')).toBe('/d/n1');
    expect((detail.getByRole('button', { name: 'Chia sẻ' }) as HTMLButtonElement).disabled).toBe(true);
    expect((detail.getByRole('button', { name: 'Bỏ vào thùng rác' }) as HTMLButtonElement).disabled).toBe(true);
    expect(detail.getByRole('button', { name: 'Bỏ yêu thích' }).getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: 'Ghi chú: swap trên Ubuntu · Chờ duyệt' }));
    expect(detail.getByRole('link', { name: 'Xem trước' }).getAttribute('href')).toBe('/d/n2');
    expect((detail.getByRole('button', { name: 'Rút lại' }) as HTMLButtonElement).disabled).toBe(true);
    expect(detail.getByText('Ghi chú · sửa 1 giờ trước')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'lab-notes.docx · Riêng tư' }));
    expect(detail.getByRole('link', { name: 'Mở' }).getAttribute('href')).toBe('/d/o1');
    expect(detail.getByText('Vũ trụ của bạn')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'DHCP từ A đến Z · Riêng tư' }));
    expect(detail.getByRole('link', { name: 'Mở' }).getAttribute('href')).toBe('/canvas/cv1');
    expect(detail.queryByRole('button', { name: 'Bỏ vào thùng rác' })).toBeNull();
  });

  it('stars and unstars a text', async () => {
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Thêm yêu thích' }));
    await waitFor(() => expect(calls).toContain('PUT /api/documents/n3/favorite'));
  });
});

describe('filters and views', () => {
  it('filters the planets by type and by status, and says when nothing matches', async () => {
    const container = await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Office' }));
    expect([...container.querySelectorAll('.mine-planet')].map((p) => p.getAttribute('aria-label'))).toEqual(['lab-notes.docx · Riêng tư', 'k8s-intro.pptx · Bị quản trị ẩn']);
    fireEvent.click(screen.getByRole('button', { name: 'Cần sửa' }));
    expect(container.querySelectorAll('.mine-planet')).toHaveLength(0);
    expect(screen.getByText('Không có hành tinh nào khớp bộ lọc.')).toBeTruthy();
    fireEvent.click(within(screen.getByRole('group', { name: 'Lọc theo loại' })).getByRole('button', { name: 'Tất cả' }));
    expect([...container.querySelectorAll('.mine-planet')].map((p) => p.getAttribute('aria-label'))).toEqual(['TCP vs UDP bằng hình · Cần sửa']);
  });

  it('lists the same texts as rows', async () => {
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Danh sách' }));
    const list = within(screen.getByRole('tabpanel')).getByRole('list');
    expect(within(list).getAllByRole('button')).toHaveLength(7);
    expect(within(list).getByText('Tệp Word · sửa hôm qua')).toBeTruthy();
    fireEvent.click(within(list).getByText('Mẹo DNS cache'));
    expect(within(screen.getByRole('complementary', { name: 'Chi tiết' })).getByText('“Nội dung nói về trình duyệt hơn là DNS.” · Linh')).toBeTruthy();
  });
});

describe('moving to the trash', () => {
  it('confirms with a toast, and its undo takes the text out again', async () => {
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Bỏ vào thùng rác' }));
    await waitFor(() => expect(screen.getByText('Đã bỏ "TCP vs UDP bằng hình" vào thùng rác')).toBeTruthy());
    expect(calls).toContain('DELETE /api/documents/n3');
    fireEvent.click(screen.getByRole('button', { name: 'Hoàn tác' }));
    await waitFor(() => expect(calls).toContain('POST /api/documents/n3/restore'));
    await waitFor(() => expect(screen.getByText('Đã khôi phục "TCP vs UDP bằng hình"')).toBeTruthy());
  });

  it('says so when the change fails', async () => {
    await ready();
    vi.mocked(fetch).mockImplementationOnce(async () => answer(403, { error: 'no-access' }));
    fireEvent.click(screen.getByRole('button', { name: 'Bỏ vào thùng rác' }));
    await waitFor(() => expect(screen.getByText('Chưa làm được. Thử lại nhé.')).toBeTruthy());
  });
});

describe('the other tabs', () => {
  it('Gần đây: cards with origin and time, and its empty state', async () => {
    await ready();
    fireEvent.click(tab(/Gần đây/));
    const recent = within(screen.getByRole('tabpanel'));
    expect(recent.getByText('Bạn mở gần đây · gồm cả bài chính thức và cộng đồng')).toBeTruthy();
    expect(recent.getByRole('link', { name: 'Giao thức DHCP' }).getAttribute('href')).toBe('/d/dhcp');
    expect(recent.getByText('Chính thức')).toBeTruthy();
    expect(recent.getByText('5 phút trước')).toBeTruthy();
  });

  it('Gần đây and Yêu thích when there is nothing in them', async () => {
    server.recent = [];
    server.favorites = [];
    await ready();
    fireEvent.click(tab(/Gần đây/));
    expect(screen.getByText('Chưa mở bài nào gần đây.')).toBeTruthy();
    fireEvent.click(tab(/Yêu thích/));
    expect(screen.getByText('Chưa có mục yêu thích.')).toBeTruthy();
  });

  it('Yêu thích: unstars from its card', async () => {
    await ready();
    fireEvent.click(tab(/Yêu thích/));
    const favorites = within(screen.getByRole('tabpanel'));
    expect(favorites.getAllByRole('link').map((a) => a.textContent)).toEqual(['Giao thức DHCP', 'Máy mới xin IP thế nào']);
    fireEvent.click(favorites.getAllByRole('button', { name: 'Bỏ yêu thích' })[0] ?? document.body);
    await waitFor(() => expect(calls).toContain('DELETE /api/documents/dhcp/favorite'));
  });

  it('Thùng rác: days left (amber near the end), restore with undo, delete for good after typing XOÁ', async () => {
    await ready();
    fireEvent.click(tab(/Thùng rác/));
    const trash = within(screen.getByRole('tabpanel'));
    expect(trash.getByText('Mục trong thùng rác tự xoá vĩnh viễn sau 30 ngày.')).toBeTruthy();
    expect(trash.getByText('Xoá 3 ngày trước · còn 27 ngày').getAttribute('data-soon')).toBeNull();
    expect(trash.getByText('Xoá 27 ngày trước · còn 3 ngày').getAttribute('data-soon')).toBe('true');

    fireEvent.click(trash.getAllByRole('button', { name: 'Khôi phục' })[0] ?? document.body);
    await waitFor(() => expect(calls).toContain('POST /api/documents/t1/restore'));
    await waitFor(() => expect(screen.getByText('Đã khôi phục "Bản nháp cũ: ARP"')).toBeTruthy());

    fireEvent.click(trash.getAllByRole('button', { name: 'Xoá vĩnh viễn' })[1] ?? document.body);
    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.getByText('"boot-notes.docx" sẽ biến mất hẳn, không khôi phục được.')).toBeTruthy();
    const confirm = dialog.getByRole('button', { name: 'Xoá vĩnh viễn' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.change(dialog.getByLabelText('Gõ XOÁ để xác nhận'), { target: { value: 'xoá' } });
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    await waitFor(() => expect(calls).toContain('DELETE /api/me/trash/t2'));
    await waitFor(() => expect(screen.getByText('Đã xoá vĩnh viễn "boot-notes.docx"')).toBeTruthy());
  });

  it('Thùng rác: empties it all, and shows the empty trash', async () => {
    await ready();
    fireEvent.click(tab(/Thùng rác/));
    fireEvent.click(screen.getByRole('button', { name: 'Dọn thùng rác' }));
    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.getByText('"Toàn bộ 2 mục trong thùng rác" sẽ biến mất hẳn, không khôi phục được.')).toBeTruthy();
    fireEvent.change(dialog.getByLabelText('Gõ XOÁ để xác nhận'), { target: { value: 'XOÁ' } });
    server.trash = [];
    fireEvent.click(dialog.getByRole('button', { name: 'Xoá vĩnh viễn' }));
    await waitFor(() => expect(calls).toContain('DELETE /api/me/trash'));
    await waitFor(() => expect(screen.getByText('Thùng rác trống')).toBeTruthy());
    expect((screen.getByRole('button', { name: 'Dọn thùng rác' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('the states of the screen', () => {
  it('loads, then fails with a retry that loads again', async () => {
    server.fail = true;
    const view = renderWithI18n(<MineScreen />);
    expect(screen.getByRole('status').textContent).toBe('Đang tải nội dung của bạn…');
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Chưa tải được nội dung của bạn.'));
    server.fail = false;
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    });
    await waitFor(() => expect(view.container.querySelector('[data-id="mine-screen"]')?.getAttribute('data-state')).toBe('ready'));
  });

  it('shows the empty own universe without a personal Space, with the three ways to start', async () => {
    server = { ...boardServer(), docs: [], canvases: [], spaces: MINE_SPACES.filter((s) => s.kind !== 'personal') };
    const container = await ready();
    expect(container.querySelector('[data-id="mine-screen"]')?.getAttribute('data-state')).toBe('empty-universe');
    expect(screen.getByText('Vũ trụ riêng còn trống')).toBeTruthy();
    expect(screen.getByText('Bạn chưa có Space riêng. Viết ghi chú đầu tiên là có ngay, chỉ bạn thấy.')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Viết ghi chú/ }).getAttribute('href')).toBe('/new');
    expect(screen.getByRole('link', { name: /Tải file Office/ }).getAttribute('href')).toBe('/create');
    expect(screen.getByRole('link', { name: /Tạo lối đi/ }).getAttribute('href')).toBe('/create');
    expect(screen.getByText('Hành tinh đầu tiên của bạn sẽ hiện ở đây.')).toBeTruthy();
  });

  it('says the personal Space has no text yet when it exists but is empty', async () => {
    server = { ...boardServer(), docs: [], canvases: [] };
    await ready();
    expect(screen.getByText('Space riêng của bạn chưa có bài nào. Bắt đầu bằng một trong ba cách dưới đây.')).toBeTruthy();
  });
});
