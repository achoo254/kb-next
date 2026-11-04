/**
 * The editorial layer between Học Cloud and kb, kept in the repository as data and reviewed like code
 * (content/hoc-cloud/curation.json): which Spaces and Collections exist, where each source item goes and in what
 * order, the sections to drop, exact-text fixes, and — where the source needs heavier edits — a whole
 * rewritten Markdown file (content/hoc-cloud/docs/); misplaced lab step intros are rewritten in
 * content/hoc-cloud/step-intros.json. Translations live in content/translations/, summaries in
 * content/summaries.json (which also holds every document's vi/en title). All files are validated together before the import writes anything.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

const Slug = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/);
const Colour = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const Bilingual = z.object({ vi: z.string().min(1), en: z.string().min(1) });
/** `lab/arp`, `exercise/syslog`, `weekly/08-08-2026/01-docker-co-ban`. */
const DocumentKey = z.string().regex(/^(lab|exercise|weekly)\/[a-z0-9][a-z0-9./-]*$/);
/** A file under content/, never outside it. */
const ContentPath = z.string().regex(/^[a-z0-9][a-z0-9._/-]*$/).refine((p) => !p.split('/').includes('..'), 'path leaves content/');

const CurationCollection = z.object({ key: Slug, name: Bilingual, tint: Colour.optional(), glow: Colour.optional(), art: z.string().optional() });

const CurationSpace = z.object({
  slug: Slug,
  name: Bilingual,
  tint: Colour,
  glow: Colour,
  art: z.string().startsWith('/art/'),
  unit: Bilingual,
  sortOrder: z.number().int(),
  collections: z.array(CurationCollection).min(1),
});

const Fix = z.object({ find: z.string().min(1), replace: z.string(), why: z.string().min(1) });

const CurationDocument = z.object({
  key: DocumentKey,
  space: Slug,
  collection: Slug,
  /** Position inside the collection, from 1. */
  order: z.number().int().min(1),
  /** Anchors of generated sections to leave out, each with the reason. */
  drop: z.array(z.object({ anchor: z.string().min(1), why: z.string().min(1) })).default([]),
  /** Exact-text edits on the generated Markdown; each must match exactly once. */
  fixes: z.array(Fix).default([]),
  /**
   * A rewritten Markdown file under content/ that replaces the generated text. Weekly pages always have one:
   * Học Cloud does not serve them, so their HTML was converted (turndown) and tidied in the repository.
   */
  markdown: ContentPath.optional(),
  /** Other documents (by key) listed under "Bài liên quan", written as wikilinks. */
  related: z.array(DocumentKey).default([]),
  /**
   * Editorial revision of this document, part of its stored content hash: bump it with an editorial change of this
   * document only (its fixes, its step intros), so a re-import gives exactly this document a new version.
   */
  revision: z.number().int().min(1).default(1),
});

const CurationTranslation = z.object({ key: DocumentKey, lang: z.literal('en'), file: ContentPath });

export const Curation = z
  .object({
    /** Edition of the curation files, bumped on every change; documents carry their own `revision`. */
    version: z.number().int().min(1),
    spaces: z.array(CurationSpace).min(1),
    documents: z.array(CurationDocument).min(1),
    translations: z.array(CurationTranslation).default([]),
  })
  .superRefine((curation, ctx) => {
    const issue = (message: string): void => ctx.addIssue({ code: 'custom', message });
    const collections = new Map<string, Set<string>>();
    for (const space of curation.spaces) {
      if (collections.has(space.slug)) issue(`space ${space.slug} listed twice`);
      const keys = new Set(space.collections.map((c) => c.key));
      if (keys.size !== space.collections.length) issue(`space ${space.slug} has a collection key twice`);
      collections.set(space.slug, keys);
    }
    const documentKeys = new Set<string>();
    const positions = new Set<string>();
    for (const doc of curation.documents) {
      if (documentKeys.has(doc.key)) issue(`document ${doc.key} listed twice`);
      documentKeys.add(doc.key);
      if (!collections.get(doc.space)?.has(doc.collection)) issue(`document ${doc.key}: no collection ${doc.space}/${doc.collection}`);
      const position = `${doc.space}/${doc.collection}/${doc.order}`;
      if (positions.has(position)) issue(`document ${doc.key}: position ${position} taken`);
      positions.add(position);
      if (doc.key.startsWith('weekly/') && !doc.markdown) issue(`document ${doc.key}: a weekly page needs its markdown file`);
    }
    for (const doc of curation.documents) {
      for (const key of doc.related) if (!documentKeys.has(key)) issue(`document ${doc.key}: related ${key} is not curated`);
    }
    for (const t of curation.translations) if (!documentKeys.has(t.key)) issue(`translation of ${t.key}: document not curated`);
  });

