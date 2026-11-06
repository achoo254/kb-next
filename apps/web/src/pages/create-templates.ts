/**
 * The built-in document templates ("Tài liệu từ mẫu" on the create ring, C01 and M02): an outline in Markdown and a
 * title to fill in, in Vietnamese and English. Picking one opens /new?template=<id>, which creates the draft in the
 * writer's personal Space prefilled with the outline in the reader's language, then opens it in the editor (C02).
 * Bracketed parts (`[chủ đề]`) are the places to write over.
 */
import type { NewDocumentRequest, Planet } from '../api/authoring-api';
import type { Locale } from '../i18n/i18n';

export type TemplateId = 'lab' | 'meeting' | 'runbook' | 'exercise' | 'compare';

interface TemplateText {
  /** The template's name on its card. */
  name: string;
  /** What it holds, one line under the name. */
  sub: string;
  /** The new document's title, with the part to fill in bracketed. */
  title: string;
  body: string;
}

export interface DocumentTemplate {
  id: TemplateId;
  /** A runbook is a process; the rest are notes. */
  type: NonNullable<NewDocumentRequest['type']>;
  /** The card's colour and the new document's planet. */
  planet: Planet;
  text: Record<Locale, TemplateText>;
}

const LAB_VI = `## Mục tiêu

- Làm xong bài này, bạn [làm được gì].

## Chuẩn bị

- Máy hoặc môi trường: [máy ảo, container, router…]
- Công cụ: [lệnh, phần mềm cần cài]
- Nên đọc trước: [bài liên quan]

## Các bước

1. [việc cần làm, kèm lệnh]
2. [việc cần làm, kèm lệnh]
3. [việc cần làm, kèm lệnh]
4. [việc cần làm, kèm lệnh]

## Kiểm tra

- Chạy [lệnh kiểm tra] và thấy [kết quả mong đợi].

## Lỗi thường gặp

| Hiện tượng | Nguyên nhân | Cách sửa |
| --- | --- | --- |
| [thông báo lỗi] | [vì sao] | [làm gì] |
`;

const LAB_EN = `## Goal

- By the end of this lab you can [do what].

## Before you start

- Machine or environment: [VM, container, router…]
- Tools: [commands, software to install]
- Read first: [related text]

## Steps

1. [what to do, with the command]
2. [what to do, with the command]
3. [what to do, with the command]
4. [what to do, with the command]

## Check

- Run [the check command] and see [the expected result].

## Common mistakes

| Symptom | Cause | Fix |
| --- | --- | --- |
| [error message] | [why] | [what to do] |
`;

const MEETING_VI = `## Thông tin

- Thời gian: [ngày, giờ]
- Người dự: [tên]
- Người ghi: [tên]

## Mục tiêu cuộc họp

- [Cần chốt điều gì]

## Nội dung chính

- [Ý chính 1]
- [Ý chính 2]

## Quyết định

- [Đã chốt gì, ai chốt]

## Việc cần làm

| Việc | Người phụ trách | Hạn |
| --- | --- | --- |
| [việc] | [tên] | [ngày] |

## Câu hỏi còn mở

- [Điều chưa rõ, ai sẽ trả lời]
`;

const MEETING_EN = `## Details

- When: [date, time]
- Attendees: [names]
- Notes by: [name]

## Purpose

- [What needs deciding]

## Discussion

- [Main point 1]
- [Main point 2]

## Decisions

- [What was decided, by whom]

## Action items

| Task | Owner | Due |
| --- | --- | --- |
| [task] | [name] | [date] |

## Open questions

- [What is still unclear, who will answer]
`;

const RUNBOOK_VI = `## Khi nào dùng

- Cảnh báo hoặc hiện tượng: [tên cảnh báo, người dùng thấy gì]
- Mức độ: [nghiêm trọng / cao / trung bình]

## Kiểm tra nhanh

1. Xác nhận: [lệnh hoặc dashboard để thấy sự cố thật]
2. Khoanh vùng: [dịch vụ, máy, vùng nào bị]
3. Xem log: [nơi xem log, từ khoá cần tìm]

## Xử lý

1. Giảm ảnh hưởng: [chuyển tải, tắt tính năng, khởi động lại]
2. Sửa gốc: [việc cần làm]
3. Kiểm tra lại: [dấu hiệu đã ổn]

## Báo tin

- Kênh: [kênh chat, email]
- Báo cho: [nhóm, người trực]

## Sau sự cố

- Nguyên nhân gốc: [điền sau khi xử lý]
- Việc phòng lần sau: [việc, người phụ trách]
`;

const RUNBOOK_EN = `## When to use

- Alert or symptom: [alert name, what users see]
- Severity: [critical / high / medium]

## Quick checks

1. Confirm: [command or dashboard showing the incident is real]
2. Narrow down: [which service, host or region]
3. Read the logs: [where, which keywords]

## Response

1. Limit the impact: [shift traffic, switch a feature off, restart]
2. Fix the cause: [what to do]
3. Verify: [signs it is healthy again]

## Communication

- Channel: [chat channel, email]
- Notify: [team, on-call]

## After the incident

- Root cause: [fill in afterwards]
- Follow-up: [task, owner]
`;

