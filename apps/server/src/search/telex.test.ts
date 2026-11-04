import { describe, expect, it } from 'vitest';
import { hasDiacritics, toTelex } from './telex';

describe('toTelex', () => {
  it('puts the tone at the end of the word', () => {
    expect(toTelex('mạng')).toBe('mangj');
    expect(toTelex('màng')).toBe('mangf');
    expect(toTelex('máy')).toBe('mays');
    expect(toTelex('hỏi')).toBe('hoir');
    expect(toTelex('ngã')).toBe('ngax');
  });

  it('leaves a word without diacritics as it is', () => {
    expect(toTelex('mang')).toBe('mang');
    expect(toTelex('Kubernetes 1.30')).toBe('kubernetes 1.30');
  });

  it('writes vowel marks and đ the Telex way', () => {
    expect(toTelex('đường')).toBe('dduwowngf');
    expect(toTelex('Đường')).toBe('dduwowngf');
    expect(toTelex('ăn')).toBe('awn');
    expect(toTelex('cấu hình')).toBe('caaus hinhf');
    expect(toTelex('tơ lụa')).toBe('tow luaj');
    expect(toTelex('ê kíp')).toBe('ee kips');
  });

  it('keeps punctuation and closes each word on its own', () => {
    expect(toTelex('Mạng máy tính, (giao thức) DHCP!')).toBe('mangj mays tinhs, (giao thuwcs) dhcp!');
    expect(toTelex('mạng\nmàng')).toBe('mangj\nmangf');
  });

  it('gives the same result for precomposed and decomposed input', () => {
    expect(toTelex('mạng'.normalize('NFD'))).toBe(toTelex('mạng'.normalize('NFC')));
  });
});

describe('hasDiacritics', () => {
  it('tells a query with diacritics from one without', () => {
    expect(hasDiacritics('mạng')).toBe(true);
    expect(hasDiacritics('đi')).toBe(true);
    expect(hasDiacritics('Đi')).toBe(true);
    expect(hasDiacritics('mang')).toBe(false);
    expect(hasDiacritics('how does DHCP work')).toBe(false);
  });
});
