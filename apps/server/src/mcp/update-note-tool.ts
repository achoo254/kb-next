/**
 * `update_note` (scope `kb:write`): changes a note the user wrote, so a memory is kept up to date instead of saved
 * twice. `append` adds a block after the note's body, `replace` writes a new body; the title may change too. Two calls
 * like save_note: the first previews and returns a confirm token, bound to the arguments and to the note's current
 * revision, so a note that changed after the preview is never overwritten by a stale plan. Only the user's own private
 * notes: an admin edits others' texts, and an author their public ones, on the web, never through an agent. The save
 * is a version of its own (`via: api`), marked as AI-made, and the note stays private.
 */
import { z } from 'zod';
import { editAccess, saveDocument } from '../access/authoring';
import { MAX_BODY_CHARS, MAX_TITLE_CHARS, bodyOf } from '../authoring/markdown-text';
import { CONFIRM_TOKEN_TTL_MS } from './confirm-token';
import { refuseSecrets } from './secret-guard';
import { SCOPE_WRITE, ToolError, type ToolContext, defineTool, documentIdOf, documentViews } from './tool-kit';

const PREVIEW_CHARS = 500;
const TOOL = 'update_note';

const Input = z.strictObject({
  id: z.string().trim().min(1).max(500).describe('The note id, or its kb link (…/d/<id>), from search or save_note.'),
  mode: z.enum(['append', 'replace']).describe('`append`: add `markdown` after the body (keeps everything); `replace`: `markdown` becomes the whole body.'),
  markdown: z.string().trim().min(1).max(MAX_BODY_CHARS).describe('Markdown to add, or the new body, without the title line.'),
  title: z
    .string()
    .trim()
    .min(1)
    .max(MAX_TITLE_CHARS)
    .refine((title) => !/[\r\n]/.test(title), 'one line')
    .optional()
    .describe('A new title; default: keep it.'),
  confirm_token: z.string().max(300).optional().describe('From the preview; omit to get the preview.'),
});
type UpdateNoteInput = z.infer<typeof Input>;

const excerpt = (text: string): string => (text.length > PREVIEW_CHARS ? `${text.slice(0, PREVIEW_CHARS - 1)}…` : text);

const REFUSALS: Record<string, [string, string]> = {
  'not-found': ['not_found', 'No such note, or it is in the trash.'],
  hidden: ['hidden', 'An admin hid this note.'],
  'no-access': ['no_access', 'Only notes the user wrote can be changed here.'],
  published: ['not_private', 'This text is public: change it on the web, where its readers see the edit. update_note changes only private notes.'],
  'not-editable': ['not_editable', 'This document is a stored file or a journey, not a Markdown note.'],
  journey: ['not_editable', 'A journey is edited in the journey builder on the web.'],
};

function refuse(kind: string): never {
  const [code, message] = REFUSALS[kind] ?? ['internal', 'internal error'];
  throw new ToolError(code, message);
}

/** The note as it stands, when the caller wrote it, it is a Markdown note and it is private (nobody else reads it). */
async function ownNote(ctx: ToolContext, id: string) {
  const access = await editAccess(ctx.db, ctx.viewer, id);
  if (access.kind !== 'ok') refuse(access.kind);
  if (access.doc.authorId !== ctx.viewer.userId) refuse('no-access');
  if (access.doc.status !== 'private') refuse('published');
  return access;
}

/** The arguments a confirm token is bound to, in a fixed key order, with the revision the preview was made from. */
const bindingArgs = (id: string, input: UpdateNoteInput, rev: Date): Record<string, unknown> => ({
  id,
  mode: input.mode,
  markdown: input.markdown,
  title: input.title ?? null,
  rev: rev.toISOString(),
});

export const updateNote = defineTool({
  name: TOOL,
  title: 'Update a note',
  description:
    'Change a private note the user wrote: append a block to it (mode "append", e.g. a new fact or a dated entry) or rewrite its body (mode "replace"), optionally with a new title. Prefer this over save_note when the user already has a note on the subject. Runs in two calls: the first returns a preview and a confirm_token, the second (same arguments plus confirm_token, after the user agreed) saves it.',
  scope: SCOPE_WRITE,
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  input: Input,
  async run(ctx, input) {
    refuseSecrets(input.title ?? '', input.markdown);
    const id = documentIdOf(input.id);
    const { doc, latest } = await ownNote(ctx, id);
    const before = bodyOf(latest.markdown);
    const added = input.markdown.replace(/\r\n?/g, '\n');
    const body = input.mode === 'append' && before ? `${before}\n\n${added}` : added;
    if (body.length > MAX_BODY_CHARS) throw new ToolError('too_long', `The note would be longer than ${MAX_BODY_CHARS} characters; replace or shorten it instead.`);
    const title = input.title ?? doc.title;
    const binding = { subject: ctx.subject, tool: TOOL, args: bindingArgs(id, input, doc.updatedAt) };

    if (!input.confirm_token) {
      const { token, expiresAt } = ctx.confirm.issue(binding);
      const [view] = await documentViews(ctx, [doc]);
      return {
        preview: {
          action: input.mode === 'append' ? 'Append to a note of the user.' : 'Replace the body of a note of the user (the old body stays in its history).',
          document: view ?? null,
          mode: input.mode,
          title_before: doc.title,
          title_after: title,
          characters_before: before.length,
          characters_after: body.length,
          [input.mode === 'append' ? 'added' : 'new_body']: excerpt(added),
        },
        confirm_token: token,
        confirm_token_expires_at: expiresAt.toISOString(),
        next: `Nothing is changed yet. Show this preview to the user; only if they agree, call ${TOOL} again with the same arguments and this confirm_token (valid ${CONFIRM_TOKEN_TTL_MS / 60_000} minutes, once).`,
      };
    }

    const refused = ctx.confirm.consume(input.confirm_token, binding);
    if (refused) {
      throw new ToolError(refused, `The confirm_token does not work (${refused}; or the note changed since the preview); call ${TOOL} without it for a new preview.`);
    }
    const saved = await saveDocument(ctx.db, ctx.viewer, id, { title, body, baseRev: doc.updatedAt, editor: 'text', fromApi: true, aiMade: true }, ctx.now());
    if (saved.kind === 'stale') throw new ToolError('stale', `The note changed while saving; call ${TOOL} without confirm_token for a new preview.`);
    if (saved.kind !== 'saved') refuse(saved.kind);
    ctx.sync?.enqueue([id]);
    const fresh = await ownNote(ctx, id);
    const [view] = await documentViews(ctx, [fresh.doc]);
    return { saved: true, changed: saved.changed, version: saved.version, document: view ?? null };
  },
});
