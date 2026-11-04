/** Curated step intros (content/hoc-cloud/step-intros.json) replace a source paragraph only while it is unchanged. */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { HOC_CLOUD_FIXTURES, fixtureSource } from '../../../test/hoc-cloud-fixtures';
import { LabDetail } from './api-schema';
import { type ContentDir, type StepIntro, loadContentDir } from './curation';
import { documentId, prepareImport, textHash } from './prepare';

const CONTENT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../content');
const OVERRIDE = 'Đoạn mở đầu viết lại cho bước này, chỉ dùng trong test.';

let content: ContentDir;
let sourceWhy: { step2: string; step3: string };

beforeAll(async () => {
  content = await loadContentDir(CONTENT_DIR);
  const { lab } = LabDetail.parse(JSON.parse(await readFile(path.join(HOC_CLOUD_FIXTURES, 'labs/subnet-cidr.json'), 'utf8')));
  sourceWhy = { step2: lab.walkthrough[1]?.why ?? '', step3: lab.walkthrough[2]?.why ?? '' };
});

async function subnetMarkdown(intro: StepIntro): Promise<{ markdown: string; warnings: string[] }> {
  const prepared = await prepareImport(fixtureSource(), { ...content, stepIntros: { ...content.stepIntros, 'lab/subnet-cidr': [intro] } });
  const doc = prepared.documents.find((d) => d.id === documentId('lab/subnet-cidr', 'vi'));
  return { markdown: doc?.markdown ?? '', warnings: prepared.warnings };
}

/** The opening words of a source paragraph as rendered (plain text there, so unchanged). */
const opening = (why: string): string => why.replace(/<[^>]+>/g, '').slice(0, 40);

describe('step intro overrides', () => {
  it('render the curated paragraph in place of the source one, and can move the source text up a step', async () => {
    const { markdown, warnings } = await subnetMarkdown({ step: 3, sourceHash: textHash(sourceWhy.step3), why: OVERRIDE, appendSourceToPrevious: true, note: 'test' });
    expect(warnings).toEqual([]);
    const step2 = markdown.slice(markdown.indexOf('## Bước 2'), markdown.indexOf('## Bước 3'));
    const step3 = markdown.slice(markdown.indexOf('## Bước 3'), markdown.indexOf('## Bước 4'));
    expect(step3).toContain(OVERRIDE);
    expect(step3).not.toContain(opening(sourceWhy.step3));
    expect(step2).toContain(opening(sourceWhy.step3));
  });

  it('fall back to the source text and warn once Học Cloud changed it', async () => {
    const { markdown, warnings } = await subnetMarkdown({ step: 3, sourceHash: textHash('an older text'), why: OVERRIDE, appendSourceToPrevious: true, note: 'test' });
    expect(markdown).not.toContain(OVERRIDE);
    expect(markdown).toContain(opening(sourceWhy.step3));
    expect(warnings).toContain('step-intros.json: lab/subnet-cidr step 3 changed on Học Cloud: showing the source text, review the override');
  });
});
