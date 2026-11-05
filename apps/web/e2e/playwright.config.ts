import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';
import { API_PORT, E2E_CLIENT_ID, E2E_CLIENT_SECRET, FAKE_IDP_PORT, OFFICE_EDITOR_ORIGIN, WEB_PORT } from './e2e-env';

const WEB_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER_DIR = path.resolve(WEB_DIR, '../server');

/**
 * Real web app (Vite) and real API (PGlite in memory) against a test-only IdP. Ports are fixed and the servers are
 * never reused, so a stale dev server fails the run instead of being tested by mistake.
 */
export default defineConfig({
  testDir: '.',
  outputDir: '../test-results',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${WEB_PORT}`, trace: 'retain-on-failure', locale: 'vi-VN', timezoneId: 'Asia/Ho_Chi_Minh' },
  projects: [
    { name: 'chromium', testIgnore: /parity\.spec\.ts/, use: { ...devices['Desktop Chrome'] } },
    {
      // Screens against the exported mock boards (design/mock-png): board size, no motion, the dark theme, 1× pixels.
      name: 'parity',
      testMatch: /parity\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: 'dark', reducedMotion: 'reduce' },
    },
  ],
  webServer: [
    {
      command: 'pnpm exec tsx e2e/fake-idp-server.ts',
      cwd: WEB_DIR,
      url: `http://127.0.0.1:${FAKE_IDP_PORT}/.well-known/openid-configuration`,
      reuseExistingServer: false,
    },
    {
      command: 'pnpm exec tsx src/server.ts',
      cwd: SERVER_DIR,
      url: `http://127.0.0.1:${API_PORT}/healthz`,
      reuseExistingServer: false,
      env: {
        NODE_ENV: 'test',
        PORT: String(API_PORT),
        PUBLIC_URL: `http://localhost:${WEB_PORT}`,
        PGLITE_DIR: 'memory',
        AUTH_ISSUER: `http://127.0.0.1:${FAKE_IDP_PORT}`,
        AUTH_CLIENT_ID: E2E_CLIENT_ID,
        AUTH_CLIENT_SECRET: E2E_CLIENT_SECRET,
        // The Office editor's origin, served by a stub page in the spec that needs it (office-offline.spec.ts).
        OFFICE_EDITOR_ORIGIN,
        // The mock's data, "Của bạn" content owned by the fake IdP's account (fake-idp-server.ts); Đạt is the admin.
        KB_SEED: 'mock', SEED_OWNER_SUB: 'e2e-account', ADMIN_SUBS: 'seed:dat',
      },
    },
    {
      command: `pnpm exec vite --port ${WEB_PORT} --strictPort`,
      cwd: WEB_DIR,
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: false,
      env: { KB_API_PORT: String(API_PORT) },
    },
  ],
});
