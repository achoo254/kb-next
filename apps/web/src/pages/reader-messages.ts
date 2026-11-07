/** Strings of the reader (board C11), vi and en; see space-messages.ts for the shared document labels. */
import type { Locale } from '../i18n/i18n';
import { type ScreenTranslate, useScreenText } from './space-messages';

export const readerVi = {
  'reader.toc': 'Mục lục',
  'reader.textSize': 'Cỡ chữ',
  'reader.textSmaller': 'Chữ nhỏ hơn',
  'reader.textLarger': 'Chữ lớn hơn',
  'reader.textSizeValue': '{size}px',
  'reader.overview': 'Tổng quan',
  'reader.comments': 'Bình luận',
  'reader.reviewedBy': 'Đã duyệt bởi {name}',
  'reader.aiTranslated': 'Bản dịch AI',
  'reader.minutes': '{count} phút đọc',
  'reader.hasLang': 'có bản {lang}',
  'reader.updated': 'cập nhật {date}',
  'reader.translate': 'Dịch bằng AI',
  'reader.translateNote': 'Chưa có bản {lang}. Đang hiện bản gốc; AI dịch được khi bạn thêm key riêng.',
  'reader.loading': 'Đang tải tài liệu',
  'reader.hidden.title': 'Tài liệu đang tạm ẩn',
  'reader.hidden.text': 'Quản trị đã ẩn tài liệu này khỏi Universe. Link chia sẻ cũ cũng tạm không mở được.',
  'reader.hidden.action': 'Về Universe',
  'reader.offline.title': 'Bạn đang offline',
  'reader.offline.text': 'Chưa tải được tài liệu này. Kết nối lại rồi thử lần nữa.',
  'reader.offline.action': 'Thử lại',
  'reader.offlineBanner': 'Offline · đang đọc bản đã tải lúc {time} · AI tạm tắt',
  'reader.actions': 'Thao tác với tài liệu',
  'reader.edit': 'Sửa',
  'reader.share': 'Chia sẻ',
  'reader.shareCopied': 'Đã chép link',
  'reader.canvas': 'Canvas',
  'reader.favorite': 'Yêu thích',
  'reader.favoriteOffline': 'Đang offline · kết nối lại để lưu Yêu thích',
  'reader.favoriteFailed': 'Chưa lưu được Yêu thích · thử lại',
  'reader.soon': 'Sắp có',
  'reader.ai.title': 'AI với tài liệu này',
  'reader.ai.explain': 'Giải thích đoạn này',
  'reader.ai.summarize': 'Tóm tắt',
  'reader.ai.noKey': 'Chưa có key · AI cần key riêng, Jev vẫn gợi ý được',
  'reader.ai.offline': 'Đang offline · AI tạm tắt',
  'reader.ai.needKeyExplain': 'AI cần key riêng của bạn để giải thích. Jev vẫn gợi ý được các bài liên quan ở cột phải.',
  'reader.ai.needKeySummarize': 'AI cần key riêng của bạn để tóm tắt. Jev vẫn gợi ý được các bài liên quan ở cột phải.',
  'reader.ai.addKey': 'Thêm key',
  'reader.ai.withKey': 'Dùng key {provider} ••••{last4} của bạn · Jev kiểm trích dẫn miễn phí',
  'reader.ai.off': 'Key riêng đang tắt trên máy chủ này',
  'reader.ai.result': 'Kết quả AI',
  'reader.ai.explainSelection': 'Giải thích đoạn đã chọn',
  'reader.ai.summarizeSelection': 'Tóm tắt đoạn đã chọn',
  'reader.ai.explainPassage': 'Giải thích đoạn “{title}”',
  'reader.ai.summarizeDocument': 'Tóm tắt tài liệu',
  'reader.ai.checked': 'Jev đã kiểm {ok}/{total}',
  'reader.ai.key': 'Key {provider} ••••{last4}',
  'reader.sel.label': 'Thao tác với đoạn đã chọn',
  'reader.sel.explain': 'Giải thích',
  'reader.sel.summarize': 'Tóm tắt',
  'reader.sel.ask': 'Hỏi Copilot',
  'reader.sel.mark': 'Đánh dấu',
  'reader.sel.question': '“{text}” nghĩa là gì?',
  'reader.backlinks': 'Backlinks · {count} tài liệu nhắc tới bài này',
  'reader.backlinksNone': 'Chưa có tài liệu nào nhắc tới bài này.',
  'reader.related': 'Liên quan',
  'reader.relatedBy': '· Jev',
  'reader.relatedNone': 'Chưa có tài liệu liên quan.',
  'reader.relevance': 'Độ liên quan {value}',
  'reader.versions': 'Phiên bản và hoạt động',
  'reader.versionsReviewed': '{name} duyệt {date} · {count} phiên bản',
  'reader.versionsEdited': 'Sửa lần cuối {date} · {count} phiên bản',
  'reader.versionRow': 'v{version} · {editor} · {date}',
  'reader.unknownEditor': 'Không rõ',
  'reader.keys': 'Phím tắt',
  'reader.keyJk': 'chuyển mục',
  'reader.commentsCount': 'Bình luận · {count}',
  'reader.commentsClosed': 'Bình luận mở khi tài liệu đã được duyệt.',
  'reader.commentsNone': 'Chưa có bình luận nào.',
  'reader.commentsFailed': 'Chưa tải được bình luận.',
  'reader.commentLabel': 'Viết bình luận',
  'reader.commentPlaceholder': 'Viết bình luận…',
  'reader.commentSend': 'Gửi',
  'reader.commentSignIn': 'Đăng nhập để bình luận',
  'reader.commentSending': 'Đang gửi…',
  'reader.commentFailed': 'Chưa gửi được bình luận. Thử lại nhé.',
  'reader.commentTooLong': 'Bình luận dài tối đa {max} ký tự.',
  'reader.anonymous': 'Ẩn danh',
};

