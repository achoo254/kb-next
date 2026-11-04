import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TextField } from './text-field';

describe('TextField', () => {
  it('labels the field and ties the hint to it', () => {
    render(<TextField label="Tên bộ sưu tập" defaultValue="Giao thức" hint="Gợi ý: ngắn" />);
    const input = screen.getByLabelText('Tên bộ sưu tập');
    expect(input.getAttribute('aria-invalid')).toBeNull();
    expect(screen.getByText('Gợi ý: ngắn').id).toBe(input.getAttribute('aria-describedby'));
  });

  it('marks an error invalid and describes the field with it', () => {
    render(<TextField label="Tiêu đề" error="Cần một tiêu đề" variant="well" />);
    const input = screen.getByLabelText('Tiêu đề');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText('Cần một tiêu đề').id).toBe(input.getAttribute('aria-describedby'));
  });
});
