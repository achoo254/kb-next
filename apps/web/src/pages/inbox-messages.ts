/**
 * Strings of the inbox (board C20) in vi and en, and how each notification reads: its tab, label, icon and colour,
 * title, message, the line under it and what can be done from it. Shared with C06's notification cards.
 */
import type { AppNotification } from '../api/notifications-api';
import { brand } from '../brand';
import type { Locale } from '../i18n/i18n';
import type { IconName } from '../ui/icon';
import { type ScreenTranslate, useScreenText } from './space-messages';

export const inboxVi = {
  'inbox.title': 'Thông báo',
  'inbox.unread': '{count} chưa đọc',
  'inbox.onlyUnread': 'Chỉ chưa đọc',
  'inbox.readAll': 'Đánh dấu đã đọc hết',
  'inbox.tabs': 'Loại thông báo',
  'inbox.tab.all': 'Tất cả',
  'inbox.tab.mention': 'Mention',
  'inbox.tab.comment': 'Bình luận',
  'inbox.tab.review': 'Duyệt bài',
  'inbox.tab.warn': 'Cảnh báo',
  'inbox.list': 'Danh sách thông báo',
  'inbox.preview': 'Xem trước thông báo',
  'inbox.unreadDot': 'Chưa đọc',
  'inbox.markRead': 'Đánh dấu đã đọc',
  'inbox.markUnread': 'Đánh dấu chưa đọc',
  'inbox.pick': 'Chọn một thông báo để xem chi tiết.',
  'inbox.empty.title': 'Đã đọc hết',
  'inbox.empty.text': 'Vũ trụ yên ắng. Có gì mới sẽ hiện ở đây.',
  'inbox.empty.home': 'Về Universe',
  'inbox.loading': 'Đang tải thông báo',
  'inbox.failed': 'Chưa tải được thông báo.',
  'inbox.retry': 'Thử lại',
  'inbox.kind.mention': 'Mention',
  'inbox.kind.comment': 'Bình luận',
  'inbox.kind.review': 'Duyệt bài',
  'inbox.kind.stale': 'Cảnh báo',
  'inbox.kind.permission': 'Quyền thay đổi',
  'inbox.someone': 'Ai đó',
  'inbox.mention.title': '@{by} nhắc bạn trong {title}',
  'inbox.comment.title': '{by} bình luận bài {title}',
  'inbox.quote': '"{text}"',
  'inbox.approved.title': 'Bài "{title}" đã được duyệt',
  'inbox.approved.body': 'Bài của bạn đã hiện trong Space {space} với nhãn Cộng đồng. Giờ bạn có thể chia sẻ link.',
  'inbox.approved.bodyNoPlace': 'Bài của bạn đã hiện trong vũ trụ với nhãn Cộng đồng.',
  'inbox.approved.meta': 'Duyệt bởi {by}',
  'inbox.changes.title': 'Bài "{title}" cần sửa',
  'inbox.changes.body': 'Lời nhắn: "{reason}"',
  'inbox.rejected.title': 'Bài "{title}" bị từ chối',
  'inbox.rejected.body': 'Lý do: "{reason}"',
  'inbox.reviewer': '{by} · Người duyệt',
  'inbox.submitted.title': 'Bài "{title}" đang chờ duyệt',
  'inbox.submitted.body': '{by} vừa gửi duyệt. Jev đã chấm sơ bộ.',
  'inbox.submitted.meta': 'Chỉ Quản trị thấy mục này',
  'inbox.stale.title': 'Tài liệu có thể lỗi thời: {title}',
  'inbox.stale.body': '{days} ngày chưa cập nhật. Rà lại để nội dung còn đúng.',
  'inbox.stale.meta': '{app} · cảnh báo tự động',
  'inbox.hidden.title': 'Bài "{title}" đã bị quản trị ẩn',
  'inbox.hidden.body': 'Người khác không còn thấy bài này trong vũ trụ; link chia sẻ trả "riêng tư". Bạn vẫn đọc được.',
  'inbox.shown.title': 'Bài "{title}" hiện lại trong vũ trụ',
  'inbox.shown.body': 'Mọi người lại thấy bài này trong vũ trụ.',
  'inbox.admin': '{by} · Quản trị',
  'inbox.action.openPassage': 'Mở đúng đoạn',
  'inbox.action.reply': 'Trả lời',
  'inbox.action.comments': 'Xem bình luận',
  'inbox.action.space': 'Xem trong Space',
  'inbox.action.open': 'Mở bài',
  'inbox.action.resubmit': 'Sửa và gửi lại',
  'inbox.action.status': 'Xem trạng thái',
  'inbox.action.queue': 'Mở hàng duyệt',
  'inbox.action.openDoc': 'Mở tài liệu',
  'inbox.action.history': 'Xem lịch sử',
  'inbox.ago.now': 'Vừa xong',
  'inbox.ago.minutes': '{n} phút trước',
  'inbox.ago.hours': '{n} giờ trước',
  'inbox.ago.yesterday': 'Hôm qua',
  'inbox.ago.days': '{n} ngày trước',
};

