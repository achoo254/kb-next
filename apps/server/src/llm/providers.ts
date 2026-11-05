/**
 * The three text providers a user can bring a key for (OpenAI, Google Gemini, Anthropic Claude): the short model list
 * of each (the first is the default, cheap and fast), how a key is sent, and what a failed call means. The server has
 * no AI key of its own: every call here runs on a user's key (src/user-keys/).
 */
import { aiProvider } from '../db/schema';

export const AI_PROVIDERS = aiProvider.enumValues;
export type AiProvider = (typeof AI_PROVIDERS)[number];

export interface ModelInfo {
  id: string;
  label: string;
}

/** Each provider's models, default first (same list as Scribe's own-key text models). */
export const MODELS: Record<AiProvider, readonly [ModelInfo, ...ModelInfo[]]> = {
  openai: [
    { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini' },
    { id: 'gpt-4.1-nano', label: 'GPT-4.1 nano (rẻ hơn)' },
  ],
  gemini: [
    { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash' },
    { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite (rẻ hơn)' },
  ],
  anthropic: [
    { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5' },
    { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 (tốt hơn, đắt hơn)' },
  ],
};

export function defaultModel(provider: AiProvider): string {
  return MODELS[provider][0].id;
}

/** The app's models a key may call: those of `allowed` (in the app's order), or all of them while unknown (null). */
export function modelsFor(provider: AiProvider, allowed: readonly string[] | null): ModelInfo[] {
  return allowed === null ? [...MODELS[provider]] : MODELS[provider].filter((m) => allowed.includes(m.id));
}

/** API origins; tests point them at local fake servers. */
export interface ProviderBases {
  openai: string;
  gemini: string;
  anthropic: string;
}

export const LIVE_BASES: ProviderBases = {
  openai: 'https://api.openai.com',
  gemini: 'https://generativelanguage.googleapis.com',
  anthropic: 'https://api.anthropic.com',
};

/** The Anthropic API version every example of the Messages docs sends. */
export const ANTHROPIC_VERSION = '2023-06-01';

/** The key travels in a header only, never in a URL. */
export function authHeaders(provider: AiProvider, apiKey: string): Record<string, string> {
  switch (provider) {
    case 'openai':
      return { Authorization: `Bearer ${apiKey}` };
    case 'gemini':
      return { 'x-goog-api-key': apiKey };
    case 'anthropic':
      return { 'x-api-key': apiKey, 'anthropic-version': ANTHROPIC_VERSION };
  }
}

/**
 * What a failed call says about the key: `rejected` (wrong, revoked, missing permission), `no-credit` (the account
 * behind it is out of credit or out of its daily quota) or `failed` (anything else: overload, outage, bad request).
 */
export type Failure = 'rejected' | 'no-credit' | 'failed';

/**
 * Gemini 429 RESOURCE_EXHAUSTED for a daily quota (a QuotaFailure whose quotaId says PerDay) or a spend limit: waiting
 * a minute does not help, so it counts as no credit. A per-minute 429 is a plain failure.
 */
function geminiQuotaExhausted(lower: string): boolean {
  return (lower.includes('quotafailure') && lower.includes('perday')) || (lower.includes('spend') && lower.includes('limit'));
}

/** Classifies an error answer; `body` is read only for the provider's error codes and never logged or returned. */
export function classifyFailure(provider: AiProvider, status: number, body: string): Failure {
  const lower = body.toLowerCase();
  if (status === 402) return 'no-credit';
  switch (provider) {
    case 'openai':
      if (lower.includes('insufficient_quota') && (status === 429 || status === 401 || status === 403)) return 'no-credit';
      if (status === 401 || status === 403) return 'rejected';
      return 'failed';
    case 'gemini':
      if (status === 401 || status === 403) return 'rejected';
      if (status === 400 && (lower.includes('api_key_invalid') || lower.includes('api key not valid'))) return 'rejected';
      if (status === 429 && geminiQuotaExhausted(lower)) return 'no-credit';
      return 'failed';
    case 'anthropic':
      if (status === 401 || status === 403) return 'rejected';
      // "Your credit balance is too low to access the Anthropic API" comes as a 400 invalid_request_error.
      if (lower.includes('credit balance')) return 'no-credit';
      return 'failed';
  }
}
