/**
 * Removes server details from imported text before it is stored or recorded as a fixture: every IPv4 address that
 * is not a lesson operand (teaching-addresses.ts) becomes `<ADDR-n>`, numbered per document by first appearance
 * (the same address keeps its number, so "the same machine" still reads as one), and its port becomes `<PORT>`;
 * SSH logins become `<USER>@<HOST>` and SSH ports `<SSH_PORT>`. Numbers are not reversible on purpose (a hash of an
 * IPv4 address is brute-forced in seconds). Running it again on its own output changes nothing.
 */
import { isTeachingAddress } from './teaching-addresses';

/**
 * An IPv4 literal with an optional `/prefix` and `:port`. Not after a digit, a dot, `§` or `section-` (spec section
 * numbers such as `RFC 1122 §3.2.1.7`); a trailing sentence dot is allowed.
 */
const IPV4 = /(?<![\d.§]|section-)(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?!\d|\.\d)(\/\d{1,2}(?!\d))?(:\d{1,5}(?!\d))?/g;
/** `ssh`/`scp`/`rsync`/`ssh-copy-id` … `user@host` on one line. */
const REMOTE_LOGIN = /\b(ssh|scp|rsync|ssh-copy-id|sftp)\b([^\n]*?)(?<![\w.-])[\w.-]+@([\w.-]+|<ADDR-\d+>)/g;
const SSH_PORT_FLAG = /\b(ssh\b[^\n]*?\s-p\s*)\d{2,5}\b/g;
const SSHD_PORT_LINE = /^(\s*Port\s+)\d{2,5}(\s*)$/gm;

export interface Redactor {
  (text: string): string;
  /** How many address occurrences were replaced so far. */
  readonly redacted: number;
}

/** A redactor for one document: placeholder numbers are shared by every text of that document. */
export function createRedactor(): Redactor {
  const numbers = new Map<string, number>();
  let redacted = 0;
  const redact = (text: string): string => {
    const withoutAddresses = text.replace(IPV4, (match, a: string, b: string, c: string, d: string, prefix: string | undefined, port: string | undefined) => {
      const octets = [a, b, c, d].map(Number);
      if (octets.some((n) => n > 255)) return match; // a version number or a date, not an address
      if (isTeachingAddress(octets, prefix ? Number(prefix.slice(1)) : null)) return match;
      const address = octets.join('.');
      const n = numbers.get(address) ?? numbers.size + 1;
      numbers.set(address, n);
      redacted += 1;
      return `<ADDR-${n}>${prefix ?? ''}${port ? ':<PORT>' : ''}`;
    });
    return withoutAddresses
      .replace(REMOTE_LOGIN, (_match, command: string, middle: string, host: string) => `${command}${middle}<USER>@${host.startsWith('<') ? host : '<HOST>'}`)
      .replace(SSH_PORT_FLAG, '$1<SSH_PORT>')
      .replace(SSHD_PORT_LINE, '$1<SSH_PORT>$2');
  };
  return Object.defineProperty(redact, 'redacted', { get: () => redacted }) as Redactor;
}

/** Every string inside a parsed JSON value redacted with one document's redactor, in document order. */
export function redactJson<T>(value: T, redact: (text: string) => string): T {
  const walk = (node: unknown): unknown => {
    if (typeof node === 'string') return redact(node);
    if (Array.isArray(node)) return node.map(walk);
    if (node !== null && typeof node === 'object') return Object.fromEntries(Object.entries(node).map(([key, child]) => [key, walk(child)]));
    return node;
  };
  return walk(value) as T;
}
