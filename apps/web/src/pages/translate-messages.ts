/** Strings of "Dịch bằng AI" (board F04), vi and en. */
import type { Locale } from '../i18n/i18n';
import { type ScreenTranslate, useScreenText } from './space-messages';

export const translateVi = {
  'translate.badge': 'Bản dịch AI · chưa ai soát',
  'translate.progress': 'Tiến độ dịch',
  'translate.stop': 'Dừng',
  'translate.read': 'Đọc bản dịch',
  'translate.again': 'Dịch lại',
  'translate.openKeys': 'Mở Key riêng',
  'translate.original': 'Bản gốc · {lang}',
  'translate.originalLabel': 'Bản gốc {lang}',
  'translate.translation': 'Bản dịch · {lang}',
  'translate.translationLabel': 'Bản dịch {lang}',
  'translate.lang.vi': 'tiếng Việt',
  'translate.lang.en': 'tiếng Anh',
  'translate.by': '{model} · key ••••{last4}',
  'translate.loading': 'Đang mở tài liệu',
  'translate.noKey.title': 'Thêm key để dịch',
  'translate.noKey.text': 'Dịch dùng model của bạn (OpenAI, Gemini hoặc Claude). Bài này khoảng {words} từ.',
  'translate.off.title': 'Dịch bằng AI đang tắt',
  'translate.off.text': 'Máy chủ này chưa bật key riêng nên chưa dịch được. Bài gốc vẫn đọc bình thường.',
  'translate.done': 'Đã dịch xong và lưu thành bản nháp chỉ bạn thấy.',
  'translate.stopped': 'Đã dừng. Phần đã dịch chưa được lưu.',
  'translate.error.rejected': 'Nhà cung cấp từ chối key của bạn. Sửa key ở Key riêng rồi dịch lại.',
  'translate.error.noCredit': 'Key của bạn đã hết credit. Nạp thêm hoặc đổi key rồi dịch lại.',
  'translate.error.unreadable': 'Máy chủ không đọc lại được key của bạn. Lưu lại key ở Key riêng rồi dịch lại.',
  'translate.error.tooLong': 'Tài liệu này dài quá để dịch một lần.',
  'translate.error.model': 'Key của bạn không dùng được model đang chọn. Chọn model khác ở Key riêng rồi dịch lại.',
  'translate.error.provider': 'Nhà cung cấp dừng giữa chừng. Phần đã dịch chưa được lưu, thử lại nhé.',
  'translate.error.rateLimited': 'Bạn dùng AI nhiều quá trong một phút. Đợi một chút rồi dịch lại.',
  'translate.error.network': 'Mất kết nối giữa chừng. Phần đã dịch chưa được lưu.',
  'translate.error.notTranslatable': 'Tài liệu này là tệp, chưa dịch bằng AI được.',
  'translate.error.sameLanguage': 'Tài liệu này đã là {lang}.',
  'translate.error.other': 'Chưa dịch được. Thử lại nhé.',
  'translate.back': 'Về bài gốc',
};

export type TranslateMessageKey = keyof typeof translateVi;

