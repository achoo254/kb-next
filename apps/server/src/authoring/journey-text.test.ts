import { describe, expect, it } from 'vitest';
import { journeyBody } from './journey-text';

describe('a journey’s text', () => {
  it('numbers the steps with their kind and time, notes under them, in the journey’s language', () => {
    const steps = [
      { kind: 'lab' as const, title: 'ARP tìm MAC router', minutes: 6, note: null },
      { kind: 'note' as const, title: 'Nghỉ *chút*', minutes: 2, note: 'Uống nước\nrồi đi tiếp.' },
    ];
    expect(journeyBody(steps, 'vi')).toBe('1. **ARP tìm MAC router** · Thử lab · 6 phút\n2. **Nghỉ \\*chút\\*** · Ghi chú · 2 phút\n   Uống nước rồi đi tiếp.');
    expect(journeyBody(steps.slice(0, 1), 'en')).toBe('1. **ARP tìm MAC router** · Lab · 6 min');
    expect(journeyBody([], 'vi')).toBe('');
  });
});