export type Curation = z.infer<typeof Curation>;

/**
 * content/hoc-cloud/step-intros.json: rewritten opening paragraphs of lab walkthrough steps whose source `why`
 * explains another step. Keyed by document key (`lab/http`), each entry names the displayed step number and the
 * sha256 of the source text it replaces: once Học Cloud changes that text, the override is stale, the import warns
 * and renders the source again.
 */
export const StepIntros = z.record(
  z.string().regex(/^lab\/[a-z0-9-]+$/),
  z.array(
    z.object({
      step: z.number().int().min(1),
      sourceHash: z.string().regex(/^[0-9a-f]{64}$/),
      why: z.string().min(20),
      /** Keep the misplaced source text by appending it to the previous step's opening paragraph. */
      appendSourceToPrevious: z.boolean().default(false),
      /** What was wrong and what the new text says, for reviewers. */
      note: z.string().min(1),
    }),
  ),
);
export type StepIntros = z.infer<typeof StepIntros>;
export type StepIntro = StepIntros[string][number];
export type CurationDocument = Curation['documents'][number];
export type CurationSpace = Curation['spaces'][number];

/** content/summaries.json: a vi/en title and short summary per document key (`hoc-cloud/lab/arp`). */
export const Summaries = z.record(
  z.string().regex(/^[a-z0-9-]+\/(lab|exercise|weekly)\/[a-z0-9./-]+$/),
  z.object({ vi: z.object({ title: z.string().min(1), summary: z.string().min(10) }), en: z.object({ title: z.string().min(1), summary: z.string().min(10) }) }),
);
export type Summaries = z.infer<typeof Summaries>;

export const SUMMARY_PREFIX = 'hoc-cloud/';

/** A translation or rewritten file: front matter `source` (document key) and `sourceHash` (the Học Cloud hash it was made from). */
export interface ContentFile {
  sourceHash: string | null;
  body: string;
}

const FRONT_MATTER = /^---\n([\s\S]*?)\n---\n/;

export function parseContentFile(text: string): ContentFile {
  const match = FRONT_MATTER.exec(text.replace(/\r\n/g, '\n'));
  if (!match) return { sourceHash: null, body: text.trim() };
  const fields = new Map((match[1] ?? '').split('\n').map((line) => [line.slice(0, line.indexOf(':')).trim(), line.slice(line.indexOf(':') + 1).trim()]));
  return { sourceHash: fields.get('sourceHash') || null, body: text.replace(/\r\n/g, '\n').slice(match[0].length).trim() };
}

export class ContentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContentError';
  }
}

export interface ContentDir {
  dir: string;
  curation: Curation;
  summaries: Summaries;
  stepIntros: StepIntros;
  read(relative: string): Promise<string>;
}

function describeZod(error: z.ZodError): string {
  return error.issues
    .slice(0, 10)
    .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('; ');
}

export async function loadContentDir(dir: string): Promise<ContentDir> {
  const read = async (relative: string): Promise<string> => {
    try {
      return await readFile(path.join(dir, relative), 'utf8');
    } catch {
      throw new ContentError(`content file missing: ${relative} (in ${dir})`);
    }
  };
  const parseJson = async (relative: string): Promise<unknown> => {
    const text = await read(relative);
    try {
      return JSON.parse(text);
    } catch {
      throw new ContentError(`${relative} is not valid JSON`);
    }
  };
  const curation = Curation.safeParse(await parseJson('hoc-cloud/curation.json'));
  if (!curation.success) throw new ContentError(`hoc-cloud/curation.json is invalid: ${describeZod(curation.error)}`);
  const summaries = Summaries.safeParse(await parseJson('summaries.json'));
  if (!summaries.success) throw new ContentError(`summaries.json is invalid: ${describeZod(summaries.error)}`);
  const stepIntros = StepIntros.safeParse(await parseJson('hoc-cloud/step-intros.json'));
  if (!stepIntros.success) throw new ContentError(`hoc-cloud/step-intros.json is invalid: ${describeZod(stepIntros.error)}`);
  for (const [key, intros] of Object.entries(stepIntros.data)) {
    if (!curation.data.documents.some((d) => d.key === key)) throw new ContentError(`hoc-cloud/step-intros.json: ${key} is not curated`);
    const steps = intros.map((i) => i.step);
    if (new Set(steps).size !== steps.length) throw new ContentError(`hoc-cloud/step-intros.json: ${key} lists a step twice`);
  }
  return { dir, curation: curation.data, summaries: summaries.data, stepIntros: stepIntros.data, read };
}
