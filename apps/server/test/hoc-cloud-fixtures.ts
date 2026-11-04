/**
 * Recorded Học Cloud API answers (test/fixtures/hoc-cloud/), served to the importer as if over HTTP. Recorded by
 * test/record-hoc-cloud.ts through the same redaction as a production run, so they hold no server address.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { HocCloudSource } from '../src/import/hoc-cloud/source';

export const HOC_CLOUD_FIXTURES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/hoc-cloud');
export const FIXTURE_BASE_URL = 'https://hoc-cloud.inetdev.io.vn';

/** `/api/labs` → `labs.json`, `/api/labs/arp` → `labs/arp.json`. */
export function fixtureFile(apiPath: string): string {
  const match = /^\/api\/(labs|exercises)(?:\/([a-z0-9-]+))?$/.exec(apiPath);
  if (!match?.[1]) throw new Error(`no fixture for ${apiPath}`);
  return match[2] ? `${match[1]}/${match[2]}.json` : `${match[1]}.json`;
}

/** A source over a fixture folder; `override` replaces answers by API path (a changed or broken payload). */
export function fixtureSource(dir: string = HOC_CLOUD_FIXTURES, override: Record<string, unknown> = {}): HocCloudSource {
  return {
    baseUrl: FIXTURE_BASE_URL,
    async getJson(apiPath) {
      if (apiPath in override) return structuredClone(override[apiPath]);
      return JSON.parse(await readFile(path.join(dir, fixtureFile(apiPath)), 'utf8')) as unknown;
    },
  };
}
