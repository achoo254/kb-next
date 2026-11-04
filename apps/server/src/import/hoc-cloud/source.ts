/**
 * Where the importer reads Học Cloud from: its public API over HTTP (HOC_CLOUD_URL), or recorded answers in tests.
 * Every answer is JSON; a failed request stops the import before anything is written.
 */

export const DEFAULT_HOC_CLOUD_URL = 'https://hoc-cloud.inetdev.io.vn';

const REQUEST_TIMEOUT_MS = 20_000;
const ATTEMPTS = 3;

export interface HocCloudSource {
  /** Origin of the Học Cloud pages, for links back to them. */
  readonly baseUrl: string;
  /** The JSON answer of an API path such as `/api/labs` or `/api/labs/arp`. */
  getJson(apiPath: string): Promise<unknown>;
}

export class SourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SourceError';
  }
}

/** HOC_CLOUD_URL, validated: an http(s) origin without a trailing slash. */
export function hocCloudBaseUrl(value: string | undefined): string {
  const raw = value?.trim() || DEFAULT_HOC_CLOUD_URL;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new SourceError('HOC_CLOUD_URL is not a URL');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new SourceError('HOC_CLOUD_URL must be http(s)');
  return url.origin;
}

export function httpSource(baseUrl: string): HocCloudSource {
  return {
    baseUrl,
    async getJson(apiPath) {
      let lastError = 'no attempt';
      for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
        try {
          const res = await fetch(`${baseUrl}${apiPath}`, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
          // A 4xx will not change on retry.
          if (res.status >= 400 && res.status < 500) throw new SourceError(`GET ${apiPath} answered ${res.status}`);
          if (!res.ok) {
            lastError = `answered ${res.status}`;
          } else {
            try {
              return (await res.json()) as unknown;
            } catch {
              throw new SourceError(`GET ${apiPath} did not answer JSON`);
            }
          }
        } catch (error) {
          if (error instanceof SourceError) throw error;
          lastError = error instanceof Error && error.name === 'TimeoutError' ? 'timed out' : 'unreachable';
        }
        if (attempt < ATTEMPTS) await new Promise((resolve) => setTimeout(resolve, 1_000 * attempt));
      }
      throw new SourceError(`GET ${apiPath} failed after ${ATTEMPTS} attempts: ${lastError}`);
    },
  };
}
