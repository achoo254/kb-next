import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { Tabs } from './tabs';

const ITEMS = [
  { id: 'docs', label: 'Tài liệu' },
  { id: 'collections', label: 'Bộ sưu tập' },
  { id: 'paths', label: 'Lối đi' },
];

function Harness(): React.ReactNode {
  const [value, setValue] = useState('docs');
  return <Tabs label="Ví dụ" items={ITEMS} value={value} onChange={setValue} />;
}

describe('Tabs', () => {
  it('selects one tab with a single tab stop and moves with the arrow keys', () => {
    render(<Harness />);
    const first = screen.getByRole('tab', { name: 'Tài liệu' });
    expect(first.getAttribute('aria-selected')).toBe('true');
    expect(first.tabIndex).toBe(0);
    expect(screen.getByRole('tab', { name: 'Lối đi' }).tabIndex).toBe(-1);
    fireEvent.keyDown(first, { key: 'ArrowLeft' });
    expect(screen.getByRole('tab', { name: 'Lối đi' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.click(screen.getByRole('tab', { name: 'Bộ sưu tập' }));
    expect(screen.getByRole('tab', { name: 'Bộ sưu tập' }).getAttribute('aria-selected')).toBe('true');
  });
});
