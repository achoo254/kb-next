/** Strings of "Trạm điều khiển" (board H03, personal settings), vi and en. */
import type { Locale } from '../i18n/i18n';
import { type ScreenTranslate, useScreenText } from './space-messages';

export const settingsVi = {
  'settings.title': 'Trạm điều khiển',
  'settings.back': 'Về vũ trụ',
  'settings.account': 'Tài khoản hoandat',
  'settings.account.noEmail': 'Chưa có email',
  'settings.account.noName': 'Tài khoản của bạn',
  'settings.apps': 'Chuyển sang app khác cùng tài khoản',
  'settings.apps.open': 'Mở {name}',
  'settings.workspace': 'Cài đặt workspace',
  'settings.workspace.badge': 'Quản trị',
  'settings.lang': 'Ngôn ngữ',
  'settings.theme': 'Giao diện',
  'settings.theme.dark': 'Tối',
  'settings.theme.light': 'Sáng',
  'settings.theme.system': 'Theo hệ thống',
  'settings.theme.follows': 'Theo máy: đang {theme}',
  'settings.motion': 'Giảm chuyển động',
  'settings.motion.sub': 'Sao, quỹ đạo, dây chạy',
  'settings.motion.on': 'Đã dừng sao lấp lánh, quỹ đạo và dây chạy. Chuyển cảnh chỉ còn mờ dần.',
  'settings.saveFailed': 'Chưa lưu được lên máy chủ. Máy này vẫn giữ lựa chọn; thử lại sau.',
  'settings.view': 'Mở app ở chế độ',
  'settings.view.orbit': 'Orbit',
  'settings.view.list': 'Danh sách',
  'settings.view.note': 'Danh sách hợp trình đọc màn hình và máy yếu.',
  'settings.offline': 'Lưu offline trên máy này',
  'settings.offline.allowed': '/ {size} cho phép',
  'settings.offline.unknown': 'Trình duyệt không cho biết dung lượng',
  'settings.offline.usage': 'Dung lượng đã dùng',
  'settings.offline.note': '{files} tệp Office, {drafts} bản nháp chưa gửi',
  'settings.offline.cleared': 'Đã xoá bản sao. Tệp sẽ tải lại khi bạn mở. Bản nháp chưa gửi vẫn giữ.',
  'settings.offline.clear': 'Xoá bộ nhớ đệm',
  'settings.offline.clearFailed': 'Chưa xoá được bộ nhớ đệm. Thử lại.',
  'settings.keys': 'Key riêng',
  'settings.keys.active': '{provider} ••••{last4} · đang dùng',
  'settings.keys.none': 'Chưa có key · thêm để dùng AI',
  'settings.keys.loading': 'Đang xem key của bạn…',
  'settings.logout': 'Đăng xuất',
  'settings.logout.sub': 'Thoát {app} trên trình duyệt này',
  'settings.logout.title': 'Rời trạm?',
  'settings.logout.text': 'Bạn sẽ đăng xuất khỏi {app} trên trình duyệt này. Bản nháp offline vẫn còn trên máy.',
  'settings.logout.stay': 'Ở lại',
  'settings.logout.failed': 'Chưa đăng xuất được. Thử lại.',
  'settings.delete': 'Xoá tài khoản ở {host}',
  'settings.failed': 'Chưa tải được cài đặt của bạn.',
  'settings.retry': 'Thử lại',
} as const;

export type SettingsMessageKey = keyof typeof settingsVi;

export const settingsEn: Record<SettingsMessageKey, string> = {
  'settings.title': 'Control station',
  'settings.back': 'Back to the universe',
  'settings.account': 'hoandat account',
  'settings.account.noEmail': 'No email yet',
  'settings.account.noName': 'Your account',
  'settings.apps': 'Switch to another app with the same account',
  'settings.apps.open': 'Open {name}',
  'settings.workspace': 'Workspace settings',
  'settings.workspace.badge': 'Admin',
  'settings.lang': 'Language',
  'settings.theme': 'Appearance',
  'settings.theme.dark': 'Dark',
  'settings.theme.light': 'Light',
  'settings.theme.system': 'Match system',
  'settings.theme.follows': 'Following this device: {theme} now',
  'settings.motion': 'Reduce motion',
  'settings.motion.sub': 'Stars, orbits, moving lines',
  'settings.motion.on': 'Twinkling stars, orbits and moving lines are stopped. Transitions only fade.',
  'settings.saveFailed': 'Not saved on the server yet. This device keeps your choice; try again later.',
  'settings.view': 'Open the app in',
  'settings.view.orbit': 'Orbit',
  'settings.view.list': 'List',
  'settings.view.note': 'The list suits screen readers and slower devices.',
  'settings.offline': 'Offline on this device',
  'settings.offline.allowed': '/ {size} allowed',
  'settings.offline.unknown': 'The browser does not tell how much space there is',
  'settings.offline.usage': 'Space used',
  'settings.offline.note': '{files} Office files, {drafts} unsent drafts',
  'settings.offline.cleared': 'Copies cleared. Files download again when you open them. Unsent drafts stay.',
  'settings.offline.clear': 'Clear the cache',
  'settings.offline.clearFailed': 'Could not clear the cache. Try again.',
  'settings.keys': 'Own keys',
  'settings.keys.active': '{provider} ••••{last4} · in use',
  'settings.keys.none': 'No key yet · add one to use AI',
  'settings.keys.loading': 'Checking your keys…',
  'settings.logout': 'Sign out',
  'settings.logout.sub': 'Leave {app} in this browser',
  'settings.logout.title': 'Leave the station?',
  'settings.logout.text': 'You will be signed out of {app} in this browser. Offline drafts stay on this device.',
  'settings.logout.stay': 'Stay',
  'settings.logout.failed': 'Could not sign out. Try again.',
  'settings.delete': 'Delete your account at {host}',
  'settings.failed': 'Could not load your settings.',
  'settings.retry': 'Try again',
};

const SETTINGS_TEXT: Record<Locale, Record<SettingsMessageKey, string>> = { vi: settingsVi, en: settingsEn };

export function useSettingsText(): { t: ScreenTranslate<SettingsMessageKey>; locale: Locale } {
  return useScreenText(SETTINGS_TEXT);
}

/** "512 MB", "1,2 GB": a size in the page's language. */
export function sizeText(bytes: number, locale: Locale): string {
  const mb = bytes / (1024 * 1024);
  const number = new Intl.NumberFormat(locale === 'vi' ? 'vi-VN' : 'en-GB', { maximumFractionDigits: mb >= 1024 ? 1 : 0 });
  return mb >= 1024 ? `${number.format(mb / 1024)} GB` : `${number.format(mb)} MB`;
}
