/**
 * A ```mermaid block of a Copilot answer (C14 "Sơ đồ · DHCP DORA", the C09 panel). A sequence between two
 * participants, the diagram Copilot draws most, is drawn the way board C14 draws it: the two participants on top,
 * one arrow row per message, left to right violet and right to left cyan. Any other diagram goes to the `mermaid`
 * library, loaded only when such a diagram shows (its own chunk) with `securityLevel: 'strict'`: its SVG is sanitised
 * by Mermaid (DOMPurify) before it is put in the page. "Xem mã Mermaid" shows the code instead.
 */
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { Icon } from '../ui/icon';
import { useTheme } from '../ui/theme';
import { useCopilotText } from './copilot-messages';

interface Participant {
  id: string;
  label: string;
}

export interface Sequence {
  left: Participant;
  right: Participant;
  messages: Array<{ from: 'left' | 'right'; text: string }>;
}

const PARTICIPANT = /^(?:participant|actor)\s+([^\s:]+)(?:\s+as\s+(.+))?$/;
const MESSAGE = /^([^\s:]+?)\s*(?:-{1,2}(?:>>|>|x|\)))\s*[+-]?([^\s:]+)\s*:\s*(.*)$/;
const TITLE = /^title\s*:?\s+(.+)$/;

function codeLines(source: string): string[] {
  return source
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('%%'));
}

/** The diagram's title: `title …` of a sequence, or the `title:` of a front matter block. */
export function diagramTitle(source: string): string | null {
  for (const line of codeLines(source)) {
    const match = TITLE.exec(line);
    if (match?.[1]) return match[1].trim();
  }
  return null;
}

/** A sequence diagram between exactly two participants (and nothing else Mermaid draws), or null. */
export function parseSequence(source: string): Sequence | null {
  const [head, ...lines] = codeLines(source);
  if (head !== 'sequenceDiagram') return null;
  const participants: Participant[] = [];
  const add = (id: string, label?: string): void => {
    const known = participants.find((p) => p.id === id);
    if (known) {
      if (label) known.label = label;
    } else participants.push({ id, label: label ?? id });
  };
  const raw: Array<{ from: string; to: string; text: string }> = [];
  for (const line of lines) {
    if (TITLE.test(line) || line === 'autonumber') continue;
    const participant = PARTICIPANT.exec(line);
    if (participant?.[1]) {
      add(participant[1], participant[2]?.trim());
      continue;
    }
    const message = MESSAGE.exec(line);
    if (!message?.[1] || !message[2]) return null;
    add(message[1]);
    add(message[2]);
    raw.push({ from: message[1], to: message[2], text: (message[3] ?? '').trim() });
  }
  const [left, right] = participants;
  if (participants.length !== 2 || !left || !right || raw.length === 0) return null;
  if (raw.some((m) => m.from === m.to)) return null;
  return { left, right, messages: raw.map((m) => ({ from: m.from === left.id ? 'left' : 'right', text: m.text })) };
}

function SequenceView({ sequence }: { sequence: Sequence }): ReactNode {
  const { left, right, messages } = sequence;
  const summary = messages.map((m) => (m.from === 'left' ? `${left.label} → ${right.label}` : `${right.label} → ${left.label}`) + (m.text ? `: ${m.text}` : '')).join('; ');
  return (
    <div className="copilot-seq" role="img" aria-label={summary} data-id="copilot-sequence">
      <span className="copilot-seq-actor" data-side="left" aria-hidden="true">
        <Icon name="monitor" size={14} />
        {left.label}
      </span>
      <span aria-hidden="true" />
      <span className="copilot-seq-actor" data-side="right" aria-hidden="true">
        <Icon name="cloud" size={14} />
        {right.label}
      </span>
      {messages.map((message, i) => (
        <span key={i} className="copilot-seq-row" aria-hidden="true">
          <span className="copilot-seq-msg" data-from={message.from}>
            <span className="copilot-seq-line" />
            <span className="copilot-seq-label">{message.text}</span>
            <svg className="copilot-seq-arrow" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 4l15 8-15 8z" />
            </svg>
          </span>
        </span>
      ))}
    </div>
  );
}

let mermaidCount = 0;

/** The SVG of any other Mermaid diagram, from the lazily loaded library. */
async function renderMermaid(source: string, dark: boolean): Promise<string> {
  const { default: mermaid } = await import('mermaid');
  mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: dark ? 'dark' : 'default', fontFamily: 'Inter, system-ui, sans-serif' });
  mermaidCount += 1;
  const { svg } = await mermaid.render(`kf-mermaid-${mermaidCount}`, source);
  return svg;
}

function MermaidSvg({ source, onFail }: { source: string; onFail(): void }): ReactNode {
  const { t } = useCopilotText();
  const dark = useTheme() === 'dark';
  const [drawn, setDrawn] = useState<{ key: string; svg: string } | null>(null);
  const key = `${dark ? 'd' : 'l'}|${source}`;
  useEffect(() => {
    let live = true;
    renderMermaid(source, dark).then(
      (svg) => live && setDrawn({ key, svg }),
      (error: unknown) => {
        console.warn('mermaid diagram not drawn', error);
        if (live) onFail();
      },
    );
    return () => {
      live = false;
    };
  }, [source, dark, key, onFail]);
  if (drawn?.key !== key) return <p className="copilot-diagram-note">{t('copilot.diagramDrawing')}</p>;
  // Mermaid's own sanitised SVG (securityLevel 'strict'), see the module comment.
  return <div className="copilot-mermaid" dangerouslySetInnerHTML={{ __html: drawn.svg }} />;
}

export function DiagramBlock({ source, streaming }: { source: string; streaming: boolean }): ReactNode {
  const { t } = useCopilotText();
  const [showCode, setShowCode] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const onFail = useCallback(() => setFailed(source), [source]);
  const title = diagramTitle(source);
  const sequence = parseSequence(source);
  const broken = failed === source;
  let body: ReactNode;
  if (streaming) body = <p className="copilot-diagram-note">{t('copilot.diagramDrawing')}</p>;
  else if (showCode || broken)
    body = (
      <>
        {broken && <p className="copilot-diagram-note">{t('copilot.diagramFailed')}</p>}
        <pre className="copilot-diagram-code">
          {source.trim()}
        </pre>
      </>
    );
  else if (sequence) body = <SequenceView sequence={sequence} />;
  else body = <MermaidSvg source={source} onFail={onFail} />;
  return (
    <figure className="copilot-diagram" data-id="copilot-diagram">
      <figcaption className="copilot-diagram-head">
        <span className="copilot-diagram-title">{title ? t('copilot.diagramTitled', { title }) : t('copilot.diagram')}</span>
        {!streaming && !broken && (
          <button type="button" className="copilot-pill" aria-pressed={showCode} onClick={() => setShowCode((on) => !on)} data-id="copilot-diagram-toggle">
            {showCode ? t('copilot.showDiagram') : t('copilot.showCode')}
          </button>
        )}
      </figcaption>
      {body}
    </figure>
  );
}
