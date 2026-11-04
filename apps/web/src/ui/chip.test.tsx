import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Chip } from './chip';

describe('Chip', () => {
  it('renders a tag, or a link for board chips', () => {
    render(
      <>
        <Chip>dhcp</Chip>
        <Chip variant="board" href="/u">
          C09
        </Chip>
      </>,
    );
    expect(screen.getByText('dhcp').dataset.variant).toBe('tag');
    expect(screen.getByRole('link', { name: 'C09' }).dataset.variant).toBe('board');
  });
});
