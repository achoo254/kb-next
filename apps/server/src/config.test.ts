import { describe, expect, it } from 'vitest';
import { loadConfig } from './config';

const SECRET = 's'.repeat(40);

describe('server config', () => {
  it('runs in dev with defaults: PGlite, sign-in off', () => {
    const config = loadConfig({});
    expect(config).toMatchObject({ nodeEnv: 'development', port: 5320, publicOrigin: 'http://localhost:5321', databaseUrl: undefined, auth: null });
  });

  it('derives the callback from PUBLIC_URL', () => {
    const config = loadConfig({ PUBLIC_URL: 'https://kb.hoandat.com', AUTH_CLIENT_SECRET: SECRET });
    expect(config.auth).toEqual({
      issuer: 'https://auth.hoandat.com',
      clientId: 'kb-web',
      clientSecret: SECRET,
      redirectUri: 'https://kb.hoandat.com/auth/callback',
    });
  });

  it('takes the development client id from AUTH_CLIENT_ID', () => {
    expect(loadConfig({ AUTH_CLIENT_ID: 'kb-web-dev', AUTH_CLIENT_SECRET: SECRET }).auth).toMatchObject({
      clientId: 'kb-web-dev',
      redirectUri: 'http://localhost:5321/auth/callback',
    });
  });

  it('requires Postgres, sign-in, search and https in production', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(/DATABASE_URL, AUTH_CLIENT_SECRET, MEILI_URL, MEILI_MASTER_KEY/);
    const prod = {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgres://kb@127.0.0.1/kb',
      AUTH_CLIENT_SECRET: SECRET,
      MEILI_URL: 'http://127.0.0.1:7700',
      MEILI_MASTER_KEY: SECRET,
    };
    expect(() => loadConfig({ ...prod, PUBLIC_URL: 'http://kb.hoandat.com' })).toThrow(/https/);
    expect(() => loadConfig({ ...prod, PUBLIC_URL: 'https://kb.hoandat.com', PGLITE_DIR: 'memory' })).toThrow(/PGLITE_DIR/);
    expect(loadConfig({ ...prod, PUBLIC_URL: 'https://kb.hoandat.com' }).auth?.redirectUri).toBe('https://kb.hoandat.com/auth/callback');
  });

  it('accepts a plain-http issuer only on loopback outside production', () => {
    expect(loadConfig({ AUTH_ISSUER: 'http://127.0.0.1:5325', AUTH_CLIENT_SECRET: SECRET }).auth?.issuer).toBe('http://127.0.0.1:5325');
    expect(() => loadConfig({ AUTH_ISSUER: 'http://auth.example', AUTH_CLIENT_SECRET: SECRET })).toThrow(/AUTH_ISSUER/);
  });

  it('rejects a short secret and disabled TLS checks, without echoing the secret', () => {
    expect(() => loadConfig({ AUTH_CLIENT_SECRET: 'short-secret-value' })).toThrow(/AUTH_CLIENT_SECRET/);
    expect(() => loadConfig({ AUTH_CLIENT_SECRET: 'short-secret-value' })).not.toThrow(/short-secret-value/);
    expect(() => loadConfig({ AUTH_CLIENT_SECRET: SECRET, NODE_TLS_REJECT_UNAUTHORIZED: '0' })).toThrow(/TLS/);
  });

  it('reads the admins from ADMIN_SUBS, none by default', () => {
    expect(loadConfig({}).adminSubs.size).toBe(0);
    expect([...loadConfig({ ADMIN_SUBS: ' sub-a , ,sub-b' }).adminSubs]).toEqual(['sub-a', 'sub-b']);
  });

  it('turns search on only with both MEILI_URL and MEILI_MASTER_KEY, without echoing the key', () => {
    expect(loadConfig({}).meili).toBeNull();
    expect(loadConfig({ MEILI_URL: 'http://127.0.0.1:5322/', MEILI_MASTER_KEY: SECRET }).meili).toEqual({
      url: 'http://127.0.0.1:5322',
      apiKey: SECRET,
      indexPrefix: '',
    });
    expect(() => loadConfig({ MEILI_URL: 'http://127.0.0.1:5322' })).toThrow(/go together/);
    expect(() => loadConfig({ MEILI_MASTER_KEY: SECRET })).toThrow(/go together/);
    expect(() => loadConfig({ MEILI_URL: 'http://127.0.0.1:5322', MEILI_MASTER_KEY: 'short-key' })).toThrow(/MEILI_MASTER_KEY/);
    expect(() => loadConfig({ MEILI_URL: 'http://127.0.0.1:5322', MEILI_MASTER_KEY: 'short-key' })).not.toThrow(/short-key/);
  });

  it('turns Jev on only with TYPESAFE_API_KEY, in any environment', () => {
    expect(loadConfig({}).typesafeApiKey).toBeNull();
    expect(loadConfig({ TYPESAFE_API_KEY: '' }).typesafeApiKey).toBeNull();
    expect(loadConfig({ TYPESAFE_API_KEY: 'ts-key-123456' }).typesafeApiKey).toBe('ts-key-123456');
  });

  it('loads the mock seed at startup only with KB_SEED=mock, never in production', () => {
    expect(loadConfig({}).startupSeed).toBeNull();
    expect(loadConfig({ KB_SEED: 'mock' }).startupSeed).toEqual({ ownerSub: 'seed:dat' });
    expect(loadConfig({ KB_SEED: 'mock', SEED_OWNER_SUB: 'e2e-account' }).startupSeed).toEqual({ ownerSub: 'e2e-account' });
    expect(() => loadConfig({ KB_SEED: 'real' })).toThrow(/KB_SEED/);
    const production = {
      NODE_ENV: 'production',
      PUBLIC_URL: 'https://kb.example',
      DATABASE_URL: 'postgres://kb@127.0.0.1/kb',
      AUTH_CLIENT_SECRET: SECRET,
      MEILI_URL: 'http://127.0.0.1:5322',
      MEILI_MASTER_KEY: SECRET,
    };
    expect(() => loadConfig(production)).not.toThrow();
    expect(() => loadConfig({ ...production, KB_SEED: 'mock' })).toThrow(/KB_SEED is dev\/test only/);
  });

  it('keeps PGlite in memory for `memory`, else in the given directory', () => {
    expect(loadConfig({ PGLITE_DIR: 'memory' }).pgliteDir).toBeNull();
    expect(loadConfig({ PGLITE_DIR: '/tmp/x' }).pgliteDir).toBe('/tmp/x');
  });
});
