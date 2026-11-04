import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { brandAssets } from './vite-brand.ts';

/** The API in dev (apps/server, `pnpm dev`; KB_API_PORT for an E2E run on shifted ports); production puts nginx in front of both. */
const API = `http://127.0.0.1:${process.env.KB_API_PORT ?? '5320'}`;
const PROXY = { '/api': API, '/auth': API, '/healthz': API };

export default defineConfig({
  plugins: [react(), brandAssets()],
  server: { port: 5321, strictPort: true, proxy: PROXY },
  preview: { port: 5321, strictPort: true, proxy: PROXY },
  build: {
    target: 'es2022',
    // Fonts stay as files: the CSP (font-src 'self') refuses data: fonts, so an inlined font subset would silently
    // fall back to a system font.
    assetsInlineLimit: (file) => (/\.(woff2?|ttf|otf)$/.test(file) ? false : undefined),
    sourcemap: true,
  },
});
