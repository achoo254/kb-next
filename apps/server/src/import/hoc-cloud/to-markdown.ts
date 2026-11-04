/**
 * Học Cloud lessons as kb Markdown. Each walkthrough step, exercise step and try-at-home phase becomes its own
 * `##` section (one chunk with its own anchor, src/import/hoc-cloud/sections.ts). The interactive playground of a
 * lab is not copied: the document links to it on Học Cloud.
 */
import type { Exercise, Lab, QuizWhyWrong } from './api-schema';
import { codeFence, proseToMarkdown } from './html-to-markdown';

/** Address of a Học Cloud page or asset; a relative screenshot path is resolved against the Học Cloud origin. */
export function hocCloudUrl(baseUrl: string, pathOrUrl: string): string {
  return new URL(pathOrUrl, `${baseUrl}/`).href;
}

export const labPageUrl = (baseUrl: string, slug: string): string => hocCloudUrl(baseUrl, `/lab/${slug}`);
export const exercisePageUrl = (baseUrl: string, slug: string): string => hocCloudUrl(baseUrl, `/exercise/${slug}`);

function block(text: string | undefined, lang = 'bash'): string {
  return text && text.trim() ? codeFence(text.replace(/\s+$/, ''), lang).trim() : '';
}

function labelled(label: string, text: string | undefined): string {
  return text && text.trim() ? `**${label}:** ${proseToMarkdown(text)}` : '';
}

function screenshot(baseUrl: string, shot: { src: string; alt: string; caption: string } | undefined): string {
  if (!shot) return '';
  const alt = shot.alt.replace(/[[\]\n]/g, ' ').trim();
  const caption = shot.caption.trim() ? `\n\n*${proseToMarkdown(shot.caption)}*` : '';
  return `![${alt}](${hocCloudUrl(baseUrl, shot.src)})${caption}`;
}

function section(heading: string, ...parts: string[]): string {
  // Callers pass Markdown already (converted titles): only line breaks and stray `#` are cleaned here.
  const title = heading.replace(/\s*\n+\s*/g, ' ').replace(/^#+\s*/, '').trim();
  return [`## ${title}`, ...parts.filter((part) => part.trim() !== '')].join('\n\n');
}

/** Leading emoji and pictographs of a source heading ("🆚 Tại sao…"). */
function withoutLeadingSymbols(text: string): string {
  return text.replace(/^(?:\p{Extended_Pictographic}|\u200d|\ufe0f|\s)+/u, '');
}

/** A source step title without its own numbering ("Bước 0: DNS…", "Bước tcpdump-1 — …", "Phase 2 — …"). */
function stepTitle(text: string): string {
  return withoutLeadingSymbols(proseToMarkdown(text).replace(/\s*\n+\s*/g, ' '))
    .replace(/^(?:bước|phase|step)\s+[\w-]+\s*[:—–-]\s*/i, '')
    .trim();
}

/**
 * An exercise step written as "<strong>Title.</strong> Body": the title for the heading and the rest as text.
 * Without a bold lead the heading is the fallback and the whole text stays the body.
 */
function splitBoldLead(html: string): { lead: string | null; body: string } {
  const match = /^\s*<(strong|b)>([\s\S]+?)<\/\1>\s*/i.exec(html);
  if (!match?.[2]) return { lead: null, body: html };
  return { lead: proseToMarkdown(match[2]).replace(/\s*\n+\s*/g, ' ').replace(/[.:]\s*$/, '').trim(), body: html.slice(match[0].length).replace(/^[.:]\s*/, '') };
}

function minutes(value: number | null): string {
  return value ? `Thời lượng ước tính: ${value} phút.` : '';
}

/** "Sai vì" lines of a quiz question, in option order. */
function whyWrongLines(options: readonly string[], whyWrong: QuizWhyWrong | undefined): string[] {
  if (whyWrong === undefined) return [];
  if (typeof whyWrong === 'string') return [`- ${proseToMarkdown(whyWrong)}`];
  return Object.entries(whyWrong)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([index, text]) => `- **${proseToMarkdown(options[Number(index)] ?? `Phương án ${Number(index) + 1}`)}**: ${proseToMarkdown(text)}`);
}

