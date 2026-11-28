/** Strings of "Trí nhớ" (/memory, no board): what the AI in Chat remembered about the reader, vi and en. */
import type { Locale } from '../i18n/i18n';
import { type ScreenTranslate, useScreenText } from './space-messages';

export const memoryVi = {
  'memory.title': 'Trí nhớ',
  'memory.sub':
    'AI trong Chat ghi lại ở đây những điều bạn kể để lần sau không phải hỏi lại. Chỉ bạn đọc được (quản trị hệ thống xem được như mọi ghi chú riêng tư, nhưng AI của họ thì không). App từ chối lưu mật khẩu, bí mật, số giấy tờ và số tài khoản; chuyện sự nghiệp và thu nhập nằm ở app riêng.',
  'memory.loading': 'Đang mở trí nhớ…',
  'memory.failed': 'Chưa tải được trí nhớ.',
  'memory.retry': 'Thử lại',
  'memory.switches': 'Cách AI dùng trí nhớ',
  'memory.paused': 'Tạm dừng trí nhớ',
  'memory.paused.sub': 'AI không ghi thêm và cũng không đọc trí nhớ cho tới khi bạn bật lại.',
  'memory.sensitive': 'Nhớ cả chủ đề nhạy cảm',
  'memory.sensitive.sub': 'Sức khoẻ, tôn giáo, chính trị… Mặc định AI tự nhận ra và bỏ qua những chuyện này; tắt lại thì AI không đọc các chủ đề nhạy cảm đã lưu.',
  'memory.saveFailed': 'Chưa lưu được lựa chọn. Thử lại.',
  'memory.general': 'Chung',
  'memory.general.sub': 'Dùng cho mọi cuộc trò chuyện',
  'memory.chats': 'Theo hội thoại',
  'memory.chats.sub': 'Chỉ dùng trong đúng hội thoại đó',
  'memory.chat': 'Hội thoại #{id}',
  'memory.updated': 'sửa {when}',
  'memory.edit': 'Sửa',
  'memory.delete': 'Xoá',
  'memory.empty': 'AI chưa nhớ điều gì. Kể cho AI trong Chat về bạn, những điều đáng nhớ sẽ hiện ở đây.',
  'memory.groupEmpty': 'Chưa có chủ đề nào.',
  'memory.deleteOne.title': 'Xoá chủ đề «{title}»?',
  'memory.deleteOne.text': 'AI sẽ không nhớ chủ đề này nữa. Nó nằm trong thùng rác 30 ngày, bạn khôi phục được ở trang Của tôi.',
  'memory.deleteOne.done': 'Đã chuyển «{title}» vào thùng rác.',
  'memory.deleteAll': 'Xoá toàn bộ trí nhớ',
  'memory.deleteAll.title': 'Xoá toàn bộ trí nhớ?',
  'memory.deleteAll.text': 'Mọi chủ đề AI đã nhớ sẽ vào thùng rác 30 ngày; sau đó bị xoá hẳn. AI bắt đầu lại từ đầu.',
  'memory.deleteAll.done': 'Đã chuyển {count} chủ đề vào thùng rác.',
  'memory.cancel': 'Thôi',
  'memory.actionFailed': 'Chưa làm được. Thử lại.',
  'memory.undo.title': 'Hoàn tác lần ghi nhớ vừa rồi?',
  'memory.undo.text': 'AI vừa ghi một điều vào trí nhớ. Bấm hoàn tác nếu bạn không muốn AI nhớ điều đó.',
  'memory.undo.action': 'Hoàn tác',
  'memory.undo.working': 'Đang hoàn tác…',
  'memory.undo.trashed': 'Đã hoàn tác: chủ đề vừa tạo đã vào thùng rác.',
  'memory.undo.reverted': 'Đã hoàn tác: điều vừa ghi đã được bỏ.',
  'memory.undo.invalid': 'Liên kết hoàn tác không đúng.',
  'memory.undo.expired': 'Liên kết hoàn tác đã quá 24 giờ. Bạn vẫn có thể sửa hay xoá chủ đề bên dưới.',
  'memory.undo.used': 'Lần ghi nhớ này đã được hoàn tác rồi.',
  'memory.undo.stale': 'Điều đó không còn trong chủ đề (có thể bạn đã sửa). Xem và sửa chủ đề bên dưới.',
  'memory.undo.notFound': 'Không còn thấy chủ đề này; có thể bạn đã xoá nó.',
  'memory.undo.failed': 'Chưa hoàn tác được. Thử lại.',
  'memory.undo.close': 'Đóng',
} as const;

