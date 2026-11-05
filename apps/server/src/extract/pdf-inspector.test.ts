/** The PDF Inspector on generated PDFs: each page's text layer and how much of it images cover. */
import { describe, expect, it } from 'vitest';
import { ENGLISH_PAGE, makePdf } from '../../test/extract-fixtures';
import { ExtractionError } from './extraction-error';
import { inspectPdf } from './pdf-inspector';
import { pdfWithPages } from './pdf-subset';

describe('inspectPdf', () => {
  it('measures a text page, a full-page scan, a page with a small figure and a blank page', async () => {
    const pdf = await makePdf([{ text: ENGLISH_PAGE }, { image: 1 }, { text: 'Figure 1', image: 0.25 }, {}]);
    const reports = await inspectPdf(pdf);
    expect(reports.map((r) => r.page)).toEqual([1, 2, 3, 4]);
    expect(reports[0]?.text).toContain('The Domain Name System translates names into addresses.');
    expect(reports[0]).toMatchObject({ imageRatio: 0 });
    expect(reports[0]?.textChars).toBeGreaterThan(150);
    expect(reports[1]).toMatchObject({ textChars: 0, imageRatio: 1 });
    expect(reports[2]?.imageRatio).toBeCloseTo(0.25, 2);
    expect(reports[3]).toMatchObject({ textChars: 0, imageRatio: 0 });
  });

  it('leaves the given buffer usable', async () => {
    const pdf = await makePdf([{ text: 'one' }]);
    await inspectPdf(pdf);
    expect(pdf.byteLength).toBeGreaterThan(0);
    expect((await inspectPdf(pdf))[0]?.text.trim()).toBe('one');
  });

  it('rejects what is not a PDF as damaged', async () => {
    const error = await inspectPdf(new TextEncoder().encode('not a pdf at all')).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ExtractionError);
    expect(error).toMatchObject({ code: 'corrupt' });
  });
});

describe('pdfWithPages', () => {
  it('copies only the asked pages, in order', async () => {
    const pdf = await makePdf([{ text: 'page one' }, { text: 'page two' }, { text: 'page three' }]);
    const reports = await inspectPdf(await pdfWithPages(pdf, [3, 1]));
    expect(reports.map((r) => r.text.trim())).toEqual(['page three', 'page one']);
  });
});
