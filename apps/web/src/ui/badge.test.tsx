import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Badge } from './badge';

describe('Badge', () => {
  it('shows its words with an icon and a tone', () => {
    const { container } = render(
      <Badge tone="success" icon="check">
        Đã đăng
      </Badge>,
    );
    const badge = screen.getByText('Đã đăng');
    expect(badge.dataset.tone).toBe('success');
    expect(container.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
  });
});