export type InboxMessageKey = keyof typeof inboxVi;

export const inboxEn: Record<InboxMessageKey, string> = {
  'inbox.title': 'Notifications',
  'inbox.unread': '{count} unread',
  'inbox.onlyUnread': 'Unread only',
  'inbox.readAll': 'Mark all as read',
  'inbox.tabs': 'Kinds of notification',
  'inbox.tab.all': 'All',
  'inbox.tab.mention': 'Mentions',
  'inbox.tab.comment': 'Comments',
  'inbox.tab.review': 'Review',
  'inbox.tab.warn': 'Alerts',
  'inbox.list': 'Notifications',
  'inbox.preview': 'Notification preview',
  'inbox.unreadDot': 'Unread',
  'inbox.markRead': 'Mark as read',
  'inbox.markUnread': 'Mark as unread',
  'inbox.pick': 'Pick a notification to see it.',
  'inbox.empty.title': 'All read',
  'inbox.empty.text': 'The Universe is quiet. Anything new shows up here.',
  'inbox.empty.home': 'Back to the Universe',
  'inbox.loading': 'Loading notifications',
  'inbox.failed': 'Notifications could not load.',
  'inbox.retry': 'Try again',
  'inbox.kind.mention': 'Mention',
  'inbox.kind.comment': 'Comment',
  'inbox.kind.review': 'Review',
  'inbox.kind.stale': 'Alert',
  'inbox.kind.permission': 'Access changed',
  'inbox.someone': 'Someone',
  'inbox.mention.title': '@{by} mentioned you in {title}',
  'inbox.comment.title': '{by} commented on {title}',
  'inbox.quote': '"{text}"',
  'inbox.approved.title': '"{title}" was approved',
  'inbox.approved.body': 'Your text is now in the {space} Space, labelled Community. You can share its link now.',
  'inbox.approved.bodyNoPlace': 'Your text is now in the Universe, labelled Community.',
  'inbox.approved.meta': 'Approved by {by}',
  'inbox.changes.title': '"{title}" needs changes',
  'inbox.changes.body': 'Note: "{reason}"',
  'inbox.rejected.title': '"{title}" was rejected',
  'inbox.rejected.body': 'Reason: "{reason}"',
  'inbox.reviewer': '{by} · Reviewer',
  'inbox.submitted.title': '"{title}" is waiting for review',
  'inbox.submitted.body': '{by} just sent it for review. Jev has pre-reviewed it.',
  'inbox.submitted.meta': 'Only admins see this',
  'inbox.stale.title': 'May be out of date: {title}',
  'inbox.stale.body': 'Not updated for {days} days. Look it over so it stays right.',
  'inbox.stale.meta': '{app} · automatic alert',
  'inbox.hidden.title': 'An admin hid "{title}"',
  'inbox.hidden.body': 'Others no longer see it in the Universe; its share links say "private". You can still read it.',
  'inbox.shown.title': '"{title}" is back in the Universe',
  'inbox.shown.body': 'Everyone sees this text in the Universe again.',
  'inbox.admin': '{by} · Admin',
  'inbox.action.openPassage': 'Open the passage',
  'inbox.action.reply': 'Reply',
  'inbox.action.comments': 'See comments',
  'inbox.action.space': 'See in Space',
  'inbox.action.open': 'Open',
  'inbox.action.resubmit': 'Edit and resend',
  'inbox.action.status': 'See status',
  'inbox.action.queue': 'Open review queue',
  'inbox.action.openDoc': 'Open document',
  'inbox.action.history': 'See history',
  'inbox.ago.now': 'Just now',
  'inbox.ago.minutes': '{n} min ago',
  'inbox.ago.hours': '{n} h ago',
  'inbox.ago.yesterday': 'Yesterday',
  'inbox.ago.days': '{n} days ago',
};

