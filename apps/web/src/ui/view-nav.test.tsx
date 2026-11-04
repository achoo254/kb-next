import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ViewNav } from './view-nav';

describe('ViewNav', () => {
  it('links every view and marks the open one as the current page', () => {
    const items = [
      { id: 'orbit', label: 'Orbit', href: '/u', icon: 'orbit' },
      { id: 'graph', label: 'Graph', href: '/graph', icon: 'graph' },
    ] as const;
    render(<ViewNav label="Chế độ xem" items={items} activeId="graph" />);
    expect(screen.getByRole('navigation', { name: 'Chế độ xem' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Graph' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'Orbit' }).getAttribute('aria-current')).toBeNull();
  });
});
