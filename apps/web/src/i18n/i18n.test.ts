import { describe, expect, it } from 'vitest';
import { brand } from '../brand';
import { LOCALES, contentLang, format, initialLocale, isLocale, nextLocale, translator } from './i18n';
import { en, vi, zhCN } from './messages';

describe('i18n', () => {
  it('has the same keys in every language, none empty', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(vi).sort());
    expect(Object.keys(zhCN).sort()).toEqual(Object.keys(vi).sort());
    for (const value of [...Object.values(vi), ...Object.values(en), ...Object.values(zhCN)]) expect(value.trim()).not.toBe('');
  });

  it('speaks the three languages of the shared shell, texts in Vietnamese and English only', () => {
    expect(LOCALES).toEqual(['vi', 'en', 'zh-CN']);
    expect(isLocale('zh-CN')).toBe(true);
    expect(isLocale('zh')).toBe(false);
    expect(LOCALES.map(nextLocale)).toEqual(['en', 'zh-CN', 'vi']);
    expect(LOCALES.map(contentLang)).toEqual(['vi', 'en', 'en']);
    expect(translator('zh-CN')('layout.signIn')).toBe('登录');
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
    // Simplified Chinese: by link, by the saved choice, or by the first Chinese language of the browser
    expect(initialLocale('?lang=zh-CN', 'vi', ['vi-VN'])).toBe('zh-CN');
    expect(initialLocale('', 'zh-CN', ['vi-VN'])).toBe('zh-CN');
    expect(initialLocale('', undefined, ['zh-TW', 'vi'])).toBe('zh-CN');
    expect(initialLocale('', undefined, ['vi', 'zh-CN'])).toBe('vi');
  });
});
