import { describe, expect, it } from 'vitest';
import { MAX_DIFF_CELLS, blocksOf, diffBlocks } from './block-diff';
import { bodyOf, composeMarkdown, foldTitle, linkedTitles } from './markdown-text';

describe('blocksOf', () => {
  it('cuts at blank lines and headings, and keeps a fenced code block whole', () => {
    const markdown = ['# Title', 'First paragraph', 'still first', '', '## Section', 'Body', '', '```sh', 'echo a', '', 'echo b', '```', 'After'].join('\n');
    expect(blocksOf(markdown)).toEqual(['# Title', 'First paragraph\nstill first', '## Section', 'Body', '```sh\necho a\n\necho b\n```', 'After']);
  });
});

describe('diffBlocks', () => {
  it('counts added and removed blocks and keeps one unchanged block of context around each change', () => {
    const before = ['# DHCP', 'A', 'B', 'C', '## Risk', 'Old risk'].join('\n\n');
    const after = ['# DHCP', 'A', 'B', 'C', '## Lease', 'Lease text', '## Risk', 'New risk'].join('\n\n');
    const diff = diffBlocks(before, after);
    expect(diff.added).toBe(3);
    expect(diff.removed).toBe(1);
    expect(diff.lines).toEqual([
      { op: 'same', text: 'C', heading: false },
      { op: 'add', text: 'Lease', heading: true },
      { op: 'add', text: 'Lease text', heading: false },
      { op: 'same', text: 'Risk', heading: true },
      { op: 'del', text: 'Old risk', heading: false },
      { op: 'add', text: 'New risk', heading: false },
    ]);
  });

  it('marks unchanged runs between two changes as one gap', () => {
    const before = ['x', '1', '2', '3', '4', 'y'].join('\n\n');
    const after = ['X', '1', '2', '3', '4', 'Y'].join('\n\n');
    expect(diffBlocks(before, after).lines.map((l) => l.op)).toEqual(['del', 'add', 'same', 'gap', 'same', 'del', 'add']);
  });

  it('bounds its cost: a small text against a huge one is shown as replaced, past the common start and end', () => {
    const small = Array.from({ length: 2_000 }, (_, i) => `a${i}`);
    const huge = Array.from({ length: 66_000 }, (_, i) => `b${i}`);
    expect(2_001 * 66_001).toBeGreaterThan(MAX_DIFF_CELLS);
    const started = Date.now();
    const diff = diffBlocks(['# T', ...small, 'end'].join('\n\n'), ['# T', ...huge, 'end'].join('\n\n'));
    expect(Date.now() - started).toBeLessThan(2_000);
    expect([diff.added, diff.removed]).toEqual([66_000, 2_000]);
    expect(diff.lines[0]).toEqual({ op: 'same', text: 'T', heading: true });
    expect(diff.lines.at(-1)).toEqual({ op: 'same', text: 'end', heading: false });
  });

  it('shows nothing for two equal texts', () => {
    expect(diffBlocks('# A\n\nB', '# A\n\nB')).toEqual({ added: 0, removed: 0, lines: [] });
  });
});

describe('markdown-text', () => {
  it('joins a title and a body, and splits them back', () => {
    expect(composeMarkdown(' Máy mới ', '\nBody\r\nline\n')).toBe('# Máy mới\n\nBody\nline');
    expect(composeMarkdown('', 'Only body')).toBe('Only body');
    expect(composeMarkdown('Only title', '  ')).toBe('# Only title');
    expect(bodyOf('# Máy mới\n\nBody\nline')).toBe('Body\nline');
    expect(bodyOf('No title here')).toBe('No title here');
    // A draft without a title whose body opens with a `#` heading keeps that heading once stored and read back.
    const stored = composeMarkdown('', '# Mục lục\n\nNội dung');
    expect(stored).toBe('## Mục lục\n\nNội dung');
    expect(bodyOf(stored)).toBe(stored);
  });

  it('lists each linked title once, outside code', () => {
    expect(linkedTitles('See [[Giao thức DHCP]] and [[ARP|the ARP lab]], again [[Giao thức DHCP]].\n\n```\n[[Not a link]]\n```')).toEqual(['Giao thức DHCP', 'ARP']);
  });

  it('folds titles for matching: case, diacritics and spaces aside', () => {
    expect(foldTitle('  Giao  thức ĐHCP ')).toBe('giao thuc dhcp');
  });
});
