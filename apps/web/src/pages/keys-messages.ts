/**
 * Strings of "Key riêng" (board F03), vi and en, and what the screen shows of each AI provider: its name, the company
 * that checks the key, where to get a key and the letters on its orb.
 */
import type { AiProvider } from '../api/keys-api';
import type { Locale } from '../i18n/i18n';
import { type ScreenTranslate, useScreenText } from './space-messages';

export interface ProviderInfo {
  name: string;
  /** Who answers the free check call ("Kiểm bằng một lần gọi miễn phí tới Google"). */
  company: string;
  /** The provider's own page for creating an API key. */
  keysUrl: string;
  /** The letters on the orb (board F03). */
  mark: string;
}

/** In the board's order: OpenAI, Gemini, Claude. */
export const PROVIDERS: Readonly<Record<AiProvider, ProviderInfo>> = {
  openai: { name: 'OpenAI', company: 'OpenAI', keysUrl: 'https://platform.openai.com/api-keys', mark: 'AI' },
  gemini: { name: 'Gemini', company: 'Google', keysUrl: 'https://aistudio.google.com/apikey', mark: 'G' },
  anthropic: { name: 'Claude', company: 'Anthropic', keysUrl: 'https://console.anthropic.com/settings/keys', mark: 'C' },
};

export const keysVi = {
  'keys.lead': 'Key được mã hoá, không ai xem lại được. Không có key: vẫn tìm được nhờ Jev.',
  'keys.privacy': 'Câu hỏi và các đoạn nguồn được gửi tới nhà cung cấp bạn chọn ở trên.',
  'keys.providers': 'Key của bạn',
  'keys.loading': 'Đang tải key của bạn',
  'keys.pick': 'Chọn {provider}',
  'keys.status.none': 'Chưa có',
  'keys.status.ok': 'Hợp lệ',
  'keys.status.okLast4': 'Hợp lệ ••••{last4}',
  'keys.status.invalid': 'Bị từ chối',
  'keys.status.quota': 'Hết credit',
  'keys.status.unreadable': 'Cần nhập lại',
  'keys.sub.none': 'Thêm key bên dưới',
  'keys.sub.checked': 'kiểm {time}',
  'keys.delete': 'Xoá key',
  'keys.delete.title': 'Xoá key {provider} ••••{last4}?',
  'keys.delete.text': 'Các nút AI sẽ cần key khác. Tìm kiếm vẫn chạy bình thường.',
  'keys.delete.keep': 'Giữ lại',
  'keys.delete.failed': 'Chưa xoá được key. Thử lại.',
  'keys.form.add': 'Thêm key {provider}',
  'keys.form.replace': 'Thay key {provider}',
  'keys.form.label': 'API key',
  'keys.form.save': 'Lưu và kiểm',
  'keys.form.checking': 'Đang kiểm…',
  'keys.form.saved': 'Đã lưu',
  'keys.form.retry': 'Thử lại',
  'keys.msg.idle': 'Kiểm bằng một lần gọi miễn phí tới {company}.',
  'keys.msg.checking': 'Đang hỏi {company} key này có dùng được không…',
  'keys.msg.saved': 'Key hợp lệ. Đã mã hoá và lưu, chỉ hiện 4 ký tự cuối.',
  'keys.msg.empty': 'Dán key vào ô trên rồi lưu.',
  'keys.msg.format': 'Key này không đúng dạng key của {company}. Dán lại đủ key.',
  'keys.msg.rejected': '{company} từ chối key này. Kiểm lại key rồi lưu lại.',
  'keys.msg.noCredit': 'Key đúng nhưng tài khoản {company} đã hết credit. Nạp thêm rồi lưu lại.',
  'keys.msg.checkFailed': 'Chưa hỏi được {company}, key chưa được lưu. Thử lại sau ít phút.',
  'keys.msg.rateLimited': 'Bạn lưu nhiều lần quá. Đợi một phút rồi thử lại.',
  'keys.msg.network': 'Mất kết nối, key chưa được lưu. Kết nối lại rồi thử lần nữa.',
  'keys.msg.other': 'Chưa lưu được key. Thử lại.',
  'keys.where': 'Lấy key {provider} ở đâu?',
  'keys.use.title': 'Dùng key nào',
  'keys.use.lead': 'Cho hỏi đáp, tóm tắt và dịch',
  'keys.use.providers': 'Nhà cung cấp',
  'keys.use.none': 'chưa có key',
  'keys.use.invalid': 'bị từ chối',
  'keys.use.quota': 'hết credit',
  'keys.use.unreadable': 'cần nhập lại',
  'keys.use.model': 'Model',
  'keys.use.failed': 'Chưa đổi được. Thử lại.',
  'keys.legend': 'Các trạng thái key',
  'keys.off.title': 'Key riêng đang tắt trên máy chủ này',
  'keys.off.text': 'Chưa lưu hay đổi key được. Tìm kiếm vẫn chạy nhờ Jev; các nút AI cần key sẽ chờ tới khi tính năng bật lại.',
  'keys.model.gpt-4.1-mini': 'rẻ, nhanh',
  'keys.model.gpt-4.1-nano': 'rẻ nhất',
  'keys.model.gemini-3.8-flash': 'nhanh',
  'keys.model.gemini-3.5-flash-lite': 'rẻ hơn',
  'keys.model.claude-haiku-5-5': 'nhanh',
  'keys.model.claude-sonnet-5-5': 'tốt hơn, đắt hơn',
};

