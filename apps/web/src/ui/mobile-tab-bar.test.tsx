import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MobileTabBar, type MobileTab } from './mobile-tab-bar';

const TABS: readonly MobileTab[] = [
  { id: 'universe', label: 'Vũ trụ', href: '/u', icon: 'tab-universe' },
  { id: 'create', label: 'Tạo mới', href: '/create', icon: 'plus', kind: 'create' },
  { id: 'copilot', label: 'Copilot', href: '/copilot', icon: 'tab-copilot' },
];

describe('MobileTabBar', () => {
  it('names each tab by its word, the raised "+" by its label, and marks the tab on screen', () => {
    render(<MobileTabBar label="Điều hướng chính" tabs={TABS} activeId="universe" />);
    const nav = screen.getByRole('navigation', { name: 'Điều hướng chính' });
    expect(nav.querySelectorAll('a')).toHaveLength(3);
    expect(screen.getByRole('link', { name: 'Vũ trụ' }).getAttribute('aria-current')).toBe('page');
    const create = screen.getByRole('link', { name: 'Tạo mới' });
    expect(create.dataset.kind).toBe('create');
    expect(create.textContent).toBe('');
    expect(screen.getByRole('link', { name: 'Copilot' }).getAttribute('aria-current')).toBeNull();
  });
});
