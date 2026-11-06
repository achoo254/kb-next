/**
 * The document model of the editor (C02) on TipTap: StarterKit (paragraphs, headings, lists, code, quotes, undo/redo,
 * the trailing empty paragraph), tables, images, and three nodes of the board, each with its Markdown form so the
 * stored text stays plain Markdown the reader (C11) renders the same way:
 * - `wikilink`: `[[Title]]` / `[[Title|label]]`, a link to another document by its title;
 * - `callout`: `> [!WARNING]` then `> text`, the board's amber warning box;
 * - `steps`: an ordered list whose every item starts with a bold term (`1. **Discover** …`), drawn as step cards
 *   marked as the reader marks them (step-mark.ts), the reader's rule for the DORA diagram (reader-markdown.tsx).
 * An unclosed `[[` (a link being written) is marked as such.
 */
import { Extension, Node, mergeAttributes, type JSONContent, type MarkdownLexerConfiguration, type MarkdownParseHelpers, type MarkdownRendererHelpers, type MarkdownToken } from '@tiptap/core';
import Image from '@tiptap/extension-image';
import { TableKit } from '@tiptap/extension-table';
import { Placeholder } from '@tiptap/extensions';
import { Markdown } from '@tiptap/markdown';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import StarterKit from '@tiptap/starter-kit';
import { stepMark } from './step-mark';

export interface Step {
  term: string;
  text: string;
}

const SVG = 'http://www.w3.org/2000/svg';
const WIKILINK = /^\[\[([^\]\n|]+)(?:\|([^\]\n]*))?\]\]/;
const CALLOUT = /^> \[!WARNING\][ \t]*\n((?:>[^\n]*(?:\n|$))+)/;

/** `[[Title]]` and `[[Title|label]]`: an atom showing the label (else the title). */
export const Wikilink = Node.create({
  name: 'wikilink',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return { title: { default: '' }, label: { default: null } };
  },
  parseHTML() {
    return [{ tag: 'span[data-wikilink]', getAttrs: (el) => ({ title: el.getAttribute('data-wikilink') ?? '', label: el.getAttribute('data-label') }) }];
  },
  renderHTML({ node, HTMLAttributes }) {
    const title = String(node.attrs.title ?? '');
    const label = typeof node.attrs.label === 'string' && node.attrs.label ? node.attrs.label : null;
    return ['span', mergeAttributes(HTMLAttributes, { 'data-wikilink': title, 'data-label': label, class: 'editor-wikilink' }), label ?? title];
  },
  renderText({ node }) {
    return `[[${String(node.attrs.title ?? '')}]]`;
  },
  markdownTokenizer: {
    name: 'wikilink',
    level: 'inline',
    start: (src: string) => src.indexOf('[['),
    tokenize(src: string) {
      const match = WIKILINK.exec(src);
      if (!match) return undefined;
      return { type: 'wikilink', raw: match[0], title: (match[1] ?? '').trim(), label: match[2]?.trim() || null };
    },
  },
  parseMarkdown(token: MarkdownToken) {
    const title: unknown = token.title;
    const label: unknown = token.label;
    return { type: 'wikilink', attrs: { title: typeof title === 'string' ? title : '', label: typeof label === 'string' ? label : null } };
  },
  renderMarkdown(node: JSONContent) {
    const title = String(node.attrs?.title ?? '');
    const label = typeof node.attrs?.label === 'string' && node.attrs.label ? node.attrs.label : null;
    return label ? `[[${title}|${label}]]` : `[[${title}]]`;
  },
});

/** The warning box: `> [!WARNING]` then the text, one quoted line. */
export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'inline*',
  defining: true,
  parseHTML() {
    return [{ tag: 'div[data-callout]', contentElement: '.editor-callout-text' }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-callout': 'warning', class: 'editor-callout', role: 'note' }),
      [
        `${SVG} svg`,
        { class: 'editor-callout-icon', width: '20', height: '20', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2.2', 'stroke-linecap': 'round', 'aria-hidden': 'true', contenteditable: 'false' },
        [`${SVG} path`, { d: 'M12 3l10 18H2zM12 10v4M12 17v.5' }],
      ],
      ['div', { class: 'editor-callout-text' }, 0],
    ];
  },
  markdownTokenizer: {
    name: 'callout',
    level: 'block',
    start: (src: string) => src.indexOf('> [!WARNING]'),
    tokenize(src: string, _tokens: MarkdownToken[], lexer: MarkdownLexerConfiguration) {
      const match = CALLOUT.exec(src);
      if (!match) return undefined;
      const text = (match[1] ?? '')
        .split('\n')
        .map((line) => line.replace(/^> ?/, ''))
        .join(' ')
        .trim();
      return { type: 'callout', raw: match[0], text, tokens: lexer.inlineTokens(text) };
    },
  },
  parseMarkdown(token: MarkdownToken, helpers: MarkdownParseHelpers) {
    return { type: 'callout', content: helpers.parseInline(token.tokens ?? []) };
  },
  renderMarkdown(node: JSONContent, helpers: MarkdownRendererHelpers) {
    return `> [!WARNING]\n> ${helpers.renderChildren(node.content ?? [])}`;
  },
});

