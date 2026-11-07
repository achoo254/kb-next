/**
 * Strings of publishing a text (board C06) in vi and en: the three steps, the published card, and what to fix when it
 * could not be published.
 */
import type { Locale } from '../i18n/i18n';
import { type ScreenTranslate, useScreenText } from './space-messages';

export const submitVi = {
  'submit.crumb': 'Đăng bài',
  'submit.steps': 'Đang đăng',
  'submit.steps.head': 'A · Đang đăng',
  'submit.step.save': 'Lưu bài',
  'submit.step.save.done': 'Bản nháp đã lưu trên máy và server',
  'submit.step.extract': 'Chuẩn bị nội dung',
  'submit.step.extractOffice': 'Trích nội dung Office',
  'submit.step.extract.done': '{count} đoạn sẵn sàng để đăng',
  'submit.step.extractOffice.done': '{name} · đã trích nội dung',
  'submit.step.publish': 'Đăng công khai',
  'submit.step.publish.run': 'Đang đăng…',
  'submit.step.publish.done': 'Đã đăng · mọi người đọc được ngay',
  'submit.step.publish.hidden': 'Đã đăng · quản trị đang ẩn bài này',
  'submit.step.publish.wait': 'Chờ các bước trước',
  'submit.step.publish.failed': 'Chưa đăng được',
  'submit.sent': 'Đã đăng',
  'submit.sent.head': 'B · Đã đăng',
  'submit.sent.title': 'Đã đăng',
  'submit.sent.text': 'Bài đã hiện trong vũ trụ. Bạn sửa, gỡ xuống hay xoá bài bất cứ lúc nào.',
  'submit.sent.hiddenText': 'Bài đã đăng nhưng quản trị đang ẩn. Bài hiện lại khi quản trị bật hiện.',
  'submit.sent.public': 'Công khai · kể cả khách đọc được',
  'submit.sent.hidden': 'Quản trị đang ẩn bài này',
  'submit.sent.view': 'Xem bài',
  'submit.sent.share': 'Chia sẻ',
  'submit.sent.mine': 'Xem trong Của tôi',
  'submit.sent.write': 'Viết bài khác',
  'submit.sent.translate': 'Tạo bản dịch {lang} bằng AI',
  'submit.fix': 'Chưa đăng được',
  'submit.fix.head': 'C · Chưa đăng được · có cách sửa',
  'submit.fix.pick': 'Chọn lỗi',
  'submit.retry': 'Thử lại',
  'submit.retrying': 'Đang thử lại…',
  'submit.err.title-required.n': 'Thiếu tiêu đề',
  'submit.err.title-required.title': 'Thiếu tiêu đề',
  'submit.err.title-required.why': 'Bài cần một tiêu đề ngắn để hiện trên hành tinh và trong tìm kiếm.',
  'submit.err.title-required.fix': 'Thêm tiêu đề → đăng lại',
  'submit.err.title-required.note': 'Nội dung khác giữ nguyên.',
  'submit.err.title-required.action': 'Thêm tiêu đề',
  'submit.err.body-required.n': 'Chưa có nội dung',
  'submit.err.body-required.title': 'Bài chưa có nội dung',
  'submit.err.body-required.why': 'Bài trống thì người đọc không có gì để đọc.',
  'submit.err.body-required.fix': 'Viết nội dung → đăng lại',
  'submit.err.body-required.note': 'Tiêu đề và nơi đặt giữ nguyên.',
  'submit.err.body-required.action': 'Viết nội dung',
  'submit.err.network.n': 'Mất mạng',
  'submit.err.network.title': 'Mất mạng giữa chừng',
  'submit.err.network.why': 'Kết nối rớt khi đang đăng. Bản nháp đã giữ trên máy.',
  'submit.err.network.fix': 'Kết nối lại rồi bấm Thử lại',
  'submit.err.network.note': 'Bài chưa được đăng.',
  'submit.err.network.action': 'Xem bản nháp',
  'submit.err.not-yours.n': 'Không phải bài của bạn',
  'submit.err.not-yours.title': 'Không đăng được bài này',
  'submit.err.not-yours.why': 'Chỉ tác giả mới đăng được bài của mình.',
  'submit.err.not-yours.fix': 'Mở Của tôi để chọn bài của bạn',
  'submit.err.not-yours.note': 'Không có gì thay đổi.',
  'submit.err.not-yours.action': 'Xem Của tôi',
  'submit.err.rate-limited.n': 'Đăng nhiều quá',
  'submit.err.rate-limited.title': 'Đăng nhiều quá',
  'submit.err.rate-limited.why': 'Bạn vừa đăng nhiều bài liền nhau.',
  'submit.err.rate-limited.fix': 'Đợi vài phút rồi thử lại',
  'submit.err.rate-limited.note': 'Bài vẫn giữ nguyên.',
  'submit.err.rate-limited.action': 'Xem bản nháp',
  'submit.err.other.n': 'Lỗi máy chủ',
  'submit.err.other.title': 'Chưa đăng được',
  'submit.err.other.why': 'Máy chủ chưa nhận bài lúc này.',
  'submit.err.other.fix': 'Thử lại sau ít phút',
  'submit.err.other.note': 'Bài vẫn giữ nguyên.',
  'submit.err.other.action': 'Xem bản nháp',
  'submit.loading': 'Đang mở bài',
};

