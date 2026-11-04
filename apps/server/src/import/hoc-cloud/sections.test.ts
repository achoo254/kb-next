import { describe, expect, it } from 'vitest';
import { dropSections, slugify, splitSections } from './sections';

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

  it('drops listed sections and refuses unknown anchors', () => {
    const kept = dropSections(DOC, ['dat-ten-may'], 'tong-quan');
    expect(kept).not.toContain('Đặt tên máy');
    expect(kept.startsWith('# Title')).toBe(true);
    expect(() => dropSections(DOC, ['missing'], 'tong-quan')).toThrow(/no section missing/);
  });
});
