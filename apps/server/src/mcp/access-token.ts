/**
 * The IdP's access tokens for kb's MCP resource (RFC 9068 JWTs, auth-next docs/integration-guide.md §3): ES256 only,
 * `typ: at+jwt` (an ID token or a logout token never passes), issued by our IdP for exactly `{PUBLIC_URL}/mcp`, not
 * expired, with a `sub`. The signature is checked against the IdP's JWKS by auth/idp-metadata.ts; this file reads the
 * header and the claims. A token is never logged.
 */
import type { IdpMetadata } from '../auth/idp-metadata';
import { decodeJws } from '../auth/jws-verify';

/** Tolerance for clock differences between the IdP and this server. */
const CLOCK_SKEW_S = 30;
const MAX_SUBJECT_CHARS = 255;
const ACCESS_TOKEN_TYPES = new Set(['at+jwt', 'application/at+jwt']);

/** A verified access token: who it acts for, with which scopes. */
export interface AccessToken {
  subject: string;
  /** The OAuth client the user approved (`tunelo-agent`); empty when the token names none. */
  clientId: string;
  scopes: ReadonlySet<string>;
}

/** Why a token is refused: `invalid` answers 401 `invalid_token`, `unavailable` 503 (the IdP's keys are unreachable). */
export type TokenCheck = { kind: 'ok'; token: AccessToken } | { kind: 'invalid' } | { kind: 'unavailable' };

function audienceHolds(aud: unknown, resource: string): boolean {
  return aud === resource || (Array.isArray(aud) && aud.includes(resource));
}

/** The claims' `scope` (space-separated, RFC 9068 §2.2.3); absent is none, anything but a string is refused. */
function scopesOf(scope: unknown): Set<string> | null {
  if (scope === undefined) return new Set();
  if (typeof scope !== 'string') return null;
  return new Set(scope.split(' ').filter((s) => s !== ''));
}

/** Checks `raw` as an access token for `resource` issued by `issuer`. */
export async function verifyAccessToken(idp: IdpMetadata, raw: string, expect: { issuer: string; resource: string }, nowMs: number): Promise<TokenCheck> {
  const jws = decodeJws(raw);
  if (!jws || jws.header.alg !== 'ES256') return { kind: 'invalid' };
  const typ = jws.header.typ;
  if (typeof typ !== 'string' || !ACCESS_TOKEN_TYPES.has(typ.toLowerCase())) return { kind: 'invalid' };
  let claims: Record<string, unknown> | null;
  try {
    claims = await idp.verifiedPayload(raw);
  } catch {
    return { kind: 'unavailable' };
  }
  if (!claims) return { kind: 'invalid' };
  if (claims.iss !== expect.issuer || !audienceHolds(claims.aud, expect.resource)) return { kind: 'invalid' };
  const nowS = Math.floor(nowMs / 1000);
  if (typeof claims.exp !== 'number' || claims.exp + CLOCK_SKEW_S <= nowS) return { kind: 'invalid' };
  if (typeof claims.nbf === 'number' && claims.nbf - CLOCK_SKEW_S > nowS) return { kind: 'invalid' };
  const { sub } = claims;
  if (typeof sub !== 'string' || sub === '' || sub.length > MAX_SUBJECT_CHARS) return { kind: 'invalid' };
  const scopes = scopesOf(claims.scope);
  if (!scopes) return { kind: 'invalid' };
  const clientId = typeof claims.client_id === 'string' ? claims.client_id : '';
  return { kind: 'ok', token: { subject: sub, clientId, scopes } };
}