export type SubmitMessageKey = keyof typeof submitVi;

export const submitEn: Record<SubmitMessageKey, string> = {
  'submit.crumb': 'Publish',
  'submit.steps': 'Publishing',
  'submit.steps.head': 'A · Publishing',
  'submit.step.save': 'Save',
  'submit.step.save.done': 'Draft saved on this device and the server',
  'submit.step.extract': 'Prepare the content',
  'submit.step.extractOffice': 'Extract the Office content',
  'submit.step.extract.done': '{count} passages ready to publish',
  'submit.step.extractOffice.done': '{name} · content extracted',
  'submit.step.publish': 'Publish',
  'submit.step.publish.run': 'Publishing…',
  'submit.step.publish.done': 'Published · everyone reads it now',
  'submit.step.publish.hidden': 'Published · an admin is hiding it',
  'submit.step.publish.wait': 'Waiting for the steps before',
  'submit.step.publish.failed': 'Not published yet',
  'submit.sent': 'Published',
  'submit.sent.head': 'B · Published',
  'submit.sent.title': 'Published',
  'submit.sent.text': 'It is in the Universe now. You can edit, take down or delete it at any time.',
  'submit.sent.hiddenText': 'Published, but an admin is hiding it. It shows again once an admin shows it.',
  'submit.sent.public': 'Public · guests read it too',
  'submit.sent.hidden': 'Hidden by an admin',
  'submit.sent.view': 'View the text',
  'submit.sent.share': 'Share',
  'submit.sent.mine': 'See in My content',
  'submit.sent.write': 'Write another',
  'submit.sent.translate': 'Make an {lang} translation with AI',
  'submit.fix': 'Not published',
  'submit.fix.head': 'C · Not published · how to fix',
  'submit.fix.pick': 'Pick an error',
  'submit.retry': 'Try again',
  'submit.retrying': 'Trying again…',
  'submit.err.title-required.n': 'No title',
  'submit.err.title-required.title': 'No title',
  'submit.err.title-required.why': 'A text needs a short title to show on its planet and in search.',
  'submit.err.title-required.fix': 'Add a title → publish again',
  'submit.err.title-required.note': 'Everything else stays as it is.',
  'submit.err.title-required.action': 'Add a title',
  'submit.err.body-required.n': 'No content',
  'submit.err.body-required.title': 'The text is empty',
  'submit.err.body-required.why': 'An empty text gives readers nothing to read.',
  'submit.err.body-required.fix': 'Write the content → publish again',
  'submit.err.body-required.note': 'Its title and place stay as they are.',
  'submit.err.body-required.action': 'Write the content',
  'submit.err.network.n': 'Offline',
  'submit.err.network.title': 'The connection dropped',
  'submit.err.network.why': 'The connection dropped while publishing. The draft is kept on this device.',
  'submit.err.network.fix': 'Reconnect, then Try again',
  'submit.err.network.note': 'The text is not published yet.',
  'submit.err.network.action': 'See the draft',
  'submit.err.not-yours.n': 'Not yours',
  'submit.err.not-yours.title': 'This text cannot be published',
  'submit.err.not-yours.why': 'Only its author publishes a text.',
  'submit.err.not-yours.fix': 'Open My content and pick one of yours',
  'submit.err.not-yours.note': 'Nothing changed.',
  'submit.err.not-yours.action': 'Open My content',
  'submit.err.rate-limited.n': 'Too many',
  'submit.err.rate-limited.title': 'Too many publications',
  'submit.err.rate-limited.why': 'You published several texts in a row.',
  'submit.err.rate-limited.fix': 'Wait a few minutes, then try again',
  'submit.err.rate-limited.note': 'The text stays as it is.',
  'submit.err.rate-limited.action': 'See the draft',
  'submit.err.other.n': 'Server error',
  'submit.err.other.title': 'Not published',
  'submit.err.other.why': 'The server did not take the text just now.',
  'submit.err.other.fix': 'Try again in a few minutes',
  'submit.err.other.note': 'The text stays as it is.',
  'submit.err.other.action': 'See the draft',
  'submit.loading': 'Opening the text',
};

const SUBMIT_TEXT: Record<Locale, Record<SubmitMessageKey, string>> = { vi: submitVi, en: submitEn };

export function useSubmitText(): { t: ScreenTranslate<SubmitMessageKey>; locale: Locale } {
  return useScreenText(SUBMIT_TEXT);
}

/** What went wrong, as C06 explains it (each has its own fix). */
export const SUBMIT_ERRORS = ['title-required', 'body-required', 'network', 'not-yours', 'rate-limited', 'other'] as const;
export type SubmitError = (typeof SUBMIT_ERRORS)[number];

/** The error of an API code (ApiError.code). */
export function submitErrorOf(code: string): SubmitError {
  if (code === 'not-found' || code === 'no-access' || code === 'hidden') return 'not-yours';
  return SUBMIT_ERRORS.find((e) => e === code) ?? 'other';
}

/** Whether trying again can help (a dropped connection, a busy server), or the text must change first. */
export function canRetry(error: SubmitError): boolean {
  return error === 'network' || error === 'rate-limited' || error === 'other';
}