const EXERCISE_VI = `## Đề bài

[Mô tả tình huống và yêu cầu.]

## Gợi ý

- [Gợi ý 1]
- [Gợi ý 2]

## Lời giải

1. [cách làm]
2. [cách làm]
3. [cách làm]

## Câu hỏi ôn tập

1. [Câu hỏi 1]
2. [Câu hỏi 2]
3. [Câu hỏi 3]

## Đáp án

1. [Đáp án 1]
2. [Đáp án 2]
3. [Đáp án 3]
`;

const EXERCISE_EN = `## Task

[Describe the situation and what to do.]

## Hints

- [Hint 1]
- [Hint 2]

## Solution

1. [how]
2. [how]
3. [how]

## Review questions

1. [Question 1]
2. [Question 2]
3. [Question 3]

## Answers

1. [Answer 1]
2. [Answer 2]
3. [Answer 3]
`;

const COMPARE_VI = `## Tóm tắt

[Một câu: khác nhau lớn nhất giữa hai công nghệ.]

## So sánh

| Tiêu chí | [Công nghệ A] | [Công nghệ B] |
| --- | --- | --- |
| Dùng để | [ ] | [ ] |
| Ưu điểm | [ ] | [ ] |
| Nhược điểm | [ ] | [ ] |
| Hiệu năng | [ ] | [ ] |
| Độ khó | [ ] | [ ] |

## Khi nào chọn [Công nghệ A]

- [Tình huống]

## Khi nào chọn [Công nghệ B]

- [Tình huống]

## Ví dụ

- [Ví dụ thực tế cho mỗi bên]
`;

const COMPARE_EN = `## In short

[One sentence: the biggest difference between the two.]

## Comparison

| Criterion | [Technology A] | [Technology B] |
| --- | --- | --- |
| Used for | [ ] | [ ] |
| Strengths | [ ] | [ ] |
| Weaknesses | [ ] | [ ] |
| Performance | [ ] | [ ] |
| Learning curve | [ ] | [ ] |

## When to choose [Technology A]

- [Situation]

## When to choose [Technology B]

- [Situation]

## Examples

- [A real example for each]
`;

export const DOCUMENT_TEMPLATES: readonly [DocumentTemplate, ...DocumentTemplate[]] = [
  {
    id: 'lab',
    type: 'note',
    planet: 'violet',
    text: {
      vi: { name: 'Lab thực hành', sub: 'Mục tiêu · chuẩn bị · các bước · kiểm tra', title: 'Lab: [chủ đề]', body: LAB_VI },
      en: { name: 'Hands-on lab', sub: 'Goal · setup · steps · check', title: 'Lab: [topic]', body: LAB_EN },
    },
  },
  {
    id: 'meeting',
    type: 'note',
    planet: 'cyan',
    text: {
      vi: { name: 'Ghi chú họp', sub: 'Quyết định · việc cần làm', title: 'Họp: [chủ đề] · [ngày]', body: MEETING_VI },
      en: { name: 'Meeting notes', sub: 'Decisions · action items', title: 'Meeting: [topic] · [date]', body: MEETING_EN },
    },
  },
  {
    id: 'runbook',
    type: 'process',
    planet: 'amber',
    text: {
      vi: { name: 'Runbook sự cố', sub: 'Kiểm tra · xử lý · báo tin', title: 'Runbook: [tên sự cố]', body: RUNBOOK_VI },
      en: { name: 'Incident runbook', sub: 'Check · respond · notify', title: 'Runbook: [incident]', body: RUNBOOK_EN },
    },
  },
  {
    id: 'exercise',
    type: 'note',
    planet: 'emerald',
    text: {
      vi: { name: 'Bài tập', sub: 'Lời giải · câu hỏi ôn tập', title: 'Bài tập: [chủ đề]', body: EXERCISE_VI },
      en: { name: 'Exercise', sub: 'Solution · review questions', title: 'Exercise: [topic]', body: EXERCISE_EN },
    },
  },
  {
    id: 'compare',
    type: 'note',
    planet: 'pink',
    text: {
      vi: { name: 'So sánh hai công nghệ', sub: 'Bảng so sánh · khi nào chọn', title: '[Công nghệ A] hay [Công nghệ B]?', body: COMPARE_VI },
      en: { name: 'Compare two technologies', sub: 'Table · when to choose which', title: '[Technology A] or [Technology B]?', body: COMPARE_EN },
    },
  },
];

/** The template of an id from a URL; null for none or an unknown one. */
export function findTemplate(id: string | null): DocumentTemplate | null {
  return DOCUMENT_TEMPLATES.find((template) => template.id === id) ?? null;
}

/** Where picking a template goes: the page that creates the draft and opens the editor. */
export function templateHref(id: TemplateId): string {
  return `/new?template=${id}`;
}

/** The draft a template creates for a reader of `locale`: its outline, title, kind and planet, in that language. */
export function templateRequest(template: DocumentTemplate, locale: Locale): Pick<NewDocumentRequest, 'type' | 'title' | 'body' | 'lang' | 'planet'> {
  const text = template.text[locale];
  return { type: template.type, title: text.title, body: text.body, lang: locale, planet: template.planet };
}
