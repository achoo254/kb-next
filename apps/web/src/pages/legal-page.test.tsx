/**
 * /privacy and /terms in jsdom (English, as navigator.languages is en-US): what each page tells, in both languages
 * with the same sections, the durations printed from the server's own constants, the language switch, the links
 * between the two pages, and the page's description while it is open.
 */
import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ADMIN_CALL_LOG_DAYS,
  BACKUP_KEEP_DAYS,
  SESSION_ABSOLUTE_DAYS,
  SESSION_IDLE_DAYS,
  SHARE_OPENINGS_KEEP_DAYS,
  TRASH_DAYS,
} from '../../../server/src/retention';
import { renderWithI18n } from '../test/render';
import { LEGAL_DOCS, type LegalKind } from './legal-docs';
import { LegalPage } from './legal-page';

afterEach(() => {
  document.cookie = 'hd_lang=; Max-Age=0; path=/';
  document.head.querySelector('meta[name="description"]')?.remove();
});

/** The text of the section under the heading `name`. */
function sectionText(name: string): string {
  const heading = screen.getByRole('heading', { level: 2, name });
  return heading.closest('section')?.textContent ?? '';
}

describe('the privacy page', () => {
  it('says where AI questions go, what Jev reads, and how long things are kept', () => {
    renderWithI18n(<LegalPage kind="privacy" />);
    expect(document.querySelector('[data-screen="Privacy"]')).not.toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'Privacy' })).toBeTruthy();

    const ai = sectionText('Copilot and AI run on your own key');
    expect(ai).toContain('OpenAI, Google Gemini or Anthropic Claude');
    expect(ai).toContain('AES-256-GCM');
    expect(ai).toContain('your question, the passage you selected (if any) and excerpts from the knowledge base');

    const jev = sectionText('Jev (TypeSafe): search and sorting');
    expect(jev).toContain('your query, the titles and summaries');
    expect(jev).not.toContain('pre-review');

    // No review gate: the author publishes; a public text is readable at once, guests included.
    expect(sectionText('Your texts, files and activity')).toContain('You choose to publish a text or keep it private.');

    expect(sectionText('Your texts, files and activity')).toContain('Apache Tika');
    expect(sectionText('Your texts, files and activity')).toContain(`${TRASH_DAYS} days`);
    expect(sectionText('Cookies and sessions')).toContain(`up to ${SESSION_ABSOLUTE_DAYS} days`);
    expect(sectionText('Cookies and sessions')).toContain(`after ${SESSION_IDLE_DAYS} days without use`);
    expect(sectionText('Cookies and sessions')).toContain('auth.hoandat.com');
    expect(sectionText('Share links')).toContain(`Openings older than ${SHARE_OPENINGS_KEEP_DAYS} days`);
    expect(sectionText('Share links')).toContain('never stores or logs the code itself');
    expect(sectionText('Administration and logs')).toContain(`kept for ${ADMIN_CALL_LOG_DAYS} days`);
    expect(sectionText('On your device')).toContain('IndexedDB');
    expect(sectionText('Servers, web logs and backups')).toContain(`for ${BACKUP_KEEP_DAYS} days`);
  });

  it('lists what deleting your data removes and keeps, and leads to Settings', () => {
    renderWithI18n(<LegalPage kind="privacy" />);
    expect(sectionText('Deleting your data')).toContain('Copilot history');
    const kept = screen.getByRole('heading', { level: 2, name: 'What stays after deleting' }).closest('section');
    if (!kept) throw new Error('the section of "What stays after deleting" is missing');
    expect(kept.textContent).toContain('Official texts outside your personal Space');
    expect(within(kept).getByRole('link', { name: 'Open Settings' }).getAttribute('href')).toBe('/settings');
  });

  it('fills in the brand words and leaves no placeholder', () => {
    renderWithI18n(<LegalPage kind="privacy" />);
    const text = document.body.textContent ?? '';
    expect(text).toContain('KnowFlow (kb.hoandat.com)');
    expect(text).not.toMatch(/\{\w+\}/);
  });

  it('lists every section in its table of contents, each leading to its heading', () => {
    renderWithI18n(<LegalPage kind="privacy" />);
    const toc = screen.getByRole('navigation', { name: 'On this page' });
    const links = within(toc).getAllByRole('link');
    expect(links).toHaveLength(LEGAL_DOCS.privacy.en.sections.length);
    for (const link of links) {
      const id = link.getAttribute('href')?.slice(1) ?? '';
      // one element per id: a section must not take the page's own (#content, the skip link's target)
      expect(document.querySelectorAll(`[id="${id}"]`)).toHaveLength(1);
      expect(document.getElementById(id)?.textContent).toBe(link.textContent);
    }
  });

  it('lands on the section an address names (/privacy#delete)', () => {
    const scrolled: string[] = [];
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function scrollIntoView(this: Element) {
      scrolled.push(this.id);
    };
    window.history.replaceState(null, '', '/privacy#delete');
    try {
      renderWithI18n(<LegalPage kind="privacy" />);
      expect(scrolled).toEqual(['delete']);
    } finally {
      Element.prototype.scrollIntoView = original;
      window.history.replaceState(null, '', '/');
    }
  });

  it('switches to Vietnamese and keeps the choice for every hoandat app', () => {
    renderWithI18n(<LegalPage kind="privacy" />);
    fireEvent.click(screen.getByRole('button', { name: 'Change language (now English)' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Quyền riêng tư' })).toBeTruthy();
    expect(sectionText('Link chia sẻ')).toContain(`Lượt mở cũ hơn ${SHARE_OPENINGS_KEEP_DAYS} ngày`);
    expect(document.cookie).toContain('hd_lang=vi');
    expect(screen.getByRole('button', { name: 'Đổi ngôn ngữ (đang dùng Tiếng Việt)' }).textContent).toBe('VI');
  });

  it('sets the page description while open and puts the app’s back after', () => {
    const meta = document.createElement('meta');
    meta.name = 'description';
    meta.content = 'the app';
    document.head.append(meta);
    const { unmount } = renderWithI18n(<LegalPage kind="privacy" />);
    expect(meta.content).toMatch(/^KnowFlow \(kb\.hoandat\.com\) is a bilingual/);
    act(() => unmount());
    expect(meta.content).toBe('the app');
  });
});

describe('the terms page', () => {
  it('shows the terms, marks itself in the footer links and leads to the privacy page', () => {
    renderWithI18n(<LegalPage kind="terms" />);
    expect(document.querySelector('[data-screen="Terms"]')).not.toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'Terms of use' })).toBeTruthy();
    expect(sectionText('AI')).toContain('AI answers can be wrong');
    const legal = screen.getByRole('navigation', { name: 'Policies and terms' });
    expect(within(legal).getByRole('link', { name: 'Terms' }).getAttribute('aria-current')).toBe('page');
    expect(within(legal).getByRole('link', { name: 'Privacy' }).getAttribute('href')).toBe('/privacy');
    expect(screen.getByRole('link', { name: 'Back to home' }).getAttribute('href')).toBe('/');
  });
});

describe('the legal texts', () => {
  it('have the same sections in both languages, none empty', () => {
    for (const kind of ['privacy', 'terms'] as const satisfies readonly LegalKind[]) {
      const { vi, en } = LEGAL_DOCS[kind];
      expect(vi.sections.map((s) => s.id)).toEqual(en.sections.map((s) => s.id));
      vi.sections.forEach((section, i) => {
        const other = en.sections[i];
        expect(section.items?.length).toBe(other?.items?.length);
        expect(section.paragraphs?.length).toBe(other?.paragraphs?.length);
        expect(section.link?.href).toBe(other?.link?.href);
        for (const line of [...(section.items ?? []), ...(section.paragraphs ?? [])]) expect(line.trim()).not.toBe('');
      });
    }
  });
});