/** The heading of a TL;DR row: its first naming field. */
const TLDR_NAME_FIELDS = ['what', 'name', 'term', 'step', 'layer', 'protocol'];
const TLDR_LABELS: Record<string, string> = {
  why: 'Vì sao',
  whyBreaks: 'Khi hỏng',
  deploymentUse: 'Khi deploy thật',
  layer: 'Tầng',
  pdu: 'PDU',
  device: 'Thiết bị',
  protocol: 'Giao thức',
  port: 'Cổng',
  payload: 'Payload',
  src_dst: 'Nguồn → đích',
  value: 'Giá trị',
  name: 'Tên',
  term: 'Thuật ngữ',
  step: 'Bước',
  what: 'Nội dung',
};

function tldrRow(row: Record<string, string>): string {
  const nameField = TLDR_NAME_FIELDS.find((field) => row[field]?.trim());
  const name = nameField ? proseToMarkdown(row[nameField] ?? '') : '';
  const lines = Object.entries(row)
    .filter(([field, value]) => field !== nameField && value.trim() !== '' && value.trim() !== '—')
    .map(([field, value]) => `  - **${TLDR_LABELS[field] ?? field}:** ${proseToMarkdown(value).replace(/\n/g, '\n    ')}`);
  return [`- **${name || 'Ý chính'}**`, ...lines].join('\n');
}

/** A step's replacement opening paragraph, and whether its source text moves to the step before. */
export interface IntroOverride {
  why: string;
  appendSourceToPrevious: boolean;
}

/**
 * `intros` maps a displayed step number to its curated opening paragraph (step-intros.json, already checked
 * against the source by the caller).
 */
export function labToMarkdown(lab: Lab, baseUrl: string, intros: ReadonlyMap<number, IntroOverride> = new Map()): string {
  const pageUrl = labPageUrl(baseUrl, lab.slug);
  const parts: string[] = [
    `# ${lab.title}`,
    [
      minutes(lab.estimated_minutes),
      lab.diagram ? `Bài này có playground tương tác: [Mở playground trên Học Cloud](${pageUrl}).` : `Bài gốc: [${lab.title} trên Học Cloud](${pageUrl}).`,
    ]
      .filter(Boolean)
      .join(' '),
  ];
  if (lab.tldr.length > 0) parts.push(section('Tóm tắt nhanh', ...lab.tldr.map(tldrRow)));
  for (const [i, step] of lab.walkthrough.entries()) {
    const next = lab.walkthrough[i + 1];
    const moved = next && intros.get(i + 2)?.appendSourceToPrevious ? proseToMarkdown(next.why) : '';
    parts.push(
      section(
        `Bước ${i + 1} — ${stepTitle(step.what)}`,
        intros.get(i + 1)?.why.trim() ?? proseToMarkdown(step.why),
        moved,
        labelled('Khi hỏng', step.whyBreaks),
        block(step.code, step.lang ?? 'bash'),
        step.observeWith.trim() ? `**Quan sát bằng:**\n\n${block(step.observeWith)}` : '',
        step.failModes?.length
          ? `**Triệu chứng khi hỏng:**\n\n${step.failModes.map((f) => `- ${proseToMarkdown(f.symptom)}: ${proseToMarkdown(f.evidence)}`).join('\n')}`
          : '',
        step.fixSteps?.length
          ? `**Cách sửa:**\n\n${step.fixSteps.map((f, j) => [`${j + 1}. ${proseToMarkdown(f.step)}`, f.command ? block(f.command).replace(/^/gm, '   ') : ''].filter(Boolean).join('\n\n')).join('\n')}`
          : '',
        step.automateScript ? `**Script hoá:** ${proseToMarkdown(step.automateScript.note ?? '')}\n\n${block(step.automateScript.code, step.automateScript.lang)}` : '',
        labelled('Khi deploy thật', step.deploymentUse),
        labelled('Ghi chú', step.note),
      ),
    );
  }
  if (lab.misconceptions.length > 0) {
    parts.push(
      section(
        'Hiểu lầm phổ biến',
        ...lab.misconceptions.map((m) => [`- **Sai:** ${proseToMarkdown(m.wrong)}`, `  **Đúng:** ${proseToMarkdown(m.right)}`].join('\n') + `\n\n${proseToMarkdown(m.why)}`),
      ),
    );
  }
  // Short untitled tasks read best as one list; titled phases (with steps) keep a section each.
  const quickTasks = lab.try_at_home.filter((task) => !task.title);
  if (quickTasks.length > 0) {
    parts.push(
      section(
        'Tự làm ở nhà',
        ...quickTasks.map((task, i) =>
          [`**${i + 1}.** ${proseToMarkdown(task.why)}`, block(task.cmd), labelled('Quan sát', task.observeWith)].filter(Boolean).join('\n\n'),
        ),
      ),
    );
  }
  for (const [i, task] of lab.try_at_home.filter((t) => t.title).entries()) {
    parts.push(
      section(
        `Thực hành ${i + 1} — ${stepTitle(task.title ?? '')}`,
        [task.estimatedMinutes ? `${task.estimatedMinutes} phút` : '', task.phaseType === 'optional' ? 'tuỳ chọn' : ''].filter(Boolean).join(' · '),
        proseToMarkdown(task.why),
        block(task.cmd),
        labelled('Quan sát', task.observeWith),
        // The number alone is bold: a step text may hold its own bold words or code blocks.
        ...(task.steps ?? []).map((s) => [`**${s.n}.** ${proseToMarkdown(s.do)}`, proseToMarkdown(s.expect), screenshot(baseUrl, s.screenshot)].filter(Boolean).join('\n\n')),
        task.analysis
          ? [
              '**Phân tích hiện tượng**',
              labelled('Quan sát', task.analysis.observation),
              labelled('Cơ chế', task.analysis.mechanism),
              labelled('Bài học', task.analysis.lesson),
            ].join('\n\n')
          : '',
        task.troubleshooting?.length
          ? `**Gỡ lỗi:**\n\n${task.troubleshooting.map((t) => `- ${proseToMarkdown(t.symptom)}: ${proseToMarkdown(t.fix)}`).join('\n')}`
          : '',
      ),
    );
  }
  if (lab.quiz.length > 0) {
    parts.push(
      section(
        'Câu hỏi ôn tập',
        ...lab.quiz.map((q, i) =>
          [
            `**Câu ${i + 1}.** ${proseToMarkdown(q.q)}`,
            q.options.map((option, j) => `${j + 1}. ${proseToMarkdown(option)}`).join('\n'),
            `**Đáp án:** ${proseToMarkdown(q.options[q.correct] ?? String(q.correct + 1))}. ${proseToMarkdown(q.whyCorrect)}`,
            ...whyWrongLines(q.options, q.whyOthersWrong ?? q.whyWrong),
          ].join('\n\n'),
        ),
      ),
    );
  }
  if (lab.flashcards.length > 0) {
    parts.push(
      section(
        'Thẻ ghi nhớ',
        ...lab.flashcards.map((card) => [`- **${proseToMarkdown(card.front)}**`, `  ${proseToMarkdown(card.back)}`, card.why ? `  *${proseToMarkdown(card.why)}*` : ''].filter(Boolean).join('\n')),
      ),
    );
  }
  return parts.join('\n\n');
}

