/**
 * The reading API behind the Universe (C09), a Space (C10) and the reader (C11): GET /api/spaces,
 * /api/spaces/:slug, /api/documents/:id and /api/recent. Every read goes through src/access/ with the viewer of
 * the session (a guest without one), so a document the viewer may not read never shows up, not even as the
 * other end of a link. Texts come in the reader's language (`?lang=`, else the account's, else Vietnamese).
 */
import express, { type Router } from 'express';
import { type CollectionRow, type DocumentRow, type SpaceRow, findLatestVersion, listChunks, listDocuments, listLinks, listSpaces } from '../access/content';
import { headingsOf, linksTouching, progressOf } from '../access/participation';
import {
  findApproverId,
  findDocumentsByIds,
  linkedSpaceCounts,
  listCollectionsOf,
  listRecentDocuments,
  listTranslationsOf,
  listVersionSummaries,
  spaceAccess,
  spacesById,
  userNames,
} from '../access/reading';
import type { Viewer } from '../access/viewer';
import { type Caption, type SpaceCaptions, captionInputsFor, fallbackCaption, textTotal } from '../captions/space-captions';
import type { ServerConfig } from '../config';
import type { Db } from '../db/client';
import { HttpError } from '../http-error';
import {
  type CollectionBrief,
  type DocumentSummary,
  type Lang,
  type SpaceBrief,
  type SpaceCard,
  type TocEntry,
  collectionBrief,
  documentSummary,
  langsOf,
  pickIn,
  pickTexts,
  readingMinutes,
  spaceBrief,
  tableOfContents,
} from './content-views';
import { neighbours, relevance, spaceRelevance, termsOf } from './relevance';
import { openDocument, readerOf } from './request-context';
import { type SpaceMember, type SpacePermissions, spaceMembers, spacePermissions } from './space-members';

export const RECENT_LIMIT = 8;
const RELATED_DOCUMENTS = 5;
const RELATED_SPACES = 2;
/** How many recent documents are read before keeping one per text (translations update together). */
const RECENT_WINDOW = RECENT_LIMIT * 4;

const SLUG = /^[a-z0-9][a-z0-9-]{0,119}$/;

export interface SpaceListItem extends SpaceCard {
  collections: CollectionBrief[];
}

/** A related Space or document with how related it is, 0–100 (src/api/relevance.ts). */
export type WithRelevance<T> = T & { relevance: number };

export interface SpaceDetailResponse {
  /** The Space with its one-line description (C10, under the name), in both languages; null when not written. */
  space: SpaceCard & { descriptionVi: string | null; descriptionEn: string | null };
  /** C10 "Thành viên & quyền", owners and admins first. */
  members: SpaceMember[];
  /** What the viewer may do in this Space. */
  permissions: SpacePermissions;
  collections: Array<CollectionBrief & { tint: string; glow: string; art: string | null; documentCount: number; documents: DocumentSummary[] }>;
  /** Documents of the Space outside any collection (the personal Space's files). */
  uncollected: DocumentSummary[];
  related: Array<WithRelevance<SpaceCard>>;
}

export interface LinkedDocument {
  kind: 'wikilink' | 'relation';
  label: string | null;
  document: DocumentSummary;
}

export interface DocumentResponse {
  /** The language asked for. */
  lang: Lang;
  /** false: no readable text in `lang`; `document` is the original (the UI offers "Dịch bằng AI"). */
  translationAvailable: boolean;
  document: DocumentSummary & {
    sourceUrl: string | null;
    createdAt: string;
    readingMinutes: number;
    reviewedBy: string | null;
    /** Anchor of the passage the signed-in viewer read last (resume there); null for a guest or not started. */
    readAnchor: string | null;
    collection: CollectionBrief | null;
    space: SpaceBrief & { art: string; kind: 'public' | 'personal' };
  };
  translations: Array<{ id: string; lang: Lang; aiTranslated: boolean }>;
  toc: TocEntry[];
  chunks: Array<{ anchor: string; heading: string | null; markdown: string }>;
  backlinks: LinkedDocument[];
  outgoing: LinkedDocument[];
  /** Most related readable texts first: same Space or linked, scored in code. */
  related: Array<WithRelevance<DocumentSummary>>;
  versions: Array<{ version: number; editorName: string | null; createdAt: string }>;
}

export interface ContentRoutesOptions {
  config: ServerConfig;
  db: Db;
  now: () => Date;
  captions: SpaceCaptions;
}

