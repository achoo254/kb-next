import { describe, expect, it } from 'vitest';
import { secretKindsIn } from './secret-guard';

// Fake secrets are put together at run time, so no file of the repository holds one whole (secret scanners stay quiet).
const glue = (...parts: string[]): string => parts.join('');
const fakePem = glue('-----BEGIN OPENSSH ', 'PRIVATE', ' KEY-----\nabc');
const fakeAwsKey = glue('AKIA', 'ABCDEFGHIJKLMNOP');
const fakeJwt = ['eyJhbGciOiJFUzI1NiJ9', 'eyJzdWIiOiJhbGljZSJ9', 'c2lnbmF0dXJlLXZhbHVl'].join('.');
const fakeDashedWord = glue('branch my-', 'sk-', 'abcdefghijklmnopqrstuvwxyz0123456789');

describe('secretKindsIn', () => {
  it.each([
    ['private key', fakePem],
    ['GitHub token', `token ghp_${'a1B2'.repeat(9)}`],
    ['AWS access key', fakeAwsKey],
    ['AI provider key', glue('sk-', 'ant-', 'x9'.repeat(20))],
    ['JSON Web Token', fakeJwt],
    ['password or key value', 'DB_PASSWORD=Tr0ub4dor&3xyz'],
    ['password or key value', 'api_key: "abcd1234efgh5678"'],
  ])('finds a %s', (kind, text) => {
    expect(secretKindsIn(text)).toContain(kind);
  });

  it.each([
    'The token lives in the iCloud env folder, never in the repo.',
    'Set API_KEY=<your key> before running.',
    'password: ${DB_PASSWORD}',
    'secret = ***',
    'Use `sk-` keys only from the vault.',
    'Rotate the password every 90 days.',
    'const apiKey = process.env.API_KEY;',
    'client_secret: config.oauth.clientSecret',
    'password: z.string().min(8)',
    'password = getpass.getpass()',
    'pwd: /home/dat/projects',
    'secret_file: /etc/kb/secret.env',
    '"password": "your-password-here"',
    'password=xxxxxxxx',
    'secret=REDACTED_VALUE',
    fakeDashedWord,
  ])('leaves a note without a secret alone: %s', (text) => {
    expect(secretKindsIn(text)).toEqual([]);
  });
});
