/**
 * The template picker of the create ring: a card per built-in template (create-templates.ts), each a link to /new
 * that creates the draft from it and opens the editor. A grid in the ring's panel (C01 "Chọn mẫu tài liệu"), a list
 * in the phone sheet (M02).
 */
import type { CSSProperties, ReactNode } from 'react';
import { DOCUMENT_TEMPLATES, templateHref } from './create-templates';
import { useCreateText } from './create-messages';
import './create-template-picker.css';

export function TemplateCards({ layout }: { layout: 'grid' | 'list' }): ReactNode {
  const { t, locale } = useCreateText();
  return (
    <ul className="create-templates" data-layout={layout} aria-label={t('create.templatePane.title')} data-id="create-templates">
      {DOCUMENT_TEMPLATES.map((template) => {
        const text = template.text[locale];
        const tone = { '--tone': `var(--planet-${template.planet})`, '--tone-deep': `var(--planet-${template.planet}-deep)` } as CSSProperties;
        return (
          <li key={template.id}>
            <a
              className="create-template"
              href={templateHref(template.id)}
              aria-label={t('create.templatePane.pick', { name: text.name })}
              style={tone}
              data-id={`create-template-${template.id}`}
            >
              <span className="create-template-swatch" aria-hidden="true" />
              <span className="create-template-text">
                <span className="create-template-name">{text.name}</span>
                <span className="create-template-sub">{text.sub}</span>
              </span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}

/** The ring's panel for "Tài liệu từ mẫu" (C01). */
export function TemplatePane(): ReactNode {
  const { t } = useCreateText();
  return (
    <div className="create-form" data-id="create-template-pane">
      <span className="create-form-title">{t('create.templatePane.title')}</span>
      <TemplateCards layout="grid" />
      <p className="create-form-note">{t('create.templatePane.note')}</p>
    </div>
  );
}