export function contentRoutes({ config, db, now, captions }: ContentRoutesOptions): Router {
  const router = express.Router();

  const reader = (req: Parameters<typeof readerOf>[0]) => readerOf(req, { config, db, now });

  /** Readable text counts and captions of the given Spaces. */
  async function spaceCards(viewer: Viewer, spaces: readonly SpaceRow[]): Promise<SpaceCard[]> {
    const collections = await listCollectionsOf(
      db,
      spaces.map((s) => s.id),
    );
    const inputs = await captionInputsFor(db, viewer, spaces);
    const chosen = await captions.captionsFor(inputs);
    return spaces.map((space, i) => {
      const input = inputs[i];
      const documentCount = input ? textTotal(input) : 0;
      const caption: Caption = chosen.get(space.id) ?? fallbackCaption(documentCount);
      return {
        ...spaceBrief(space),
        art: space.art,
        kind: space.kind,
        caption,
        documentCount,
        collectionCount: collections.filter((c) => c.spaceId === space.id).length,
      };
    });
  }

  /** Summaries of documents, in order, with their authors, Spaces and the viewer's reading progress. */
  async function summaries(viewer: Viewer, picked: ReadonlyArray<{ doc: DocumentRow; langs: Lang[] }>): Promise<DocumentSummary[]> {
    const ids = picked.map((p) => p.doc.id);
    const authors = await userNames(
      db,
      picked.map((p) => p.doc.authorId),
    );
    const spaces = new Map((await spacesById(db, [...new Set(picked.map((p) => p.doc.spaceId))])).map((s) => [s.id, s]));
    const progress = viewer.kind === 'user' ? await progressOf(db, viewer.userId, ids) : null;
    return picked.flatMap(({ doc, langs }) => {
      const space = spaces.get(doc.spaceId);
      const read = progress ? (progress.get(doc.id)?.progress ?? 0) : null;
      return space ? [documentSummary(doc, langs, space, authors.get(doc.authorId) ?? null, read)] : [];
    });
  }

  /**
   * Texts related to `doc`, most related first: the readable texts of its Space and those it links with (`linked`),
   * one per text in `lang`, scored by src/api/relevance.ts; ties keep the Space's order.
   */
  async function relatedDocuments(viewer: Viewer, lang: Lang, doc: DocumentRow, linked: readonly DocumentRow[]): Promise<Array<WithRelevance<DocumentSummary>>> {
    const ownKey = doc.translationGroupId ?? doc.id;
    const pool = [...(await listDocuments(db, viewer, { spaceId: doc.spaceId })), ...linked.filter((d) => d.spaceId !== doc.spaceId)];
    const candidates = pickTexts(
      pool.filter((d) => (d.translationGroupId ?? d.id) !== ownKey),
      lang,
    );
    const ids = [doc.id, ...candidates.map((c) => c.doc.id)];
    const [headings, pairs] = await Promise.all([headingsOf(db, viewer, ids), linksTouching(db, viewer, ids)]);
    const graph = neighbours(pairs);
    const features = (d: DocumentRow) => ({ id: d.id, spaceId: d.spaceId, collectionId: d.collectionId, terms: termsOf([d.title, ...(headings.get(d.id) ?? [])]) });
    const own = features(doc);
    const scored = candidates
      .map((c, order) => ({ ...c, order, score: relevance(own, features(c.doc), graph) }))
      .sort((a, b) => b.score - a.score || a.order - b.order)
      .slice(0, RELATED_DOCUMENTS);
    const scores = new Map(scored.map((c) => [c.doc.id, c.score]));
    return (await summaries(viewer, scored)).map((summary) => ({ ...summary, relevance: scores.get(summary.id) ?? 0 }));
  }

  router.get('/api/spaces', async (req, res) => {
    const { viewer } = await reader(req);
    const spaces = await listSpaces(db, viewer);
    const cards = await spaceCards(viewer, spaces);
    const collections = await listCollectionsOf(
      db,
      spaces.map((s) => s.id),
    );
    const items: SpaceListItem[] = cards.map((card, i) => ({
      ...card,
      collections: collections.filter((c) => c.spaceId === spaces[i]?.id).map(collectionBrief),
    }));
    res.set('Cache-Control', 'no-store').json({ spaces: items });
  });

  router.get('/api/spaces/:slug', async (req, res) => {
    const { viewer, lang } = await reader(req);
    const slug = req.params.slug;
    if (typeof slug !== 'string' || !SLUG.test(slug)) throw new HttpError(404, 'not-found');
    const access = await spaceAccess(db, viewer, slug);
    if (access.kind === 'not-found') throw new HttpError(404, 'not-found');
    if (access.kind === 'no-access') throw new HttpError(403, 'no-access');
    const { space } = access;

    const texts = pickTexts(await listDocuments(db, viewer, { spaceId: space.id }), lang);
    const listed = await summaries(viewer, texts);
    const byId = new Map(listed.map((s) => [s.id, s]));
    const inCollection = (collectionId: string | null): DocumentSummary[] =>
      texts.flatMap(({ doc }) => {
        const summary = byId.get(doc.id);
        return summary && doc.collectionId === collectionId ? [summary] : [];
      });
    const collections = (await listCollectionsOf(db, [space.id])).map((c: CollectionRow) => {
      const documents = inCollection(c.id);
      return { ...collectionBrief(c), tint: c.tint, glow: c.glow, art: c.art, documentCount: documents.length, documents };
    });

    // Related: Spaces linked to this one, most linked first; else the next public Spaces of the Universe.
    const visible = await listSpaces(db, viewer);
    const linkCounts = await linkedSpaceCounts(db, viewer, space.id);
    const linked = linkCounts.flatMap(({ spaceId }) => visible.filter((s) => s.id === spaceId));
    const position = visible.findIndex((s) => s.id === space.id);
    const following = [...visible.slice(position + 1), ...visible.slice(0, Math.max(position, 0))].filter((s) => s.kind === 'public');
    const related: SpaceRow[] = [];
    for (const candidate of [...linked, ...following]) {
      if (related.length === RELATED_SPACES) break;
      if (candidate.id !== space.id && !related.some((r) => r.id === candidate.id)) related.push(candidate);
    }
    const [card, ...relatedCards] = await spaceCards(viewer, [space, ...related]);
    if (!card) throw new Error('space card missing');
    const body: SpaceDetailResponse = {
      space: { ...card, descriptionVi: space.descriptionVi, descriptionEn: space.descriptionEn },
      members: await spaceMembers(db, config.adminSubs, space),
      permissions: await spacePermissions(db, viewer, space),
      collections,
      uncollected: inCollection(null),
      related: relatedCards.map((c, i) => ({ ...c, relevance: spaceRelevance(linkCounts.find((l) => l.spaceId === related[i]?.id)?.links ?? 0) })),
    };
    res.set('Cache-Control', 'no-store').json(body);
  });

  router.get('/api/documents/:id', async (req, res) => {
    const { viewer, lang } = await reader(req);
    const opened = await openDocument(db, viewer, req.params.id);
    const group = opened.translationGroupId ? await listTranslationsOf(db, viewer, [opened.translationGroupId]) : [opened];
    const members = group.some((d) => d.id === opened.id) ? group : [opened, ...group];
    const doc = pickIn(members, lang);
    const langs = langsOf(members);

    const [chunkRows, latest, linkRows, versions, approverId, spaceRows, collectionRows] = await Promise.all([
      listChunks(db, viewer, doc.id),
      findLatestVersion(db, viewer, doc.id),
      listLinks(db, viewer, doc.id),
      listVersionSummaries(db, viewer, doc.id),
      findApproverId(db, viewer, doc.id),
      spacesById(db, [doc.spaceId]),
      listCollectionsOf(db, [doc.spaceId]),
    ]);
    const space = spaceRows[0];
    if (!space) throw new Error('document without its Space');
    const chunks = chunkRows ?? [];

    const links = linkRows ?? [];
    const otherIds = links.map((l) => (l.sourceId === doc.id ? l.targetId : l.sourceId));
    const others = await findDocumentsByIds(db, viewer, otherIds);
    const otherSummaries = new Map((await summaries(viewer, others.map((d) => ({ doc: d, langs: [d.lang] })))).map((s) => [s.id, s]));
    const linked = (direction: 'in' | 'out'): LinkedDocument[] =>
      links.flatMap((link) => {
        const otherId = direction === 'in' ? link.sourceId : link.targetId;
        const mine = direction === 'in' ? link.targetId : link.sourceId;
        const summary = otherSummaries.get(otherId);
        return mine === doc.id && otherId !== doc.id && summary ? [{ kind: link.kind, label: link.label, document: summary }] : [];
      });

    const related = await relatedDocuments(viewer, lang, doc, others);

    const names = await userNames(db, [doc.authorId, ...(versions ?? []).map((v) => v.editorId), ...(approverId ? [approverId] : [])]);
    const [summary] = await summaries(viewer, [{ doc, langs }]);
    const progress = viewer.kind === 'user' ? (await progressOf(db, viewer.userId, [doc.id])).get(doc.id) : undefined;
    if (!summary) throw new Error('document summary missing');
    const collection = collectionRows.find((c) => c.id === doc.collectionId);
    const body: DocumentResponse = {
      lang,
      translationAvailable: doc.lang === lang,
      document: {
        ...summary,
        sourceUrl: doc.sourceUrl,
        createdAt: doc.createdAt.toISOString(),
        readingMinutes: readingMinutes(chunks.map((c) => c.text)),
        reviewedBy: approverId ? (names.get(approverId) ?? null) : null,
        readAnchor: progress?.anchor ?? null,
        collection: collection ? collectionBrief(collection) : null,
        space: { ...spaceBrief(space), art: space.art, kind: space.kind },
      },
      translations: members.map((d) => ({ id: d.id, lang: d.lang, aiTranslated: d.aiTranslated })),
      toc: tableOfContents(chunks, latest?.markdown ?? null),
      chunks: chunks.map((c) => ({ anchor: c.anchor, heading: c.heading, markdown: c.text })),
      backlinks: linked('in'),
      outgoing: linked('out'),
      related,
      versions: (versions ?? []).map((v) => ({ version: v.version, editorName: names.get(v.editorId) ?? null, createdAt: v.createdAt.toISOString() })),
    };
    res.set('Cache-Control', 'no-store').json(body);
  });

  router.get('/api/recent', async (req, res) => {
    const { viewer, lang } = await reader(req);
    const recent = pickTexts(await listRecentDocuments(db, viewer, RECENT_WINDOW), lang).slice(0, RECENT_LIMIT);
    res.set('Cache-Control', 'no-store').json({ documents: await summaries(viewer, recent) });
  });

  return router;
}
