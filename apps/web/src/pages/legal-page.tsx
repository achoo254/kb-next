/**
 * /privacy and /terms: the privacy policy and terms of use, in the reader's language, open to anyone signed in or not.
 * No mock board: a reading column on the kit's rim panel over the strong veil (like the reader), light and dark, laid
 * out at the window's own width so a phone reads it without sideways scrolling. The text lives in legal-docs.ts.
 */
import { writePreference } from '@achoo254/app-shell/preferences';
import { type ReactNode, useEffect } from 'react';
import { brand } from '../brand';
import { type Locale, format, useI18n } from '../i18n/i18n';
import { LegalLinks } from '../layout/legal-links';
import { ScreenPage } from '../layout/screen-page';
import { Button } from '../ui/button';
import { RimPanel } from '../ui/rim-panel';
import { LEGAL_DOCS, type LegalKind } from './legal-docs';
import './legal-page.css';

const SCREEN_CODE: Record<LegalKind, string> = { privacy: 'Privacy', terms: 'Terms' };
const OTHER_LOCALE: Record<Locale, Locale> = { vi: 'en', en: 'vi' };

/**
 * The page's own `<meta name="description">` while it is open (search engines run the app's script), the app's
 * again when it closes. index.html carries the app's description (vite-brand.ts); without one nothing changes.
 */
function usePageDescription(description: string): void {
  useEffect(() => {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!meta) return;
    const previous = meta.content;
    meta.content = description;
    return () => {
      meta.content = previous;
    };
  }, [description]);
}

/**
 * A link to a section (`/privacy#delete`) lands on it: the browser looked for the anchor before the app drew the page,
 * so the page goes there once it has.
 */
function useSectionFromAddress(): void {
  useEffect(() => {
    // section ids are plain ASCII (legal-docs.ts), so the hash needs no decoding (which could throw on a bad one)
    const id = window.location.hash.slice(1);
    if (id) document.getElementById(id)?.scrollIntoView?.();
  }, []);
}

export function LegalPage({ kind }: { kind: LegalKind }): ReactNode {
  const { t, locale, setLocale } = useI18n();
  const doc = LEGAL_DOCS[kind][locale];
  const intro = format(doc.intro);
  usePageDescription(intro);
  useSectionFromAddress();
  const switchLanguage = (): void => {
    const next = OTHER_LOCALE[locale];
    writePreference('lang', next, { domain: brand.primaryTenant.domain });
    setLocale(next);
  };
  return (
    <ScreenPage
      code={SCREEN_CODE[kind]}
      veil="strong"
      stars={false}
      layout="board"
      responsive
      className="legal"
      actions={
        <>
          <Button variant="ghost" className="legal-lang" aria-label={t('layout.lang')} onClick={switchLanguage} dataId="legal-lang">
            {locale.toUpperCase()}
          </Button>
          <Button variant="ghost" href="/" className="legal-home" dataId="legal-home">
            {t('layout.backHome')}
          </Button>
        </>
      }
    >
      <div className="legal-column">
        <RimPanel as="article" className="legal-article" dataId={`legal-${kind}-article`}>
          <header className="legal-head">
            <h1 className="legal-title">{doc.title}</h1>
            <p className="legal-updated">{doc.updated}</p>
            <p className="legal-intro">{intro}</p>
          </header>
          <nav className="legal-toc" aria-label={t('layout.legalToc')}>
            <ol>
              {doc.sections.map((section) => (
                <li key={section.id}>
                  <a href={`#${section.id}`}>{section.heading}</a>
                </li>
              ))}
            </ol>
          </nav>
          {doc.sections.map((section) => (
            <section key={section.id} className="legal-section" aria-labelledby={section.id}>
              <h2 id={section.id} className="legal-heading">
                {section.heading}
              </h2>
              {section.paragraphs?.map((paragraph) => (
                <p key={paragraph}>{format(paragraph)}</p>
              ))}
              {section.items && (
                <ul>
                  {section.items.map((item) => (
                    <li key={item}>{format(item)}</li>
                  ))}
                </ul>
              )}
              {section.link && (
                <a className="legal-section-link" href={section.link.href}>
                  {section.link.label}
                </a>
              )}
            </section>
          ))}
        </RimPanel>
        <footer className="legal-foot">
          <LegalLinks current={kind} />
        </footer>
      </div>
    </ScreenPage>
  );
}
