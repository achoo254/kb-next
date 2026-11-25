---
phase: 1
title: "Bộ cắt slide"
status: completed
tier: M
dependsOn: []
---

# Giai đoạn 1 · Bộ cắt slide

## Mục tiêu

Viết một hàm thuần `buildSlides(document, chunks, lang)` nhận `Slide[]`. Hàm không gọi mạng và không đụng React, để test
được bằng vitest với dữ liệu giống bài thật.

## Tệp

- Mới: `apps/web/src/pages/present-slides.ts` (kiểu `Slide`, `buildSlides`, các luật tách).
- Mới: `apps/web/src/pages/present-slides.test.ts`.
- Mới: `apps/web/src/pages/present-fixtures.ts`: 3 bài mẫu rút từ prod gồm một note, một process và bài lab dài nhất. Chỉ chép phần cần để test và chạy qua `pnpm check:public` (không chứa IP hay bí mật).
- Đọc lại, không sửa: `reader-markdown.tsx` (`isStepList`, `stepTerm`, `linkWikilinks`), `step-mark.ts`.

## Kiểu slide

```ts
type Slide =
  | { kind: 'cover'; title: string; space: SpaceRef; minutes: number }
  | { kind: 'tldr'; points: string[] }
  | { kind: 'toc'; headings: { anchor: string; title: string }[] }
  | { kind: 'section'; anchor: string; heading: string; index: number; total: number }
  | { kind: 'text'; anchor: string; markdown: string; notes: string }
  | { kind: 'bullets'; anchor: string; items: string[]; notes: string }
  | { kind: 'step'; anchor: string; term: string; body: string; step: number; steps: number }
  | { kind: 'quote'; anchor: string; markdown: string }
  | { kind: 'stat'; anchor: string; value: string; caption: string }
  | { kind: 'code'; anchor: string; lang: string; code: string; part?: [number, number] }
  | { kind: 'table-cards'; anchor: string; rows: Record<string, string>[] }
  | { kind: 'table-link'; anchor: string }
  | { kind: 'image'; anchor: string; src: string; alt: string }
  | { kind: 'end'; title: string; headings: string[] };
```

Trường `notes` luôn chứa đoạn Markdown gốc đầy đủ của slide. Màn hình người nói (giai đoạn 3) dùng trường này.

## Luật cắt

1. Slide `cover`. Tiếp theo là `tldr` nếu phần đầu của bài có khối `> [!TLDR]`. Khối này bị bỏ khỏi phần thân để không hiện hai lần. Nếu bài không có khối TL;DR thì slide thứ hai là `toc` (mục lục các heading).
2. Mỗi chunk mở đầu bằng một slide `section` (tên phần và "Phần i/n"), sau đó các khối Markdown lần lượt:
   - Đoạn văn: tách theo câu (`Intl.Segmenter` với `granularity: 'sentence'`), gom câu cho tới khoảng 200 ký tự, mỗi gói thành một `text`. Câu dài hơn 260 ký tự đứng riêng một slide; CSS chỉnh cỡ chữ cho vừa.
   - Danh sách thường: `bullets`, tối đa 3 mục mỗi slide.
   - Danh sách bước (`isStepList`): mỗi mục là một `step`.
   - Trích dẫn: `quote`. Trích dẫn `[!WARNING]` vẫn là `quote` nhưng có cờ cảnh báo.
   - Đoạn chỉ gồm một con số nổi bật (ví dụ `**73%** người dùng…`, khớp mẫu số/phần trăm ở đầu đoạn và đoạn ngắn hơn 120 ký tự): `stat`.
   - Code: `code`, mỗi slide tối đa 12 dòng. Dài hơn thì tách thành nhiều phần và gắn `part`.
   - Bảng: tối đa 3 cột thì `table-cards` (3 hàng mỗi slide), nhiều cột hơn thì `table-link`.
   - Ảnh: `image`.
3. Slide cuối là `end`: tiêu đề bài và danh sách heading làm tóm tắt.
4. Giữ toàn văn bài (V1), xem mục "Bài dài" bên dưới.
5. Luôn trả kết quả giống nhau với cùng đầu vào, để `#n` trỏ cùng một slide giữa các lần mở cho tới khi bài đổi.

## Test

- Mỗi luật ở mục 2 có ít nhất một ca test.
- Với 3 bài mẫu: không slide `text` nào dài hơn 260 ký tự, không slide `code` nào quá 12 dòng, nối `notes` của mọi slide lại thì không thiếu đoạn văn nào của bài, và slide `toc` trỏ đúng index của từng `section`.
- Có TL;DR thì slide 2 là `tldr` và khối TL;DR không hiện lại trong phần thân. Không có TL;DR thì slide 2 là `toc`.
- Chạy: `pnpm vitest run apps/web/src/pages/present-slides.test.ts`.

## Bài dài (V1, chủ dự án chốt 08/11/2026)

Giữ toàn văn, không cắt bớt nội dung. Bài lab dài nhất trên prod (51.700 ký tự, 36 code block) sẽ ra khoảng 250 slide.
Để người xem không bị lạc trong bộ slide dài:

- Các mục trong slide `toc` bấm được, nhảy thẳng tới slide `section` của phần đó.
- Slide `section` cho biết phần này có bao nhiêu slide.
- Thanh tiến độ chia theo phần khi bộ slide có hơn 40 slide (giai đoạn 2).
- Thêm phím `T` để mở lại mục lục từ bất kỳ slide nào (giai đoạn 2).
- Giới hạn an toàn là 1.000 slide. Vượt mức này thì chỉ giữ 1.000 slide đầu và ghi cảnh báo vào console. Hiện chưa có bài nào gần tới mức này.
