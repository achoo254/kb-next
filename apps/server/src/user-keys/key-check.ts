/**
 * Checks a key when it is saved, with one call that costs no credit: `GET /v1/models` (OpenAI, Anthropic),
 * `GET /v1beta/models` (Gemini). The same answer lists the models the key may call (a project can be limited to some),
 * so the app offers only those. The key goes in a header only; the provider's message is never logged or returned
 * (it may name the account).
 */
import { type AiProvider, MODELS, type ProviderBases, authHeaders, classifyFailure } from '../llm/providers';

export type KeyVerdict = 'valid' | 'rejected' | 'no-credit' | 'unreachable';

export interface KeyCheck {
  verdict: KeyVerdict;
  /**
   * For a valid key, the app's models (MODELS) the provider lists for it, in the app's order; null when the answer
   * names no model at all (unknown: every model stays offered and a call that finds none drops it then).
   */
  models: string[] | null;
}

const CHECK_TIMEOUT_MS = 15_000;

/** A key's shape: one run of 20–300 printable ASCII characters; OpenAI keys start with `sk-` (not `sk-ant-`). */
export function keyFormatOk(provider: AiProvider, key: string): boolean {
  if (!/^[\x21-\x7e]{20,300}$/.test(key)) return false;
  if (provider === 'openai') return key.startsWith('sk-') && !key.startsWith('sk-ant-');
  return true;
}

function checkUrl(bases: ProviderBases, provider: AiProvider): string {
  switch (provider) {
    case 'openai':
      return `${bases.openai}/v1/models`;
    case 'gemini':
      return `${bases.gemini}/v1beta/models?pageSize=1000`;
    case 'anthropic':
      return `${bases.anthropic}/v1/models?limit=1000`;
  }
}

/** Model ids in a models listing: `data[].id` (OpenAI, Anthropic) or `models[].name` as `models/<id>` (Gemini). */
export function listedIds(body: string): string[] {
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return [];
  }
  if (typeof json !== 'object' || json === null) return [];
  const ids: string[] = [];
  for (const field of ['data', 'models'] as const) {
    const items: unknown = (json as Record<string, unknown>)[field];
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      if (typeof item !== 'object' || item === null) continue;
      const id: unknown = (item as Record<string, unknown>).id ?? (item as Record<string, unknown>).name;
      if (typeof id === 'string') ids.push(id.replace(/^models\//, ''));
    }
  }
  return ids;
}

/** The app's models of `provider` that `listed` contains; null when the listing named no model. */
export function allowedModels(provider: AiProvider, listed: readonly string[]): string[] | null {
  if (listed.length === 0) return null;
  const have = new Set(listed);
  return MODELS[provider].map((m) => m.id).filter((id) => have.has(id));
}

export async function checkKey(bases: ProviderBases, provider: AiProvider, key: string): Promise<KeyCheck> {
  let res: Response;
  try {
    res = await fetch(checkUrl(bases, provider), { headers: authHeaders(provider, key), signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) });
  } catch {
    return { verdict: 'unreachable', models: null };
  }
  const body = await res.text().catch(() => '');
  if (res.ok) return { verdict: 'valid', models: allowedModels(provider, listedIds(body)) };
  const failure = classifyFailure(provider, res.status, body);
  if (failure === 'failed') {
    console.error(JSON.stringify({ event: 'user-key-check', provider, status: res.status, outcome: 'unreachable' }));
    return { verdict: 'unreachable', models: null };
  }
  return { verdict: failure, models: null };
}
