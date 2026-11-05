/** Shared pieces of the own-key and Copilot tests: the secret file, Jev at its boundary, the model's reply, events. */
import { randomBytes } from 'node:crypto';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { vi } from 'vitest';
import type { JevJudge, JevQuestion, JevResult } from '../src/jev/jev-client';
import type { FakePrompt } from './fake-providers';

/** A fresh 32-byte secret in a mode-600 file; `remove` deletes its directory. */
export async function writeSecretFile(): Promise<{ path: string; secret: Buffer; remove(): Promise<void> }> {
  const dir = await mkdtemp(path.join(tmpdir(), 'kb-user-keys-'));
  const file = path.join(dir, 'user-keys-secret');
  const secret = randomBytes(32);
  await writeFile(file, secret);
  await chmod(file, 0o600);
  return { path: file, secret, remove: () => rm(dir, { recursive: true, force: true }) };
}

interface Passage {
  document?: string;
  section?: string | null;
  text?: string;
}

const passagesOf = (state: unknown): Record<string, Passage> => (state as { passages?: Record<string, Passage> }).passages ?? {};

/** The seed's DHCP passages as Jev would rate them: DORA plus "xin IP" answers, DORA helps, a bare IP barely relates. */
function rate(text: string): number {
  return /xin IP/.test(text) && /DORA/.test(text) ? 3 : /DORA/.test(text) ? 2 : /\bIP\b/.test(text) ? 1 : 0;
}

const aboutDhcp = (question: string): boolean => /DHCP|\bIP\b/i.test(question);

/**
 * Jev on the seed for search and the Copilot: documents about DHCP are what a DHCP question is about; enough to
 * answer only for a question about DHCP or IPs when a passage explains DORA; a claim is supported when it and its
 * source both speak of DORA. `fail` makes every call reject (an outage, a timeout).
 */
export function fakeAskJev() {
  const calls: Array<{ purpose: string; state: unknown }> = [];
  /** `fail`: every call rejects; `delayMs`: each call waits this long first. */
  const control = { fail: false, delayMs: 0 };
  const usage = { inputTokens: 400, outputTokens: 20 };
  const ask = vi.fn(async (purpose: string, state: unknown, questions: Record<string, JevQuestion>): Promise<JevResult> => {
    calls.push({ purpose, state });
    if (control.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, control.delayMs));
    if (control.fail) return Promise.reject(new Error(`Jev ${purpose} failed: TimeoutError`));
    const answers: JevResult['answers'] = {};
    if (purpose === 'search-documents') {
      const docs = (state as { documents: Record<string, unknown> }).documents;
      const query = /search query "([^"]*)"/.exec(questions.document?.instructions ?? '')?.[1] ?? '';
      const weights = Object.fromEntries(Object.entries(docs).map(([id, d]) => [id, /DHCP|DORA/.test(JSON.stringify(d)) ? 1 : 0.02]));
      const sum = Object.values(weights).reduce((a, b) => a + b, 0);
      const probabilities = Object.fromEntries(Object.entries(weights).map(([id, w]) => [id, w / sum]));
      const choice = Object.entries(probabilities).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
      answers.document = { type: 'choice', choice, confidence: 0.5, probabilities };
      answers.exists = { type: 'noul', noul: aboutDhcp(query) ? 0.95 : 0.05 };
      return Promise.resolve({ answers, usage });
    }
    if (purpose === 'search-passages' || purpose === 'ask-passages') {
      const passages = passagesOf(state);
      for (const id of Object.keys(questions)) {
        if (id === 'enough' || id === 'language') continue;
        answers[id] = { type: 'score', score: rate(passages[id]?.text ?? ''), confidence: 0.9, probabilities: {} };
      }
      if ('enough' in questions) {
        const question = String((state as { question?: unknown }).question ?? '');
        const explained = Object.values(passages).some((p) => /DORA/.test(p.text ?? ''));
        answers.enough = { type: 'noul', noul: aboutDhcp(question) && explained ? 0.9 : 0.1 };
      }
      return Promise.resolve({ answers, usage });
    }
    if (purpose === 'ask-check') {
      const { sources, claims } = state as { sources: Record<string, Passage>; claims: Record<string, string> };
      for (const key of Object.keys(questions)) {
        const [claim = '', source = ''] = key.split('_');
        const supported = /DORA/.test(claims[claim] ?? '') && /DORA/.test(sources[source]?.text ?? '');
        answers[key] = { type: 'noul', noul: supported ? 0.95 : 0.1 };
      }
      return Promise.resolve({ answers, usage });
    }
    return Promise.reject(new Error(`unexpected Jev purpose ${purpose}`));
  });
  const jev: JevJudge = { choose: vi.fn(() => Promise.reject(new Error('not used'))), ask };
  return { jev, calls, control };
}

/** The numbered sources of a Copilot prompt: `[n] title — section` then the passage between triple quotes. */
export function promptSources(user: string): Array<{ n: number; text: string }> {
  return [...user.matchAll(/^\[(\d+)\] [^\n]*\n"""\n([\s\S]*?)\n"""/gm)].map((m) => ({ n: Number(m[1]), text: m[2] ?? '' }));
}

/**
 * The model on the seed: cites the first source that explains DORA for the DORA sentence, and another one for a
 * sentence no source supports, then draws the exchange in Mermaid. Translations: each paragraph marked EN (after its heading marks).
 */
export function seedReply(prompt: FakePrompt): string {
  if (prompt.system.startsWith('Translate')) {
    return prompt.user
      .split('\n\n')
      .map((p) => p.replace(/^(#+ )?/, (marks) => `${marks}EN `))
      .join('\n\n');
  }
  const sources = promptSources(prompt.user);
  const dora = sources.find((s) => /DORA/.test(s.text));
  const other = [...sources].reverse().find((s) => s !== dora);
  // The unsupported claim cites another source, or the DORA one again when there is only one (only that sentence is
  // flagged then: verdicts go per citation, not per source).
  const sentences = [
    `A new computer gets its IP address from a DHCP server in four DORA steps: Discover, Offer, Request, Acknowledge [${dora?.n ?? 1}].`,
    `The moon is made of cheese [${other?.n ?? dora?.n ?? 1}].`,
  ];
  // A citation-like mark inside the diagram is not a claim.
  return `${sentences.join(' ')}\n\n\`\`\`mermaid\nsequenceDiagram\n  Client->>Server: Discover. [9]\n\`\`\``;
}

export interface StreamEvent {
  event: string;
  data: unknown;
}

/** Every event of a text/event-stream answer, in order. */
export async function readEvents(res: Response): Promise<StreamEvent[]> {
  const text = await res.text();
  return text
    .split('\n\n')
    .filter((block) => block.trim() !== '')
    .map((block) => {
      const event = /^event: (.*)$/m.exec(block)?.[1] ?? '';
      const data = /^data: (.*)$/m.exec(block)?.[1] ?? 'null';
      return { event, data: JSON.parse(data) as unknown };
    });
}

/** The data of the first event named `name`. */
export function dataOf<T>(events: readonly StreamEvent[], name: string): T | undefined {
  return events.find((e) => e.event === name)?.data as T | undefined;
}
