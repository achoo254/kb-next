import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Curation, SUMMARY_PREFIX, loadContentDir, parseContentFile } from './curation';

const CONTENT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../content');

describe('content/ for the Học Cloud import', () => {
  it('has exactly one summary per curated document, every title distinct', async () => {
    const { curation, summaries } = await loadContentDir(CONTENT_DIR);
    expect(Object.keys(summaries).sort()).toEqual(curation.documents.map((d) => `${SUMMARY_PREFIX}${d.key}`).sort());
    const titles = Object.values(summaries).flatMap((s) => [s.vi.title.toLowerCase(), s.en.title.toLowerCase()]);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it('rejects a curation that places a document in a collection it does not define', () => {
    const parsed = Curation.safeParse({
      version: 1,
      spaces: [{ slug: 's', name: { vi: 'S', en: 'S' }, tint: '#000000', glow: '#ffffff', art: '/art/x.webp', unit: { vi: 'bài', en: 'articles' }, sortOrder: 0, collections: [{ key: 'c', name: { vi: 'C', en: 'C' } }] }],
      documents: [{ key: 'lab/x', space: 's', collection: 'nope', order: 1 }],
    });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.map((i) => i.message)).toContain('document lab/x: no collection s/nope');
  });

  it('reads front matter of translations and rewritten pages', () => {
    expect(parseContentFile('---\nsource: lab/http\nsourceHash: abc\n---\n# T\n\nBody\n')).toEqual({ sourceHash: 'abc', body: '# T\n\nBody' });
    expect(parseContentFile('# T\n')).toEqual({ sourceHash: null, body: '# T' });
  });
});
