/**
 * The claim checks of an OpenID Connect Back-Channel Logout 1.0 logout token (§2.6), once its signature is verified:
 * issued by our IdP for our client, recent, carrying the back-channel event and a `jti`, never a `nonce`, and naming
 * an IdP session (`sid`), an account (`sub`) or both.
 */
const BACKCHANNEL_EVENT = 'http://schemas.openid.net/event/backchannel-logout';
/** Tolerance for clock differences between the IdP and this server. */
const CLOCK_SKEW_S = 60;
/** A logout token older than this is refused (the spec leaves the window to the client). */
const LOGOUT_TOKEN_MAX_AGE_S = 5 * 60;

export interface LogoutClaims {
  sub: string | null;
  sid: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const text = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);

/** Whether the token is meant for `clientId` (OIDC Core §3.1.3.7 steps 3–5 for `aud` and `azp`). */
export function audienceIncludes(claims: Record<string, unknown>, clientId: string): boolean {
  const { aud, azp } = claims;
  if (aud === clientId) return azp === undefined || azp === clientId;
  return Array.isArray(aud) && aud.includes(clientId) && (aud.length === 1 || azp === clientId);
}

export function logoutClaims(claims: Record<string, unknown>, expect: { issuer: string; clientId: string }, nowMs: number): LogoutClaims | null {
  if (claims.iss !== expect.issuer || !audienceIncludes(claims, expect.clientId)) return null;
  const nowS = Math.floor(nowMs / 1000);
  if (typeof claims.iat !== 'number' || claims.iat - CLOCK_SKEW_S > nowS || nowS - claims.iat > LOGOUT_TOKEN_MAX_AGE_S) return null;
  if (typeof claims.exp === 'number' && claims.exp + CLOCK_SKEW_S <= nowS) return null;
  if (!text(claims.jti) || 'nonce' in claims) return null;
  if (!isRecord(claims.events) || !isRecord(claims.events[BACKCHANNEL_EVENT])) return null;
  const sub = text(claims.sub);
  const sid = text(claims.sid);
  return sub || sid ? { sub, sid } : null;
}
