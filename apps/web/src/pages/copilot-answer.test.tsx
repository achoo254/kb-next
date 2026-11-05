import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithI18n } from '../test/render';
import { AnswerText, splitCitations } from './copilot-answer';
import { diagramTitle, parseSequence } from './copilot-diagram';
import { type CopilotTurn, newTurn } from './copilot-run';

function source(n: number, extra: Partial<CopilotTurn['sources'][number]> = {}): CopilotTurn['sources'][number] {
  return { n, documentId: `d${n}`, anchor: `a-${n}`, title: `Bài ${n}`, section: 'Mục', spaceName: 'Networking', collectionName: null, origin: 'official', status: 'approved', ...extra };
}

function turn(text: string, change: Partial<CopilotTurn> = {}): CopilotTurn {
  return { ...newTurn({ question: 'Hỏi', scope: { kind: 'universe' } }), stage: 'done', text, sources: [source(1), source(2)], ...change };
}

const DORA = ['sequenceDiagram', '  title DHCP DORA', '  participant M as Máy bạn', '  participant S as DHCP server', '  M->>S: DISCOVER', '  S-->>M: OFFER'].join('\n');

describe('splitCitations', () => {
  it('turns the [n] of known sources into citations and underlines the sentence a doubtful one closes', () => {
    const parts = splitCitations('Câu một [1]. Câu hai sai [2]. Lạ [9].', new Set([1, 2]), (n) => n === 2);
    expect(parts).toEqual([
      { type: 'text', value: 'Câu một ' },
      { type: 'link', url: '#kf-cite-1', children: [{ type: 'text', value: '1' }] },
      { type: 'text', value: '. ' },
      { type: 'link', url: '#kf-claim-2', children: [{ type: 'text', value: 'Câu hai sai' }] },
      { type: 'text', value: ' ' },
      { type: 'link', url: '#kf-cite-2-doubt', children: [{ type: 'text', value: '2' }] },
      { type: 'text', value: '. Lạ [9].' },
    ]);
  });
});

describe('AnswerText', () => {
  it('links each citation to the cited passage of the reader', () => {
    renderWithI18n(<AnswerText turn={turn('DHCP cấp IP **qua 4 bước** [1]. Xem [nguồn](https://example.org) [2].')} />);
    const cite = screen.getByRole('link', { name: 'Citation 1: Bài 1 § Mục' });
    expect(cite.getAttribute('href')).toBe('/d/d1#a-1');
    expect(screen.getByText('qua 4 bước').tagName).toBe('STRONG');
    expect(screen.getByRole('link', { name: 'nguồn' }).getAttribute('target')).toBe('_blank');
  });

  it('marks a citation Jev did not confirm, and one whose source is gone is not a link (G)', () => {
    const doubtful = turn('Một [1]. Hai [2].', { citations: [{ n: 1, supported: true }, { n: 2, supported: false }], sources: [source(1, { available: false }), source(2)] });
    renderWithI18n(<AnswerText turn={doubtful} />);
    const two = screen.getByRole('link', { name: 'Citation 2 not confirmed by its source: Bài 2 § Mục' });
    expect(two.hasAttribute('data-doubt')).toBe(true);
    expect(two.textContent).toBe('2 ?');
    expect(Array.from(document.querySelectorAll('.copilot-claim'), (claim) => claim.textContent)).toEqual(['Một', 'Hai']);
    expect(screen.queryByRole('link', { name: /Citation 1/ })).toBeNull();
    expect(screen.getByRole('note', { name: /Citation 1/ }).textContent).toBe('1 ?');
  });

  it('marks only the sentence Jev did not confirm when one source backs one sentence and not the next', () => {
    // Seen on prod 05/11/2026: one unconfirmed sentence citing [1] marked every [1] of the answer.
    const mixed = turn('Một [1]. Hai [1]. Ba [2].', { citations: [{ n: 1, supported: true }, { n: 1, supported: false }, { n: 2, supported: true }], sources: [source(1), source(2)] });
    renderWithI18n(<AnswerText turn={mixed} />);
    expect(Array.from(document.querySelectorAll('.copilot-claim'), (claim) => claim.textContent)).toEqual(['Hai']);
    expect(Array.from(document.querySelectorAll('.copilot-cite'), (cite) => cite.textContent)).toEqual(['1', '1 ?', '2']);
  });

  it('draws a two-party sequence like board C14, with its Mermaid code a toggle away', () => {
    renderWithI18n(<AnswerText turn={turn(`DORA:\n\n\`\`\`mermaid\n${DORA}\n\`\`\``)} />);
    expect(screen.getByText('Diagram · DHCP DORA')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Máy bạn → DHCP server: DISCOVER; DHCP server → Máy bạn: OFFER' })).toBeTruthy();
    const toggle = screen.getByRole('button', { name: 'Show Mermaid code' });
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelector('.copilot-diagram-code')?.textContent).toContain('M->>S: DISCOVER');
    expect(screen.getByRole('button', { name: 'Show diagram' })).toBeTruthy();
  });

  it('waits for the whole block while the answer is still written', () => {
    renderWithI18n(<AnswerText turn={turn(`\`\`\`mermaid\n${DORA}`, { stage: 'writing' })} writing />);
    expect(screen.getByText('Drawing the diagram…')).toBeTruthy();
    expect(document.querySelector('[data-writing]')).not.toBeNull();
  });
});

describe('parseSequence', () => {
  it('reads two participants and their messages, else leaves the diagram to Mermaid', () => {
    expect(parseSequence(DORA)).toEqual({
      left: { id: 'M', label: 'Máy bạn' },
      right: { id: 'S', label: 'DHCP server' },
      messages: [
        { from: 'left', text: 'DISCOVER' },
        { from: 'right', text: 'OFFER' },
      ],
    });
    expect(diagramTitle(DORA)).toBe('DHCP DORA');
    expect(parseSequence('graph TD\n A-->B')).toBeNull();
    expect(parseSequence('sequenceDiagram\n A->>B: x\n B->>C: y')).toBeNull();
    expect(parseSequence('sequenceDiagram\n A->>B: x\n Note over A: n')).toBeNull();
  });
});