const INBOX_TEXT: Record<Locale, Record<InboxMessageKey, string>> = { vi: inboxVi, en: inboxEn };

export function useInboxText(): { t: ScreenTranslate<InboxMessageKey>; locale: Locale } {
  return useScreenText(INBOX_TEXT);
}

/** The tabs of C20: Cảnh báo holds stale texts and permission changes. */
export const INBOX_TABS = ['all', 'mention', 'comment', 'review', 'warn'] as const;
export type InboxTab = (typeof INBOX_TABS)[number];

export function tabOf(n: AppNotification): Exclude<InboxTab, 'all'> {
  return n.kind === 'stale' || n.kind === 'permission' ? 'warn' : n.kind;
}

/** The colour of a notification's orb, a class modifier (inbox-screen.css). */
export type NoticeTone = 'violet' | 'cyan' | 'emerald' | 'amber' | 'purple' | 'orange' | 'teal' | 'rose';

export interface NoticeAction {
  label: string;
  href: string;
  primary: boolean;
}

export interface NoticeView {
  tab: Exclude<InboxTab, 'all'>;
  kindLabel: string;
  icon: IconName;
  tone: NoticeTone;
  title: string;
  body: string;
  /** The line under the message: who, and where the text lives. */
  meta: string;
  /** The letter of the avatar on that line. */
  initial: string;
  actions: NoticeAction[];
}

