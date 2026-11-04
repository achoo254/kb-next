import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Loader } from './loader';

describe('Loader', () => {
  it.each(['orbit', 'ai', 'ring', 'spinner'] as const)('the %s loader is a named status', (variant) => {
    render(<Loader variant={variant} label="Đang tải vũ trụ" />);
    expect(screen.getByRole('status', { name: 'Đang tải vũ trụ' }).dataset.variant).toBe(variant);
  });

  it('the bar reports its progress, clamped to 0–100', () => {
    render(<Loader variant="bar" label="Tải lên lab-notes.docx" note="Có thể huỷ" value={140} />);
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('100');
    expect(screen.getByText('Có thể huỷ')).toBeTruthy();
  });
});
