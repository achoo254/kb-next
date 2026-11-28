import { readPreferences, subscribePreferences } from '@achoo254/app-shell/preferences';
import { type ReactNode, createContext, useContext, useEffect, useMemo, useState } from 'react';
import { brand } from '../brand';
import { type MessageKey, type Messages, en, vi, zhCN } from './messages';

/** The languages of the shared shell, in the order the language choices show them. */
export const LOCALES = ['vi', 'en', 'zh-CN'] as const;
export type Locale = (typeof LOCALES)[number];

const DICTIONARIES: Record<Locale, Messages> = { vi, en, 'zh-CN': zhCN };

/** Each language in its own words, never translated (the shell's names). */
export const LOCALE_NAMES: Readonly<Record<Locale, string>> = { vi: 'Tiếng Việt', en: 'English', 'zh-CN': '中文' };

/** The short mark of the language toggles on the landing and legal pages. */
export const LOCALE_MARKS: Readonly<Record<Locale, string>> = { vi: 'VI', en: 'EN', 'zh-CN': '中文' };

/** The language after `locale` for the one-button toggles: vi → en → zh-CN → vi. */
export function nextLocale(locale: Locale): Locale {
  return LOCALES[(LOCALES.indexOf(locale) + 1) % LOCALES.length] ?? 'vi';
}

/**
 * The language of texts (articles, Space names, the account's reading and writing language), which are written in
 * Vietnamese and English only: a Chinese page reads the English ones.
 */
export type ContentLang = 'vi' | 'en';
export function contentLang(locale: Locale): ContentLang {
  return locale === 'vi' ? 'vi' : 'en';
}

/** The BCP 47 tag for `Intl` dates and numbers in `locale`. */
export function intlLocale(locale: Locale): string {
  return locale === 'vi' ? 'vi-VN' : locale === 'en' ? 'en-GB' : 'zh-CN';
}

export type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

/** Fills `{name}` placeholders; `{app}` is always the brand name. */
export function format(template: string, vars: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => {
    if (name === 'app') return brand.appName;
    const value = vars[name];
    return value === undefined ? whole : String(value);
  });
}

export function translator(locale: Locale): Translate {
  const dictionary = DICTIONARIES[locale];
  return (key, vars) => format(dictionary[key], vars);
}

export const isLocale = (value: unknown): value is Locale => LOCALES.some((locale) => locale === value);

/** Vietnamese and Chinese browser tags pick their page language; English is the rest. */
const BROWSER_LOCALES: Readonly<Record<string, Locale>> = { vi: 'vi', zh: 'zh-CN' };

/**
 * `?lang=` wins (a shared link), then the language picked in any hoandat.com app (cookie `hd_lang`), then the first
 * Vietnamese or Chinese language of the browser; everyone else reads English.
 */
export function initialLocale(search: string, stored: Locale | undefined, browserLanguages: readonly string[]): Locale {
  const fromQuery = new URLSearchParams(search).get('lang');
  if (isLocale(fromQuery)) return fromQuery;
  if (stored) return stored;
  for (const tag of browserLanguages) {
    const match = BROWSER_LOCALES[tag.toLowerCase().split('-')[0] ?? ''];
    if (match) return match;
  }
  return 'en';
}

/** The language picked in any hoandat.com app (cookie `hd_lang`), if any of this app's. */
function storedLocale(): Locale | undefined {
  return readPreferences({ domain: brand.primaryTenant.domain, locales: LOCALES }).lang;
}

interface I18n {
  locale: Locale;
  t: Translate;
  /** Shows the page in `locale`; the footer's language switch has already stored the choice. */
  setLocale(locale: Locale): void;
}

const I18nContext = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }): ReactNode {
  // Without a window (never in the browser) the page is English.
  const [locale, setLocale] = useState<Locale>(() =>
    typeof window === 'undefined' ? 'en' : initialLocale(window.location.search, storedLocale(), navigator.languages),
  );
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  // A language picked in another app's tab shows here when this tab is viewed again. Only a change counts, so a
  // shared `?lang=` link keeps its language until someone picks one.
  useEffect(() => {
    let last = storedLocale();
    return subscribePreferences(() => {
      const next = storedLocale();
      if (next === undefined || next === last) return;
      last = next;
      setLocale(next);
    });
  }, []);
  const value = useMemo(() => ({ locale, t: translator(locale), setLocale }), [locale]);
  return <I18nContext value={value}>{children}</I18nContext>;
}

export function useI18n(): I18n {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n outside I18nProvider');
  return value;
}
