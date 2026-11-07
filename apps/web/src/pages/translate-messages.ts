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

const TRANSLATE_TEXT: Record<Locale, Record<TranslateMessageKey, string>> = { vi: translateVi, en: translateEn };

export function useTranslateText(): { t: ScreenTranslate<TranslateMessageKey>; locale: Locale } {
  return useScreenText(TRANSLATE_TEXT);
}

/** A language's own name, as the column headings show it ("Bản gốc · Tiếng Việt", "Bản dịch · English"). */
export const NATIVE_LANGUAGE = { vi: 'Tiếng Việt', en: 'English' } as const;