export function isStepList(value: unknown): value is Step[] {
  return Array.isArray(value) && value.every((s) => typeof s === 'object' && s !== null && typeof (s as Step).term === 'string' && typeof (s as Step).text === 'string');
}

/** Step cards (the board's DORA): `1. **Term** text` per step in Markdown. Edited in the node view. */
export const Steps = Node.create({
  name: 'steps',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,
  addAttributes() {
    return {
      steps: {
        default: [],
        parseHTML: (el: HTMLElement) => {
          try {
            const value: unknown = JSON.parse(el.getAttribute('data-steps') ?? '[]');
            return isStepList(value) ? value : [];
          } catch {
            return [];
          }
        },
        renderHTML: (attrs: { steps?: unknown }) => ({ 'data-steps': JSON.stringify(isStepList(attrs.steps) ? attrs.steps : []) }),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-steps]' }];
  },
  renderHTML({ node, HTMLAttributes }) {
    const steps = isStepList(node.attrs.steps) ? node.attrs.steps : [];
    return ['div', mergeAttributes(HTMLAttributes, { class: 'editor-steps' }), ...steps.map((step) => ['span', { class: 'editor-step' }, stepMark(step.term)])];
  },
  renderMarkdown(node: JSONContent) {
    const steps = isStepList(node.attrs?.steps) ? node.attrs.steps : [];
    return steps.map((step, i) => `${i + 1}. **${step.term.trim() || '·'}**${step.text.trim() ? ` ${step.text.trim()}` : ''}`).join('\n');
  },
});

/** Text of an inline node list (marks dropped). */
function plainText(nodes: readonly JSONContent[] | undefined): string {
  return (nodes ?? []).map((n) => (n.type === 'text' ? (n.text ?? '') : n.type === 'wikilink' ? `[[${String(n.attrs?.title ?? '')}]]` : '')).join('');
}

/** A list item that is one paragraph opening with bold text: its step, else null. */
function stepOf(item: JSONContent): Step | null {
  const [paragraph, ...rest] = item.content ?? [];
  if (!paragraph || rest.length > 0 || paragraph.type !== 'paragraph') return null;
  const [first, ...after] = paragraph.content ?? [];
  if (!first || first.type !== 'text' || !first.marks?.some((m) => m.type === 'bold')) return null;
  const term = (first.text ?? '').trim();
  return term ? { term, text: plainText(after).trim() } : null;
}

/** The parsed document with every ordered list of bold-led items turned into step cards (2 to 6, as the reader). */
export function withSteps(doc: JSONContent): JSONContent {
  const content = (doc.content ?? []).map((node): JSONContent => {
    if (node.type !== 'orderedList') return node;
    const steps = (node.content ?? []).map(stepOf);
    if (steps.length < 2 || steps.length > 6 || steps.some((s) => s === null)) return node;
    return { type: 'steps', attrs: { steps: steps.filter((s): s is Step => s !== null) } };
  });
  return { ...doc, content };
}

const PENDING_LINK = /\[\[(?![^\]\n]*\]\])/g;
const pendingKey = new PluginKey('editor-pending-link');

/** Marks an unclosed `[[` (a link being written), as the board's cyan chip. */
const PendingLink = Extension.create({
  name: 'pendingLink',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: pendingKey,
        props: {
          decorations(state) {
            const found: Decoration[] = [];
            state.doc.descendants((node, pos) => {
              if (!node.isText || !node.text) return;
              for (const match of node.text.matchAll(PENDING_LINK)) {
                const from = pos + (match.index ?? 0);
                found.push(Decoration.inline(from, from + 2, { class: 'editor-link-pending' }));
              }
            });
            return DecorationSet.create(state.doc, found);
          },
        },
      }),
    ];
  },
});

/** Every extension of the editor; `extra` adds the screen's own (the `/` and `[[` menus). */
export function editorExtensions(placeholder: string, extra: readonly Extension[] = []): Array<Extension | Node> {
  return [
    StarterKit.configure({ heading: { levels: [2, 3] }, link: { openOnClick: false, autolink: true } }),
    TableKit.configure({ table: { resizable: false } }),
    Image.configure({ inline: false }),
    Placeholder.configure({ placeholder, showOnlyCurrent: false }),
    Markdown,
    Wikilink,
    Callout,
    Steps,
    PendingLink,
    ...extra,
  ];
}

/** Markdown as the store keeps it: at most one blank line between blocks (outside code), no trailing spaces. */
export function tidyMarkdown(markdown: string): string {
  const out: string[] = [];
  let fence: string | null = null;
  let blank = 0;
  for (const line of markdown.replace(/\r\n?/g, '\n').split('\n')) {
    const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
    if (marker) fence = fence === null ? marker : marker[0] === fence[0] && marker.length >= fence.length ? null : fence;
    if (fence === null && !marker && line.trim() === '') {
      blank += 1;
      if (blank > 1) continue;
    } else {
      blank = 0;
    }
    out.push(line);
  }
  return out.join('\n').trim();
}
