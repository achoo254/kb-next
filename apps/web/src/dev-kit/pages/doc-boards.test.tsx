import { fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { renderWithI18n } from '../../test/render';
import { ErrorsBoardPage } from './errors-board-page';
import { SignInBoardPage } from './sign-in-board-page';
import { SitemapPage } from './sitemap-page';
import { SpatialPage } from './spatial-page';

afterEach(() => {
  delete document.documentElement.dataset.theme;
});

describe('state boards', () => {
  it('lays out the three sign-in states of S02', () => {
    renderWithI18n(<SignInBoardPage />);
    expect(document.querySelector('[data-screen="S02-Login"]')).not.toBeNull();
    expect(document.querySelectorAll('.auth-card')).toHaveLength(3);
    expect(screen.getByText('A · Chuyển sang IdP')).toBeTruthy();
  });

  it('lays out the four errors of X02', () => {
    renderWithI18n(<ErrorsBoardPage />);
    expect(document.querySelector('[data-screen="X02-Errors"]')).not.toBeNull();
    expect(document.querySelectorAll('.error-panel')).toHaveLength(4);
  });
});

describe('SitemapPage', () => {
  it('links the screens that have a route and switches the theme', async () => {
    renderWithI18n(<SitemapPage />);
    expect(document.querySelector('[data-screen="Z01-Sitemap"]')).not.toBeNull();
    expect(screen.getByRole('link', { name: /Universe\s*C09 · 3D/ }).getAttribute('href')).toBe('/u');
    // C02 has no screen yet: documented, not linked.
    expect(screen.queryByRole('link', { name: /Sửa \/ viết/ })).toBeNull();
    expect(document.querySelectorAll('.z01-flow')).toHaveLength(4);
    fireEvent.click(screen.getByRole('button', { name: 'Chuyển sang Sáng' }));
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(await screen.findByRole('button', { name: 'Chuyển sang Tối' })).toBeTruthy();
  });
});

describe('SpatialPage', () => {
  it('switches the demo between 3D and the 2D list and pauses its motion', () => {
    renderWithI18n(<SpatialPage />);
    expect(document.querySelector('[data-screen="Z02-Spatial3D"]')).not.toBeNull();
    expect(document.querySelector('.z02-plane')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '2D' }));
    expect(screen.getByRole('button', { name: '2D' }).getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelectorAll('.z02-flat li')).toHaveLength(6);
    const motion = screen.getByRole('switch', { name: 'Giảm chuyển động: Tắt' });
    fireEvent.click(motion);
    expect(motion.getAttribute('aria-checked')).toBe('true');
    expect(document.querySelector('.z02-stage')?.hasAttribute('data-paused')).toBe(true);
  });
});
