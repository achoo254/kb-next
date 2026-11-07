import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { answer } from '../test/api-fakes';
import { renderWithI18n } from '../test/render';
import { SpacesScreen, byLatest } from './spaces-screen';
import { space } from './universe-test-data';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SpacesScreen', () => {
  it('lists every Space, the one with the newest text first, each opening its Space', async () => {
    const spaces = [space('networking', { updatedAt: '2026-11-01T00:00:00Z' }), space('ky-nang', { nameEn: 'Skills', art: '/art/orb-universe.webp', updatedAt: '2026-11-07T00:00:00Z', collectionCount: 2 })];
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => answer(200, { spaces })),
    );
    renderWithI18n(<SpacesScreen />);
    const list = await screen.findByRole('list', { name: 'All Spaces' });
    const links = within(list).getAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['/s/ky-nang', '/s/networking']);
    expect(within(list).getByText('2 planets')).toBeTruthy();
  });

  it('puts Spaces without texts last and keeps the API order between equals', () => {
    const order = byLatest([space('a', { updatedAt: null }), space('b', { updatedAt: '2026-11-02T00:00:00Z' }), space('c'), space('d', { updatedAt: '2026-11-02T00:00:00Z' })]);
    expect(order.map((s) => s.slug)).toEqual(['b', 'd', 'a', 'c']);
  });
});
