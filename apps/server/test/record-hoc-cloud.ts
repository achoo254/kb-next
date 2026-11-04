/**
 * Records the Học Cloud API answers the importer tests use (test/fixtures/hoc-cloud/), through the importer's own
 * redaction (one redactor per answer, as in a production run), so the repository never holds a server address:
 *   pnpm --filter @kb/server exec tsx test/record-hoc-cloud.ts [HOC_CLOUD_URL]
 * With `--weekly <hoc-hang-tuan folder> <out folder>` it instead converts the weekly HTML pages (turndown, redacted)
 * into Markdown drafts, the starting point of the tidied pages in content/hoc-cloud/docs/.
 */
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { htmlToMarkdown } from '../src/import/hoc-cloud/html-to-markdown';
import { createRedactor, redactJson } from '../src/import/hoc-cloud/redact';
import { hocCloudBaseUrl, httpSource } from '../src/import/hoc-cloud/source';
import { HOC_CLOUD_FIXTURES, fixtureFile } from './hoc-cloud-fixtures';

async function save(apiPath: string, body: unknown): Promise<void> {
  const file = path.join(HOC_CLOUD_FIXTURES, fixtureFile(apiPath));
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(redactJson(body, createRedactor()), null, 2)}\n`);
}

async function recordApi(baseUrl: string): Promise<void> {
  const source = httpSource(baseUrl);
  for (const [list, key] of [
    ['labs', 'labs'],
    ['exercises', 'exercises'],
  ] as const) {
    const index = (await source.getJson(`/api/${list}`)) as Record<string, Array<{ slug: string }>>;
    await save(`/api/${list}`, index);
    for (const { slug } of index[key] ?? []) await save(`/api/${list}/${slug}`, await source.getJson(`/api/${list}/${slug}`));
    console.log(`${list}: ${(index[key] ?? []).length}`);
  }
}

async function draftWeekly(dir: string, out: string): Promise<void> {
  for (const week of (await readdir(dir, { withFileTypes: true })).filter((e) => e.isDirectory())) {
    for (const file of (await readdir(path.join(dir, week.name))).filter((f) => f.endsWith('.html'))) {
      const markdown = createRedactor()(htmlToMarkdown(await readFile(path.join(dir, week.name, file), 'utf8')));
      const target = path.join(out, `weekly-${week.name}-${file.replace(/\.html$/, '.md')}`);
      await mkdir(out, { recursive: true });
      await writeFile(target, `${markdown}\n`);
      console.log(target);
    }
  }
}

const [first, second, third] = process.argv.slice(2);
const run = first === '--weekly' && second && third ? draftWeekly(second, third) : recordApi(hocCloudBaseUrl(first));
run.catch((error: unknown) => {
  console.error('record failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
