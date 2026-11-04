/**
 * Everything one import run will store, computed before anything is written: the Học Cloud answers are fetched,
 * redacted and validated, the curation is applied, and each document gets its Markdown, chunks, wikilinks and
 * content hash. Any mismatch throws here, so a run either writes a complete, valid set or nothing.
 */
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { ExerciseDetail, ExerciseIndex, type Lab, LabDetail, LabIndex } from './api-schema';
import { type ContentDir, ContentError, type CurationDocument, type CurationSpace, SUMMARY_PREFIX, type StepIntro, parseContentFile } from './curation';
import { createRedactor, redactJson } from './redact';
import { type Section, dropSections, splitSections } from './sections';
import type { HocCloudSource } from './source';
import { type IntroOverride, exercisePageUrl, exerciseToMarkdown, labPageUrl, labToMarkdown } from './to-markdown';

/** A stable uuid-shaped id for an imported record, so a re-run finds the same rows. */
export function importId(name: string): string {
  const hex = createHash('sha256').update(`kb-import:hoc-cloud:${name}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export const SYSTEM_SUB = 'system:hoc-cloud';
export const SYSTEM_NAME = 'Học Cloud';

/** Anchor of the passage before a document's first heading, per language (also used by AI translations). */
export const OVERVIEW_ANCHOR = { vi: 'tong-quan', en: 'overview' } as const;
const RELATED_HEADING = { vi: 'Bài liên quan', en: 'Related' } as const;
const WIKILINK = /\[\[([^\]\n|]+)(?:\|[^\]\n]*)?\]\]/g;

export interface PreparedCollection {
  id: string;
  spaceSlug: string;
  nameVi: string;
  nameEn: string;
  tint: string;
  glow: string;
  art: string | null;
  sortOrder: number;
}

export interface PreparedDocument {
  id: string;
  key: string;
  lang: 'vi' | 'en';
  translationGroupId: string;
  aiTranslated: boolean;
  spaceSlug: string;
  collectionId: string;
  sortOrder: number;
  title: string;
  type: 'lab' | 'note';
  sourceUrl: string | null;
  markdown: string;
  chunks: Section[];
  /** Ids of the documents its `[[ ]]` links point at. */
  wikilinks: string[];
  contentHash: string;
}

export interface PreparedImport {
  spaces: CurationSpace[];
  collections: PreparedCollection[];
  documents: PreparedDocument[];
  /** Things a person should look at; the run still completes. */
  warnings: string[];
  counts: { labs: number; exercises: number; weekly: number; translations: number; redactedAddresses: number };
}

function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown, what: string): T {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  const issues = parsed.error.issues
    .slice(0, 5)
    .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('; ');
  throw new ContentError(`Học Cloud ${what} does not match the expected format (${issues}); nothing was written`);
}

/** Applies exact-text fixes; each must match exactly once, or the curation went stale. */
function applyFixes(markdown: string, doc: CurationDocument): string {
  let text = markdown;
  for (const fix of doc.fixes) {
    const count = text.split(fix.find).length - 1;
    if (count !== 1) throw new ContentError(`curation of ${doc.key}: fix "${fix.find.slice(0, 40)}" matches ${count} times, expected once`);
    text = text.replace(fix.find, () => fix.replace);
  }
  return text;
}

function sha256(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

interface Draft {
  doc: CurationDocument;
  lang: 'vi' | 'en';
  title: string;
  type: 'lab' | 'note';
  sourceUrl: string | null;
  sourceHash: string;
  markdown: string;
  aiTranslated: boolean;
}

export async function prepareImport(source: HocCloudSource, content: ContentDir): Promise<PreparedImport> {
  const { curation, summaries } = content;
  const warnings: string[] = [];
  let redactedAddresses = 0;
  /** One redactor per answer: placeholder numbers are per document. */
  const fetchRedacted = async (apiPath: string): Promise<unknown> => {
    const redact = createRedactor();
    const value = redactJson(await source.getJson(apiPath), redact);
    redactedAddresses += redact.redacted;
    return value;
  };

  const labIndex = parseOrThrow(LabIndex, await fetchRedacted('/api/labs'), 'lab list');
  const exerciseIndex = parseOrThrow(ExerciseIndex, await fetchRedacted('/api/exercises'), 'exercise list');
  const curated = new Map(curation.documents.map((doc) => [doc.key, doc]));
  const upstream = new Set([...labIndex.labs.map((l) => `lab/${l.slug}`), ...exerciseIndex.exercises.map((e) => `exercise/${e.slug}`)]);
  for (const key of upstream) if (!curated.has(key)) warnings.push(`${key} is new on Học Cloud and not curated yet: skipped (add it to content/hoc-cloud/curation.json)`);

  const titleOf = (key: string, lang: 'vi' | 'en'): string => {
    const summary = summaries[`${SUMMARY_PREFIX}${key}`];
    if (!summary) throw new ContentError(`content/summaries.json has no entry ${SUMMARY_PREFIX}${key}`);
    return summary[lang].title;
  };

  const drafts: Draft[] = [];
  const counts = { labs: 0, exercises: 0, weekly: 0, translations: 0, redactedAddresses: 0 };
  for (const doc of curation.documents) {
    const [kind, slug = ''] = doc.key.split(/\/(.*)/s);
    let generated: string;
    let sourceHash: string;
    let sourceUrl: string | null = null;
    if (kind === 'weekly') {
      if (!doc.markdown) throw new ContentError(`curation of ${doc.key}: no markdown file`);
      const file = parseContentFile(await content.read(doc.markdown));
      generated = file.body;
      sourceHash = createHash('sha256').update(file.body).digest('hex');
      counts.weekly += 1;
    } else {
      if (!upstream.has(doc.key)) {
        warnings.push(`${doc.key} is curated but no longer on Học Cloud: kept as stored`);
        continue;
      }
      if (kind === 'lab') {
        const { lab } = parseOrThrow(LabDetail, await fetchRedacted(`/api/labs/${slug}`), `lab ${slug}`);
        generated = labToMarkdown(lab, source.baseUrl, checkedIntros(doc.key, lab, content.stepIntros[doc.key] ?? [], warnings));
        sourceHash = lab.content_hash;
        sourceUrl = labPageUrl(source.baseUrl, slug);
        counts.labs += 1;
      } else {
        const { exercise } = parseOrThrow(ExerciseDetail, await fetchRedacted(`/api/exercises/${slug}`), `exercise ${slug}`);
        generated = exerciseToMarkdown(exercise, source.baseUrl);
        sourceHash = exercise.content_hash;
        sourceUrl = exercisePageUrl(source.baseUrl, slug);
        counts.exercises += 1;
      }
      if (doc.markdown) {
        const file = parseContentFile(await content.read(doc.markdown));
        if (file.sourceHash !== sourceHash) warnings.push(`${doc.markdown} was rewritten from an older ${doc.key}: review it against Học Cloud`);
        generated = file.body;
      }
    }
    let markdown: string;
    try {
      markdown = dropSections(
        applyFixes(generated, doc),
        doc.drop.map((d) => d.anchor),
        OVERVIEW_ANCHOR.vi,
      );
    } catch (error) {
      if (error instanceof ContentError) throw error;
      throw new ContentError(`curation of ${doc.key}: ${error instanceof Error ? error.message : 'invalid'}`);
    }
    const title = titleOf(doc.key, 'vi');
    drafts.push({ doc, lang: 'vi', title, type: kind === 'weekly' ? 'note' : 'lab', sourceUrl, sourceHash, markdown: withTitle(markdown, title), aiTranslated: false });
  }

  for (const translation of curation.translations) {
    const original = drafts.find((d) => d.doc.key === translation.key);
    if (!original) continue; // its source vanished upstream: warned above
    const file = parseContentFile(await content.read(translation.file));
    if (file.sourceHash !== original.sourceHash) warnings.push(`${translation.file} was translated from an older ${translation.key}: update the translation`);
    const title = titleOf(translation.key, 'en');
    // The translation's own text decides whether it changed; an upstream change of the original only warns.
    const sourceHash = createHash('sha256').update(file.body).digest('hex');
    drafts.push({ ...original, lang: 'en', title, sourceHash, markdown: withTitle(file.body, title), aiTranslated: true });
    counts.translations += 1;
  }

  // Wikilinks resolve by title (vi or en) to the Vietnamese document of that key.
  const byTitle = new Map<string, string>();
  for (const doc of curation.documents) {
    const id = documentId(doc.key, 'vi');
    byTitle.set(titleOf(doc.key, 'vi').toLowerCase(), id);
    byTitle.set(titleOf(doc.key, 'en').toLowerCase(), id);
  }

  const collections = curation.spaces.flatMap((space) =>
    space.collections.map(
      (c, i): PreparedCollection => ({
        id: collectionId(space.slug, c.key),
        spaceSlug: space.slug,
        nameVi: c.name.vi,
        nameEn: c.name.en,
        tint: c.tint ?? space.tint,
        glow: c.glow ?? space.glow,
        art: c.art ?? null,
        sortOrder: i,
      }),
    ),
  );
  const collectionIndex = new Map(curation.spaces.flatMap((space) => space.collections.map((c, i) => [`${space.slug}/${c.key}`, i] as const)));

  const documents = drafts.map((draft): PreparedDocument => {
    const related = draft.doc.related.map((key) => `- [[${titleOf(key, draft.lang)}]]`);
    const markdown = related.length > 0 ? `${draft.markdown}\n\n## ${RELATED_HEADING[draft.lang]}\n\n${related.join('\n')}` : draft.markdown;
    const wikilinks = [...new Set(wikilinkTitles(markdown).map((title) => {
      const id = byTitle.get(title.toLowerCase());
      if (!id) throw new ContentError(`${draft.doc.key} (${draft.lang}) links to [[${title}]], which is no curated document title`);
      return id;
    }))];
    const id = documentId(draft.doc.key, draft.lang);
    const place = {
      spaceSlug: draft.doc.space,
      collectionId: collectionId(draft.doc.space, draft.doc.collection),
      sortOrder: (collectionIndex.get(`${draft.doc.space}/${draft.doc.collection}`) ?? 0) * 100 + draft.doc.order,
    };
    const fields = {
      id,
      key: draft.doc.key,
      lang: draft.lang,
      translationGroupId: importId(`group:${draft.doc.key}`),
      aiTranslated: draft.aiTranslated,
      ...place,
      title: draft.title,
      type: draft.type,
      sourceUrl: draft.sourceUrl,
      markdown,
      chunks: splitSections(markdown, OVERVIEW_ANCHOR[draft.lang]),
      wikilinks: wikilinks.filter((target) => target !== id),
    };
    const contentHash = sha256({ curation: draft.doc.revision, source: draft.sourceHash, ...fields, chunks: undefined });
    return { ...fields, contentHash };
  });

  counts.redactedAddresses = redactedAddresses;
  return { spaces: curation.spaces, collections, documents, warnings, counts };
}

