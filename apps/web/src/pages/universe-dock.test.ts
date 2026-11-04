import { describe, expect, it } from 'vitest';
import { translator } from '../i18n/i18n';
import { continueReading, daysSince, dockCards, staleDocument } from './universe-dock';
import { doc } from './universe-test-data';

const t = translator('vi');
const NOW = Date.parse('2026-12-18T14:00:00Z');

describe('the "Gần đây" stage', () => {
  it('reads on with the latest started text and flags the latest one untouched for 30 days', () => {
    const recent = [
      doc('fresh', { updatedAt: '2026-12-17T14:00:00Z' }),
      doc('dhcp', { title: 'Giao thức DHCP', readProgress: 72, updatedAt: '2026-11-03T14:05:00Z' }),
      doc('k8s', { title: 'Kiến trúc cụm K8s', updatedAt: '2026-11-03T13:55:00Z' }),
    ];
    expect(continueReading(recent)?.id).toBe('dhcp');
    expect(staleDocument(recent, NOW, recent[1])?.id).toBe('k8s');
    expect(daysSince('2026-11-03T13:55:00Z', NOW)).toBe(45);

    const cards = dockCards({ recent, relatedCount: 5, now: NOW }, t);
    expect(cards.map((card) => card.id)).toEqual(['continue', 'update', 'graph', 'related', 'ask']);
    expect(cards[0]).toMatchObject({ title: 'Tiếp tục đọc', sub: 'Giao thức DHCP', progress: 72, href: '/d/dhcp' });
    expect(cards[1]).toMatchObject({ title: 'Cần cập nhật', sub: 'Kiến trúc cụm K8s', warning: '● Đã 45 ngày', iconTone: 'warn' });
    expect(cards[2]?.highlight).toBe(true);
    expect(cards[3]).toMatchObject({ sub: '5 tài liệu', href: '/d/dhcp#related' });
  });

  it('shows the latest texts without progress or anything stale, and never makes up a count', () => {
    const recent = [doc('a', { title: 'A', updatedAt: '2026-12-17T14:00:00Z' }), doc('b', { title: 'B', updatedAt: '2026-12-16T14:00:00Z' })];
    const cards = dockCards({ recent, relatedCount: null, now: NOW }, t);
    expect(cards[0]).toMatchObject({ title: 'Mới cập nhật', sub: 'A', progress: undefined });
    expect(cards[1]).toMatchObject({ title: 'Mới cập nhật', sub: 'B', warning: undefined });
    expect(cards[3]?.sub).toBe('Xem liên kết');
  });

  it('points somewhere useful when there is nothing to read yet', () => {
    const cards = dockCards({ recent: [], relatedCount: null, now: NOW }, t);
    expect(cards[0]).toMatchObject({ title: 'Bắt đầu đọc', href: '/search' });
    expect(cards[1]).toMatchObject({ title: 'Của tôi', href: '/me' });
    expect(cards[3]?.href).toBe('/graph');
  });
});
