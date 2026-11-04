import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Crystal } from './crystal';

describe('Crystal', () => {
  it('shows the Space crystal art, names it with its count and reacts to a pick', () => {
    const onClick = vi.fn();
    const { container } = render(<Crystal space="kubernetes" name="Kubernetes" count="2 bài" onClick={onClick} dimmed />);
    const crystal = screen.getByRole('button', { name: 'Kubernetes · 2 bài' });
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/art/crystal-kubernetes.webp');
    expect(crystal.dataset.space).toBe('kubernetes');
    expect(crystal.dataset.dimmed).toBe('true');
    fireEvent.click(crystal);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('is a link when given href', () => {
    render(<Crystal space="networking" name="Networking" href="/s/networking" size="mini" />);
    expect(screen.getByRole('link', { name: 'Networking' }).getAttribute('href')).toBe('/s/networking');
  });
});
