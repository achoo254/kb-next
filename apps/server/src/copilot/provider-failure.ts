/**
 * A user's provider refusing a call midway through an answer or a translation: the key is marked (rejected →
 * `invalid`, out of credit → `quota`; only the saved version that was used) and the stream ends with the matching
 * `error` event (F02 C, D, H). The turn never moves to another key or provider. Logged without the key.
 */
import type { ProviderError } from '../llm/stream-text';
import { safeErrorText } from '../log-error';
import type { OpenedKey, UserKeyStore } from '../user-keys/key-store';

export type ProviderErrorCode = 'USER_KEY_REJECTED' | 'USER_KEY_NO_CREDIT' | 'MODEL_UNAVAILABLE' | 'PROVIDER_FAILED';

export interface ProviderErrorEvent {
  code: ProviderErrorCode;
  provider: OpenedKey['provider'];
  last4: string;
}

export async function reportProviderFailure(keys: UserKeyStore, userId: string, key: OpenedKey, error: ProviderError): Promise<ProviderErrorEvent> {
  console.error(JSON.stringify({ event: 'provider-failure', provider: key.provider, model: key.model, kind: error.kind, status: error.status }));
  const status = error.kind === 'rejected' ? 'invalid' : error.kind === 'no-credit' ? 'quota' : null;
  if (status) {
    // The user must still learn why the turn stopped when the database fails to record it.
    try {
      await keys.mark(userId, key.provider, key.nonce, status);
    } catch (markError) {
      console.error('could not mark the key after a provider failure', safeErrorText(markError));
    }
  }
  return { code: errorCode(error), provider: key.provider, last4: key.last4 };
}

/**
 * A 404 from the provider means the chosen model is not there for this key (a project without access to it, or a
 * model the provider retired): the key itself works, so it is not marked and the user is told to pick another model.
 */
function errorCode(error: ProviderError): ProviderErrorCode {
  if (error.kind === 'rejected') return 'USER_KEY_REJECTED';
  if (error.kind === 'no-credit') return 'USER_KEY_NO_CREDIT';
  return error.status === 404 ? 'MODEL_UNAVAILABLE' : 'PROVIDER_FAILED';
}
