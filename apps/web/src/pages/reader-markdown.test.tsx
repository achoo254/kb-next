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
    expect([...container.querySelectorAll('li')].map((li) => li.getAttribute('data-mark'))).toEqual(['D', 'O']);
  });

  it('marks numbered steps with their number, not the first letter of "Bước"', () => {
    const { container } = render(<ReaderMarkdown markdown={'1. **Bước 1** Mở cổng\n2. **Bước 2** Gửi yêu cầu'} />);
    expect([...container.querySelectorAll('li')].map((li) => li.getAttribute('data-mark'))).toEqual(['1', '2']);
  });

  it('links each [[ ]] title the server resolved, with its label, and leaves the rest as written', () => {
    const links = new Map([
      ['DHCP', 'd1'],
      ['Giao thức ARP', 'a1'],
    ]);
    const { container } = render(<ReaderMarkdown markdown={'Xem [[DHCP]], **[[Giao thức ARP|ARP]]** và [[Chưa có bài]].\n\n`[[DHCP]]`'} wikilinks={links} />);
    const anchors = [...container.querySelectorAll('a')];
    expect(anchors.map((a) => [a.textContent, a.getAttribute('href'), a.getAttribute('data-id')])).toEqual([
      ['DHCP', '/d/d1', 'reader-wikilink'],
      ['ARP', '/d/a1', 'reader-wikilink'],
    ]);
    expect(container.textContent).toContain('[[Chưa có bài]]');
    expect(container.querySelector('code')?.textContent).toBe('[[DHCP]]');
  });

  it('draws no link without resolved titles', () => {
    const { container } = render(<ReaderMarkdown markdown={'Xem [[DHCP]].'} />);
    expect(container.querySelector('a')).toBeNull();
    expect(container.textContent).toBe('Xem [[DHCP]].');
  });
});
