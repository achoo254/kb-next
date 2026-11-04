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

  it('renders the solid accent and danger fills', () => {
    render(
      <>
        <Button variant="accent" size="md">
          Thử ngay
        </Button>
        <Button variant="danger-solid" size="xxl">
          Xoá
        </Button>
      </>,
    );
    const retry = screen.getByRole('button', { name: 'Thử ngay' });
    expect(retry.dataset.variant).toBe('accent');
    expect(retry.dataset.size).toBe('md');
    const remove = screen.getByRole('button', { name: 'Xoá' });
    expect(remove.dataset.variant).toBe('danger-solid');
    expect(remove.dataset.size).toBe('xxl');
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
