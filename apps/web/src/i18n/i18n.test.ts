import { describe, expect, it } from 'vitest';
import { brand } from '../brand';
import { format, initialLocale, translator } from './i18n';
import { en, vi } from './messages';

describe('i18n', () => {
  it('has the same keys in both languages, none empty', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(vi).sort());
    for (const value of [...Object.values(vi), ...Object.values(en)]) expect(value.trim()).not.toBe('');
  });

  it('fills placeholders and the brand name', () => {
    expect(format('{app}: {code}, {missing}', { code: 'C09' })).toBe(`${brand.appName}: C09, {missing}`);
    expect(translator('en')('screen.placeholder', { code: 'C09' })).toBe('This screen is being built from mock board C09.');
  });

  it('picks ?lang= first, then the saved choice, then Vietnamese for a Vietnamese browser, else English', () => {
    expect(initialLocale('?lang=en', 'vi', ['vi-VN'])).toBe('en');
    expect(initialLocale('', 'en', ['vi-VN'])).toBe('en');
    expect(initialLocale('', 'vi', ['en-US'])).toBe('vi');
    expect(initialLocale('', undefined, ['en-US', 'vi'])).toBe('vi');
    expect(initialLocale('?lang=fr', undefined, ['vi-VN'])).toBe('vi');
    expect(initialLocale('', undefined, ['en-GB', 'fr'])).toBe('en');
    expect(initialLocale('', undefined, [])).toBe('en');
  });
});
