/**
 * `pnpm check:public`: this repository is public, so no server address, SSH port or server user may land in it
 * (runbooks use placeholders such as `<SERVER_IP>` and `<SSH_PORT>`). check:brand does not look for these.
 *
 * Fails on, in every text file of the repository:
 * - an IPv4 address other than loopback, 0.0.0.0, netmasks (255.x), the documentation ranges (RFC 5737) and
 *   192.168.1.0/24 (the example home network the mock's DHCP walkthrough uses); a spec section written `§3.1.3.7`
 *   is not an address;
 * - an SSH port or login written out (`ssh -p 2222`, `Port 2222`, `ssh user@host`).
 *
 * Imported lessons (LESSON_DIRS) may also keep the addresses they teach with (subnet exercises, public resolvers,
 * Pod networks): the list the importer redacts against, apps/server/src/import/hoc-cloud/teaching-addresses.ts.
 *
 * The patterns are generic on purpose: naming the real addresses here would publish them.
 */
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isTeachingAddress } from '../apps/server/src/import/hoc-cloud/teaching-addresses';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.data', 'test-results', 'playwright-report', 'generated', '.claude']);
const TEXT_FILES = /\.(ts|tsx|js|mjs|cjs|json|md|html|css|yml|yaml|txt|conf|service|sh|sql|example|toml)$/;

// Not after `section-` either: `rfc1122#section-3.2.1.7` is a spec section in a URL. The `/prefix` is kept for lessons.
const IPV4 = /(?<![\d.§]|section-)(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?![\d.])(?:\/(\d{1,2})(?!\d))?/g;
/** Imported lesson content and its recorded source (relative paths, `/` separated). */
const LESSON_DIRS = ['content/', 'apps/server/test/fixtures/hoc-cloud/'];
const SSH_PATTERNS = [/\bssh\s+(?:-\w+\s+)*-p\s*\d{2,5}\b/, /^\s*Port\s+\d{2,5}\s*$/m, /\bssh\s+(?:-\w+\s+\S+\s+)*[\w.-]+@[\w.-]+/];

/** Addresses that say nothing about a real server. */
export function isHarmlessIpv4(octets: readonly number[]): boolean {
  const [a, b, c] = octets;
  if (octets.some((n) => n > 255)) return true; // not an address (a version number, a date…)
  if (a === 127 || a === 255 || (a === 0 && b === 0)) return true;
  if ((a === 192 && b === 0 && c === 2) || (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113)) return true;
  return a === 192 && b === 168 && c === 1;
}

export interface Finding {
  file: string;
  line: number;
  match: string;
}

export function findPublicInfo(source: string, file: string): Finding[] {
  const findings: Finding[] = [];
  const lesson = LESSON_DIRS.some((dir) => file.split(path.sep).join('/').startsWith(dir));
  source.split(/\r?\n/).forEach((text, index) => {
    for (const m of text.matchAll(IPV4)) {
      const octets = m.slice(1, 5).map(Number);
      if (isHarmlessIpv4(octets)) continue;
      if (lesson && isTeachingAddress(octets, m[5] === undefined ? null : Number(m[5]))) continue;
      findings.push({ file, line: index + 1, match: m[0] });
    }
    for (const pattern of SSH_PATTERNS) {
      const m = pattern.exec(text);
      if (m) findings.push({ file, line: index + 1, match: m[0] });
    }
  });
  return findings;
}

async function textFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return SKIP_DIRS.has(entry.name) ? [] : textFiles(full);
      return TEXT_FILES.test(entry.name) || entry.name.startsWith('.env') ? [full] : [];
    }),
  );
  return nested.flat();
}

/** This guard, its test and the lesson allowlist spell out what they look for. */
const SELF = new Set(['scripts/check-public-info.ts', 'scripts/check-public-info.test.ts', 'apps/server/src/import/hoc-cloud/teaching-addresses.ts']);

async function main(): Promise<number> {
  const files = (await textFiles(ROOT)).filter((file) => path.basename(file) !== '.env' && !SELF.has(path.relative(ROOT, file)));
  const findings = (await Promise.all(files.map(async (file) => findPublicInfo(await readFile(file, 'utf8'), path.relative(ROOT, file))))).flat();
  if (findings.length === 0) {
    console.log(`✓ No server address or SSH detail in ${files.length} text files`);
    return 0;
  }
  console.error(`✗ ${findings.length} server detail(s) in a public repository (use a placeholder such as <SERVER_IP>):`);
  for (const f of findings) console.error(`  ${f.file}:${f.line}  ${f.match}`);
  return 1;
}

// Run as a script, not when a test imports it.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      console.error('check:public crashed:', error);
      process.exitCode = 1;
    },
  );
}
