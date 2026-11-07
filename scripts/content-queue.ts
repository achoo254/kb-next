/**
 * The AI article queue (docs/admin-api.md, "Hàng chờ bài AI"). Each run of the routine adds one planet (a Collection)
 * as `content/queue/<planet>/`, holding 3–5 articles (`<article>.md`) linked to each other with `[[Title]]`, and to
 * articles of other planets. `.github/workflows/publish-queue.yml` makes the Space and the Collection when needed,
 * publishes the articles (a linked-to article before the one linking to it, so every link resolves when it is saved)
 * and removes the folder. The database owns the articles after that; the repository keeps only the topic list and the
 * ledger of what was published.
 *
 * `pnpm check:queue` checks `content/topics.json`, `content/spaces.json`, `content/published.json` and every queued
 * planet, so a bad article never reaches the publish step.
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

/** Limits of the admin API (apps/server/src/api/admin-api-routes.ts, review-routes.ts, authoring-routes.ts). */
const MAX_TITLE_CHARS = 200;
const MAX_NAME_CHARS = 80;
const MAX_TAGS = 8;
const MAX_TAG_CHARS = 60;
/** Shorter than this is a stub, not an article. */
export const MIN_BODY_CHARS = 1200;
export const MIN_ARTICLES = 3;
export const MAX_ARTICLES = 5;
const SLUG = /^[a-z0-9][a-z0-9-]{0,119}$/;

/** A planet to write: a Collection of linked articles in one Space. */
export interface Topic {
  slug: string;
  space: string;
  lang: 'vi' | 'en';
  /** The Collection's name. */
  name: string;
  nameEn: string;
  /** A tech topic; these stay at most a third of the list (the knowledge base covers all kinds of topics). */
  tech: boolean;
  /** What the planet covers and the articles it could hold. */
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
  /** Spaces the publish step makes (once) before it publishes into them. */
  create: SpaceSpec[];
}

export interface PublishedPlanet {
  slug: string;
  space: string;
  collectionId: string;
  at: string;
}

export interface PublishedPost {
  /** `<planet>/<article>`; a bare slug for the articles published before planets. */
  slug: string;
  id: string;
  title: string;
  at: string;
}

export interface Ledger {
  planets: PublishedPlanet[];
  posts: PublishedPost[];
}

export interface QueuedArticle {
  /** `<planet>/<article>`. */
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

/** How the server matches a `[[Title]]` to a title: case and accents do not count. */
export function titleKey(title: string): string {
  return title.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/gi, 'd').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** The titles an article links to (`[[Title]]`, `[[Title|shown text]]`). */
export function linkedTitles(body: string): string[] {
  return [...body.matchAll(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g)].map((m) => (m[1] ?? '').trim()).filter(Boolean);
}

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
    for (const [key, value] of [['name', topic.name], ['nameEn', topic.nameEn]] as const) {
      if (!value?.trim() || value.length > MAX_NAME_CHARS) problems.push({ file: where, message: `${key} must be 1–${MAX_NAME_CHARS} characters` });
    }
  }
  const tech = topics.filter((t) => t.tech).length;
  if (tech * 3 > topics.length) problems.push({ file, message: `${tech} of ${topics.length} topics are tech; keep tech at most a third` });
  return problems;
}

/** A queued planet: its folder name and the text of each article file, by article slug. */
export interface QueuedPlanet {
  slug: string;
  files: Record<string, string>;
}

/** Whether the undirected graph of `edges` over `nodes` is one piece. */
function connected(nodes: readonly string[], edges: ReadonlyArray<[string, string]>): boolean {
  if (nodes.length <= 1) return true;
  const next = new Map(nodes.map((n) => [n, new Set<string>()]));
  for (const [a, b] of edges) {
    next.get(a)?.add(b);
    next.get(b)?.add(a);
  }
  const seen = new Set<string>([nodes[0] ?? '']);
  const stack = [nodes[0] ?? ''];
  while (stack.length > 0) {
    for (const n of next.get(stack.pop() ?? '') ?? []) {
      if (!seen.has(n)) {
        seen.add(n);
        stack.push(n);
      }
    }
  }
  return seen.size === nodes.length;
}

/**
 * The order to publish `articles` in: an article after every queued article it links to, so each `[[link]]` finds its
 * target when the article is saved. Null when the links go round in a circle.
 */
export function publishOrder(articles: readonly QueuedArticle[]): QueuedArticle[] | null {
  const byKey = new Map(articles.map((a) => [titleKey(a.title), a]));
  const order: QueuedArticle[] = [];
  const state = new Map<string, 'visiting' | 'done'>();
  const visit = (article: QueuedArticle): boolean => {
    const mark = state.get(article.slug);
    if (mark === 'done') return true;
    if (mark === 'visiting') return false;
    state.set(article.slug, 'visiting');
    for (const title of linkedTitles(article.body)) {
      const target = byKey.get(titleKey(title));
      if (target && target !== article && !visit(target)) return false;
    }
    state.set(article.slug, 'done');
    order.push(article);
    return true;
  };
  for (const article of [...articles].sort((a, b) => a.slug.localeCompare(b.slug))) if (!visit(article)) return null;
  return order;
}

