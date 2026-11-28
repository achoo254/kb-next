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

export const paletteZh: Record<PaletteMessageKey, string> = {
  'palette.label': '快速搜索',
  'palette.inputLabel': '搜索知识或询问 AI',
  'palette.placeholder': '搜索知识、文档，或询问 AI…',
  'palette.meaningPending': 'Jev 正在按语义搜索…',
  'palette.recent': '最近',
  'palette.commands': '快捷命令',
  'palette.command.note': '新建笔记',
  'palette.command.canvas': '打开画布',
  'palette.command.ask': '询问 AI',
  'palette.command.upload': '上传 Office 文件',
  'palette.ask': '询问 AI：“{query}”',
  'palette.accent': '正在匹配准确的声调符号 · 不带符号输入可查找所有变体',
  'palette.keywordGroup': '关键词匹配 · {count} · 按空间',
  'palette.keywordGroupExact': '“{query}”的精确匹配 · {count} · 按空间',
  'palette.groupCount': '· {count}',
  'palette.meaningGroup': '按语义 · Jev',
  'palette.meaningHint': '用英文提问也能找到越南语文档',
  'palette.keywordOnly': 'Jev 暂未响应 · 仅显示关键词结果',
  'palette.none.title': '这里还没有内容',
  'palette.none.text': '按关键词和语义都没有找到“{query}”。',
  'palette.none.note': '写一篇关于它的笔记',
  'palette.failed': '搜索没有响应。按 Enter 重试。',
  'palette.previewLabel': '预览 · Tab',
  'palette.open': '打开 · Enter',
  'palette.hint.move': '移动',
  'palette.hint.open': '打开',
  'palette.hint.preview': '预览',
  'palette.hint.close': '关闭',
  'palette.free': '关键词 + Jev · 免费',
  'palette.all': '查看全部结果',
};

const PALETTE_TEXT: Record<Locale, Record<PaletteMessageKey, string>> = { vi: paletteVi, en: paletteEn, 'zh-CN': paletteZh };

export type PaletteTranslate = ScreenTranslate<PaletteMessageKey>;

export function usePaletteText(): { t: PaletteTranslate; locale: Locale } {
  return useScreenText(PALETTE_TEXT);
}
