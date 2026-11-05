/**
 * A passage's Markdown as React elements (react-markdown + GFM). Nothing goes through innerHTML: raw HTML in the
 * text is dropped (`skipHtml`), link and image URLs pass react-markdown's default filter (no `javascript:` and the
 * like), and outside links open in a new tab without access to this page.
 *
 * One reading rule of the boards: an ordered list whose every item starts with a bold term ("1. **Discover** Hét lên
 * cả mạng xin IP") is a list of steps, drawn as step cards with the term's first letter (C11's DORA diagram). A quote
 * opening with `[!WARNING]` (as the editor, C02, writes its warning box) is drawn as that warning.
 */
import type { ReactNode } from 'react';
import Markdown, { type Components, type ExtraProps } from 'react-markdown';
import remarkGfm from 'remark-gfm';

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
      <li {...props} data-letter={term ? Array.from(term)[0]?.toLocaleUpperCase() : undefined}>
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

const PLUGINS = [remarkGfm];
const REHYPE_PLUGINS = [rehypeWarnings];

export function ReaderMarkdown({ markdown }: { markdown: string }): ReactNode {
  return (
    <Markdown remarkPlugins={PLUGINS} rehypePlugins={REHYPE_PLUGINS} components={COMPONENTS} skipHtml>
      {markdown}
    </Markdown>
  );
}
