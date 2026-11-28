/**
 * "Trí nhớ" (/memory) as typed calls: what the account's AI in Chat remembered (private notes in the "Trí nhớ"
 * Collection of the personal Space), its two switches, undoing the last save, and forgetting everything.
 *
 * Errors (ApiError.code): `sign-in-required` (401); undo: `undo-invalid`, `undo-expired`, `undo-used` (400),
 * `not-found` (404); `network` when the request got no answer.
 */
import * as z from 'zod/mini';
import { getJson } from './api-client';

const MemoryTopicSchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string(),
  updatedAt: z.iso.datetime({ offset: true }),
  /** Set when the topic belongs to one Chat conversation; null: general memory. */
  chatId: z.nullable(z.number()),
  url: z.string(),
});
export type MemoryTopic = z.infer<typeof MemoryTopicSchema>;

const MemorySettingsSchema = z.object({
  /** The AI neither saves nor reads memory. */
  paused: z.boolean(),
  /** Sensitive topics (health, religion, politics…) may be remembered too. */
  sensitive: z.boolean(),
});
export type MemorySettings = z.infer<typeof MemorySettingsSchema>;

const MemorySchema = z.object({ ...MemorySettingsSchema.shape, topics: z.array(MemoryTopicSchema) });
export type Memory = z.infer<typeof MemorySchema>;

const UndoSchema = z.object({ undone: z.literal(true), action: z.enum(['trashed', 'reverted']), documentId: z.string() });
export type MemoryUndo = z.infer<typeof UndoSchema>;

/** The memory topics, newest first, with the two switches. */
export function fetchMemory(): Promise<Memory> {
  return getJson(MemorySchema, '/api/memory');
}

export function saveMemorySettings(change: Partial<MemorySettings>): Promise<MemorySettings> {
  return getJson(MemorySettingsSchema, '/api/memory/settings', { method: 'PUT', body: JSON.stringify(change) });
}

/** Takes back the save an undo link names: a new topic goes to the trash, an added point is removed. */
export function undoMemory(token: string): Promise<MemoryUndo> {
  return getJson(UndoSchema, '/api/memory/undo', { method: 'POST', body: JSON.stringify({ token }) });
}

/** Moves every memory topic to the 30-day trash. */
export function forgetAllMemory(): Promise<{ trashed: number }> {
  return getJson(z.object({ trashed: z.number() }), '/api/memory', { method: 'DELETE' });
}