/** "5 phút trước", "2 giờ trước", "Hôm qua", "3 ngày trước". */
export function noticeAgo(t: ScreenTranslate<InboxMessageKey>, iso: string, now: number): string {
  const minutes = Math.max(0, Math.floor((now - Date.parse(iso)) / 60_000));
  if (minutes < 1) return t('inbox.ago.now');
  if (minutes < 60) return t('inbox.ago.minutes', { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 12) return t('inbox.ago.hours', { n: hours });
  const days = Math.floor(hours / 24);
  if (days < 2) return t('inbox.ago.yesterday');
  return t('inbox.ago.days', { n: days });
}

/** How one notification reads (see the module comment). */
export function noticeView(t: ScreenTranslate<InboxMessageKey>, locale: Locale, n: AppNotification): NoticeView {
  const p = n.payload;
  const doc = n.documentId ? `/d/${encodeURIComponent(n.documentId)}` : null;
  const place = n.place ? [locale === 'vi' ? n.place.space.nameVi : n.place.space.nameEn, n.place.collection ? (locale === 'vi' ? n.place.collection.nameVi : n.place.collection.nameEn) : null].filter(Boolean).join(' › ') : '';
  const withPlace = (head: string): string => (place ? `${head} · ${place}` : head);
  const by = 'by' in p && p.by ? p.by : t('inbox.someone');
  const initial = Array.from(by)[0]?.toLocaleUpperCase() ?? '·';
  const link = (label: string, href: string | null, primary: boolean): NoticeAction[] => (href ? [{ label, href, primary }] : []);
  const base = { tab: tabOf(n), kindLabel: t(`inbox.kind.${n.kind}`), initial };
  switch (p.kind) {
    case 'mention':
      return {
        ...base,
        icon: 'notice-mention',
        tone: 'violet',
        title: t('inbox.mention.title', { by, title: p.title }),
        body: t('inbox.quote', { text: p.excerpt }),
        meta: withPlace(by),
        actions: [...link(t('inbox.action.openPassage'), doc && (p.anchor ? `${doc}#${encodeURIComponent(p.anchor)}` : doc), true), ...link(t('inbox.action.reply'), doc, false)],
      };
    case 'comment':
      return {
        ...base,
        icon: 'notice-comment',
        tone: 'cyan',
        title: t('inbox.comment.title', { by, title: p.title }),
        body: t('inbox.quote', { text: p.excerpt }),
        meta: withPlace(by),
        actions: link(t('inbox.action.comments'), doc, true),
      };
    case 'review':
      if (p.action === 'approved') {
        return {
          ...base,
          icon: 'notice-approved',
          tone: 'emerald',
          title: t('inbox.approved.title', { title: p.title }),
          body: n.place ? t('inbox.approved.body', { space: locale === 'vi' ? n.place.space.nameVi : n.place.space.nameEn }) : t('inbox.approved.bodyNoPlace'),
          meta: withPlace(t('inbox.approved.meta', { by })),
          actions: [...link(t('inbox.action.space'), n.place ? `/s/${encodeURIComponent(n.place.space.slug)}` : null, true), ...link(t('inbox.action.open'), doc, !n.place)],
        };
      }
      if (p.action === 'submitted') {
        return {
          ...base,
          icon: 'notice-queue',
          tone: 'purple',
          title: t('inbox.submitted.title', { title: p.title }),
          body: t('inbox.submitted.body', { by }),
          meta: t('inbox.submitted.meta'),
          actions: [{ label: t('inbox.action.queue'), href: '/admin', primary: true }],
        };
      }
      return {
        ...base,
        icon: p.action === 'rejected' ? 'notice-rejected' : 'notice-fix',
        tone: p.action === 'rejected' ? 'rose' : 'amber',
        title: p.action === 'rejected' ? t('inbox.rejected.title', { title: p.title }) : t('inbox.changes.title', { title: p.title }),
        body: p.reason ? (p.action === 'rejected' ? t('inbox.rejected.body', { reason: p.reason }) : t('inbox.changes.body', { reason: p.reason })) : '',
        meta: t('inbox.reviewer', { by }),
        actions: [...(p.action === 'changes_requested' ? link(t('inbox.action.resubmit'), doc && `${doc}/edit`, true) : []), { label: t('inbox.action.status'), href: '/me', primary: p.action === 'rejected' }],
      };
    case 'stale':
      return {
        ...base,
        icon: 'notice-warn',
        tone: 'orange',
        title: t('inbox.stale.title', { title: p.title }),
        body: t('inbox.stale.body', { days: p.days }),
        meta: t('inbox.stale.meta', { app: brand.appName }),
        initial: Array.from(brand.appName)[0] ?? '·',
        actions: [...link(t('inbox.action.openDoc'), doc, true), ...link(t('inbox.action.history'), doc && `${doc}/history`, false)],
      };
    case 'permission':
      return {
        ...base,
        icon: 'notice-shield',
        tone: 'teal',
        title: p.hidden ? t('inbox.hidden.title', { title: p.title }) : t('inbox.shown.title', { title: p.title }),
        body: p.hidden ? t('inbox.hidden.body') : t('inbox.shown.body'),
        meta: t('inbox.admin', { by }),
        actions: link(t('inbox.action.open'), doc, true),
      };
  }
}
