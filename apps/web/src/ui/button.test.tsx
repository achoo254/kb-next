import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './button';

describe('Button', () => {
  it('renders a button with its variant and calls onClick', () => {
    const onClick = vi.fn();
    render(
      <Button variant="rim" icon="plus" onClick={onClick} dataId="create">
        Tạo
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Tạo' });
    expect(button.dataset.variant).toBe('rim');
    expect(button.getAttribute('data-id')).toBe('create');
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('renders a link when given href, and a disabled button instead of a dead link', () => {
    const { rerender } = render(<Button href="/u">Universe</Button>);
    expect(screen.getByRole('link', { name: 'Universe' }).getAttribute('href')).toBe('/u');
    rerender(
      <Button href="/u" disabled>
        Universe
      </Button>,
    );
    expect(screen.queryByRole('link')).toBeNull();
    expect((screen.getByRole('button', { name: 'Universe' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