export type ReaderMessageKey = keyof typeof readerVi;

export const readerEn: Record<ReaderMessageKey, string> = {
  'reader.toc': 'Contents',
  'reader.textSize': 'Text size',
  'reader.textSmaller': 'Smaller text',
  'reader.textLarger': 'Larger text',
  'reader.textSizeValue': '{size}px',
  'reader.overview': 'Overview',
  'reader.comments': 'Comments',
  'reader.reviewedBy': 'Reviewed by {name}',
  'reader.aiTranslated': 'AI translation',
  'reader.minutes': '{count} min read',
  'reader.hasLang': '{lang} version available',
  'reader.updated': 'updated {date}',
  'reader.translate': 'Translate with AI',
  'reader.translateNote': 'No {lang} version yet. Showing the original; AI can translate once you add your own key.',
  'reader.loading': 'Loading the document',
  'reader.hidden.title': 'This document is hidden for now',
  'reader.hidden.text': 'An admin took this document off the Universe. Old share links do not open it either.',
  'reader.hidden.action': 'Back to the Universe',
  'reader.offline.title': 'You are offline',
  'reader.offline.text': 'This document has not loaded yet. Reconnect and try again.',
  'reader.offline.action': 'Try again',
  'reader.offlineBanner': 'Offline · reading the copy loaded at {time} · AI paused',
  'reader.actions': 'Document actions',
  'reader.edit': 'Edit',
  'reader.share': 'Share',
  'reader.shareCopied': 'Link copied',
  'reader.canvas': 'Canvas',
  'reader.favorite': 'Favourite',
  'reader.favoriteOffline': 'Offline · reconnect to save favourites',
  'reader.favoriteFailed': 'The favourite was not saved · try again',
  'reader.soon': 'Coming soon',
  'reader.ai.title': 'AI with this document',
  'reader.ai.explain': 'Explain this passage',
  'reader.ai.summarize': 'Summarise',
  'reader.ai.noKey': 'No key yet · AI needs your own key, Jev still suggests',
  'reader.ai.offline': 'Offline · AI paused',
  'reader.ai.needKeyExplain': 'AI needs your own key to explain. Jev still suggests related documents on the right.',
  'reader.ai.needKeySummarize': 'AI needs your own key to summarise. Jev still suggests related documents on the right.',
  'reader.ai.addKey': 'Add a key',
  'reader.ai.withKey': 'Uses your {provider} key ••••{last4} · Jev checks citations for free',
  'reader.ai.off': 'Own keys are off on this server',
  'reader.ai.result': 'AI result',
  'reader.ai.explainSelection': 'Explaining the selection',
  'reader.ai.summarizeSelection': 'Summarising the selection',
  'reader.ai.explainPassage': 'Explaining “{title}”',
  'reader.ai.summarizeDocument': 'Summary of the document',
  'reader.ai.checked': 'Checked by Jev {ok}/{total}',
  'reader.ai.key': '{provider} key ••••{last4}',
  'reader.sel.label': 'Actions on the selection',
  'reader.sel.explain': 'Explain',
  'reader.sel.summarize': 'Summarise',
  'reader.sel.ask': 'Ask Copilot',
  'reader.sel.mark': 'Highlight',
  'reader.sel.question': 'What does “{text}” mean?',
  'reader.backlinks': 'Backlinks · {count} documents mention this one',
  'reader.backlinksNone': 'No document mentions this one yet.',
  'reader.related': 'Related',
  'reader.relatedBy': '· Jev',
  'reader.relatedNone': 'No related documents yet.',
  'reader.relevance': 'Relevance {value}',
  'reader.versions': 'Versions and activity',
  'reader.versionsReviewed': '{name} reviewed {date} · {count} versions',
  'reader.versionsEdited': 'Last edited {date} · {count} versions',
  'reader.versionRow': 'v{version} · {editor} · {date}',
  'reader.unknownEditor': 'Unknown',
  'reader.keys': 'Shortcuts',
  'reader.keyJk': 'next / previous section',
  'reader.commentsCount': 'Comments · {count}',
  'reader.commentsClosed': 'Comments open once the document is approved.',
  'reader.commentsNone': 'No comments yet.',
  'reader.commentsFailed': 'Comments could not be loaded.',
  'reader.commentLabel': 'Write a comment',
  'reader.commentPlaceholder': 'Write a comment…',
  'reader.commentSend': 'Send',
  'reader.commentSignIn': 'Sign in to comment',
  'reader.commentSending': 'Sending…',
  'reader.commentFailed': 'The comment was not sent. Please try again.',
  'reader.commentTooLong': 'A comment is at most {max} characters.',
  'reader.anonymous': 'Anonymous',
};

