/**
 * The Copilot's address (C14 at /copilot): `q` a question to ask on opening, `scope` where to look
 * (`universe`, `space:<id or slug>`, `collection:<id>`, `document:<id>`), `from` the document whose page opened
 * Copilot (its "Mở từ" link and the scope chips Universe › Space › Collection › Tài liệu), `h` a question of the
 * history to show.
 */
import { type AskScope, SCOPE_KINDS, type ScopeKind } from '../api/copilot-api';
import { SHELL_PATHS } from '../layout/shell-paths';

export interface CopilotLink {
  question?: string;
  scope?: AskScope;
  from?: string;
  item?: string;
}

const ID = /^[A-Za-z0-9_-]{1,100}$/;

function isScopeKind(value: string): value is ScopeKind {
  return (SCOPE_KINDS as readonly string[]).includes(value);
}

export function scopeParam(scope: AskScope): string {
  return scope.kind === 'universe' || !scope.id ? 'universe' : `${scope.kind}:${scope.id}`;
}

/** The scope of a `scope` parameter; null for anything else (the page then asks in the whole Universe). */
export function parseScope(value: string | null): AskScope | null {
  if (!value) return null;
  if (value === 'universe') return { kind: 'universe' };
  const [kind = '', id = ''] = value.split(':');
  if (kind === 'universe' || !isScopeKind(kind) || !ID.test(id)) return null;
  return { kind, id };
}

export function sameScope(a: AskScope, b: AskScope): boolean {
  return a.kind === b.kind && (a.kind === 'universe' || a.id === b.id);
}

/** C14, asking `question` (if any) in `scope`. */
export function copilotHref(question?: string, options: Omit<CopilotLink, 'question'> = {}): string {
  const params = new URLSearchParams();
  if (question?.trim()) params.set('q', question.trim());
  if (options.scope && options.scope.kind !== 'universe') params.set('scope', scopeParam(options.scope));
  if (options.from) params.set('from', options.from);
  if (options.item) params.set('h', options.item);
  const query = params.toString();
  return query ? `${SHELL_PATHS.copilot}?${query}` : SHELL_PATHS.copilot;
}

export function readCopilotLink(search: string): CopilotLink {
  const params = new URLSearchParams(search);
  const question = params.get('q')?.trim() || undefined;
  const scope = parseScope(params.get('scope')) ?? undefined;
  const from = params.get('from') ?? undefined;
  const item = params.get('h') ?? undefined;
  return {
    question,
    scope,
    from: from && ID.test(from) ? from : undefined,
    item: item && ID.test(item) ? item : undefined,
  };
}