export const translateEn: Record<TranslateMessageKey, string> = {
  'translate.badge': 'AI translation · not checked',
  'translate.progress': 'Translation progress',
  'translate.stop': 'Stop',
  'translate.read': 'Read the translation',
  'translate.again': 'Translate again',
  'translate.openKeys': 'Open Own keys',
  'translate.original': 'Original · {lang}',
  'translate.originalLabel': 'Original in {lang}',
  'translate.translation': 'Translation · {lang}',
  'translate.translationLabel': 'Translation in {lang}',
  'translate.lang.vi': 'Vietnamese',
  'translate.lang.en': 'English',
  'translate.by': '{model} · key ••••{last4}',
  'translate.loading': 'Opening the document',
  'translate.noKey.title': 'Add a key to translate',
  'translate.noKey.text': 'Translation runs on your own model (OpenAI, Gemini or Claude). This document is about {words} words.',
  'translate.off.title': 'AI translation is off',
  'translate.off.text': 'Own keys are not switched on for this server, so nothing can be translated. The original reads as usual.',
  'translate.done': 'Translated and saved as a draft only you can see.',
  'translate.stopped': 'Stopped. The part translated so far was not saved.',
  'translate.error.rejected': 'The provider refused your key. Fix it in Own keys, then translate again.',
  'translate.error.noCredit': 'Your key is out of credit. Top it up or change keys, then translate again.',
  'translate.error.unreadable': 'The server can no longer read your key. Save it again in Own keys, then translate again.',
  'translate.error.tooLong': 'This document is too long to translate in one go.',
  'translate.error.model': 'Your key cannot use the chosen model. Pick another model under Own keys, then translate again.',
  'translate.error.provider': 'The provider stopped halfway. Nothing was saved; try again.',
  'translate.error.rateLimited': 'Too many AI requests in a minute. Wait a moment, then translate again.',
  'translate.error.network': 'The connection dropped halfway. Nothing was saved.',
  'translate.error.notTranslatable': 'This document is a file; AI cannot translate it yet.',
  'translate.error.sameLanguage': 'This document is already in {lang}.',
  'translate.error.other': 'Could not translate. Try again.',
  'translate.back': 'Back to the original',
};

export const translateZh: Record<TranslateMessageKey, string> = {
  'translate.badge': 'AI 翻译 · 尚未审核',
  'translate.progress': '翻译进度',
  'translate.stop': '停止',
  'translate.read': '阅读译文',
  'translate.again': '重新翻译',
  'translate.openKeys': '打开私有密钥',
  'translate.original': '原文 · {lang}',
  'translate.originalLabel': '{lang}原文',
  'translate.translation': '译文 · {lang}',
  'translate.translationLabel': '{lang}译文',
  'translate.lang.vi': '越南语',
  'translate.lang.en': '英语',
  'translate.by': '{model} · 密钥 ••••{last4}',
  'translate.loading': '正在打开文档',
  'translate.noKey.title': '添加密钥后才能翻译',
  'translate.noKey.text': '翻译使用你自己的模型（OpenAI、Gemini 或 Claude）。这篇文档约 {words} 字。',
  'translate.off.title': 'AI 翻译已关闭',
  'translate.off.text': '此服务器尚未启用私有密钥，因此无法翻译。原文仍可正常阅读。',
  'translate.done': '翻译完成，已保存为仅你可见的草稿。',
  'translate.stopped': '已停止。已翻译的部分未保存。',
  'translate.error.rejected': '服务商拒绝了你的密钥。请在私有密钥中修改后重新翻译。',
  'translate.error.noCredit': '你的密钥额度已用完。请充值或更换密钥后重新翻译。',
  'translate.error.unreadable': '服务器无法再读取你的密钥。请在私有密钥中重新保存后再翻译。',
  'translate.error.tooLong': '这篇文档太长，无法一次翻译完。',
  'translate.error.model': '你的密钥无法使用所选模型。请在私有密钥中选择其他模型后重新翻译。',
  'translate.error.provider': '服务商中途停止。已翻译的部分未保存，请重试。',
  'translate.error.rateLimited': '你一分钟内使用 AI 过于频繁。请稍等片刻再翻译。',
  'translate.error.network': '连接中途中断。已翻译的部分未保存。',
  'translate.error.notTranslatable': '这篇文档是文件，暂时无法用 AI 翻译。',
  'translate.error.sameLanguage': '这篇文档已经是{lang}。',
  'translate.error.other': '暂时无法翻译，请重试。',
  'translate.back': '回到原文',
};

const TRANSLATE_TEXT: Record<Locale, Record<TranslateMessageKey, string>> = { vi: translateVi, en: translateEn, 'zh-CN': translateZh };

export function useTranslateText(): { t: ScreenTranslate<TranslateMessageKey>; locale: Locale } {
  return useScreenText(TRANSLATE_TEXT);
}

/** A language's own name, as the column headings show it ("Bản gốc · Tiếng Việt", "Bản dịch · English"). */
export const NATIVE_LANGUAGE = { vi: 'Tiếng Việt', en: 'English' } as const;
