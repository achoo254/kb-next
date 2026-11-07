/**
 * The AI article queue (docs/admin-api.md, "Hàng chờ bài AI"). A nightly routine writes one article as
 * `content/queue/<slug>.md`; `.github/workflows/publish-queue.yml` publishes it through the admin API and
 * removes the file. The database owns the article after that; the repository keeps only the topic list and the
 * `slug → id` ledger.
 *
 * `pnpm check:queue` checks `content/topics.json`, `content/spaces.json`, `content/published.json` and every queued
 * file, so a bad article never reaches the publish step.
 */
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findPublicInfo } from './check-public-info';

export const CONTENT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'content');

export const TOPIC_STATUSES = ['todo', 'queued', 'published', 'skipped'] as const;
export type TopicStatus = (typeof TOPIC_STATUSES)[number];
const POST_TYPES = ['note', 'lab', 'process'] as const;
export type PostType = (typeof POST_TYPES)[number];

/** Limits of the admin API (apps/server/src/api/admin-api-routes.ts, review-routes.ts). */
const MAX_TITLE_CHARS = 200;
const MAX_TAGS = 8;
const MAX_TAG_CHARS = 60;
/** Shorter than this is a stub, not an article. */
export const MIN_BODY_CHARS = 1200;
const SLUG = /^[a-z0-9][a-z0-9-]{0,119}$/;

export interface Topic {
  slug: string;
  space: string;
  lang: 'vi' | 'en';
  title: string;
  /** A tech topic; these stay at most a third of the list (the knowledge base covers all kinds of topics). */
  tech: boolean;
  brief: string;
  status: TopicStatus;
  /** Why the routine skipped it. */
  note?: string;
}

export interface SpaceSpec {
  slug: string;
  nameVi: string;
  nameEn: string;
  tint: string;
  glow: string;
  art: string;
  unitVi: string;
  unitEn: string;
  descriptionVi?: string;
  descriptionEn?: string;
}

export interface Spaces {
  /** Public Spaces already on kb.hoandat.com. */
  existing: string[];
  /** Spaces the publish step makes (once) before it publishes an article into them. */
  create: SpaceSpec[];
}

export interface PublishedPost {
  slug: string;
  id: string;
  title: string;
  at: string;
}

export interface QueuedArticle {
  slug: string;
  title: string;
  tags: string[];
  type: PostType;
  body: string;
}

/** A failed check: the file it is about and what is wrong, in plain words. */
export interface Problem {
  file: string;
  message: string;
}

/** What a queued article must not carry: secrets, and anything of the retired source site. */
const FORBIDDEN: ReadonlyArray<[RegExp, string]> = [
  [/kf_admin_|ghp_[A-Za-z0-9]{20}|github_pat_|\bsk-[A-Za-z0-9_-]{20}|-----BEGIN [A-Z ]*PRIVATE KEY/, 'looks like a secret'],
  // The site's name and addresses; plain "học cloud" (learning cloud) is fine.
  [/hoc-?cloud|Học Cloud/, 'mentions the retired Học Cloud site'],
];

/**
 * Splits `---` front matter (`key: value` lines; `tags` comma-separated) from the Markdown body.
 * Returns the article, or the problems with it.
 */
