/**
 * /new: creates a note (a draft only its author sees) and opens it in the editor (C02). `?space=<slug>` and
 * `?collection=<id>` put it there (default: the writer's personal Space), `?type=process` makes a process. The page
 * replaces itself with the editor, so Back does not create another note.
 */
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../api/api-client';
import { type NewDocumentRequest, createDocument } from '../api/authoring-api';
import { SHELL_PATHS } from '../layout/shell-paths';
import { EmptyState } from '../ui/empty-state';
import { useEditorText } from './editor-messages';
import { EditorFrame } from './editor-screen';
import './editor-screen.css';
import { navigate } from '../router/navigation';

/** The note to create, from the page's query. */
export function newNoteRequest(search: string): NewDocumentRequest {
  const params = new URLSearchParams(search);
  const space = params.get('space');
  const collection = params.get('collection');
  return {
    type: params.get('type') === 'process' ? 'process' : 'note',
    ...(space ? { space } : {}),
    ...(collection ? { collection } : {}),
  };
}

export function NewNote(): ReactNode {
  const { t } = useEditorText();
  const [failed, setFailed] = useState(false);
  const started = useRef(false);
  const create = useCallback(() => {
    setFailed(false);
    createDocument(newNoteRequest(window.location.search)).then(
      (doc) => navigate(`/d/${encodeURIComponent(doc.id)}/edit`, { replace: true }),
      (error: unknown) => {
        if (!(error instanceof ApiError)) console.error('note create failed', error);
        setFailed(true);
      },
    );
  }, []);
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
