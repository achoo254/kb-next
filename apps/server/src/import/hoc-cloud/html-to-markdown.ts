/**
 * HTML to Markdown for imported content (turndown): fenced code, GFM tables, and nothing of a page's chrome
 * (head, style, script, nav, buttons). Plain text without tags is kept as written: turndown would fold its line
 * breaks and escape its punctuation.
 */
import TurndownService from 'turndown';

const HTML_TAG = /<\/?[a-z][a-z0-9]*(?:\s[^<>]*)?\/?>/i;

/** The part of turndown's server-side DOM used here (the server is typed without the DOM library). */
interface DomNode {
  nodeType: number;
  nodeName: string;
  childNodes: ArrayLike<DomNode>;
  textContent: string | null;
  innerHTML?: string;
  getAttribute?(name: string): string | null;
}

const dom = (node: TurndownService.Node): DomNode => node as unknown as DomNode;

/** Text of a node with every run of whitespace kept, for code. */
function codeText(node: DomNode): string {
  return (node.textContent ?? '').replace(/\n+$/, '');
}

/**
 * Elements named `name` below `node`, in document order. turndown's server-side DOM has no querySelectorAll, so
 * the tree is walked by hand.
 */
function descendants(node: DomNode, name: string): DomNode[] {
  const found: DomNode[] = [];
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType !== 1) continue;
    if (child.nodeName === name) found.push(child);
    found.push(...descendants(child, name));
  }
  return found;
}

function fence(code: string, lang = ''): string {
  // A fence longer than any backtick run inside the code.
  const longest = Math.max(2, ...[...code.matchAll(/`+/g)].map((m) => m[0].length));
  const ticks = '`'.repeat(longest + 1);
  return `\n\n${ticks}${lang}\n${code}\n${ticks}\n\n`;
}

/** One table cell on one line: GFM rows cannot hold line breaks or bare pipes. */
function cellText(service: TurndownService, html: string): string {
  return service
    .turndown(html)
    .replace(/\s*\n+\s*/g, ' ')
    .replace(/\|/g, '\\|')
    .trim();
}

function createService(): TurndownService {
  const service = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-', emDelimiter: '*' });
  service.remove(['head', 'style', 'script', 'noscript', 'nav', 'button', 'svg', 'template', 'form', 'input']);
  service.addRule('pre', {
    filter: 'pre',
    replacement: (_content, node) => {
      const pre = dom(node);
      const code = descendants(pre, 'CODE')[0];
      const lang = /language-([\w+-]+)/.exec(code?.getAttribute?.('class') ?? pre.getAttribute?.('class') ?? '')?.[1] ?? '';
      return fence(codeText(pre), lang);
    },
  });
  service.addRule('table', {
    filter: 'table',
    replacement: (_content, node) => {
      const rows = descendants(dom(node), 'TR').map((tr) =>
        Array.from(tr.childNodes)
          .filter((cell) => cell.nodeName === 'TH' || cell.nodeName === 'TD')
          .map((cell) => cellText(service, cell.innerHTML ?? '')),
      );
      const width = Math.max(0, ...rows.map((row) => row.length));
      if (width === 0) return '';
      const line = (cells: string[]): string => `| ${Array.from({ length: width }, (_, i) => cells[i] ?? '').join(' | ')} |`;
      const [head = [], ...body] = rows;
      return `\n\n${[line(head), line(Array.from({ length: width }, () => '---')), ...body.map(line)].join('\n')}\n\n`;
    },
  });
  return service;
}

let shared: TurndownService | null = null;

/** Markdown of an HTML fragment or page. */
export function htmlToMarkdown(html: string): string {
  shared ??= createService();
  // turndown's parser hoists a page's <title> into the text: the head goes before parsing.
  return shared
    .turndown(html.replace(/<head[\s>][\s\S]*?<\/head>/i, ''))
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Tags lesson prose actually uses; anything else in angle brackets is text. */
const PROSE_TAGS = new Set(
  'a abbr b blockquote br code dd del details div dl dt em h1 h2 h3 h4 h5 h6 hr i img kbd li mark ol p pre q s small span strong sub summary sup table tbody td tfoot th thead tr u ul'.split(' '),
);
const ANGLE_WORD = /<(\/?)([A-Za-z][\w-]*)([^<>]*)>/g;

/**
 * Prose mixes HTML with literal angle-bracket words (`docker logs <container>`, the redaction's `<ADDR-1>`): those
 * would parse as unknown elements and vanish, so they are escaped first.
 */
function escapeNonHtml(text: string): string {
  return text.replace(ANGLE_WORD, (match, _slash: string, name: string) => (PROSE_TAGS.has(name.toLowerCase()) ? match : match.replace(/</g, '&lt;').replace(/>/g, '&gt;')));
}

/** Markdown of a field that may hold HTML (Học Cloud's prose fields): converted when it has tags, else as written. */
export function proseToMarkdown(text: string): string {
  return HTML_TAG.test(text) ? htmlToMarkdown(escapeNonHtml(text)) : text.trim();
}

export { fence as codeFence };
