import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GradientTitle } from './gradient-title';

describe('GradientTitle', () => {
  it('renders a heading at the given size', () => {
    render(<GradientTitle size={42}>18 trạng thái</GradientTitle>);
    const heading = screen.getByRole('heading', { level: 1, name: '18 trạng thái' });
    expect(heading.style.fontSize).toBe('42px');
  });
});
