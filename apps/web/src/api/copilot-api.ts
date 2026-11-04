/**
 * The Copilot (C14, F02, the C09 panel, C11's AI buttons) and AI translation (F04), from
 * apps/server/src/copilot/ask-routes.ts and translate-routes.ts, as typed calls. Asking and translating answer a
 * `text/event-stream`: `streamAsk` and `streamTranslation` yield its events, each checked against its schema (a
 * mismatch throws ApiError(BAD_RESPONSE)).
 *
 * Errors before the stream (ApiError.code): `sign-in-required` (401), `USER_KEYS_DISABLED` (503), `rate-limited`
 * (429: 20 a minute, asks and translations together), `invalid-body` (400), `NO_USER_KEY` (403: show "Mở Key riêng"),
 * `not-found` (404: a scope or document the reader cannot see), for translation also `hidden` / `no-access` (403),
 * `same-language` and `not-translatable` (400); `network` when the request got no answer (F02 "mất mạng", also when
 * the stream breaks: the reader throws ApiError(0, 'network')).
 *
 * In the stream, `error.code` maps to F02: `NO_ANSWER` "kho chưa có" (the provider was never called),
 * `USER_KEY_REJECTED` "key bị từ chối", `USER_KEY_NO_CREDIT` "hết credit", `PROVIDER_FAILED` and `INTERNAL`
 * "lỗi / thử lại" (keep the text already streamed). `status.jev === 'off'` is "chỉ theo từ khoá" (no `check` comes);
 * a `check` citation with `supported: false` is "trích dẫn không khả dụng".
 */
import * as z from 'zod/mini';
import { ApiError, BAD_RESPONSE, NETWORK_ERROR, apiFetch, getJson } from './api-client';
import { DOCUMENT_ORIGINS, DOCUMENT_STATUSES, LANGS } from './content-api';
import { AI_PROVIDERS } from './keys-api';

export const SCOPE_KINDS = ['universe', 'space', 'collection', 'document'] as const;
export type ScopeKind = (typeof SCOPE_KINDS)[number];
export const COPILOT_TASKS = ['answer', 'explain', 'summarize'] as const;
export type CopilotTask = (typeof COPILOT_TASKS)[number];
export const STREAM_ERRORS = ['NO_ANSWER', 'USER_KEY_REJECTED', 'USER_KEY_NO_CREDIT', 'PROVIDER_FAILED', 'INTERNAL'] as const;
export type StreamErrorCode = (typeof STREAM_ERRORS)[number];
/** The longest question and selection the server reads (characters). */
export const MAX_QUESTION_CHARS = 1000;
export const MAX_SELECTION_CHARS = 4000;

/** A Space by id or slug, a Collection or a document by id; the whole Universe without an id. */
export interface AskScope {
  kind: ScopeKind;
  id?: string;
}

export interface AskRequest {
  /** Required for `answer`; optional for `explain` and `summarize`. */
  question?: string;
  scope: AskScope;
  task?: CopilotTask;
  /** The reader's selected text: required for `explain` and `summarize`. */
  selection?: string;
}

const Provider = z.enum(AI_PROVIDERS);
const Time = z.iso.datetime({ offset: true });

export const SourceSchema = z.object({
  /** The number the answer cites as `[n]`. */
  n: z.number(),
  documentId: z.string(),
  /** Open `/d/<documentId>#<anchor>`. */
  anchor: z.string(),
  title: z.string(),
  section: z.nullable(z.string()),
  spaceName: z.string(),
  collectionName: z.nullable(z.string()),
  origin: z.enum(DOCUMENT_ORIGINS),
  status: z.enum(DOCUMENT_STATUSES),
});
export type CopilotSource = z.infer<typeof SourceSchema>;

const CitationSchema = z.object({ n: z.number(), supported: z.boolean() });
export type CitationCheck = z.infer<typeof CitationSchema>;

const StatusSchema = z.object({ stage: z.enum(['searching', 'writing']), jev: z.enum(['ok', 'off']), found: z.number() });
const ErrorSchema = z.object({ code: z.enum(STREAM_ERRORS), provider: z.optional(Provider), last4: z.optional(z.string()) });

/** One event of a stream whose event names and data schemas are `S`. */
type EventOf<S extends Record<string, z.ZodMiniType>> = { [K in keyof S & string]: { event: K; data: z.infer<S[K]> } }[keyof S & string];

