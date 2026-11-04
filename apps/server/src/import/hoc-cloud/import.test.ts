/**
 * The Học Cloud import end to end, on the recorded API answers (test/fixtures/hoc-cloud/), the repository's
 * content/ and a real Meilisearch: what one run stores, that a second run writes nothing, that a changed source
 * gives exactly one new version, that a malformed answer writes nothing, and that imported text is searchable.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { count, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { findPublicInfo } from '../../../../../scripts/check-public-info';
import { fixtureSource, HOC_CLOUD_FIXTURES } from '../../../test/hoc-cloud-fixtures';
import { MEILI_SETUP_TIMEOUT_MS, type TestMeili, startTestMeili } from '../../../test/meili';
import { findDocument, listCollections, listDocuments, listSpaces } from '../../access/content';
import { searchChunks } from '../../access/search';
import { GUEST } from '../../access/viewer';
import { type DbHandle, openPglite } from '../../db/client';
import { chunks, documentVersions, documents, links, users } from '../../db/schema';
import { type ContentDir, ContentError, loadContentDir } from './curation';
import { SYSTEM_SUB, documentId } from './prepare';
import { runImport } from './run-import';

const CONTENT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../content');

let database: DbHandle;
let meili: TestMeili;
let content: ContentDir;

async function rows(table: typeof documents | typeof documentVersions | typeof chunks | typeof links | typeof users): Promise<number> {
  const [row] = await database.db.select({ n: count() }).from(table);
  return Number(row?.n ?? 0);
}

async function fixture(apiPath: string): Promise<Record<string, unknown>> {
  const file = apiPath.replace(/^\/api\//, '');
  return JSON.parse(await readFile(path.join(HOC_CLOUD_FIXTURES, `${file}.json`), 'utf8')) as Record<string, unknown>;
}

beforeAll(async () => {
  database = await openPglite();
  meili = await startTestMeili();
  content = await loadContentDir(CONTENT_DIR);
}, MEILI_SETUP_TIMEOUT_MS);

afterAll(async () => {
  await meili?.close();
  await database?.close();
});

describe('Học Cloud import', () => {
  it('stops on a malformed answer before writing anything', async () => {
    const dns = await fixture('/api/labs/dns');
    const broken = { lab: { ...(dns.lab as Record<string, unknown>), walkthrough: 'not a list' } };
    await expect(runImport(database.db, fixtureSource(undefined, { '/api/labs/dns': broken }), content, { meili: meili.client })).rejects.toThrow(ContentError);
    await expect(runImport(database.db, fixtureSource(undefined, { '/api/labs/dns': broken }), content, { meili: meili.client })).rejects.toThrow(/lab dns.*walkthrough/);
    expect(await rows(documents)).toBe(0);
    expect(await rows(users)).toBe(0);
  });

  it('imports every curated document once, public and official', async () => {
    const report = await runImport(database.db, fixtureSource(), content, { meili: meili.client });
    expect(report.counts).toMatchObject({ labs: 19, exercises: 11, weekly: 4, translations: 3 });
    // The fixtures were recorded through the same redaction: nothing is left to replace (redact.test.ts covers it).
    expect(report.counts.redactedAddresses).toBe(0);
    expect(report.created).toHaveLength(37);
    expect(report.updated).toHaveLength(0);
    expect(report.indexed).toBe(true);
    expect(report.warnings).toEqual([]);

    const visible = await listDocuments(database.db, GUEST);
    expect(visible).toHaveLength(37);
    expect(new Set(visible.map((d) => d.origin))).toEqual(new Set(['official']));
    expect(visible.every((d) => d.status === 'approved' && !d.hidden)).toBe(true);
    const [author] = await database.db.select({ id: users.id }).from(users).where(eq(users.sub, SYSTEM_SUB));
    expect(visible.every((d) => d.authorId === author?.id)).toBe(true);
    expect(visible.filter((d) => d.type === 'lab').every((d) => d.sourceUrl?.startsWith('https://hoc-cloud.inetdev.io.vn/'))).toBe(true);

    const http = await findDocument(database.db, GUEST, documentId('lab/http', 'vi'));
    const httpEn = await findDocument(database.db, GUEST, documentId('lab/http', 'en'));
    expect(http).toMatchObject({ lang: 'vi', aiTranslated: false, sourceUrl: 'https://hoc-cloud.inetdev.io.vn/lab/http' });
    expect(httpEn).toMatchObject({ lang: 'en', aiTranslated: true, origin: 'official', translationGroupId: http?.translationGroupId });

    const spaces = await listSpaces(database.db, GUEST);
    const networking = spaces.find((s) => s.slug === 'networking');
    expect(networking?.documentCount).toBe(11);
    // Every curated Space gets its one-line description in both languages (C10).
    expect(networking).toMatchObject({ descriptionVi: 'Máy tính nói chuyện với nhau thế nào, từ cắm dây tới mở web.', descriptionEn: expect.stringMatching(/^How computers talk/) as string });
    expect(spaces.every((s) => Boolean(s.descriptionVi) && Boolean(s.descriptionEn))).toBe(true);
    const collections = await listCollections(database.db, GUEST, networking?.id ?? '');
    expect(collections?.map((c) => [c.nameVi, c.documentCount])).toEqual([
      ['Hành trình gói tin', 1],
      ['Địa chỉ', 1],
      ['Giao thức nền tảng', 5], // with the DNS translation
      ['Truyền tải & Web', 4], // with the TCP/UDP and HTTP translations
    ]);
    expect(await rows(links)).toBeGreaterThan(0);
  });

  it('writes nothing when run again', async () => {
    const before = { documents: await rows(documents), versions: await rows(documentVersions), chunks: await rows(chunks), links: await rows(links) };
    const report = await runImport(database.db, fixtureSource(), content, { meili: meili.client });
    expect(report.created).toEqual([]);
    expect(report.updated).toEqual([]);
    expect(report.unchanged).toBe(37);
    expect(report.spacesCreated + report.collectionsCreated).toBe(0);
    expect({ documents: await rows(documents), versions: await rows(documentVersions), chunks: await rows(chunks), links: await rows(links) }).toEqual(before);
  });

  it('gives a changed source exactly one new version', async () => {
    const arp = await fixture('/api/labs/arp');
    const changed = { lab: { ...(arp.lab as Record<string, unknown>), content_hash: 'changed-upstream' } };
    const versionsBefore = await rows(documentVersions);
    const report = await runImport(database.db, fixtureSource(undefined, { '/api/labs/arp': changed }), content, { meili: meili.client });
    expect(report.created).toEqual([]);
    expect(report.updated).toEqual([documentId('lab/arp', 'vi')]);
    expect(await rows(documentVersions)).toBe(versionsBefore + 1);
    const versions = await database.db
      .select({ version: documentVersions.version })
      .from(documentVersions)
      .where(eq(documentVersions.documentId, documentId('lab/arp', 'vi')));
    expect(versions.map((v) => v.version).sort()).toEqual([1, 2]);
  });

  it('stores no server address, SSH port or login', async () => {
    const versions = await database.db.select({ markdown: documentVersions.markdown }).from(documentVersions);
    const findings = versions.flatMap((v, i) => findPublicInfo(v.markdown ?? '', `content/imported-${i}.md`));
    expect(findings).toEqual([]);
  });

  it('makes imported text searchable', async () => {
    const hits = await searchChunks(database.db, meili.client, GUEST, 'DHCPDISCOVER');
    expect(hits.map((h) => h.title)).toContain('Giao thức DHCP');
  });
});
