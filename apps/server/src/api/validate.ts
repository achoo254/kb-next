/** Request input checked with zod at the boundary; a mismatch is a 400 with a stable code, never the zod message. */
import type { z } from 'zod';
import { HttpError } from '../http-error';

export function parseBody<T extends z.ZodType>(schema: T, body: unknown): z.infer<T> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new HttpError(400, 'invalid-body');
  return parsed.data;
}

export function parseQuery<T extends z.ZodType>(schema: T, query: unknown): z.infer<T> {
  const parsed = schema.safeParse(query);
  if (!parsed.success) throw new HttpError(400, 'invalid-query');
  return parsed.data;
}
