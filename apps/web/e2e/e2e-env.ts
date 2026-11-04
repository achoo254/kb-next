/**
 * Ports and the test client secret of the E2E run (never a real secret); the API and web ports are the dev ones.
 * KB_E2E_PORT_OFFSET shifts all three, so two runs (two worktrees, two agents) can go side by side.
 */
const OFFSET = Number(process.env.KB_E2E_PORT_OFFSET ?? 0);
export const FAKE_IDP_PORT = 5325 + OFFSET;
export const API_PORT = 5320 + OFFSET;
export const WEB_PORT = 5321 + OFFSET;
export const E2E_CLIENT_ID = 'kb-web';
export const E2E_CLIENT_SECRET = 'e2e-only-client-secret-not-a-real-one-000';
