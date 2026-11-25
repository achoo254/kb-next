/**
 * kb's MCP endpoint as an OAuth 2.1 resource server of the IdP: the resource `{PUBLIC_URL}/mcp` (the `aud` of every
 * accepted token, auth-next src/oidc/resources.ts), its Protected Resource Metadata (RFC 9728) and the Bearer challenge
 * of a refused request (RFC 6750 §3) pointing at it.
 */
import type { Response, Router } from 'express';
import type { ServerConfig } from '../config';
import { APP_NAME, KB_SCOPES } from './tool-kit';

export const MCP_PATH = '/mcp';
export const METADATA_PATH = '/.well-known/oauth-protected-resource';
/** RFC 9728 §3.1: the well-known path with the resource's path appended. */
export const MCP_METADATA_PATH = `${METADATA_PATH}${MCP_PATH}`;

export const mcpResourceOf = (config: ServerConfig): string => `${config.publicOrigin}${MCP_PATH}`;
export const metadataUrlOf = (config: ServerConfig): string => `${config.publicOrigin}${MCP_METADATA_PATH}`;

export function protectedResourceMetadata(config: ServerConfig, issuer: string) {
  return {
    resource: mcpResourceOf(config),
    authorization_servers: [issuer],
    scopes_supported: [...KB_SCOPES],
    bearer_methods_supported: ['header'],
    resource_name: `${APP_NAME} MCP`,
  };
}

/** Public and readable from any origin: clients discover it before they sign in. Absent (404) while sign-in is off. */
export function registerMetadataRoutes(router: Router, config: ServerConfig): void {
  for (const path of [METADATA_PATH, MCP_METADATA_PATH]) {
    router.options(path, (_req, res) => {
      res.set({ 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': '*' }).status(204).end();
    });
    router.get(path, (_req, res) => {
      if (!config.auth) {
        res.status(404).json({ error: 'not-found' });
        return;
      }
      res.set({ 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=300' }).json(protectedResourceMetadata(config, config.auth.issuer));
    });
  }
}

/** A quoted-string auth-param without the characters it cannot carry as is. */
const quoted = (value: string): string => `"${value.replace(/["\\]/g, '')}"`;

export interface Refusal {
  status: 401 | 403;
  /** Absent for a request without a token (RFC 6750 §3.1). */
  error?: 'invalid_token' | 'insufficient_scope';
  description?: string;
  /** What the client should ask the user for. */
  scopes: readonly string[];
}

/** Answers a refused request with its `WWW-Authenticate` challenge and a JSON body `{error, message}`. */
export function refuse(res: Response, config: ServerConfig, refusal: Refusal): void {
  const params: string[] = [];
  if (refusal.error) params.push(`error=${quoted(refusal.error)}`);
  if (refusal.error && refusal.description) params.push(`error_description=${quoted(refusal.description)}`);
  params.push(`scope=${quoted(refusal.scopes.join(' '))}`);
  params.push(`resource_metadata=${quoted(metadataUrlOf(config))}`);
  res.set('WWW-Authenticate', `Bearer ${params.join(', ')}`);
  res.status(refusal.status).json({ error: refusal.error ?? 'unauthenticated', message: refusal.description ?? 'A Bearer access token from the authorization server is required.' });
}
