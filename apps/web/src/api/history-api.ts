/**
 * Versions and activity of a document (C17), from apps/server/src/api/history-routes.ts: the timeline, one version's
 * text, the difference between two versions, and restoring one. Errors (ApiError.code): `not-found` (404),
 * `hidden` / `no-access` (403: may not read it; for a restore, may not edit it), `locked` (403: waiting for review or
 * published), `stale` (409), `rate-limited` (429), `network` offline.
 */
import * as z from 'zod/mini';
import { getJson } from './api-client';
import { CollectionBriefSchema, SpaceBriefSchema } from './content-api';

const Time = z.iso.datetime({ offset: true });
export const ACTOR_ROLES = ['admin', 'reviewer', 'member'] as const;
export const REVIEW_ACTIONS = ['submitted', 'approved', 'changes_requested', 'rejected'] as const;
export const VERSION_VIAS = ['editor', 'api', 'import', 'restore', 'translation'] as const;

const ActorSchema = z.nullable(z.object({ name: z.nullable(z.string()), role: z.enum(ACTOR_ROLES) }));
export type HistoryActor = z.infer<typeof ActorSchema>;

const VersionEventSchema = z.object({
  kind: z.literal('version'),
  at: Time,
  actor: ActorSchema,
  version: z.number(),
  via: z.enum(VERSION_VIAS),
  aiMade: z.boolean(),
  summary: z.nullable(z.string()),
  restoredFrom: z.nullable(z.number()),
  /** By someone other than the author who is no admin ("Đề xuất sửa"). */
  proposal: z.boolean(),
});
const ReviewEventSchema = z.object({
  kind: z.literal('review'),
  at: Time,
  actor: ActorSchema,
  action: z.enum(REVIEW_ACTIONS),
  reason: z.nullable(z.string()),
  /** The version current at the time ("Duyệt phiên bản v4"). */
  version: z.nullable(z.number()),
});
const VisibilityEventSchema = z.object({ kind: z.literal('visibility'), at: Time, actor: ActorSchema, hidden: z.boolean() });

const HistoryEventSchema = z.discriminatedUnion('kind', [VersionEventSchema, ReviewEventSchema, VisibilityEventSchema]);
export type HistoryEvent = z.infer<typeof HistoryEventSchema>;
export type VersionEvent = z.infer<typeof VersionEventSchema>;

export const HistorySchema = z.object({
  document: z.object({
    id: z.string(),
    title: z.string(),
    status: z.string(),
    origin: z.string(),
    space: z.extend(SpaceBriefSchema, { kind: z.enum(['public', 'personal']) }),
    collection: z.nullable(CollectionBriefSchema),
  }),
  /** `full`: the author or an admin sees everything; `public`: another reader, the current version and approvals only. */
  scope: z.enum(['full', 'public']),
  /** The viewer may restore an earlier version. */
  canRestore: z.boolean(),
  currentVersion: z.number(),
  /** Newest first. */
  events: z.array(HistoryEventSchema),
});
export type DocumentHistory = z.infer<typeof HistorySchema>;

export const DIFF_OPS = ['same', 'add', 'del', 'gap'] as const;
export const DiffSchema = z.object({
  from: z.number(),
  to: z.number(),
  added: z.number(),
  removed: z.number(),
  lines: z.array(z.object({ op: z.enum(DIFF_OPS), text: z.string(), heading: z.boolean() })),
});
export type VersionDiff = z.infer<typeof DiffSchema>;

const VersionSchema = z.object({ version: z.number(), markdown: z.string(), savedAt: Time, editorName: z.nullable(z.string()) });
export type StoredVersion = z.infer<typeof VersionSchema>;

const docPath = (id: string): string => `/api/documents/${encodeURIComponent(id)}`;

export function fetchHistory(id: string): Promise<DocumentHistory> {
  return getJson(HistorySchema, `${docPath(id)}/history`);
}

export function fetchVersion(id: string, version: number): Promise<StoredVersion> {
  return getJson(VersionSchema, `${docPath(id)}/versions/${version}`);
}

export function fetchDiff(id: string, from: number, to: number): Promise<VersionDiff> {
  return getJson(DiffSchema, `${docPath(id)}/diff?${new URLSearchParams({ from: String(from), to: String(to) }).toString()}`);
}

export function restoreVersion(id: string, version: number): Promise<{ rev: string; version: number }> {
  return getJson(z.object({ rev: Time, version: z.number() }), `${docPath(id)}/versions/${version}/restore`, { method: 'POST' });
}
