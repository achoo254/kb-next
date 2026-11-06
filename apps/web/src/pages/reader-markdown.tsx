/**
 * A passage's Markdown as React elements (react-markdown + GFM). Nothing goes through innerHTML: raw HTML in the
 * text is dropped (`skipHtml`), link and image URLs pass react-markdown's default filter (no `javascript:` and the
 * like), and outside links open in a new tab without access to this page.
 *
 * One reading rule of the boards: an ordered list whose every item starts with a bold term ("1. **Discover** Hét lên
 * cả mạng xin IP") is a list of steps, drawn as step cards marked with the step's number or the term's first letter
 * (step-mark.ts; C11's DORA diagram). A quote
 * opening with `[!WARNING]` (as the editor, C02, writes its warning box) is drawn as that warning. A `[[Tiêu đề]]`
 * (or `[[Tiêu đề|chữ]]`) the server resolved to a document the reader may open is a link to it; any other stays as
 * written.
 */
import { type ReactNode, memo, useMemo } from 'react';
import Markdown, { type Components, type ExtraProps } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { stepMark } from './step-mark';

/** The syntax-tree element react-markdown hands each component (hast), and what an element may contain. */
type Element = NonNullable<ExtraProps['node']>;
type ElementContent = Element['children'][number];

const MIN_STEPS = 2;
const MAX_STEPS = 6;

function isElement(node: ElementContent | undefined): node is Element {
  return node?.type === 'element';
}

function isBlank(node: ElementContent): boolean {
  return node.type === 'text' && node.value.trim() === '';
}

function textOf(node: ElementContent): string {
  if (node.type === 'text') return node.value;
  if (node.type === 'element') return node.children.map(textOf).join('');
  return '';
}

/** The bold term an item starts with (directly, or in its first paragraph), or null. */
export function stepTerm(item: Element): string | null {
  const first = item.children.find((child) => !isBlank(child));
  if (!isElement(first)) return null;
  const lead = first.tagName === 'p' ? first.children.find((child) => !isBlank(child)) : first;
  if (!isElement(lead) || lead.tagName !== 'strong') return null;
  const term = textOf(lead).trim();
  return term === '' ? null : term;
}

/** Whether an ordered list is a list of steps (see the module comment). */
export function isStepList(list: Element): boolean {
  const items = list.children.filter((child): child is Element => isElement(child) && child.tagName === 'li');
  return items.length >= MIN_STEPS && items.length <= MAX_STEPS && items.every((item) => stepTerm(item) !== null);
}

function isExternal(href: string | undefined): boolean {
  return href !== undefined && /^https?:\/\//i.test(href) && !href.startsWith(window.location.origin);
}

const COMPONENTS: Components = {
  ol({ node, children, ...props }) {
    const steps = node ? isStepList(node) : false;
    return (
      <ol {...props} className={steps ? 'reader-steps' : undefined} data-steps={steps || undefined}>
        {children}
      </ol>
    );
  },
  li({ node, children, ...props }) {
    const term = node ? stepTerm(node) : null;
    return (
      <li {...props} data-mark={term ? stepMark(term) : undefined}>
        {children}
      </li>
    );
  },
  a({ node: _node, href, children, ...props }) {
    return isExternal(href) ? (
      <a {...props} href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    ) : (
      <a {...props} href={href}>
        {children}
      </a>
    );
  },
  img({ node: _node, alt, ...props }) {
    return <img {...props} alt={alt ?? ''} loading="lazy" />;
  },
};

const WARNING_MARK = /^\[!WARNING\][ \t]*\n?/;

/** A quote opening with `[!WARNING]` becomes the warning box (`div.reader-callout`, a note), without the mark. */
export function rehypeWarnings() {
  const visit = (node: Element | ElementContent): void => {
    if (!isElement(node)) return;
    if (node.tagName === 'blockquote') {
      const paragraph = node.children.find((child): child is Element => isElement(child));
      const first = paragraph?.children[0];
      if (paragraph?.tagName === 'p' && first?.type === 'text' && WARNING_MARK.test(first.value)) {
        first.value = first.value.replace(WARNING_MARK, '');
        node.tagName = 'div';
        node.properties = { ...node.properties, className: ['reader-callout'], role: 'note' };
      }
    }
    for (const child of node.children) visit(child);
  };
  return (tree: { children: ElementContent[] }): void => {
    for (const child of tree.children) visit(child);
  };
}

/** A `[[ ]]` link as written (same syntax as the server's, src/import/hoc-cloud/prepare.ts): title, then its label. */
const WIKILINK = /\[\[([^\]\n|]+)(?:\|([^\]\n]*))?\]\]/g;
/** Elements whose text is never turned into links: links themselves and code. */
const NO_LINKS = new Set(['a', 'code', 'pre']);

/** The text of `value` with each resolved `[[ ]]` as a link (`/d/<id>`), or null when it holds none. */
export function linkWikilinks(value: string, targets: ReadonlyMap<string, string>): ElementContent[] | null {
  const parts: ElementContent[] = [];
  let last = 0;
  for (const match of value.matchAll(WIKILINK)) {
    const id = targets.get((match[1] ?? '').trim());
    if (!id) continue;
    const start = match.index;
    if (start > last) parts.push({ type: 'text', value: value.slice(last, start) });
    const label = match[2]?.trim() || (match[1] ?? '').trim();
    parts.push({
      type: 'element',
      tagName: 'a',
      properties: { href: `/d/${encodeURIComponent(id)}`, className: ['reader-wikilink'], dataId: 'reader-wikilink' },
      children: [{ type: 'text', value: label }],
    });
    last = start + match[0].length;
  }
  if (parts.length === 0) return null;
  if (last < value.length) parts.push({ type: 'text', value: value.slice(last) });
  return parts;
}

/** A rehype plugin turning the resolved `[[ ]]` titles of the text into links (see the module comment). */
export function rehypeWikilinks(targets: ReadonlyMap<string, string>) {
  const visit = (node: Element): void => {
    if (NO_LINKS.has(node.tagName)) return;
    node.children = node.children.flatMap((child) => {
      if (isElement(child)) {
        visit(child);
        return [child];
      }
      return child.type === 'text' ? (linkWikilinks(child.value, targets) ?? [child]) : [child];
    });
  };
  return () =>
    (tree: { children: ElementContent[] }): void => {
      for (const child of tree.children) if (isElement(child)) visit(child);
    };
}

const PLUGINS = [remarkGfm];

interface ReaderMarkdownProps {
  markdown: string;
  /** `[[ ]]` titles and the document each links (the reader's `wikilinks`). */
  wikilinks?: ReadonlyMap<string, string>;
}

function ReaderMarkdownView({ markdown, wikilinks }: ReaderMarkdownProps): ReactNode {
  const rehypePlugins = useMemo(() => (wikilinks && wikilinks.size > 0 ? [rehypeWarnings, rehypeWikilinks(wikilinks)] : [rehypeWarnings]), [wikilinks]);
  return (
    <Markdown remarkPlugins={PLUGINS} rehypePlugins={rehypePlugins} components={COMPONENTS} skipHtml>
      {markdown}
    </Markdown>
  );
}

/** Memoised: the reader re-renders as the current section changes, and parsing every passage again each time made
 * jumping through the table of contents stutter. */
export const ReaderMarkdown = memo(ReaderMarkdownView);