export function parseArticle(slug: string, text: string): QueuedArticle | string[] {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(text);
  if (!match) return ['missing the --- front matter (title, tags, type)'];
  const [, head = '', body = ''] = match;
  const fields = new Map<string, string>();
  for (const line of head.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const kv = /^([a-z]+):\s*(.*)$/.exec(line);
    if (!kv?.[1]) return [`front matter line is not "key: value": ${line}`];
    fields.set(kv[1], (kv[2] ?? '').trim());
  }
  const problems: string[] = [];
  for (const key of fields.keys()) if (!['title', 'tags', 'type'].includes(key)) problems.push(`unknown front matter key "${key}"`);
  const title = fields.get('title') ?? '';
  if (!title) problems.push('title is empty');
  if (title.length > MAX_TITLE_CHARS) problems.push(`title is longer than ${MAX_TITLE_CHARS} characters`);
  const tags = (fields.get('tags') ?? '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
  if (tags.length > MAX_TAGS) problems.push(`more than ${MAX_TAGS} tags`);
  if (tags.some((tag) => tag.length > MAX_TAG_CHARS)) problems.push(`a tag is longer than ${MAX_TAG_CHARS} characters`);
  const type = fields.get('type') ?? 'note';
  if (!(POST_TYPES as readonly string[]).includes(type)) problems.push(`type must be one of ${POST_TYPES.join(', ')}`);
  const trimmed = body.trim();
  if (trimmed.length < MIN_BODY_CHARS) problems.push(`body is shorter than ${MIN_BODY_CHARS} characters`);
  for (const [pattern, message] of FORBIDDEN) if (pattern.test(text)) problems.push(`the article ${message}`);
  for (const finding of findPublicInfo(text, slug)) problems.push(`server detail on line ${finding.line}: ${finding.match}`);
  if (problems.length > 0) return problems;
  return { slug, title, tags, type: type as PostType, body: trimmed };
}

/** Checks the topic list against the Spaces; `file` names it in the problems. */
export function checkTopics(topics: readonly Topic[], spaces: Spaces, file = 'content/topics.json'): Problem[] {
  const problems: Problem[] = [];
  const known = new Set([...spaces.existing, ...spaces.create.map((s) => s.slug)]);
  const seen = new Set<string>();
  for (const topic of topics) {
    const where = `${file} (${topic.slug})`;
    if (!SLUG.test(topic.slug)) problems.push({ file: where, message: 'slug must be lowercase letters, digits and dashes' });
    if (seen.has(topic.slug)) problems.push({ file: where, message: 'slug is listed twice' });
    seen.add(topic.slug);
    if (!known.has(topic.space)) problems.push({ file: where, message: `unknown Space "${topic.space}"` });
    if (!(TOPIC_STATUSES as readonly string[]).includes(topic.status)) problems.push({ file: where, message: `status must be one of ${TOPIC_STATUSES.join(', ')}` });
    if (topic.lang !== 'vi' && topic.lang !== 'en') problems.push({ file: where, message: 'lang must be vi or en' });
    if (typeof topic.tech !== 'boolean') problems.push({ file: where, message: 'tech must be true or false' });
  }
  const tech = topics.filter((t) => t.tech).length;
  if (tech * 3 > topics.length) problems.push({ file, message: `${tech} of ${topics.length} topics are tech; keep tech at most a third` });
  return problems;
}

/** Checks one queued file against the topic list. */
export function checkQueued(slug: string, text: string, topics: readonly Topic[]): Problem[] {
  const file = `content/queue/${slug}.md`;
  const topic = topics.find((t) => t.slug === slug);
  if (!topic) return [{ file, message: 'no topic with this slug in content/topics.json' }];
  if (topic.status === 'published' || topic.status === 'skipped') return [{ file, message: `its topic is already ${topic.status}` }];
  const article = parseArticle(slug, text);
  return Array.isArray(article) ? article.map((message) => ({ file, message })) : [];
}

export async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, 'utf8')) as T;
}

/** The slugs of the queued files, in name order (`.gitkeep` and other files are not articles). */
export async function queuedSlugs(dir: string): Promise<string[]> {
  const names = await readdir(path.join(dir, 'queue'));
  return names
    .filter((name) => name.endsWith('.md'))
    .map((name) => name.slice(0, -3))
    .sort();
}

export async function checkContent(dir: string): Promise<Problem[]> {
  const spaces = await readJson<Spaces>(path.join(dir, 'spaces.json'));
  const { topics } = await readJson<{ topics: Topic[] }>(path.join(dir, 'topics.json'));
  const { posts } = await readJson<{ posts: PublishedPost[] }>(path.join(dir, 'published.json'));
  const problems = checkTopics(topics, spaces);
  const published = new Set(posts.map((p) => p.slug));
  for (const topic of topics) {
    if (topic.status === 'published' && !published.has(topic.slug)) problems.push({ file: 'content/topics.json', message: `${topic.slug} is published but not in content/published.json` });
  }
  for (const slug of await queuedSlugs(dir)) {
    problems.push(...checkQueued(slug, await readFile(path.join(dir, 'queue', `${slug}.md`), 'utf8'), topics));
  }
  return problems;
}

async function main(): Promise<number> {
  const problems = await checkContent(CONTENT_DIR);
  if (problems.length === 0) {
    console.log('✓ content queue is valid');
    return 0;
  }
  console.error(`✗ ${problems.length} problem(s) in the content queue:`);
  for (const p of problems) console.error(`  ${p.file}: ${p.message}`);
  return 1;
}

// Run as a script, not when a test imports it.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      console.error('check:queue crashed:', error);
      process.exitCode = 1;
    },
  );
}
