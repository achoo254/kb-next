/**
 * /new: creates a note (a draft only its author sees) and opens it in the editor (C02). `?space=<slug>` and
 * `?collection=<id>` put it there (default: the writer's personal Space), `?type=process` makes a process, and
 * `?template=<id>` starts it from a built-in template (create-templates.ts: its outline, title, kind and planet, in the
 * reader's language). The page replaces itself with the editor, so Back does not create another note.
 */
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../api/api-client';
import { type NewDocumentRequest, createDocument } from '../api/authoring-api';
import type { Locale } from '../i18n/i18n';
import { SHELL_PATHS } from '../layout/shell-paths';
import { EmptyState } from '../ui/empty-state';
import { findTemplate, templateRequest } from './create-templates';
import { useEditorText } from './editor-messages';
import { EditorFrame } from './editor-screen';
import './editor-screen.css';
import { navigate } from '../router/navigation';

/** The note to create, from the page's query; a template's text comes in the reader's `locale`. */
export function newNoteRequest(search: string, locale: Locale): NewDocumentRequest {
  const params = new URLSearchParams(search);
  const space = params.get('space');
  const collection = params.get('collection');
  const template = findTemplate(params.get('template'));
  return {
    type: params.get('type') === 'process' ? 'process' : 'note',
    ...(template ? templateRequest(template, locale) : {}),
    ...(space ? { space } : {}),
    ...(collection ? { collection } : {}),
  };
}

export function NewNote(): ReactNode {
  const { t, locale } = useEditorText();
  const [failed, setFailed] = useState(false);
  const started = useRef(false);
  const create = useCallback(() => {
    setFailed(false);
    createDocument(newNoteRequest(window.location.search, locale)).then(
      (doc) => navigate(`/d/${encodeURIComponent(doc.id)}/edit`, { replace: true }),
      (error: unknown) => {
        if (!(error instanceof ApiError)) console.error('note create failed', error);
        setFailed(true);
      },
    );
  }, [locale]);
  useEffect(() => {
    // Once per visit (React runs effects twice in development).
    if (started.current) return;
    started.current = true;
    create();
  }, [create]);
  return (
    <EditorFrame breadcrumb={[{ label: 'Universe', href: SHELL_PATHS.universe }, { label: t('editor.crumbDrafts'), href: SHELL_PATHS.mine }]}>
      <div className="editor-screen" data-id="new-note" data-state={failed ? 'failed' : 'creating'}>
        {failed ? (
          <EmptyState art="crystal-cracked" title={t('editor.new.failed')} action={{ label: t('editor.offline.retry'), onClick: create }} className="editor-state" />
        ) : (
          <p className="editor-creating" role="status">
            {t('editor.new.creating')}
          </p>
        )}
      </div>
    </EditorFrame>
  );
}
