/**
 * The MCP write tools never store a secret: kb keeps notes, not credentials. A text that holds something shaped like
 * a private key, an access token or a password assignment is refused with `secret_detected`, naming only the kind
 * found (never the value), so the agent can save where the secret lives instead of the secret itself.
 */
import { ToolError } from './tool-kit';

interface SecretShape {
  kind: string;
  pattern: RegExp;
}

const SHAPES: readonly SecretShape[] = [
  { kind: 'private key', pattern: /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----/ },
  { kind: 'GitHub token', pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/ },
  { kind: 'GitLab token', pattern: /\bglpat-[A-Za-z0-9_-]{20,}\b/ },
  { kind: 'Slack token', pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/ },
  { kind: 'AWS access key', pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/ },
  { kind: 'Google API key', pattern: /\bAIza[A-Za-z0-9_-]{35}\b/ },
  { kind: 'AI provider key', pattern: /(?<![\w-])sk-(?:ant-|proj-)?[A-Za-z0-9_-]{32,}\b/ },
  { kind: 'kb admin token', pattern: /\bkf_admin_[A-Za-z0-9_-]{16,}\b/ },
  { kind: 'JSON Web Token', pattern: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
];

/**
 * `password: hunter2hunter2`, `DB_PASSWORD="…"` (no `\b` before the name: `DB_` and `X_` prefixes count). The value
 * is the run of characters after `:`/`=`; see literalSecretValue for what is not one.
 */
const ASSIGNED = /(?<![a-z0-9])(?:password|passwd|secret|api[_-]?key|access[_-]?token|client[_-]?secret)\b["']?\s*[:=]\s*["']?([^\s"'`<>,;]{8,})/gi;
const ASSIGNED_KIND = 'password or key value';
/** Values that only stand in for a secret: `xxxxxxxx`, `your-password-here`, `REDACTED`, `changeme`, `example…`. */
const PLACEHOLDER = /^(?:x+|\*+|your[-_].*|.*redacted.*|changeme|example.*|placeholder.*|dummy.*|test.*)$/i;

/**
 * Whether the text after `password =` is a literal secret, not code or a stand-in: a placeholder (`<your key>`,
 * `${VAR}`, `***`, `xxxxxxxx`) or an expression (`process.env.API_KEY`, `z.string().min(8)`, `getpass()`,
 * `config.oauth.clientSecret`, a path) is not one.
 */
function literalSecretValue(value: string): boolean {
  if (/^[<$*{[(]/.test(value) || PLACEHOLDER.test(value)) return false;
  if (/[.()/]/.test(value) && /^[A-Za-z_$][\w$]*(?:[.(/]|$)/.test(value)) return false;
  return !value.startsWith('/');
}

function hasAssignedSecret(text: string): boolean {
  for (const match of text.matchAll(ASSIGNED)) if (literalSecretValue(match[1] ?? '')) return true;
  return false;
}

/** The kinds of secret found in `texts`, in the order of SHAPES, the assigned value last. */
export function secretKindsIn(...texts: readonly string[]): string[] {
  const kinds = SHAPES.filter((shape) => texts.some((text) => shape.pattern.test(text))).map((shape) => shape.kind);
  return texts.some(hasAssignedSecret) ? [...kinds, ASSIGNED_KIND] : kinds;
}

/** Throws `secret_detected` when any of `texts` holds a secret. */
export function refuseSecrets(...texts: readonly string[]): void {
  const kinds = secretKindsIn(...texts);
  if (kinds.length === 0) return;
  throw new ToolError(
    'secret_detected',
    `The note looks like it holds a secret (${kinds.join(', ')}). kb never stores secrets: remove the value and write where it is kept instead (a password manager, an env file location).`,
  );
}