const AskEventSchemas = {
  status: StatusSchema,
  sources: z.object({ sources: z.array(SourceSchema) }),
  delta: z.object({ text: z.string() }),
  check: z.object({ citations: z.array(CitationSchema) }),
  done: z.object({ questionId: z.string(), provider: Provider, model: z.string(), last4: z.string() }),
  error: ErrorSchema,
};
export type AskEvent = EventOf<typeof AskEventSchemas>;

const TranslateEventSchemas = {
  /** The text so far of paragraph `index` (0 is the `#` title); replace that paragraph with it. */
  paragraph: z.object({ index: z.number(), text: z.string() }),
  /** The saved draft: open `/d/<documentId>`. */
  done: z.object({ documentId: z.string() }),
  error: ErrorSchema,
};
export type TranslateEvent = EventOf<typeof TranslateEventSchemas>;

/** The raw events of an event-stream answer: `event:` name and the JSON of its `data:` line. */
async function* readEventStream(res: Response): AsyncGenerator<{ event: string; data: unknown }> {
  if (!res.body) throw new ApiError(res.status, BAD_RESPONSE);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const chunk = await reader.read().catch(() => {
        throw new ApiError(0, NETWORK_ERROR);
      });
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      let end = buffer.indexOf('\n\n');
      while (end !== -1) {
        const block = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const event = /^event: (.*)$/m.exec(block)?.[1];
        const data = /^data: (.*)$/m.exec(block)?.[1];
        if (event && data !== undefined) {
          let parsed: unknown;
          try {
            parsed = JSON.parse(data);
          } catch {
            throw new ApiError(res.status, BAD_RESPONSE);
          }
          yield { event, data: parsed };
        }
        end = buffer.indexOf('\n\n');
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/** Each event checked against the schema of its name; an unknown name is skipped (a newer server). */
async function* typedEvents<S extends Record<string, z.ZodMiniType>>(res: Response, schemas: S): AsyncGenerator<EventOf<S>> {
  for await (const { event, data } of readEventStream(res)) {
    if (!Object.hasOwn(schemas, event)) continue;
    const schema = schemas[event];
    const parsed = schema?.safeParse(data);
    if (!parsed?.success) throw new ApiError(res.status, BAD_RESPONSE);
    // The data passed the schema of its event name: TypeScript cannot pair the two by itself.
    yield { event, data: parsed.data } as EventOf<S>;
  }
}

/** Asks the Copilot; `signal` stops the answer (and the user's provider call) when the reader leaves. */
export async function* streamAsk(request: AskRequest, signal?: AbortSignal): AsyncGenerator<AskEvent> {
  const res = await apiFetch('/api/ask', { method: 'POST', body: JSON.stringify(request), signal });
  yield* typedEvents(res, AskEventSchemas);
}

/** Translates a document with the reader's key into `to`, saved as the reader's private draft. */
export async function* streamTranslation(documentId: string, to: (typeof LANGS)[number], signal?: AbortSignal): AsyncGenerator<TranslateEvent> {
  const res = await apiFetch(`/api/documents/${encodeURIComponent(documentId)}/translate`, { method: 'POST', body: JSON.stringify({ to }), signal });
  yield* typedEvents(res, TranslateEventSchemas);
}

const ScopeSchema = z.object({ kind: z.enum(SCOPE_KINDS), id: z.nullable(z.string()) });

export const HistorySchema = z.object({
  /** Newest first, the latest 50 (C14 groups them by today / yesterday). */
  items: z.array(z.object({ id: z.string(), task: z.enum(COPILOT_TASKS), question: z.string(), scope: ScopeSchema, createdAt: Time })),
});
export type CopilotHistory = z.infer<typeof HistorySchema>;

export const HistoryItemSchema = z.object({
  id: z.string(),
  task: z.enum(COPILOT_TASKS),
  question: z.string(),
  selection: z.nullable(z.string()),
  scope: ScopeSchema,
  answer: z.string(),
  /** `available: false`: the reader can no longer open that document (its title and names are blank). */
  sources: z.array(z.extend(SourceSchema, { available: z.boolean() })),
  /** null when Jev did not check the citations. */
  citations: z.nullable(z.array(CitationSchema)),
  provider: Provider,
  model: z.string(),
  createdAt: Time,
});
export type CopilotHistoryItem = z.infer<typeof HistoryItemSchema>;

export function fetchCopilotHistory(): Promise<CopilotHistory> {
  return getJson(HistorySchema, '/api/copilot/history');
}

export function fetchCopilotQuestion(id: string): Promise<CopilotHistoryItem> {
  return getJson(HistoryItemSchema, `/api/copilot/history/${encodeURIComponent(id)}`);
}
