import { describe, expect, it } from 'vitest';
import { stepMark } from './step-mark';

describe('stepMark', () => {
  it('shows the number of a numbered step, not the first letter of its word', () => {
    expect(stepMark('Bước 1')).toBe('1');
    expect(stepMark('Bước 12: Kiểm tra')).toBe('12');
    expect(stepMark('Step 3.')).toBe('3');
    expect(stepMark('2) Cài đặt')).toBe('2');
  });

  it('keeps the first letter of a named step (the board’s DORA)', () => {
    expect(stepMark('Discover')).toBe('D');
    expect(stepMark(' ước lượng')).toBe('Ư');
    expect(stepMark('IPv4 tĩnh')).toBe('I');
    expect(stepMark('Cấu hình VLAN 10')).toBe('C');
  });

  it('marks an empty term with a dot', () => {
    expect(stepMark('   ')).toBe('·');
  });
});
