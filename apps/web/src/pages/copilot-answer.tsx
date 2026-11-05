/**
 * The text of a Copilot answer: Markdown (react-markdown + GFM, raw HTML dropped as in the reader) where each `[n]`
 * of a known source becomes a citation number that opens the reader at the cited passage (`/d/<id>#<anchor>`), and
 * a ```mermaid block becomes a diagram (copilot-diagram.tsx). A citation Jev did not find supported by its source,
 * or whose source the reader can no longer open, is drawn dashed ("2 ?") and the sentence it closes gets an orange
 * wavy underline (F02 G). Jev's verdicts come one per citation in writing order (`turn.citations`), so only the
 * sentence a source does not back is marked, not every sentence citing that source.
 */
import { type ReactNode, useMemo } from 'react';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { CopilotTurn, TurnSource } from './copilot-run';
import { doubtfulCitations } from './copilot-run';
import { DiagramBlock } from './copilot-diagram';
import { useCopilotText } from './copilot-messages';

/** The reader at the cited passage. */
export function sourceHref(source: Pick<TurnSource, 'documentId' | 'anchor'>): string {
  return `/d/${encodeURIComponent(source.documentId)}#${encodeURIComponent(source.anchor)}`;
}

/** "Giao thức DHCP § DORA": a source's document and section. */
export function sourceTitle(source: Pick<TurnSource, 'title' | 'section'>): string {
  return source.section ? `${source.title} § ${source.section}` : source.title;
}

/** The part of the Markdown syntax tree (mdast) the citation pass reads and writes. */
interface MdNode {
  type: string;
  value?: string;
  url?: string;
  children?: MdNode[];
}

const CITE_HREF = '#kf-cite-';
/** Appended to a citation's href when that citation is in doubt. */
const DOUBT_SUFFIX = '-doubt';
const CLAIM_HREF = '#kf-claim-';
const CITATION = /\[(\d{1,3})\]/g;
/** Where the sentence a citation closes starts: after the last sentence end before it. */
const SENTENCE_END = /[.!?…:;]\s+/g;
const SKIPPED = new Set(['code', 'inlineCode', 'link', 'linkReference', 'definition', 'html']);

function text(value: string): MdNode {
  return { type: 'text', value };
}

function link(url: string, value: string): MdNode {
  return { type: 'link', url, children: [text(value)] };
}

function sentenceStart(before: string): number {
  let start = 0;
  for (const match of before.matchAll(SENTENCE_END)) start = match.index + match[0].length;
  return start;
}

/**
 * A text node split into text, citation links and, before a doubtful citation, its underlined sentence. `isDoubtful`
 * is asked once per citation of a known source, in writing order.
 */
export function splitCitations(value: string, known: ReadonlySet<number>, isDoubtful: (n: number) => boolean): MdNode[] {
  const out: MdNode[] = [];
  let last = 0;
  for (const match of value.matchAll(CITATION)) {
    const n = Number(match[1]);
    if (!known.has(n)) continue;
    const before = value.slice(last, match.index);
    const doubt = isDoubtful(n);
    if (doubt) {
      const start = sentenceStart(before);
      const sentence = before.slice(start);
      const claim = sentence.trim();
      const lead = before.slice(0, start) + sentence.slice(0, sentence.length - sentence.trimStart().length);
      if (lead) out.push(text(lead));
      if (claim) out.push(link(`${CLAIM_HREF}${n}`, claim));
      const gap = sentence.slice(sentence.trimEnd().length);
      if (gap && claim) out.push(text(gap));
    } else if (before) out.push(text(before));
    out.push(link(`${CITE_HREF}${n}${doubt ? DOUBT_SUFFIX : ''}`, String(n)));
    last = match.index + match[0].length;
  }
  if (last === 0) return [text(value)];
  if (last < value.length) out.push(text(value.slice(last)));
  return out;
}

function markCitations(node: MdNode, known: ReadonlySet<number>, isDoubtful: (n: number) => boolean): void {
  if (!node.children || SKIPPED.has(node.type)) return;
  node.children = node.children.flatMap((child) => {
    if (child.type === 'text' && child.value !== undefined) return splitCitations(child.value, known, isDoubtful);
    markCitations(child, known, isDoubtful);
    return [child];
  });
}

function isExternal(href: string | undefined): boolean {
  return href !== undefined && /^https?:\/\//i.test(href) && !href.startsWith(window.location.origin);
}

interface AnswerTextProps {
  turn: CopilotTurn;
  /** The caret (after the last block, in CSS) while the answer is being written. */
  writing?: boolean;
  className?: string;
}

export function AnswerText({ turn, writing = false, className }: AnswerTextProps): ReactNode {
  const { t } = useCopilotText();
  const { sources } = turn;
  const { citations } = turn;
  const unavailableKey = doubtfulCitations(turn).unavailable.join(',');
  const known = useMemo(() => new Set(sources.map((s) => s.n)), [sources]);
  const plugins = useMemo(() => {
    const unavailable = new Set(unavailableKey ? unavailableKey.split(',').map(Number) : []);
    return [
      remarkGfm,
      () => (tree: MdNode) => {
        // One verdict per citation, in the order the answer writes them (the server counts them the same way).
        let next = 0;
        markCitations(tree, known, (n) => {
          const verdict = citations?.[next];
          next += 1;
          return unavailable.has(n) || verdict?.supported === false;
        });
      },
    ];
  }, [known, citations, unavailableKey]);
  const streaming = turn.stage === 'writing' || turn.stage === 'searching';

  const components = useMemo<Components>(
    () => ({
      a({ node: _node, href, children, ...props }) {
        if (href?.startsWith(CITE_HREF)) {
          const doubt = href.endsWith(DOUBT_SUFFIX);
          const n = Number(href.slice(CITE_HREF.length, doubt ? -DOUBT_SUFFIX.length : undefined));
          const source = sources.find((s) => s.n === n);
          const label = source ? t(doubt ? 'copilot.citeDoubt' : 'copilot.cite', { n, title: sourceTitle(source) }) : String(n);
          if (!source || source.available === false)
            return (
              <span className="copilot-cite" data-doubt={doubt || undefined} role="note" aria-label={label}>
                {n}
                {doubt && ' ?'}
              </span>
            );
          return (
            <a className="copilot-cite" href={sourceHref(source)} data-doubt={doubt || undefined} aria-label={label} data-id={`copilot-cite-${n}`}>
              {n}
              {doubt && ' ?'}
            </a>
          );
        }
        if (href?.startsWith(CLAIM_HREF)) return <span className="copilot-claim">{children}</span>;
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
      pre({ node, children, ...props }) {
        const code = node?.children[0];
        const classes = code?.type === 'element' ? code.properties.className : undefined;
        const mermaid = Array.isArray(classes) && classes.includes('language-mermaid');
        if (mermaid && code?.type === 'element') {
          const source = code.children.map((child) => (child.type === 'text' ? child.value : '')).join('');
          return <DiagramBlock source={source} streaming={streaming} />;
        }
        return <pre {...props}>{children}</pre>;
      },
      img({ node: _node, alt, ...props }) {
        return <img {...props} alt={alt ?? ''} loading="lazy" />;
      },
    }),
    [sources, streaming, t],
  );

  return (
    <div className={className ? `copilot-text ${className}` : 'copilot-text'} data-writing={writing || undefined} data-id="copilot-text">
      <Markdown remarkPlugins={plugins} components={components} skipHtml>
        {turn.text}
      </Markdown>
    </div>
  );
}
