/**
 * Publishing (C04) in jsdom: the form as it opens (where the text is, its tags, the scopes), "Gửi duyệt" sending what
 * was chosen and showing C06's steps in place (the address becoming /submit), "Riêng tư" keeping it private, what
 * stops a text without a title, the AI translation off without a key, a text already waiting, a published one (read
 * only, Chia sẻ open), the locked Chia sẻ tab, and a text that cannot be opened.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DocumentView } from '../api/content-api';
import type { KeysResponse } from '../api/keys-api';
import { KEYS_OPENAI, answer } from '../test/api-fakes';
import { renderWithI18n } from '../test/render';
import { PublishScreen } from './publish-screen';
import { DOC_ID, PUBLISH_SPACES, draftView } from './publish-test-data';

let view: DocumentView;
let keys: KeysResponse | null;
let docStatus: number;
let calls: Array<{ method: string; url: string; body: unknown }>;

beforeEach(() => {
  window.history.replaceState(null, '', `/d/${DOC_ID}/publish?lang=vi`);
  view = draftView();
  keys = KEYS_OPENAI;
  docStatus = 200;
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string, init?: RequestInit) => {
      const url = String(path);
      const method = init?.method ?? 'GET';
      calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : null });
      if (url === `/api/documents/${DOC_ID}/submit`) return answer(200, { status: 'pending', queuePosition: 2, submittedAt: '2026-11-03T14:05:00.000Z', preReviewed: true });
      if (url === `/api/documents/${DOC_ID}/private`) return answer(200, { status: 'private' });
      if (url.startsWith(`/api/documents/${DOC_ID}`)) return docStatus === 200 ? answer(200, view) : answer(docStatus, { error: 'not-found' });
      if (url.startsWith('/api/spaces')) return answer(200, { spaces: PUBLISH_SPACES });
      if (url.startsWith('/api/me/keys')) return keys ? answer(200, keys) : answer(503, { error: 'USER_KEYS_DISABLED' });
      if (url.startsWith('/api/me/notifications')) return answer(200, { notifications: [], unread: { total: 0, byKind: { mention: 0, comment: 0, review: 0, stale: 0, permission: 0 } } });
      return answer(404, { error: 'not-found' });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function form(): Promise<ReturnType<typeof within>> {
  renderWithI18n(<PublishScreen id={DOC_ID} />);
  return within(await screen.findByRole('dialog', { name: 'Xuất bản và chia sẻ' }));
}

describe('the Xuất bản tab', () => {
  it('opens on "Gửi duyệt" in the first public Space, with the text’s tags and the card of how it will show', async () => {
    const sheet = await form();
    expect(sheet.getByRole('radio', { name: /Gửi duyệt · công khai sau khi duyệt/ }).getAttribute('aria-checked')).toBe('true');
    expect((sheet.getByRole('combobox', { name: /^Space/ }) as HTMLSelectElement).value).toBe('networking');
    // For review only public Spaces are offered.
    expect(sheet.getAllByRole('option').map((o: HTMLElement) => o.textContent)).toContain('Networking (công khai · cần duyệt)');
    expect(sheet.queryByRole('option', { name: 'Vũ trụ của bạn (cá nhân)' })).toBeNull();
    expect(sheet.getByText('Thẻ').parentElement?.textContent).toContain('· 3/8');
    const card = within(screen.getByRole('complementary', { name: 'Xem trước thẻ bài' }));
    expect(card.getByText('Chờ duyệt')).toBeTruthy();
    expect(card.getByText('Máy mới hỏi cả mạng để xin IP, qua 4 bước DORA.')).toBeTruthy();
    expect(card.getByText('Networking')).toBeTruthy();
    expect(card.getByText('Trước khi duyệt: chỉ bạn và người duyệt thấy. Không có link chia sẻ.')).toBeTruthy();
  });

  it('sends what was chosen, only on "Gửi duyệt", and shows C06’s steps at /submit', async () => {
    const sheet = await form();
    fireEvent.change(sheet.getByRole('combobox', { name: /Collection/ }), { target: { value: 'c-proto' } });
    fireEvent.click(sheet.getByRole('radio', { name: 'EN' }));
    fireEvent.click(sheet.getByRole('button', { name: 'Bỏ thẻ lease' }));
    const input = sheet.getByRole('textbox', { name: 'Thêm thẻ' });
    fireEvent.change(input, { target: { value: 'dora' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(calls.some((c) => c.url.endsWith('/submit'))).toBe(false);
    fireEvent.click(sheet.getByRole('button', { name: 'Gửi duyệt' }));
    expect(await screen.findByRole('heading', { name: 'Đã gửi duyệt' })).toBeTruthy();
    expect(calls.filter((c) => c.url.endsWith('/submit')).map((c) => c.body)).toEqual([{ space: 'networking', collection: 'c-proto', tags: ['dhcp', 'broadcast', 'dora'], lang: 'en' }]);
    expect(window.location.pathname).toBe(`/d/${DOC_ID}/submit`);
  });

  it('keeps it private in the reader’s own Universe, then opens Của tôi', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign, search: '?lang=vi', pathname: `/d/${DOC_ID}/publish` });
    const sheet = await form();
    fireEvent.click(sheet.getByRole('radio', { name: /Riêng tư · chỉ mình tôi/ }));
    expect((sheet.getByRole('combobox', { name: /^Space/ }) as HTMLSelectElement).value).toBe('personal-me');
    expect(within(screen.getByRole('complementary', { name: 'Xem trước thẻ bài' })).getByText('Của bạn · riêng tư')).toBeTruthy();
    // No AI translation for a private text.
    expect((sheet.getByRole('switch', { name: 'Tạo bản dịch EN bằng AI' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(sheet.getByRole('button', { name: 'Lưu riêng tư' }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/me'));
    expect(calls.find((c) => c.url.endsWith('/private'))?.body).toEqual({ space: 'personal-me', tags: ['dhcp', 'broadcast', 'lease'], lang: 'vi' });
    expect(calls.some((c) => c.url.endsWith('/submit'))).toBe(false);
  });

  it('turns the AI translation on with the reader’s own key, and offers it once sent', async () => {
    const sheet = await form();
    const toggle = sheet.getByRole('switch', { name: 'Tạo bản dịch EN bằng AI' });
    expect(sheet.getByText('Tắt · dùng key OpenAI ••••a1b2 của bạn khi bật')).toBeTruthy();
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    expect(within(screen.getByRole('complementary', { name: 'Xem trước thẻ bài' })).getByText('VI · có bản EN')).toBeTruthy();
    fireEvent.click(sheet.getByRole('button', { name: 'Gửi duyệt' }));
    expect((await screen.findByRole('link', { name: 'Tạo bản dịch EN bằng AI' })).getAttribute('href')).toBe(`/d/${DOC_ID}/translate?to=en`);
  });

  it('keeps the AI translation off without an own key', async () => {
    keys = null;
    const sheet = await form();
    expect((sheet.getByRole('switch', { name: 'Tạo bản dịch EN bằng AI' }) as HTMLButtonElement).disabled).toBe(true);
    expect(sheet.getByText('Tắt · cần Key riêng để bật')).toBeTruthy();
  });

  it('says what to fix when the text has no title, and cannot send it', async () => {
    view = draftView({ title: '' }, [{ anchor: 'a', heading: null, markdown: '' }]);
    const sheet = await form();
    const alert = sheet.getByRole('alert');
    expect(alert.textContent).toContain('Chưa gửi được, còn 2 chỗ cần sửa');
    expect(alert.textContent).toContain('Thiếu tiêu đề · quay lại trình soạn để thêm');
    expect((sheet.getByRole('button', { name: 'Gửi duyệt' }) as HTMLButtonElement).disabled).toBe(true);
    expect(within(screen.getByRole('complementary', { name: 'Xem trước thẻ bài' })).getByText('[Chưa có tiêu đề]')).toBeTruthy();
  });

  it('shows a text already waiting as sent: only "Riêng tư" takes it back', async () => {
    view = draftView({ status: 'pending' });
    const sheet = await form();
    expect((sheet.getByRole('button', { name: 'Đã gửi duyệt' }) as HTMLButtonElement).disabled).toBe(true);
    expect(sheet.getByText('Bài đang chờ duyệt. Chọn Riêng tư để rút về.')).toBeTruthy();
  });

  it('says so when keeping it private fails', async () => {
    const sheet = await form();
    vi.mocked(fetch).mockImplementationOnce(async () => answer(500, { error: 'internal' }));
    fireEvent.click(sheet.getByRole('radio', { name: /Riêng tư · chỉ mình tôi/ }));
    fireEvent.click(sheet.getByRole('button', { name: 'Lưu riêng tư' }));
    expect((await sheet.findByRole('alert')).textContent).toBe('Chưa lưu được: server chưa nhận, thử lại sau');
  });
});

describe('the Chia sẻ tab', () => {
  it('is locked until the text is approved', async () => {
    const sheet = await form();
    fireEvent.click(sheet.getByRole('tab', { name: 'Chia sẻ' }));
    expect(sheet.getByText('Bài chưa được duyệt nên chưa chia sẻ được')).toBeTruthy();
    fireEvent.click(sheet.getByRole('button', { name: 'Sang tab Xuất bản' }));
    expect(sheet.getByRole('tab', { name: 'Xuất bản' }).getAttribute('aria-selected')).toBe('true');
  });

  it('opens on Chia sẻ for a published text, which leads to C18; its form is read-only', async () => {
    view = draftView({ status: 'approved', origin: 'community' });
    const sheet = await form();
    expect(sheet.getByRole('tab', { name: 'Chia sẻ' }).getAttribute('aria-selected')).toBe('true');
    expect(sheet.getByRole('link', { name: /Quyền truy cập, hạn link/ }).getAttribute('href')).toBe(`/d/${DOC_ID}/share`);
    fireEvent.click(sheet.getByRole('tab', { name: 'Xuất bản' }));
    expect(sheet.getByRole('link', { name: 'Quản lý chia sẻ' }).getAttribute('href')).toBe(`/d/${DOC_ID}/share`);
    expect((sheet.getByRole('combobox', { name: /^Space/ }) as HTMLSelectElement).disabled).toBe(true);
  });
});

it('shows the X02 panel for a text it cannot open', async () => {
  docStatus = 404;
  renderWithI18n(<PublishScreen id={DOC_ID} />);
  expect(await screen.findByText('404')).toBeTruthy();
});
