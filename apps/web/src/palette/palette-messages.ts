/** Strings of the ⌘K palette (board F01); a result's own labels come from the search strings (pages/search-messages.ts). */
import type { Locale } from '../i18n/i18n';
import { type ScreenTranslate, useScreenText } from '../pages/space-messages';

export const paletteVi = {
  'palette.label': 'Tìm nhanh',
  'palette.inputLabel': 'Tìm tri thức hoặc hỏi AI',
  'palette.placeholder': 'Tìm tri thức, tài liệu, hoặc hỏi AI…',
  'palette.meaningPending': 'Jev đang tìm theo nghĩa…',
  'palette.recent': 'Gần đây',
  'palette.commands': 'Lệnh nhanh',
  'palette.command.note': 'Tạo ghi chú',
  'palette.command.canvas': 'Mở Canvas',
  'palette.command.ask': 'Hỏi AI',
  'palette.command.upload': 'Tải tệp Office',
  'palette.ask': 'Hỏi AI: “{query}”',
  'palette.accent': 'Đang tìm đúng dấu · gõ không dấu để tìm mọi biến thể',
  'palette.keywordGroup': 'Khớp từ khoá · {count} · theo Space',
  'palette.keywordGroupExact': 'Khớp đúng dấu “{query}” · {count} · theo Space',
  'palette.groupCount': '· {count}',
  'palette.meaningGroup': 'Theo nghĩa · Jev',
  'palette.meaningHint': 'hỏi tiếng Anh cũng ra bài tiếng Việt',
  'palette.keywordOnly': 'Jev đang không trả lời · chỉ có kết quả theo từ khoá',
  'palette.none.title': 'Kho chưa có',
  'palette.none.text': 'Không thấy “{query}” theo từ khoá lẫn theo nghĩa.',
  'palette.none.note': 'Tạo ghi chú về nó',
  'palette.failed': 'Chưa tìm được. Nhấn Enter để thử lại.',
  'palette.previewLabel': 'Xem trước · Tab',
  'palette.open': 'Mở · Enter',
  'palette.hint.move': 'chọn',
  'palette.hint.open': 'mở',
  'palette.hint.preview': 'xem trước',
  'palette.hint.close': 'đóng',
  'palette.free': 'Từ khoá + Jev · miễn phí',
  'palette.all': 'Xem tất cả kết quả',
} as const;

export type PaletteMessageKey = keyof typeof paletteVi;

export const paletteEn: Record<PaletteMessageKey, string> = {
  'palette.label': 'Quick search',
  'palette.inputLabel': 'Search knowledge or ask AI',
  'palette.placeholder': 'Search knowledge, documents, or ask AI…',
  'palette.meaningPending': 'Jev is searching by meaning…',
  'palette.recent': 'Recent',
  'palette.commands': 'Quick commands',
  'palette.command.note': 'New note',
  'palette.command.canvas': 'Open Canvas',
  'palette.command.ask': 'Ask AI',
  'palette.command.upload': 'Upload an Office file',
  'palette.ask': 'Ask AI: “{query}”',
  'palette.accent': 'Matching exact accents · type without them for every variant',
  'palette.keywordGroup': 'Keyword matches · {count} · by Space',
  'palette.keywordGroupExact': 'Exact matches for “{query}” · {count} · by Space',
  'palette.groupCount': '· {count}',
  'palette.meaningGroup': 'By meaning · Jev',
  'palette.meaningHint': 'ask in English, find Vietnamese documents too',
  'palette.keywordOnly': 'Jev is not answering · keyword results only',
  'palette.none.title': 'Nothing here yet',
  'palette.none.text': 'Nothing on “{query}” by keyword or by meaning.',
  'palette.none.note': 'Write a note about it',
  'palette.failed': 'Search did not answer. Press Enter to try again.',
  'palette.previewLabel': 'Preview · Tab',
  'palette.open': 'Open · Enter',
  'palette.hint.move': 'move',
  'palette.hint.open': 'open',
  'palette.hint.preview': 'preview',
  'palette.hint.close': 'close',
  'palette.free': 'Keywords + Jev · free',
  'palette.all': 'See all results',
};

const PALETTE_TEXT: Record<Locale, Record<PaletteMessageKey, string>> = { vi: paletteVi, en: paletteEn };

export type PaletteTranslate = ScreenTranslate<PaletteMessageKey>;

export function usePaletteText(): { t: PaletteTranslate; locale: Locale } {
  return useScreenText(PALETTE_TEXT);
}
