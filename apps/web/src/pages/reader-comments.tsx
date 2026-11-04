/**
 * "Bình luận" of a document (board C11): the discussion of a published document, oldest first, and the composer.
 * Comments are plain text as typed: rendered as text (React escapes it), never as Markdown or HTML.
 */
import { type FormEvent, type ReactNode, useEffect, useState } from 'react';
import { ApiError } from '../api/api-client';
import { type DocumentComment, type DocumentComments, MAX_COMMENT_CHARS, fetchComments, postComment } from '../api/content-api';
import { Button } from '../ui/button';
import { timeAgo, useReaderText } from './reader-messages';
import { useSpaceText } from './space-messages';

/** The anchor of the comments section (the last entry of the table of contents). */
export const COMMENTS_ANCHOR = 'binh-luan';

type CommentsLoad = { status: 'loading' } | { status: 'ready'; data: DocumentComments } | { status: 'failed' };

function initialOf(name: string | null): string {
  const first = Array.from(name?.trim() ?? '')[0];
  return first ? first.toLocaleUpperCase() : '·';
}

function CommentItem({ comment, now }: { comment: DocumentComment; now: number }): ReactNode {
  const { t, locale } = useReaderText();
  const space = useSpaceText();
  const staff = comment.author.role !== 'member';
  return (
    <li className="reader-comment" data-id={`comment-${comment.id}`}>
      <span className="reader-comment-avatar" data-tone={staff ? 'emerald' : 'cyan'} aria-hidden="true">
        {initialOf(comment.author.name)}
      </span>
      <div>
        <div className="reader-comment-head">
          {comment.author.name ?? t('reader.anonymous')}
          {staff && <span className="reader-comment-role">{space.t(`role.${comment.author.role}`)}</span>}
          <span className="reader-comment-time">
            · <time dateTime={comment.createdAt}>{timeAgo(locale, comment.createdAt, now)}</time>
          </span>
        </div>
        <p className="reader-comment-body">{comment.body}</p>
      </div>
    </li>
  );
}

export function ReaderComments({ documentId, offline }: { documentId: string; offline: boolean }): ReactNode {
  const { t } = useReaderText();
  // The comments of the document shown; another document's (or none yet) shows as loading.
  const [result, setResult] = useState<{ documentId: string; load: CommentsLoad } | null>(null);
  const load: CommentsLoad = result?.documentId === documentId ? result.load : { status: 'loading' };
  const setLoad = (next: CommentsLoad): void => setResult({ documentId, load: next });
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let current = true;
    fetchComments(documentId)
      .then((data) => {
        if (!current) return;
        setNow(Date.now());
        setResult({ documentId, load: { status: 'ready', data } });
      })
      .catch((error: unknown) => {
        if (!(error instanceof ApiError)) console.error('comments load failed', error);
        if (current) setResult({ documentId, load: { status: 'failed' } });
      });
    return () => {
      current = false;
    };
  }, [documentId]);

  async function send(event: FormEvent): Promise<void> {
    event.preventDefault();
    const body = draft.trim();
    if (body === '' || sending || load.status !== 'ready') return;
    if (body.length > MAX_COMMENT_CHARS) {
      setSendError(t('reader.commentTooLong', { max: MAX_COMMENT_CHARS }));
      return;
    }
    setSending(true);
    setSendError(null);
    try {
      const created = await postComment(documentId, body);
      setLoad({ status: 'ready', data: { ...load.data, comments: [...load.data.comments, created] } });
      setNow(Date.now());
      setDraft('');
    } catch {
      setSendError(t('reader.commentFailed'));
    } finally {
      setSending(false);
    }
  }

  const comments = load.status === 'ready' ? load.data.comments : [];
  return (
    <section id={COMMENTS_ANCHOR} className="reader-comments" aria-labelledby="reader-comments-title" data-id="reader-comments">
      <h2 id="reader-comments-title" className="reader-comments-title">
        {t('reader.commentsCount', { count: comments.length })}
      </h2>
      {load.status === 'failed' && <p className="reader-note">{t('reader.commentsFailed')}</p>}
      {load.status === 'ready' && !load.data.open && <p className="reader-note">{t('reader.commentsClosed')}</p>}
      {load.status === 'ready' && load.data.open && comments.length === 0 && <p className="reader-note">{t('reader.commentsNone')}</p>}
      {comments.length > 0 && (
        <ul className="reader-comment-list">
          {comments.map((comment) => (
            <CommentItem key={comment.id} comment={comment} now={now} />
          ))}
        </ul>
      )}
      {load.status === 'ready' && load.data.open && (
        <form className="reader-composer" onSubmit={(event) => void send(event)} data-id="reader-composer">
          <label className="reader-composer-field">
            <span className="kf-visually-hidden">{t('reader.commentLabel')}</span>
            <input
              type="text"
              value={draft}
              maxLength={MAX_COMMENT_CHARS}
              placeholder={t('reader.commentPlaceholder')}
              onChange={(event) => setDraft(event.target.value)}
              disabled={offline}
              data-id="reader-comment-input"
            />
          </label>
          <Button variant="rim" type="submit" disabled={sending || offline || draft.trim() === ''} dataId="reader-comment-send">
            {sending ? t('reader.commentSending') : t('reader.commentSend')}
          </Button>
        </form>
      )}
      {sendError && (
        <p className="reader-note" role="alert">
          {sendError}
        </p>
      )}
    </section>
  );
}
