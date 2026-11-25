/**
 * POST /mcp: kb's MCP endpoint for AI agents (docs/mcp.md), acting as the signed-in user with an access token of the
 * IdP whose `aud` is `{PUBLIC_URL}/mcp` (scopes `kb:read`, `kb:write`; never the admin API's `kf_admin_` tokens). Only
 * the `Authorization: Bearer` header authenticates: the session cookie and the same-origin check play no part, so the
 * router is mounted ahead of both. The token's `sub` is the kb account the web session of that IdP account uses.
 *
 * - 401 with a Bearer challenge naming the Protected Resource Metadata: no token, or an invalid one.
 * - 403 `insufficient_scope`: a token without a kb scope, or a tools/call of a tool whose scope it lacks (step-up).
 * - 429 `rate-limited`: more than `MCP_CALLS_PER_MINUTE` requests a minute from one account.
 * - 503 `mcp-unavailable` while sign-in is off; 503 `auth-unavailable` when the IdP's keys cannot be read.
 * - 405 for anything but POST (stateless: no server stream, no session to end); 400 for a batch or a non-JSON-RPC body.
 */
import express, { type NextFunction, type Request, type Response, type Router } from 'express';
import { eq } from 'drizzle-orm';
import { viewerFor } from '../access/viewer';
import { AccountBudget } from '../api/account-limit';
import type { IdpMetadata } from '../auth/idp-metadata';
import type { ServerConfig } from '../config';
import type { Db } from '../db/client';
import { users } from '../db/schema';
import type { IndexSync } from '../search/index-sync';
import type { LayeredSearchDeps } from '../search/layered-search';
import { type AccessToken, verifyAccessToken } from './access-token';
import { ConfirmTokens } from './confirm-token';
import { answer, jsonRpcRequestOf, rpcError, toolNamed } from './mcp-server';
import { MCP_PATH, mcpResourceOf, refuse, registerMetadataRoutes } from './resource-metadata';
import { KB_SCOPES, type ToolContext } from './tool-kit';

/** Requests per minute per account: an agent reads a few texts per question. */
export const MCP_CALLS_PER_MINUTE = 120;
/** A note may be as long as the editor allows (200 000 characters), in JSON. */
const MCP_BODY_LIMIT = '1mb';
const BEARER = /^Bearer +([A-Za-z0-9\-._~+/]+=*)$/i;

export interface McpRoutesOptions {
  config: ServerConfig;
  db: Db;
  now: () => Date;
  idp: IdpMetadata | null;
  search: LayeredSearchDeps;
  sync: IndexSync | null;
  /** Default: a key of this process (tests pass their own clock). */
  confirm?: ConfirmTokens;
}

export function mcpRoutes({ config, db, now, idp, search, sync, confirm = new ConfirmTokens(() => now().getTime()) }: McpRoutesOptions): Router {
  const router = express.Router();
  const budget = new AccountBudget(MCP_CALLS_PER_MINUTE, () => now().getTime());
  /** The verified token of each authenticated request, kept off `res.locals` so it stays typed. */
  const tokens = new WeakMap<Response, AccessToken>();
  registerMetadataRoutes(router, config);

  const authenticate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    res.set('Cache-Control', 'no-store');
    const origin = req.headers.origin;
    if (origin !== undefined && origin !== config.publicOrigin) {
      res.status(403).json({ error: 'forbidden-origin' });
      return;
    }
    if (!config.auth || !idp) {
      res.status(503).json({ error: 'mcp-unavailable', message: 'Sign-in is not configured on this server.' });
      return;
    }
    const header = req.headers.authorization;
    if (!header || !/^Bearer(?: |$)/i.test(header)) {
      refuse(res, config, { status: 401, scopes: KB_SCOPES });
      return;
    }
    const raw = BEARER.exec(header)?.[1];
    const check = raw ? await verifyAccessToken(idp, raw, { issuer: config.auth.issuer, resource: mcpResourceOf(config) }, now().getTime()) : { kind: 'invalid' as const };
    if (check.kind === 'unavailable') {
      res.set('Retry-After', '5').status(503).json({ error: 'auth-unavailable', message: 'Sign-in is not available yet; retry shortly.' });
      return;
    }
    if (check.kind === 'invalid') {
      refuse(res, config, { status: 401, error: 'invalid_token', description: 'The access token is invalid or expired.', scopes: KB_SCOPES });
      return;
    }
    const { token } = check;
    if (!KB_SCOPES.some((scope) => token.scopes.has(scope))) {
      refuse(res, config, { status: 403, error: 'insufficient_scope', description: 'The access token carries no kb scope.', scopes: KB_SCOPES });
      return;
    }
    if (!budget.take(`mcp:${token.subject}`, 1)) {
      res.set('Retry-After', '60').status(429).json({ error: 'rate-limited', message: 'Too many MCP requests; slow down.' });
      return;
    }
    tokens.set(res, token);
    next();
  };

  /** The tool context of the token's account; null when the IdP account has no live kb account. */
  async function contextOf(token: AccessToken): Promise<ToolContext | null> {
    const [row] = await db.select({ id: users.id, lang: users.lang }).from(users).where(eq(users.sub, token.subject));
    if (!row) return null;
    const viewer = await viewerFor(db, config.adminSubs, row.id);
    if (viewer.kind !== 'user') return null;
    return { db, config, now, subject: token.subject, viewer, lang: row.lang, search, sync, confirm };
  }

  router.all(MCP_PATH, authenticate, (req, res, next) => {
    if (req.method === 'POST') return next();
    res.set('Allow', 'POST').status(405).json({ error: 'method-not-allowed', message: 'This MCP server is stateless: POST one JSON-RPC message per request.' });
  });

  router.post(MCP_PATH, express.json({ limit: MCP_BODY_LIMIT }), async (req, res) => {
    const token = tokens.get(res);
    if (!token) throw new Error('mcp: request reached the handler unauthenticated');
    const body: unknown = req.body;
    if (Array.isArray(body)) {
      res.status(400).json(rpcError(null, -32600, 'Batches are not supported: send one JSON-RPC message per request.'));
      return;
    }
    const request = jsonRpcRequestOf(body);
    if (!request) {
      res.status(400).json(rpcError(null, -32600, 'The body must be one JSON-RPC 2.0 request.'));
      return;
    }
    const { id } = request;
    // A notification (no id) is taken and not answered.
    if (id === undefined) {
      res.status(202).end();
      return;
    }
    if (request.method === 'tools/call') {
      const tool = toolNamed(request.params.name);
      if (tool && !token.scopes.has(tool.scope)) {
        const scopes = KB_SCOPES.filter((scope) => scope === tool.scope || token.scopes.has(scope));
        refuse(res, config, { status: 403, error: 'insufficient_scope', description: `Tool ${tool.name} needs the ${tool.scope} scope.`, scopes });
        return;
      }
    }
    res.json(await answer({ ...request, id }, token.scopes, () => contextOf(token)));
  });

  return router;
}
