/**
 * Confirm tokens of the MCP tools that write (two calls, like Chat's MCP): the first call answers a preview and a
 * token bound to the caller, the tool and the exact arguments; the second call presents it to do the change. A token
 * lives 5 minutes and works once. The key and the spent nonces are kept in this process (kb runs one server process,
 * infra/kb-server.service): a restart only makes pending previews fail, and the agent previews again.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const CONFIRM_TOKEN_TTL_MS = 5 * 60 * 1000;
const VERSION = 'v1';

export type ConfirmFailure = 'confirm_token_invalid' | 'confirm_token_expired' | 'confirm_token_used';

export interface IssuedConfirmToken {
  token: string;
  expiresAt: Date;
}

/** What a token is bound to. `args` must be the tool's input without its `confirm_token`, its keys in a fixed order. */
export interface ConfirmBinding {
  subject: string;
  tool: string;
  args: Record<string, unknown>;
}

export class ConfirmTokens {
  private readonly key: Buffer;
  /** Spent nonce → its expiry (ms). */
  private readonly used = new Map<string, number>();

  constructor(
    private readonly now: () => number = Date.now,
    key: Buffer = randomBytes(32),
  ) {
    this.key = key;
  }

  issue(binding: ConfirmBinding): IssuedConfirmToken {
    const expiresAt = this.now() + CONFIRM_TOKEN_TTL_MS;
    const exp = expiresAt.toString(36);
    const nonce = randomBytes(16).toString('base64url');
    return { token: `${VERSION}.${exp}.${nonce}.${this.mac(exp, nonce, binding).toString('base64url')}`, expiresAt: new Date(expiresAt) };
  }

  /** Spends `token` for `binding`; null when accepted, else why it was refused. */
  consume(token: string, binding: ConfirmBinding): ConfirmFailure | null {
    const parts = token.split('.');
    const [version, exp = '', nonce = '', signature = ''] = parts;
    if (parts.length !== 4 || version !== VERSION || nonce === '') return 'confirm_token_invalid';
    const given = Buffer.from(signature, 'base64url');
    const expected = this.mac(exp, nonce, binding);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return 'confirm_token_invalid';
    const expiresAt = Number.parseInt(exp, 36);
    if (!Number.isSafeInteger(expiresAt)) return 'confirm_token_invalid';
    const at = this.now();
    for (const [spent, until] of this.used) if (until <= at) this.used.delete(spent);
    if (expiresAt <= at) return 'confirm_token_expired';
    if (this.used.has(nonce)) return 'confirm_token_used';
    this.used.set(nonce, expiresAt);
    return null;
  }

  private mac(exp: string, nonce: string, { subject, tool, args }: ConfirmBinding): Buffer {
    return createHmac('sha256', this.key)
      .update(JSON.stringify([VERSION, exp, nonce, subject, tool, args]))
      .digest();
  }
}