export type MemoryMessageKey = keyof typeof memoryVi;

export const memoryEn: Record<MemoryMessageKey, string> = {
  'memory.title': 'Memory',
  'memory.sub':
    'The AI in Chat keeps here what you told it, so it does not have to ask again. Only you can read it (system admins can see it like any private note, but their AI cannot). The app refuses passwords, secrets, identity and account numbers; your career and income live in their own app.',
  'memory.loading': 'Opening your memory…',
  'memory.failed': 'Your memory could not load.',
  'memory.retry': 'Try again',
  'memory.switches': 'How the AI uses memory',
  'memory.paused': 'Pause memory',
  'memory.paused.sub': 'The AI neither saves nor reads memory until you turn it back on.',
  'memory.sensitive': 'Remember sensitive topics too',
  'memory.sensitive.sub': 'Health, religion, politics… By default the AI recognises and leaves these out; turning this off again hides saved sensitive topics from the AI.',
  'memory.saveFailed': 'Your choice was not saved. Try again.',
  'memory.general': 'General',
  'memory.general.sub': 'Used in every conversation',
  'memory.chats': 'By conversation',
  'memory.chats.sub': 'Used only in that conversation',
  'memory.chat': 'Conversation #{id}',
  'memory.updated': 'edited {when}',
  'memory.edit': 'Edit',
  'memory.delete': 'Delete',
  'memory.empty': 'The AI has not remembered anything yet. Tell the AI in Chat about yourself; what is worth keeping shows up here.',
  'memory.groupEmpty': 'No topic yet.',
  'memory.deleteOne.title': 'Delete the topic “{title}”?',
  'memory.deleteOne.text': 'The AI will forget this topic. It stays in the trash for 30 days; you can restore it from Mine.',
  'memory.deleteOne.done': '“{title}” moved to the trash.',
  'memory.deleteAll': 'Delete all memory',
  'memory.deleteAll.title': 'Delete all memory?',
  'memory.deleteAll.text': 'Every topic the AI remembered goes to the trash for 30 days, then is deleted for good. The AI starts over.',
  'memory.deleteAll.done': '{count} topics moved to the trash.',
  'memory.cancel': 'Cancel',
  'memory.actionFailed': 'That did not work. Try again.',
  'memory.undo.title': 'Undo what was just remembered?',
  'memory.undo.text': 'The AI just saved something to your memory. Undo it if you do not want the AI to keep it.',
  'memory.undo.action': 'Undo',
  'memory.undo.working': 'Undoing…',
  'memory.undo.trashed': 'Undone: the new topic went to the trash.',
  'memory.undo.reverted': 'Undone: what was just saved is removed.',
  'memory.undo.invalid': 'This undo link is not valid.',
  'memory.undo.expired': 'This undo link is older than 24 hours. You can still edit or delete the topic below.',
  'memory.undo.used': 'This save was already undone.',
  'memory.undo.stale': 'That fact is no longer in the topic (you may have edited it). See and edit the topic below.',
  'memory.undo.notFound': 'This topic is gone; you may have deleted it.',
  'memory.undo.failed': 'Could not undo. Try again.',
  'memory.undo.close': 'Close',
};

const MEMORY_TEXT: Record<Locale, Record<MemoryMessageKey, string>> = { vi: memoryVi, en: memoryEn };

export function useMemoryText(): { t: ScreenTranslate<MemoryMessageKey>; locale: Locale } {
  return useScreenText(MEMORY_TEXT);
}

export type MemoryTranslate = ScreenTranslate<MemoryMessageKey>;
