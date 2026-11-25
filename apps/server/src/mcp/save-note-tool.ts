/**
 * `save_note` (scope `kb:write`): saves a private note of the user, in two calls. The first answers a preview and a
 * confirm token (nothing is written); the agent shows the preview, and only once the user agrees calls again with the
 * same arguments and the token. The note is written as the web editor writes a new text (createDocument, in the
 * user's personal Space unless a Space is named) and then kept private as C04 "Lưu riêng tư" does, so only the user
 * (and the workspace admins, as for every private text) reads it.
 */
import { z } from 'zod';
import type { SpaceRow } from '../access/content';
import { createDocument } from '../access/authoring';
import { findPersonalSpace, ensurePersonalSpace, PERSONAL_SPACE_LOOK, spaceForWriting } from '../access/spaces-write';
import { MAX_BODY_CHARS, MAX_TITLE_CHARS } from '../authoring/markdown-text';
import { keepTextPrivate } from '../review/moderation';
import { CONFIRM_TOKEN_TTL_MS } from './confirm-token';
import { APP_NAME, SCOPE_WRITE, ToolError, type ToolContext, defineTool, documentViews, spaceView } from './tool-kit';

const SLUG = /^[a-z0-9][a-z0-9-]{0,119}$/;
const PREVIEW_CHARS = 500;
const TOOL = 'save_note';

const Input = z.strictObject({
  title: z
    .string()
    .trim()
    .min(1)
    .max(MAX_TITLE_CHARS)
    .refine((title) => !/[\r\n]/.test(title), 'one line'),
  markdown: z.string().min(1).max(MAX_BODY_CHARS).describe('The note body in Markdown, without the title line.'),
  space: z.string().regex(SLUG).optional().describe("A Space slug (from list_spaces); default: the user's own private Space."),
  lang: z.enum(['vi', 'en']).optional().describe("The note's language; default: the account's."),
  confirm_token: z.string().max(300).optional().describe('From the preview; omit to get the preview.'),
});
type SaveNoteInput = z.infer<typeof Input>;

/** The Space the note goes to: the named one (not someone else's, not one an admin hid) or the personal one (null: not made yet). */
async function targetSpace(ctx: ToolContext, slug: string | undefined): Promise<SpaceRow | null> {
  if (!slug) return findPersonalSpace(ctx.db, ctx.viewer.userId);
  const access = await spaceForWriting(ctx.db, ctx.viewer, slug);
  if (access.kind === 'ok' && !(access.space.kind === 'public' && access.space.hidden)) return access.space;
  throw new ToolError('space_not_found', `No Space "${slug}" the user can write in; see list_spaces, or leave space out for the private Space.`);
}

/** The arguments a confirm token is bound to, in a fixed key order. */
const bindingArgs = (input: SaveNoteInput): Record<string, unknown> => ({ title: input.title, markdown: input.markdown, space: input.space ?? null, lang: input.lang ?? null });

async function preview(ctx: ToolContext, input: SaveNoteInput, space: SpaceRow | null): Promise<Record<string, unknown>> {
  const { token, expiresAt } = ctx.confirm.issue({ subject: ctx.subject, tool: TOOL, args: bindingArgs(input) });
  const where = space ? spaceView(ctx.config, space, ctx.lang) : { slug: null, name: ctx.lang === 'en' ? PERSONAL_SPACE_LOOK.nameEn : PERSONAL_SPACE_LOOK.nameVi, kind: 'personal' };
  const body = input.markdown.trim();
  return {
    preview: {
      action: `Save a new private note to the ${APP_NAME} (only the user can read it).`,
      title: input.title,
      space: where,
      lang: input.lang ?? ctx.lang,
      visibility: 'private',
      characters: body.length,
      excerpt: body.length > PREVIEW_CHARS ? `${body.slice(0, PREVIEW_CHARS - 1)}…` : body,
    },
    confirm_token: token,
    confirm_token_expires_at: expiresAt.toISOString(),
    next: `Nothing is saved yet. Show this preview to the user; only if they agree, call ${TOOL} again with the same arguments and this confirm_token (valid ${CONFIRM_TOKEN_TTL_MS / 60_000} minutes, once).`,
  };
}

export const saveNote = defineTool({
  name: TOOL,
  title: 'Save a private note',
  description:
    `Save a new private note (title and Markdown) to the user's ${APP_NAME}, in their own private Space unless a Space is named. Runs in two calls: the first returns a preview and a confirm_token, the second (same arguments plus confirm_token, after the user agreed) saves it and returns its url.`,
  scope: SCOPE_WRITE,
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  input: Input,
  async run(ctx, input) {
    const space = await targetSpace(ctx, input.space);
    if (!input.confirm_token) return preview(ctx, input, space);
    const refused = ctx.confirm.consume(input.confirm_token, { subject: ctx.subject, tool: TOOL, args: bindingArgs(input) });
    if (refused) throw new ToolError(refused, `The confirm_token does not work (${refused}); call ${TOOL} without it for a new preview.`);

    const { db, viewer, now } = ctx;
    const into = space ?? (await ensurePersonalSpace(db, viewer)).space;
    const created = await createDocument(
      db,
      viewer,
      { spaceId: into.id, collectionId: null, title: input.title, body: input.markdown, type: 'note', lang: input.lang ?? ctx.lang, planet: null },
      now(),
    );
    ctx.sync?.enqueue([created.id]);
    const doc = await keepTextPrivate({ config: ctx.config, db, now, sync: ctx.sync }, viewer, created.id, {});
    const [view] = await documentViews(ctx, [doc]);
    if (!view) throw new Error('saved note has no Space');
    return { saved: true, document: view };
  },
});