/**
 * Checks the queued planets against the topic list and the ledger: each planet has 3–5 valid articles linked into one
 * piece, links to at least one article outside itself, and every `[[link]]` points at a queued or published title.
 * Returns the problems and the valid articles of each planet.
 */
export function checkPlanets(planets: readonly QueuedPlanet[], topics: readonly Topic[], ledger: Ledger): { problems: Problem[]; articles: Map<string, QueuedArticle[]> } {
  const problems: Problem[] = [];
  const articles = new Map<string, QueuedArticle[]>();
  for (const planet of planets) {
    const dir = `content/queue/${planet.slug}`;
    const topic = topics.find((t) => t.slug === planet.slug);
    if (!topic) problems.push({ file: dir, message: 'no topic with this slug in content/topics.json' });
    else if (topic.status === 'published' || topic.status === 'skipped') problems.push({ file: dir, message: `its topic is already ${topic.status}` });
    const names = Object.keys(planet.files).sort();
    if (names.length < MIN_ARTICLES || names.length > MAX_ARTICLES) problems.push({ file: dir, message: `a planet holds ${MIN_ARTICLES}–${MAX_ARTICLES} articles, this one ${names.length}` });
    const parsed: QueuedArticle[] = [];
    for (const name of names) {
      const file = `${dir}/${name}.md`;
      if (!SLUG.test(name)) problems.push({ file, message: 'file name must be lowercase letters, digits and dashes' });
      const article = parseArticle(`${planet.slug}/${name}`, planet.files[name] ?? '');
      if (Array.isArray(article)) problems.push(...article.map((message) => ({ file, message })));
      else parsed.push(article);
    }
    articles.set(planet.slug, parsed);
  }

  const queued = [...articles.values()].flat();
  const queuedKeys = new Map(queued.map((a) => [titleKey(a.title), a]));
  const publishedKeys = new Set(ledger.posts.map((p) => titleKey(p.title)));
  // An article in the ledger whose file is still queued: a run that died after publishing it; not a twin.
  const publishedAs = new Map(ledger.posts.map((p) => [titleKey(p.title), p.slug]));
  const seen = new Map<string, string>();
  for (const article of queued) {
    const key = titleKey(article.title);
    const file = `content/queue/${article.slug}.md`;
    if (publishedKeys.has(key) && publishedAs.get(key) !== article.slug) problems.push({ file, message: `an article titled "${article.title}" is already published` });
    const twin = seen.get(key);
    if (twin) problems.push({ file, message: `same title as content/queue/${twin}.md` });
    seen.set(key, article.slug);
    for (const title of linkedTitles(article.body)) {
      if (!queuedKeys.has(titleKey(title)) && !publishedKeys.has(titleKey(title))) problems.push({ file, message: `[[${title}]] is neither queued nor in content/published.json` });
    }
  }

  for (const [slug, list] of articles) {
    if (list.length === 0) continue;
    const dir = `content/queue/${slug}`;
    const own = new Map(list.map((a) => [titleKey(a.title), a.slug]));
    const edges: Array<[string, string]> = [];
    let outside = false;
    for (const article of list) {
      for (const title of linkedTitles(article.body)) {
        const target = own.get(titleKey(title));
        if (target) edges.push([article.slug, target]);
        else outside = true;
      }
    }
    if (!connected(list.map((a) => a.slug), edges)) problems.push({ file: dir, message: 'its articles are not all linked together with [[ ]]' });
    const elsewhere = [...ledger.posts, ...queued].some((a) => !a.slug.startsWith(`${slug}/`));
    if (elsewhere && !outside) problems.push({ file: dir, message: 'no [[link]] to an article of another planet' });
  }
  if (queued.length > 0 && publishOrder(queued) === null) problems.push({ file: 'content/queue', message: 'the [[links]] between queued articles go round in a circle; link one way only' });
  return { problems, articles };
}

export async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, 'utf8')) as T;
}

/** The queued planets, in name order (`.gitkeep` and other files are not planets). */
export async function readQueue(dir: string): Promise<QueuedPlanet[]> {
  const entries = await readdir(path.join(dir, 'queue'), { withFileTypes: true });
  const planets: QueuedPlanet[] = [];
  for (const entry of entries.filter((e) => e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const files: Record<string, string> = {};
    for (const name of (await readdir(path.join(dir, 'queue', entry.name))).filter((n) => n.endsWith('.md'))) {
      files[name.slice(0, -3)] = await readFile(path.join(dir, 'queue', entry.name, name), 'utf8');
    }
    planets.push({ slug: entry.name, files });
  }
  return planets;
}

export async function checkContent(dir: string): Promise<Problem[]> {
  const spaces = await readJson<Spaces>(path.join(dir, 'spaces.json'));
  const { topics } = await readJson<{ topics: Topic[] }>(path.join(dir, 'topics.json'));
  const ledger = await readJson<Ledger>(path.join(dir, 'published.json'));
  const problems = checkTopics(topics, spaces);
  const planets = new Set(ledger.planets.map((p) => p.slug));
  for (const topic of topics) {
    if (topic.status === 'published' && !planets.has(topic.slug)) problems.push({ file: 'content/topics.json', message: `${topic.slug} is published but not in content/published.json` });
  }
  problems.push(...checkPlanets(await readQueue(dir), topics, ledger).problems);
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
