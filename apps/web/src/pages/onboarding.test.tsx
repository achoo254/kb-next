import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithI18n } from '../test/render';
import { type OnboardingSpace, Onboarding } from './onboarding';

const SPACES: readonly OnboardingSpace[] = [
  { slug: 'networking', name: 'Networking', art: '/art/crystal-networking.webp', glow: 'var(--glow-net)' },
  { slug: 'linux', name: 'Linux', art: '/art/crystal-linux.webp', glow: 'var(--glow-linux)' },
];

const ME = {
  name: 'Đạt',
  email: 'dat@example.com',
  picture: null,
  lang: 'en',
  theme: 'system',
  role: 'member',
  isAdmin: false,
  roleLocked: false,
  reducedMotion: false,
  onboardedAt: '2026-11-04T08:00:00.000+07:00',
  interests: ['linux'],
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async () => new Response(JSON.stringify(ME), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.cookie = 'hd_lang=; Max-Age=0; path=/';
  localStorage.clear();
});

function next(): void {
  fireEvent.click(screen.getByRole('button', { name: /^(Next|Tiếp|Start exploring|Bắt đầu khám phá)$/ }));
}

describe('Onboarding', () => {
  it('walks language, interests and the four tips, then saves the choices', async () => {
    const onDone = vi.fn();
    renderWithI18n(<Onboarding spaces={SPACES} onDone={onDone} />);
    const dialog = screen.getByRole('dialog', { name: 'Getting started with Knowledge Base' });
    expect(dialog.dataset.step).toBe('0');
    expect(screen.getByRole('button', { name: /EN/ }).getAttribute('aria-pressed')).toBe('true');
    expect((screen.getByRole('button', { name: 'Back' }) as HTMLButtonElement).disabled).toBe(true);

    next();
    expect(screen.getByRole('heading', { name: 'Which planets interest you?' })).toBeTruthy();
    const linux = screen.getByRole('button', { name: 'Linux' });
    fireEvent.click(linux);
    expect(linux.getAttribute('aria-pressed')).toBe('true');

    next();
    expect(screen.getByText('Step 3 of 3 · tip 1 of 4')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Create from here' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('heading', { name: 'Which planets interest you?' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Linux' }).getAttribute('aria-pressed')).toBe('true');
    next();
    next();
    next();
    next();
    expect(screen.getByRole('heading', { name: 'Quick search ⌘K' })).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Start exploring' })));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/me/onboarding');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ lang: 'en', interests: ['linux'] });
    expect(onDone).toHaveBeenCalledWith({ saved: true });
  });

  it('switches the reading language at once and stores it for every app', () => {
    renderWithI18n(<Onboarding spaces={SPACES} onDone={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: /VI/ }));
    expect(screen.getByRole('heading', { name: 'Bạn muốn đọc bằng ngôn ngữ nào?' })).toBeTruthy();
    expect(document.documentElement.lang).toBe('vi');
    expect(`${document.cookie} ${localStorage.getItem('hd_lang') ?? ''}`).toContain('vi');
  });

  it('saves on Skip and on Escape, and reports a save that failed', async () => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ error: 'down' }), { status: 503 }));
    const onDone = vi.fn();
    renderWithI18n(<Onboarding spaces={SPACES} onDone={onDone} />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Skip' })));
    expect(onDone).toHaveBeenLastCalledWith({ saved: false });
    await act(async () => fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body))).toEqual({ lang: 'en', interests: [] });
  });

  it('goes straight from the language to the tour when there are no Spaces to pick', () => {
    renderWithI18n(<Onboarding spaces={[]} onDone={() => undefined} />);
    next();
    expect(screen.getByRole('heading', { name: 'Create from here' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('heading', { name: 'Which language do you want to read in?' })).toBeTruthy();
  });
});
