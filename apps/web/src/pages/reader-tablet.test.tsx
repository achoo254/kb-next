import { fireEvent, screen } from '@testing-library/react';
import { type ReactNode, useState } from 'react';
import { describe, expect, it } from 'vitest';
import { renderWithI18n } from '../test/render';
import { TocButton, TocDrawer } from './reader-tablet';

function Harness(): ReactNode {
  const [open, setOpen] = useState(false);
  return (
    <>
      <TocButton open={open} onOpen={() => setOpen(true)} />
      <TocDrawer open={open} onClose={() => setOpen(false)}>
        <a href="#a">Overview</a>
      </TocDrawer>
    </>
  );
}

describe('the tablet contents drawer', () => {
  it('opens from "Contents" and closes with Esc, its ×, or a swipe to the left', () => {
    renderWithI18n(<Harness />);
    const open = screen.getByRole('button', { name: 'Contents' });
    fireEvent.click(open);
    expect(open.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('complementary', { name: 'Contents' })).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('complementary')).toBeNull();

    fireEvent.click(open);
    fireEvent.click(screen.getAllByRole('button', { name: 'Close the contents' })[1] as HTMLElement);
    expect(screen.queryByRole('complementary')).toBeNull();

    fireEvent.click(open);
    const drawer = screen.getByRole('complementary');
    fireEvent.pointerDown(drawer, { clientX: 250 });
    fireEvent.pointerUp(drawer, { clientX: 120 });
    expect(screen.queryByRole('complementary')).toBeNull();
  });
});