export function exerciseToMarkdown(exercise: Exercise, baseUrl: string): string {
  const pageUrl = exercisePageUrl(baseUrl, exercise.slug);
  const parts: string[] = [
    `# ${exercise.title}`,
    [minutes(exercise.estimated_minutes), `Bài gốc: [${exercise.title} trên Học Cloud](${pageUrl}).`].filter(Boolean).join(' '),
    proseToMarkdown(exercise.brief),
  ];
  for (const [i, step] of exercise.guide.entries()) {
    const { lead, body } = splitBoldLead(step.instruction);
    parts.push(section(lead ? `Bước ${i + 1} — ${lead}` : `Bước ${i + 1}`, proseToMarkdown(body), block(step.command), labelled('Ghi chú', step.note)));
  }
  for (const [i, step] of exercise.demo.entries()) {
    const { lead, body } = splitBoldLead(step.what);
    parts.push(
      section(
        lead ? `Minh hoạ ${i + 1} — ${lead}` : `Minh hoạ ${i + 1} — ${stepTitle(step.what)}`,
        lead ? proseToMarkdown(body) : '',
        block(step.command),
        step.output ? `Kết quả:\n\n${block(step.output, 'text')}` : '',
        labelled('Ghi chú', step.note),
        screenshot(baseUrl, step.screenshot),
      ),
    );
  }
  if (exercise.references.length > 0) {
    parts.push(section('Tài liệu tham khảo', exercise.references.map((r) => `- [${proseToMarkdown(r.label)}](${r.url})`).join('\n')));
  }
  return parts.join('\n\n');
}
