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
  findApproval,
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
import { editRight } from '../access/authoring';
import { currentFileOf } from '../access/files';
import { favoriteIds } from '../access/my-content';
import { EDITABLE_KINDS, type FileKind, kindOfMime } from '../files/file-kinds';
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
  langsOf,
  pickIn,
  pickTexts,
  readingMinutes,
  spaceBrief,
  tableOfContents,
} from './content-views';
import { neighbours, relevance, spaceRelevance, termsOf } from './relevance';
import { summarize } from './summaries';
import { type LinkCandidate, bestLinkTarget } from '../authoring/link-targets';
import { linkedTitles } from '../authoring/markdown-text';
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
  /** When the Space's latest readable text changed (ISO); null when it has none. The Universe puts the liveliest first. */
  updatedAt: string | null;
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
  /** A collection without its own image shows the Space's crystal, matching its tint (which falls back to the Space's too). */
  collections: Array<CollectionBrief & { tint: string; glow: string; art: string; documentCount: number; documents: DocumentSummary[] }>;
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
    tags: string[];
    /** The viewer manages its share link: its author or an admin (C18). */
    canShare: boolean;
    /** When it was last approved (C11 "Linh duyệt 03/11"); null when never. */
    reviewedAt: string | null;
    /** Anchor of the passage the signed-in viewer read last (resume there); null for a guest or not started. */
    readAnchor: string | null;
    /** The signed-in viewer marked it as favourite (C08 "Yêu thích"); null for a guest. */
    favorite: boolean | null;
    collection: CollectionBrief | null;
    space: SpaceBrief & { art: string; kind: 'public' | 'personal' };
  };
  translations: Array<{ id: string; lang: Lang; aiTranslated: boolean }>;
  toc: TocEntry[];
  chunks: Array<{ anchor: string; heading: string | null; markdown: string }>;
  backlinks: LinkedDocument[];
  outgoing: LinkedDocument[];
  /**
   * `[[ ]]` titles written in the text, each with the readable document it links (C11 draws them as links); a title
   * whose document the viewer may not read, or that links nothing, is not here and stays plain text.
   */
  wikilinks: Array<{ title: string; id: string }>;
  /** Most related readable texts first: same Space or linked, scored in code. */
  related: Array<WithRelevance<DocumentSummary>>;
  versions: Array<{ version: number; editorName: string | null; createdAt: string }>;
  /**
   * The stored file of an Office document's current version (C11 opens it in the editor); null for a text.
   * `editable`: the viewer may save a new version and the editor opens that kind (docx, xlsx, pptx).
   */
  file: { id: string; name: string; kind: FileKind; size: number; version: number; savedAt: string; editable: boolean } | null;
}

/**
 * Which readable document each `[[ ]]` title of `markdown` links: a link row does not keep the title it was written
 * as, so the save's choice (src/authoring/link-targets.ts) is replayed over the document's own readable wikilink
 * targets. When the document the save chose is one the viewer may not read, its title links nothing here.
 */
export function writtenLinks(markdown: string, targets: readonly LinkCandidate[], lang: DocumentRow['lang']): Array<{ title: string; id: string }> {
  return linkedTitles(markdown).flatMap((title) => {
    const target = bestLinkTarget(title, targets, lang);
    return target ? [{ title, id: target.id }] : [];
  });
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

  const summaries = (viewer: Viewer, picked: ReadonlyArray<{ doc: DocumentRow; langs: Lang[] }>): Promise<DocumentSummary[]> => summarize(db, viewer, picked);

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
      updatedAt: spaces[i]?.latestAt?.toISOString() ?? null,
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
      return { ...collectionBrief(c), tint: c.tint, glow: c.glow, art: c.art ?? space.art, documentCount: documents.length, documents };
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
    const group = await listTranslationsOf(db, viewer, [opened.translationGroupId ?? opened.id]);
    const members = group.some((d) => d.id === opened.id) ? group : [opened, ...group];
    const doc = pickIn(members, lang);
    const langs = langsOf(members);

    const [chunkRows, latest, linkRows, versions, approval, spaceRows, collectionRows] = await Promise.all([
      listChunks(db, viewer, doc.id),
      findLatestVersion(db, viewer, doc.id),
      listLinks(db, viewer, doc.id),
      listVersionSummaries(db, viewer, doc.id),
      findApproval(db, viewer, doc.id),
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

    const names = await userNames(db, [doc.authorId, ...(versions ?? []).map((v) => v.editorId), ...(approval ? [approval.actorId] : [])]);
    const [summary] = await summaries(viewer, [{ doc, langs }]);
    const [progress, favorite] =
      viewer.kind === 'user' ? await Promise.all([progressOf(db, viewer.userId, [doc.id]).then((rows) => rows.get(doc.id)), favoriteIds(db, viewer.userId, [doc.id]).then((ids) => ids.has(doc.id))]) : [undefined, null];
    if (!summary) throw new Error('document summary missing');
    const collection = collectionRows.find((c) => c.id === doc.collectionId);
    const stored = doc.type === 'office' ? await currentFileOf(db, viewer, doc.id) : null;
    const storedKind = stored ? kindOfMime(stored.mime) : null;
    const body: DocumentResponse = {
      lang,
      translationAvailable: doc.lang === lang,
      document: {
        ...summary,
        sourceUrl: doc.sourceUrl,
        createdAt: doc.createdAt.toISOString(),
        readingMinutes: readingMinutes(chunks.map((c) => c.text)),
        tags: doc.tags,
        canShare: viewer.kind === 'user' && (viewer.isAdmin || viewer.userId === doc.authorId),
        reviewedBy: approval ? (names.get(approval.actorId) ?? null) : null,
        reviewedAt: approval ? approval.at.toISOString() : null,
        readAnchor: progress?.anchor ?? null,
        favorite,
        collection: collection ? collectionBrief(collection) : null,
        space: { ...spaceBrief(space), art: space.art, kind: space.kind },
      },
      translations: members.map((d) => ({ id: d.id, lang: d.lang, aiTranslated: d.aiTranslated })),
      toc: tableOfContents(chunks, latest?.markdown ?? null),
      chunks: chunks.map((c) => ({ anchor: c.anchor, heading: c.heading, markdown: c.text })),
      backlinks: linked('in'),
      outgoing: linked('out'),
      wikilinks: writtenLinks(chunks.map((c) => c.text).join('\n\n'), others.filter((d) => links.some((l) => l.kind === 'wikilink' && l.sourceId === doc.id && l.targetId === d.id)), doc.lang),
      related,
      versions: (versions ?? []).map((v) => ({ version: v.version, editorName: names.get(v.editorId) ?? null, createdAt: v.createdAt.toISOString() })),
      file:
        stored && storedKind
          ? {
              id: stored.id,
              name: stored.originalName,
              kind: storedKind,
              size: stored.size,
              version: stored.version,
              savedAt: stored.savedAt.toISOString(),
              editable: EDITABLE_KINDS.has(storedKind) && editRight(viewer, doc) === 'ok',
            }
          : null,
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
