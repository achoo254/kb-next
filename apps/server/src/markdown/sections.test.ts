import { describe, expect, it } from 'vitest';
import { slugify, splitSections } from './sections';

const DOC = [
  '# Title',
  '',
  'Intro text.',
  '',
  '## Bước 1 — Gửi ARP Request',
  '',
  '```bash',
  '# not a heading',
  '## nor this',
  '```',
  '',
  '### Đặt tên máy',
  'Body.',
  '',
  '## Bước 1 — Gửi ARP Request',
  'Again.',
].join('\n');

describe('sections', () => {
  it('folds Vietnamese into anchors', () => {
    expect(slugify('Bước 2 — Đặt `hostname` & DNS!')).toBe('buoc-2-dat-hostname-dns');
  });

  it('cuts at ## and ### outside code, with unique anchors and the overview first', () => {
    const sections = splitSections(DOC, 'tong-quan');
    expect(sections.map((s) => [s.anchor, s.heading])).toEqual([
      ['tong-quan', null],
      ['buoc-1-gui-arp-request', 'Bước 1 — Gửi ARP Request'],
      ['dat-ten-may', 'Đặt tên máy'],
      ['buoc-1-gui-arp-request-2', 'Bước 1 — Gửi ARP Request'],
    ]);
    expect(sections[0]?.text).toBe('Intro text.');
    expect(sections[1]?.text).toContain('## nor this');
  });

  it('keeps every anchor unique, and the usual ones unchanged, whatever the headings', () => {
    const anchors = (headings: string[]): string[] => splitSections(headings.map((h) => `## ${h}\n\nx`).join('\n\n'), 'tong-quan').map((s) => s.anchor);
    // As anchors always were (imported texts and their citations keep them).
    expect(anchors(['Ví dụ', 'Ví dụ', 'Ví dụ', 'Tổng quan'])).toEqual(['vi-du', 'vi-du-2', 'vi-du-3', 'tong-quan-2']);
    // A heading that is another one's numbered anchor no longer collides.
    expect(anchors(['Ví dụ', 'Ví dụ', 'Ví dụ 2'])).toEqual(['vi-du', 'vi-du-2', 'vi-du-2-2']);
    expect(anchors(['Ví dụ 2', 'Ví dụ', 'Ví dụ'])).toEqual(['vi-du-2', 'vi-du', 'vi-du-3']);
    const many = anchors(['A', 'A 2', 'A', 'A 3', 'A', 'A', 'A 2']);
    expect(new Set(many).size).toBe(many.length);
  });
});
