import { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it } from 'vitest';
import { editorExtensions, isStepList, tidyMarkdown } from './editor-schema';
import { readMarkdown, writeMarkdown } from './editor-markdown';

/** The owner's draft of board C02, as the seed stores its body. */
const C02_BODY = [
  'Máy mới vào mạng chưa có IP. Nó phải hỏi cả mạng bằng broadcast, theo 4 bước gọi là DORA.',
  '1. **Discover**\n2. **Offer**\n3. **Request**\n4. **Acknowledge**',
  '> [!WARNING]\n> Mạng có DHCP giả mạo thì máy bạn có thể nhận nhầm gateway.',
  'Xem thêm [[',
].join('\n\n');

let editor: Editor | null = null;

function open(markdown: string): Editor {
  editor = new Editor({ extensions: editorExtensions('Gõ / để chèn khối'), content: '' });
  editor.commands.setContent(readMarkdown(editor, markdown));
  return editor;
}

afterEach(() => {
  editor?.destroy();
  editor = null;
});

describe('the editor’s Markdown', () => {
  it('reads the C02 draft as a paragraph, step cards, a warning and a link being written', () => {
    const doc = open(C02_BODY).getJSON();
    expect(doc.content?.map((n) => n.type)).toEqual(['paragraph', 'steps', 'callout', 'paragraph', 'paragraph']);
    const steps: unknown = doc.content?.[1]?.attrs?.steps;
    expect(isStepList(steps) && steps.map((s) => s.term)).toEqual(['Discover', 'Offer', 'Request', 'Acknowledge']);
    expect(document.querySelectorAll('.editor-link-pending').length + (editor?.view.dom.querySelectorAll('.editor-link-pending').length ?? 0)).toBeGreaterThan(0);
  });

  it('writes the same Markdown back', () => {
    const md = writeMarkdown(open(C02_BODY));
    expect(md).toBe(C02_BODY.replace('Xem thêm [[', 'Xem thêm \\[\\['));
  });

  it('keeps [[ ]] links, headings, lists, tables and code as Markdown', () => {
    const body = ['## Lease', 'Xem [[Giao thức DHCP]] và [[ARP|lab ARP]].', '- một\n- hai', '| a | b |\n| --- | --- |\n| 1 | 2 |', '```sh\nip a\n\n\nip r\n```'].join('\n\n');
    const written = writeMarkdown(open(body));
    expect(written).toContain('Xem [[Giao thức DHCP]] và [[ARP|lab ARP]].');
    expect(written).toContain('## Lease');
    expect(written).toContain('- một\n- hai');
    expect(written).toMatch(/\| a +\| b +\|/);
    // Blank lines inside code are the code's own.
    expect(written).toContain('```sh\nip a\n\n\nip r\n```');
  });

  it('keeps an ordered list that is not a list of steps as a list', () => {
    expect(open('1. một\n2. hai').getJSON().content?.[0]?.type).toBe('orderedList');
  });

  it('tidies blank lines outside code only', () => {
    expect(tidyMarkdown('a\n\n\n\nb\n\n```\nx\n\n\ny\n```\n\n\n')).toBe('a\n\nb\n\n```\nx\n\n\ny\n```');
  });
});