/** sha256 of a source text, as step-intros.json records it. */
export function textHash(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/** The step intros whose source text is still the one they were written against; the others warn and fall back. */
function checkedIntros(key: string, lab: Lab, intros: readonly StepIntro[], warnings: string[]): Map<number, IntroOverride> {
  const valid = new Map<number, IntroOverride>();
  for (const intro of intros) {
    const step = lab.walkthrough[intro.step - 1];
    if (!step) {
      warnings.push(`step-intros.json: ${key} has no step ${intro.step} any more: the override is ignored`);
    } else if (textHash(step.why) !== intro.sourceHash) {
      warnings.push(`step-intros.json: ${key} step ${intro.step} changed on Học Cloud: showing the source text, review the override`);
    } else {
      valid.set(intro.step, { why: intro.why, appendSourceToPrevious: intro.appendSourceToPrevious });
    }
  }
  return valid;
}

export function documentId(key: string, lang: 'vi' | 'en'): string {
  return importId(`document:${key}:${lang}`);
}

export function collectionId(spaceSlug: string, key: string): string {
  return importId(`collection:${spaceSlug}:${key}`);
}

/** The Markdown with the curated title as its `#` line (the source's own title line replaced). */
function withTitle(markdown: string, title: string): string {
  const body = markdown.replace(/^\s*#\s+[^\n]*\n?/, '');
  return `# ${title}\n\n${body.trim()}`;
}

/** Titles named by `[[Title]]` or `[[Title|label]]`, outside fenced code. */
export function wikilinkTitles(markdown: string): string[] {
  const titles: string[] = [];
  let inFence = false;
  for (const line of markdown.split('\n')) {
    if (/^\s*(`{3,}|~{3,})/.test(line)) inFence = !inFence;
    if (inFence) continue;
    for (const m of line.matchAll(WIKILINK)) if (m[1]) titles.push(m[1].trim());
  }
  return titles;
}
