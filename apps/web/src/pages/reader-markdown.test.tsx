import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ReaderMarkdown } from './reader-markdown';

describe('ReaderMarkdown', () => {
  it('reads the editor’s warning box as a note, without its mark, and leaves other quotes as quotes', () => {
    const { container } = render(<ReaderMarkdown markdown={'> [!WARNING]\n> Mạng có DHCP giả mạo.\n\n> Một câu trích.'} />);
    const note = screen.getByRole('note');
    expect(note.className).toBe('reader-callout');
    expect(note.textContent?.trim()).toBe('Mạng có DHCP giả mạo.');
    expect(container.querySelectorAll('blockquote')).toHaveLength(1);
    expect(container.textContent).not.toContain('[!WARNING]');
  });

  it('still draws an ordered list of bold terms as step cards', () => {
    const { container } = render(<ReaderMarkdown markdown={'1. **Discover**\n2. **Offer**'} />);
    expect(container.querySelector('ol')?.getAttribute('data-steps')).toBe('true');
    expect([...container.querySelectorAll('li')].map((li) => li.getAttribute('data-letter'))).toEqual(['D', 'O']);
  });
});
