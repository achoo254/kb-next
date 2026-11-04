// Signature check of a compact JWS (the IdP's ID tokens and logout tokens) against the IdP's published keys, with
// node:crypto only. Only the algorithms the account service signs with are accepted (ES256 by default, RS256 for a
// client that asks for it); `none`, HMAC and anything else are refused, so a token can never pick a weaker check.
import { createPublicKey, verify, type JsonWebKeyInput, type KeyObject } from 'node:crypto';

const ACCEPTED_ALGS = { ES256: { kty: 'EC', crv: 'P-256' }, RS256: { kty: 'RSA', crv: undefined } } as const;
type AcceptedAlg = keyof typeof ACCEPTED_ALGS;

/** One key of the IdP's JWKS, as published (only the members the checks read are typed). */
export interface Jwk {
  kty?: unknown;
  crv?: unknown;
  kid?: unknown;
  alg?: unknown;
  use?: unknown;
  [member: string]: unknown;
}

/** A compact JWS split and decoded; null when it is not one. */
export interface DecodedJws {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  signingInput: string;
  signature: Buffer;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function decodeJson(part: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
}

export function decodeJws(token: string): DecodedJws | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [rawHeader = '', rawPayload = '', rawSignature = ''] = parts;
  const header = decodeJson(rawHeader);
  const payload = decodeJson(rawPayload);
  if (!header || !payload || rawSignature === '') return null;
  return { header, payload, signingInput: `${rawHeader}.${rawPayload}`, signature: Buffer.from(rawSignature, 'base64url') };
}

function isAcceptedAlg(alg: unknown): alg is AcceptedAlg {
  return typeof alg === 'string' && Object.hasOwn(ACCEPTED_ALGS, alg);
}

function keyObject(jwk: Jwk): KeyObject | null {
  try {
    // Only the public members of an EC or RSA key; node:crypto refuses anything that is not a valid public key.
    const str = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);
    const input: JsonWebKeyInput = { key: { kty: str(jwk.kty), crv: str(jwk.crv), x: str(jwk.x), y: str(jwk.y), n: str(jwk.n), e: str(jwk.e) }, format: 'jwk' };
    return createPublicKey(input);
  } catch {
    return null;
  }
}

/** The keys of `keys` a token signed with `alg` and `kid` may have used (same type, curve, and kid when given). */
export function candidateKeys(keys: readonly Jwk[], alg: string, kid: unknown): Jwk[] {
  if (!isAcceptedAlg(alg)) return [];
  const shape = ACCEPTED_ALGS[alg];
  return keys.filter(
    (key) =>
      key.kty === shape.kty &&
      (shape.crv === undefined || key.crv === shape.crv) &&
      (key.use === undefined || key.use === 'sig') &&
      (key.alg === undefined || key.alg === alg) &&
      (typeof kid !== 'string' || key.kid === kid),
  );
}

/** Whether `jws` carries a valid signature by one of `keys`. */
export function verifyJws(jws: DecodedJws, keys: readonly Jwk[]): boolean {
  const alg = jws.header.alg;
  if (!isAcceptedAlg(alg)) return false;
  const data = Buffer.from(jws.signingInput);
  return candidateKeys(keys, alg, jws.header.kid).some((jwk) => {
    const key = keyObject(jwk);
    if (!key) return false;
    try {
      return alg === 'ES256'
        ? verify('sha256', data, { key, dsaEncoding: 'ieee-p1363' }, jws.signature)
        : verify('sha256', data, key, jws.signature);
    } catch {
      return false;
    }
  });
}