const READER_TEXT: Record<Locale, Record<ReaderMessageKey, string>> = { vi: readerVi, en: readerEn };

export function useReaderText(): { t: ScreenTranslate<ReaderMessageKey>; locale: Locale } {
  return useScreenText(READER_TEXT);
}

/** The short dates of C11 in the app's time zone: "03/11" in Vietnamese, "3 Nov" in English. */
export function shortDate(locale: Locale, iso: string): string {
  const date = new Date(iso);
  if (locale === 'vi') {
    const parts = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' }).formatToParts(date);
    const part = (type: Intl.DateTimeFormatPartTypes): string => parts.find((p) => p.type === type)?.value ?? '';
    return `${part('day')}/${part('month')}`;
  }
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Ho_Chi_Minh' });
}

/** "2 giờ trước", "2 hours ago": how long ago, from `now`. */
export function timeAgo(locale: Locale, iso: string, now: number): string {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  const format = new Intl.RelativeTimeFormat(locale === 'vi' ? 'vi-VN' : 'en-GB', { numeric: 'auto' });
  const steps: ReadonlyArray<readonly [Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 365 * 86400],
    ['month', 30 * 86400],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ];
  for (const [unit, size] of steps) {
    if (Math.abs(seconds) >= size) return format.format(Math.trunc(seconds / size), unit);
  }
  return format.format(0, 'minute');
}
