/**
 * Checks a key when it is saved, with one call that costs no credit: `GET /v1/models` (OpenAI, Anthropic),
 * `GET /v1beta/models` (Gemini). The key goes in a header only; the provider's message is never logged or returned
 * (it may name the account).
 */
import { type AiProvider, type ProviderBases, authHeaders, classifyFailure } from '../llm/providers';

export type KeyVerdict = 'valid' | 'rejected' | 'no-credit' | 'unreachable';

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
      return `${bases.gemini}/v1beta/models?pageSize=1`;
    case 'anthropic':
      return `${bases.anthropic}/v1/models?limit=1`;
  }
}

export async function checkKey(bases: ProviderBases, provider: AiProvider, key: string): Promise<KeyVerdict> {
  let res: Response;
  try {
    res = await fetch(checkUrl(bases, provider), { headers: authHeaders(provider, key), signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) });
  } catch {
    return 'unreachable';
  }
  const body = await res.text().catch(() => '');
  if (res.ok) return 'valid';
  const failure = classifyFailure(provider, res.status, body);
  if (failure === 'failed') {
    console.error(JSON.stringify({ event: 'user-key-check', provider, status: res.status, outcome: 'unreachable' }));
    return 'unreachable';
  }
  return failure;
}
