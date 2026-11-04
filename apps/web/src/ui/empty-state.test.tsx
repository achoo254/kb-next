import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EmptyState } from './empty-state';

describe('EmptyState', () => {
  it('uses the AI art of the state, one sentence and one action', () => {
    const { container } = render(
      <EmptyState art="telescope-empty" tone="warn" title="Không tìm thấy" description="Thử từ khác." action={{ label: 'Hỏi AI', href: '/copilot' }} />,
    );
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/art/ill-telescope-empty.webp');
    expect(screen.getByText('Không tìm thấy')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Hỏi AI' }).getAttribute('href')).toBe('/copilot');
  });

  it('can show a Space crystal as its art', () => {
    const { container } = render(<EmptyState art="crystal-personal" title="Chưa có ghi chú" />);
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/art/crystal-personal.webp');
  });
});
