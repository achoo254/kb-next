import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LensRail, type LensRailItem } from './lens-rail';

const ITEMS: readonly LensRailItem[] = [
  { id: 'universe', label: 'Universe', href: '/u', icon: 'home', spaceAfter: 6 },
  { id: 'create', label: 'Tạo mới', href: '/new', icon: 'plus', kind: 'create' },
  { id: 'search', label: 'Tìm kiếm', href: '/search', icon: 'search' },
];

describe('LensRail', () => {
  it('names every icon link, highlights the current section and puts the avatar outside the lens', () => {
    render(<LensRail label="Điều hướng chính" items={ITEMS} activeId="search" account={{ label: 'Tài khoản của Đạt', initial: 'Đ', href: '/settings' }} />);
    const nav = screen.getByRole('navigation', { name: 'Điều hướng chính' });
    expect(nav.querySelectorAll('a')).toHaveLength(3);
    expect(screen.getByRole('link', { name: 'Tìm kiếm' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'Tạo mới' }).dataset.kind).toBe('create');
    const avatar = screen.getByRole('link', { name: 'Tài khoản của Đạt' });
    expect(nav.contains(avatar)).toBe(false);
  });

  it('draws the mini sample without the avatar', () => {
    render(<LensRail label="Mẫu" items={ITEMS} size="mini" account={{ label: 'Tài khoản', initial: 'Đ', href: '/settings' }} />);
    expect(screen.queryByRole('link', { name: 'Tài khoản' })).toBeNull();
  });
});
