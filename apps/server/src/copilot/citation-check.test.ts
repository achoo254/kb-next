import { describe, expect, it } from 'vitest';
import { fakeAskJev } from '../../test/copilot-fixtures';
import { checkCitations, citedSentences } from './citation-check';
import { groupParagraphs, splitParagraphs } from './paragraphs';

describe('cited sentences', () => {
  it('splits sentences at a stop, keeps the citations written after it, and skips code blocks', () => {
    const answer = [
      'DHCP uses four steps [1]. The server offers an IP from 192.168.1.100 [2][1]. No source here.',
      'Version 4.1 is fine. [3]',
      '```mermaid',
      'graph LR; A-->B [4]',
      '```',
      'Last line without a stop [2]',
    ].join('\n');
    expect(citedSentences(answer)).toEqual([
      { sentence: 'DHCP uses four steps.', numbers: [1], cites: [1] },
      { sentence: 'The server offers an IP from 192.168.1.100.', numbers: [2, 1], cites: [2, 1] },
      { sentence: 'Version 4.1 is fine.', numbers: [3], cites: [3] },
      { sentence: 'Last line without a stop', numbers: [2], cites: [2] },
    ]);
  });
});

describe('citation check', () => {
  it('gives one verdict per citation in writing order, leaving out a number no source has', async () => {
    const { jev, calls } = fakeAskJev();
    const sources = [
      { n: 1, title: 'Giao thức DHCP', section: null, text: 'Máy mới xin IP qua 4 bước gọi là DORA.' },
      { n: 2, title: 'Giao thức DHCP', section: 'Lease', text: 'IP chỉ được cho mượn có hạn.' },
    ];
    const answer = 'A new machine gets its IP in four DORA steps [1]. The DORA exchange is encrypted [2]. See also [7].';
    expect(await checkCitations(jev, answer, sources)).toEqual([
      { n: 1, supported: true },
      { n: 2, supported: false },
    ]);
    expect(calls.map((c) => c.purpose)).toEqual(['ask-check']);
  });

  it('flags only the sentence a source does not back, not every sentence citing that source', async () => {
    // Seen on prod 05/11/2026: one unsupported claim citing [1] marked every [1] of the answer.
    const { jev } = fakeAskJev();
    const sources = [{ n: 1, title: 'Giao thức DHCP', section: null, text: 'Máy mới xin IP qua 4 bước gọi là DORA.' }];
    const answer = 'A new machine gets its IP in four DORA steps [1]. The exchange is encrypted [1]. Code `[1]` is not a citation.';
    expect(await checkCitations(jev, answer, sources)).toEqual([
      { n: 1, supported: true },
      { n: 1, supported: false },
    ]);
  });

  it('checks every cited number even past the question cap', async () => {
    const { jev, calls } = fakeAskJev();
    const sources = [
      { n: 1, title: 'A', section: null, text: 'DORA.' },
      { n: 2, title: 'B', section: null, text: 'DORA.' },
    ];
    const answer = `${Array.from({ length: 40 }, (_, i) => `DORA fact ${i} [1].`).join(' ')} DORA last [2].`;
    const verdicts = await checkCitations(jev, answer, sources);
    expect(verdicts).toHaveLength(41);
    expect(verdicts.every((v) => v.supported)).toBe(true);
    expect(verdicts.at(-1)).toEqual({ n: 2, supported: true });
    expect(Object.keys((calls[0]?.state as { claims: object }).claims)).toHaveLength(30);
  });

  it('asks Jev nothing when the answer cites nothing', async () => {
    const { jev, calls } = fakeAskJev();
    expect(await checkCitations(jev, 'No citations here.', [])).toEqual([]);
    expect(calls).toEqual([]);
  });
});

describe('paragraphs', () => {
  it('splits at blank lines, keeping a fenced block whole', () => {
    const markdown = '# Title\n\nFirst line\nsame paragraph\n\n```sh\necho a\n\necho b\n```\n\n\n- item';
    expect(splitParagraphs(markdown)).toEqual(['# Title', 'First line\nsame paragraph', '```sh\necho a\n\necho b\n```', '- item']);
  });

  it('packs paragraphs into groups under the size, a long one alone', () => {
    expect(groupParagraphs(['aaaa', 'bbbb', 'c'.repeat(20), 'dd'], 10)).toEqual([['aaaa', 'bbbb'], ['c'.repeat(20)], ['dd']]);
  });
});