export type KeysMessageKey = keyof typeof keysVi;

export const keysEn: Record<KeysMessageKey, string> = {
  'keys.lead': 'Keys are encrypted and nobody can read them back. Without a key, Jev still finds things for you.',
  'keys.privacy': 'Questions and source passages are sent to the provider you pick above.',
  'keys.providers': 'Your keys',
  'keys.loading': 'Loading your keys',
  'keys.pick': 'Choose {provider}',
  'keys.status.none': 'None yet',
  'keys.status.ok': 'Valid',
  'keys.status.okLast4': 'Valid ••••{last4}',
  'keys.status.invalid': 'Rejected',
  'keys.status.quota': 'Out of credit',
  'keys.status.unreadable': 'Enter again',
  'keys.sub.none': 'Add a key below',
  'keys.sub.checked': 'checked {time}',
  'keys.delete': 'Delete key',
  'keys.delete.title': 'Delete the {provider} key ••••{last4}?',
  'keys.delete.text': 'The AI buttons will need another key. Search keeps working as usual.',
  'keys.delete.keep': 'Keep it',
  'keys.delete.failed': 'Could not delete the key. Try again.',
  'keys.form.add': 'Add a {provider} key',
  'keys.form.replace': 'Replace the {provider} key',
  'keys.form.label': 'API key',
  'keys.form.save': 'Save and check',
  'keys.form.checking': 'Checking…',
  'keys.form.saved': 'Saved',
  'keys.form.retry': 'Try again',
  'keys.msg.idle': 'Checked with one free call to {company}.',
  'keys.msg.checking': 'Asking {company} whether this key works…',
  'keys.msg.saved': 'The key works. Encrypted and saved; only its last 4 characters show.',
  'keys.msg.empty': 'Paste a key in the field above, then save.',
  'keys.msg.format': 'This does not look like a {company} key. Paste the whole key again.',
  'keys.msg.rejected': '{company} refused this key. Check it, then save again.',
  'keys.msg.noCredit': 'The key is right but the {company} account is out of credit. Top it up, then save again.',
  'keys.msg.checkFailed': 'Could not reach {company}, so the key was not saved. Try again in a few minutes.',
  'keys.msg.rateLimited': 'Too many saves. Wait a minute, then try again.',
  'keys.msg.network': 'No connection, so the key was not saved. Reconnect and try again.',
  'keys.msg.other': 'Could not save the key. Try again.',
  'keys.where': 'Where do I get a {provider} key?',
  'keys.use.title': 'Which key to use',
  'keys.use.lead': 'For questions, summaries and translation',
  'keys.use.providers': 'Provider',
  'keys.use.none': 'no key yet',
  'keys.use.invalid': 'rejected',
  'keys.use.quota': 'out of credit',
  'keys.use.unreadable': 'enter again',
  'keys.use.model': 'Model',
  'keys.use.failed': 'Could not change it. Try again.',
  'keys.legend': 'Key states',
  'keys.off.title': 'Own keys are off on this server',
  'keys.off.text': 'Keys cannot be saved or changed for now. Search keeps working with Jev; AI buttons that need a key wait until this is back on.',
  'keys.model.gpt-4.1-mini': 'cheap, fast',
  'keys.model.gpt-4.1-nano': 'cheapest',
  'keys.model.gemini-3.8-flash': 'fast',
  'keys.model.gemini-3.5-flash-lite': 'cheaper',
  'keys.model.claude-haiku-5-5': 'fast',
  'keys.model.claude-sonnet-5-5': 'better, pricier',
};

const KEYS_TEXT: Record<Locale, Record<KeysMessageKey, string>> = { vi: keysVi, en: keysEn };

export function useKeysText(): { t: ScreenTranslate<KeysMessageKey>; locale: Locale } {
  return useScreenText(KEYS_TEXT);
}

function isModelNoteKey(key: string): key is KeysMessageKey {
  return Object.hasOwn(keysVi, key);
}

/** A model as the select shows it: "gpt-4.1-mini · rẻ, nhanh"; a model this page does not know keeps the server's label. */
export function modelOption(t: ScreenTranslate<KeysMessageKey>, model: { id: string; label: string }): string {
  const key = `keys.model.${model.id}`;
  return isModelNoteKey(key) ? `${model.id} · ${t(key)}` : model.label;
}

/** "21:10" for a check today (Saigon time), else "03/11 21:10". */
export function checkedTime(iso: string, now: Date = new Date()): string {
  const zone = 'Asia/Ho_Chi_Minh';
  const date = new Date(iso);
  const day = (d: Date): string => d.toLocaleDateString('en-CA', { timeZone: zone });
  const time = date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: zone });
  if (day(date) === day(now)) return time;
  // Built from parts: ICU writes a day and month alone in vi-VN as "03-11".
  const parts = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', timeZone: zone }).formatToParts(date);
  const part = (type: 'day' | 'month'): string => parts.find((p) => p.type === type)?.value ?? '';
  return `${part('day')}/${part('month')} ${time}`;
}
