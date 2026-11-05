/**
 * The text of /privacy and /terms in Vietnamese and English. `{app}` is the brand name (filled by `format`); hosts and
 * the account name come from brand.ts. Every duration the server enforces is printed from apps/server/src/retention.ts,
 * so the page says what the code does. The facts behind the rest: docs/settings-and-roles.md (what deleting your data
 * removes and keeps), docs/deployment-guide.md ("Key riêng", "Link chia sẻ", "Sao lưu và khôi phục").
 */
import type { Locale } from '../i18n/i18n';
import { BRAND_WORDS } from '../layout/brand-words';
import {
  ADMIN_CALL_LOG_DAYS,
  BACKUP_KEEP_DAYS,
  SESSION_ABSOLUTE_DAYS,
  SESSION_IDLE_DAYS,
  SHARE_OPENINGS_KEEP_DAYS,
  TRASH_DAYS,
} from '../../../server/src/retention';

export type LegalKind = 'privacy' | 'terms';

export interface LegalSection {
  /** The heading's anchor (`/privacy#delete`). */
  id: string;
  heading: string;
  paragraphs?: readonly string[];
  items?: readonly string[];
  /** A page of the app the section points to (Settings, "Key riêng"). */
  link?: { href: string; label: string };
}

export interface LegalDoc {
  title: string;
  /** When the text last changed, as the reader writes dates. */
  updated: string;
  intro: string;
  sections: readonly LegalSection[];
}

const { account, idp, host } = BRAND_WORDS;

/** Where a reader asks questions (the ecosystem's page, as on the other hoandat apps). */
const CONTACT = { vi: 'Trang Facebook Hoandat Apps', en: 'the Hoandat Apps Facebook Page' } as const;

const UPDATED = { vi: 'Cập nhật ngày 05/11/2026', en: 'Last updated 5 November 2026' } as const;

const PRIVACY_VI: LegalDoc = {
  title: 'Quyền riêng tư',
  updated: UPDATED.vi,
  intro: `{app} (${host}) là knowledge base song ngữ Anh – Việt của hệ sinh thái ${account}, do một nhà phát triển độc lập vận hành. Trang này nói rõ app giữ gì, gửi gì đi đâu, giữ bao lâu và cách bạn xoá dữ liệu của mình.`,
  sections: [
    {
      id: 'account',
      heading: 'Tài khoản và đăng nhập',
      items: [
        `Bạn đăng nhập bằng tài khoản ${account} qua ${idp}, dùng chung cho các app ${account}. {app} không bao giờ thấy mật khẩu của bạn.`,
        'App xin quyền "openid profile email" và nhận mã định danh tài khoản, tên hiển thị, email và địa chỉ ảnh đại diện. Chúng được lưu cùng tài khoản và cập nhật mỗi lần bạn đăng nhập. App không gửi email cho bạn.',
        'Ảnh đại diện do trình duyệt tải thẳng từ nơi giữ ảnh (Google hoặc GitHub); app không lưu bản sao.',
        'App lưu thêm cài đặt của bạn: ngôn ngữ, giao diện Sáng/Tối, giảm chuyển động, các Space bạn chọn lúc bắt đầu, và vai trò của bạn trong workspace (Thành viên, Người duyệt, Quản trị).',
        'Quản trị thấy tên, email và vai trò của mọi tài khoản trong trang cài đặt workspace.',
      ],
    },
    {
      id: 'cookies',
      heading: 'Cookie và phiên đăng nhập',
      items: [
        `__Host-kb_session giữ bạn đăng nhập tối đa ${SESSION_ABSOLUTE_DAYS} ngày, và hết sớm hơn khi ${SESSION_IDLE_DAYS} ngày không dùng. Máy chủ chỉ lưu bản băm (sha256) của nó. Đăng xuất, ở app hay ở ${idp}, là huỷ phiên trên máy chủ.`,
        `kb_login chỉ có trong lúc đăng nhập (tối đa 10 phút): nó giữ mã chống giả mạo của bước chuyển sang ${idp} rồi quay về.`,
        `hd_lang nhớ ngôn ngữ bạn chọn, dùng chung cho các app ${account}.`,
        'App không dùng cookie quảng cáo hay cookie theo dõi.',
      ],
    },
    {
      id: 'texts',
      heading: 'Bài viết, tệp và hoạt động của bạn',
      items: [
        'Máy chủ lưu bài bạn viết cùng các phiên bản của nó, bình luận, yêu thích, tiến độ đọc và tiến độ lối đi tri thức, Canvas của bạn, thông báo gửi cho bạn (nhắc tên, bình luận, kết quả duyệt, bài lâu chưa cập nhật, quản trị ẩn hay hiện bài của bạn) và lịch sử Copilot (câu hỏi, câu trả lời, nguồn đã trích; chỉ bạn xem được).',
        'Bài đã duyệt và đang hiện là bài công khai: người dùng {app} đọc và tìm thấy được. Bài nháp, riêng tư, bị trả lại hay bị từ chối chỉ bạn đọc được; bài chờ duyệt thì người duyệt đọc được để duyệt. Quản trị đọc được mọi bài, kể cả bài riêng tư.',
        `Bài bạn xoá nằm trong thùng rác ${TRASH_DAYS} ngày rồi tự xoá hẳn, cùng các phiên bản và tệp của nó. Bạn xoá hẳn sớm hơn được.`,
        'Tệp tải lên (docx, xlsx, pptx, pdf, md, tối đa 25 MB) được lưu trên ổ đĩa của máy chủ {app}, dưới một tên ngẫu nhiên. Chữ trong tệp được trích bằng Apache Tika (kèm OCR Tesseract cho trang quét) chạy ngay trên cùng máy chủ: bước trích chữ không gửi tệp ra ngoài. Một phần chữ trích được thì Jev đọc để chấm (xem mục Jev).',
        'Trình sửa Office chạy trong trình duyệt của bạn, tải từ một tên miền riêng của {app}; tệp không đi qua dịch vụ của bên thứ ba.',
      ],
    },
    {
      id: 'ai',
      heading: 'Copilot và AI chạy bằng key riêng của bạn',
      items: [
        'Copilot, các nút AI khi đọc (giải thích, tóm tắt), "AI viết hộ" trong trình soạn và dịch bằng AI chỉ chạy bằng key AI của chính bạn, với nhà cung cấp bạn chọn: OpenAI, Google Gemini hoặc Anthropic Claude. Máy chủ {app} không có key AI nào cho các việc này; chưa có key thì không có gì được gửi đi.',
        'Khi bạn hỏi, máy chủ gửi tới nhà cung cấp đó câu hỏi, đoạn bạn bôi chọn (nếu có) và các đoạn trích từ kho làm nguồn. "AI viết hộ" gửi tiêu đề và nội dung bản nháp đang soạn; dịch gửi nội dung bài cần dịch. Nhà cung cấp xử lý những gì nhận được theo điều khoản và chính sách của họ với tài khoản của bạn.',
        'Khi Jev xác nhận kho chưa đủ để trả lời, Copilot báo "kho chưa có" và không gọi nhà cung cấp.',
        'Key được mã hoá AES-256-GCM trước khi lưu, bằng một khoá bí mật nằm ngoài database: database hay bản sao lưu bị lộ cũng không lộ key. App chỉ hiện lại 4 ký tự cuối, key không bao giờ vào log, và bạn xoá key bất cứ lúc nào ở trang Key riêng.',
        'Câu trả lời của Copilot được lưu vào lịch sử của bạn; bản dịch được lưu thành bản nháp của bạn; gợi ý của "AI viết hộ" không được lưu.',
      ],
      link: { href: '/settings/keys', label: 'Mở trang Key riêng' },
    },
    {
      id: 'jev',
      heading: 'Jev (TypeSafe): tìm kiếm, phân loại và chấm duyệt',
      paragraphs: [
        'Jev là dịch vụ chấm điểm của TypeSafe (typesafe.ai). Máy chủ {app} gọi Jev bằng key của chính máy chủ, cho mọi người dùng, và Jev chỉ trả về lựa chọn và điểm số, không viết chữ. Tuỳ việc, máy chủ gửi tới Jev:',
      ],
      items: [
        'tìm kiếm theo nghĩa: câu bạn tìm, tiêu đề và tóm tắt (hoặc đoạn đầu) của các bài ứng viên, rồi các đoạn của những bài được chọn;',
        'Copilot: câu hỏi và các đoạn ứng viên (để chọn nguồn và biết kho đã đủ để trả lời chưa), rồi các câu trong câu trả lời cùng đoạn nguồn chúng trích (để kiểm trích dẫn);',
        'gợi ý nối bài trong Graph và Canvas, gợi ý bước tiếp của lối đi tri thức: tiêu đề và một đoạn ngắn (tóm tắt, đoạn đầu, nội dung thẻ Canvas);',
        'sơ duyệt bài gửi duyệt: một phần nội dung bài và các bài đã xuất bản gần giống nhất;',
        'tệp tải lên: mẫu chữ của từng trang (lớp chữ có đọc được không, OCR có ra chữ không), tiêu đề và một phần nội dung (để gợi ý Collection và thẻ).',
        'Bài ứng viên chỉ gồm bài bạn được đọc, nên có thể có bài riêng tư của bạn. App ghi số lần gọi và số token mỗi ngày để theo dõi chi phí; bản ghi đó không chứa nội dung gửi đi hay câu trả lời.',
        'Tìm kiếm theo từ khoá chạy bằng Meilisearch trên chính máy chủ {app}.',
      ],
    },
    {
      id: 'share',
      heading: 'Link chia sẻ',
      items: [
        'Tác giả hay quản trị tạo được link cho bài đã duyệt. Link chỉ chứa một mã ngẫu nhiên; máy chủ chỉ lưu bản băm (sha256) và 4 ký tự cuối của mã, không bao giờ lưu hay ghi log chính mã đó. Link có thể hết hạn (sau 7 hoặc 30 ngày) và thu hồi được bất cứ lúc nào.',
        `Mỗi lần ai đó mở link (trừ tác giả và quản trị), máy chủ ghi giờ mở và tài khoản đã mở, hoặc "khách" khi chưa đăng nhập, vào lịch sử truy cập của link; tác giả và quản trị xem được lịch sử này. Lượt mở cũ hơn ${SHARE_OPENINGS_KEEP_DAYS} ngày tự bị xoá. Thẻ xem trước khi dán link vào Zalo hay Messenger không tính là lượt mở.`,
      ],
    },
    {
      id: 'admin',
      heading: 'Quản trị và nhật ký',
      items: [
        'Nhật ký kiểm toán ghi ai làm gì, lúc nào: đổi vai trò, gỡ và khôi phục thành viên, link mời, token API, đăng nhập, xoá dữ liệu, ẩn và hiện bài. Nhật ký không ghi token, email hay nội dung bài, và chỉ quản trị xem được.',
        `Nhật ký gọi API quản trị (phương thức, đường dẫn, kết quả, bài được tạo hay sửa) giữ ${ADMIN_CALL_LOG_DAYS} ngày.`,
      ],
    },
    {
      id: 'device',
      heading: 'Trên máy của bạn',
      items: [
        'Để đọc và sửa khi mất mạng, trình duyệt giữ bản sao tệp Office, bản nháp chưa gửi và bản Office lưu lúc offline trong IndexedDB; Canvas đang sửa có bản nháp trong localStorage. Trình duyệt cũng nhớ giao diện, chế độ xem và tài khoản vừa dùng, để bản offline chỉ mở cho đúng tài khoản đó.',
        'Những bản này chỉ nằm trên máy đó. "Xoá bộ nhớ đệm" ở Cài đặt xoá các bản đã có trên máy chủ; đăng xuất thì máy thôi hiện bản offline của bạn cho tới khi bạn đăng nhập lại; "Xoá dữ liệu của tôi" xoá hết chúng trên máy đang dùng.',
      ],
    },
    {
      id: 'server',
      heading: 'Máy chủ, nhật ký web và sao lưu',
      items: [
        'Mọi truy cập đi qua Cloudflare (bảo vệ và tăng tốc). Trang có thể dùng Cloudflare Web Analytics để đếm lượt xem trang; công cụ này không đặt cookie và không theo dõi bạn sang trang khác. App không quảng cáo và không bán dữ liệu.',
        'Log của máy chủ web ghi địa chỉ IP, trình duyệt, đường dẫn trang và thời gian; không ghi chuỗi truy vấn hay trang dẫn tới, và mã của link chia sẻ hay link mời không bao giờ vào log. Giới hạn tần suất đếm lượt theo IP hoặc tài khoản trong bộ nhớ, không ghi lại.',
        `Mỗi ngày máy chủ sao lưu database và thư mục tệp tải lên, giữ ${BACKUP_KEEP_DAYS} ngày rồi xoá. Vì vậy dữ liệu đã xoá có thể còn trong bản sao lưu tối đa ${BACKUP_KEEP_DAYS} ngày. Khoá bí mật dùng để mã hoá key AI không nằm trong bản sao lưu.`,
      ],
    },
    {
      id: 'delete',
      heading: 'Xoá dữ liệu của bạn',
      paragraphs: ['Ở Cài đặt, "Xoá dữ liệu của tôi" (gõ XOÁ để xác nhận) xoá hẳn ngay, trong một lần:'],
      items: [
        'bài không phải bài chính thức chưa xuất bản (nháp, riêng tư, chờ duyệt, bị trả lại, bị từ chối), mọi bài trong thùng rác, mọi bài trong Space cá nhân và chính Space đó;',
        'bài cộng đồng bạn đã xuất bản, nếu bạn chọn "Gỡ cả bài cộng đồng tôi đã xuất bản";',
        'tệp tải lên không còn bài nào dùng, cả tệp trên đĩa;',
        'key AI và lựa chọn key, lịch sử Copilot, tiến độ đọc và lối đi, yêu thích, thông báo, Canvas, bình luận, dấu vết bạn đã mở link chia sẻ;',
        'mọi phiên đăng nhập, và trên máy đang dùng: bản sao offline, bản nháp và tài khoản đã nhớ.',
      ],
    },
    {
      id: 'kept',
      heading: 'Những gì còn lại sau khi xoá',
      items: [
        'Bài chính thức ngoài Space cá nhân, ở bất kỳ bước nào: chúng thuộc workspace.',
        'Bài cộng đồng đã xuất bản nếu bạn không chọn gỡ; tác giả hiện là "Tài khoản đã xoá".',
        'Các phiên bản và quyết định duyệt bạn viết trên những bài còn lại, và nhật ký kiểm toán (thêm một dòng ghi tài khoản đã xoá dữ liệu).',
        `Bản sao lưu, cho tới khi hết ${BACKUP_KEEP_DAYS} ngày.`,
        `Link chia sẻ, token API và link mời bạn tạo bị thu hồi. Tên, email và ảnh bị xoá khỏi tài khoản: chỉ còn một dòng không tên để bài giữ lại vẫn có tác giả. Đăng nhập lại bằng cùng tài khoản ${account} sẽ tạo một tài khoản {app} mới, trống. Tài khoản ${account} dùng chung do ${idp} quản lý; xoá dữ liệu ở đây không xoá tài khoản đó.`,
      ],
      link: { href: '/settings', label: 'Mở Cài đặt' },
    },
    {
      id: 'contact',
      heading: 'Liên hệ',
      paragraphs: [`Muốn hỏi, hay cần giúp xoá dữ liệu: nhắn ${CONTACT.vi}.`],
    },
  ],
};

const PRIVACY_EN: LegalDoc = {
  title: 'Privacy',
  updated: UPDATED.en,
  intro: `{app} (${host}) is a bilingual English – Vietnamese knowledge base of the ${account} ecosystem, run by an independent developer. This page says what the app keeps, what it sends where, for how long, and how you delete your data.`,
  sections: [
    {
      id: 'account',
      heading: 'Your account and signing in',
      items: [
        `You sign in with your ${account} account through ${idp}, shared by the ${account} apps. {app} never sees your password.`,
        'The app asks for the "openid profile email" scopes and receives an account identifier, your display name, email and the address of your profile picture. They are stored with your account and updated each time you sign in. The app sends you no email.',
        'Your browser loads the profile picture straight from where it is kept (Google or GitHub); the app keeps no copy.',
        'The app also stores your settings: language, light or dark theme, reduced motion, the Spaces you picked when you started, and your role in the workspace (Member, Reviewer, Admin).',
        'Admins see the name, email and role of every account on the workspace settings page.',
      ],
    },
    {
      id: 'cookies',
      heading: 'Cookies and sessions',
      items: [
        `__Host-kb_session keeps you signed in for up to ${SESSION_ABSOLUTE_DAYS} days, and ends sooner after ${SESSION_IDLE_DAYS} days without use. The server stores only its hash (sha256). Signing out, in the app or on ${idp}, ends the session on the server.`,
        `kb_login exists only while you sign in (at most 10 minutes): it holds the anti-forgery codes of the trip to ${idp} and back.`,
        `hd_lang remembers the language you picked, shared by the ${account} apps.`,
        'The app uses no advertising or tracking cookies.',
      ],
    },
    {
      id: 'texts',
      heading: 'Your texts, files and activity',
      items: [
        'The server keeps the texts you write with their versions, your comments, favourites, reading and journey progress, your Canvases, the notifications sent to you (mentions, comments, review results, texts not updated for a long time, an admin hiding or showing a text of yours) and your Copilot history (questions, answers, the sources cited; only you can see it).',
        'An approved text that is not hidden is public: {app} users can read and find it. Drafts and private, returned or rejected texts are readable by you only; a text waiting for review is readable by reviewers, to review it. Admins can read every text, private ones included.',
        `A text you delete stays in the trash for ${TRASH_DAYS} days, then is deleted for good with its versions and files. You can delete it for good sooner.`,
        'Uploaded files (docx, xlsx, pptx, pdf, md, up to 25 MB) are stored on the disk of the {app} server under a random name. Their text is extracted with Apache Tika (with Tesseract OCR for scanned pages) running on that same server: extraction sends no file anywhere. Jev reads part of the extracted text to rate it (see the Jev section).',
        'The Office editor runs in your browser, loaded from a domain of {app} itself; files do not go through any third-party service.',
      ],
    },
    {
      id: 'ai',
      heading: 'Copilot and AI run on your own key',
      items: [
        'The Copilot, the AI buttons while reading (explain, summarize), "AI writing help" in the editor and AI translation run only on your own AI key, with the provider you chose: OpenAI, Google Gemini or Anthropic Claude. The {app} server has no AI key of its own for these; without your key nothing is sent.',
        'When you ask, the server sends that provider your question, the passage you selected (if any) and excerpts from the knowledge base as sources. "AI writing help" sends the title and text of the draft you are writing; translation sends the text being translated. The provider handles what it receives under its own terms and policies for your account.',
        'When Jev finds the knowledge base cannot answer, the Copilot says so and does not call the provider.',
        'Keys are encrypted with AES-256-GCM before they are stored, with a secret kept outside the database: a leaked database or backup does not leak keys. The app shows only the last 4 characters again, keys never go into logs, and you can delete a key at any time on the Own keys page.',
        'Copilot answers are kept in your history; a translation is saved as your draft; "AI writing help" suggestions are not stored.',
      ],
      link: { href: '/settings/keys', label: 'Open Own keys' },
    },
    {
      id: 'jev',
      heading: 'Jev (TypeSafe): search, sorting and review checks',
      paragraphs: [
        'Jev is the judgment service of TypeSafe (typesafe.ai). The {app} server calls Jev with the server’s own key, for every user, and Jev only returns choices and scores; it writes no text. Depending on the task, the server sends Jev:',
      ],
      items: [
        'search by meaning: your query, the titles and summaries (or first passage) of candidate texts, then the passages of the texts chosen;',
        'the Copilot: your question and the candidate passages (to pick sources and tell whether the knowledge base can answer), then the sentences of the answer with the passages they cite (to check citations);',
        'link suggestions in the Graph and Canvas, and next-step suggestions in a knowledge journey: titles and a short text (summary, first passage, Canvas card text);',
        'the pre-review of a text sent for review: part of its text and the closest published texts;',
        'uploaded files: a sample of each page’s text (whether its text layer is readable, whether OCR found text), the title and part of the text (to suggest a Collection and tags).',
        'Candidate texts are only texts you may read, so they can include your private ones. The app records the number of calls and tokens per day to watch the cost; that record holds nothing that was sent or answered.',
        'Keyword search runs on Meilisearch on the {app} server itself.',
      ],
    },
    {
      id: 'share',
      heading: 'Share links',
      items: [
        'An author or an admin can make a link to an approved text. The link holds only a random code; the server stores only its hash (sha256) and last 4 characters, and never stores or logs the code itself. A link can expire (after 7 or 30 days) and can be revoked at any time.',
        `Each time someone opens a link (other than the author or an admin), the server records when, and which account opened it, or "guest" when signed out, in the link's access history; the author and admins can see it. Openings older than ${SHARE_OPENINGS_KEEP_DAYS} days are deleted automatically. The preview card shown when a link is pasted into Zalo or Messenger does not count as an opening.`,
      ],
    },
    {
      id: 'admin',
      heading: 'Administration and logs',
      items: [
        'The audit log records who did what, and when: role changes, removing and restoring members, invite links, API tokens, sign-ins, data deletion, hiding and showing texts. It never records tokens, emails or text content, and only admins can see it.',
        `The admin API call log (method, path, result, the text created or changed) is kept for ${ADMIN_CALL_LOG_DAYS} days.`,
      ],
    },
    {
      id: 'device',
      heading: 'On your device',
      items: [
        'To read and edit offline, your browser keeps copies of Office files, unsent drafts and Office files saved offline in IndexedDB; a Canvas being edited has a draft in localStorage. The browser also remembers your theme, view and the account last used, so offline copies open only for that account.',
        'These copies stay on that device. "Clear the cache" in Settings removes the copies the server already has; signing out stops the device showing your offline copies until you sign in again; "Delete my data" removes them all on the device in use.',
      ],
    },
    {
      id: 'server',
      heading: 'Servers, web logs and backups',
      items: [
        'All traffic goes through Cloudflare (protection and speed). The site may use Cloudflare Web Analytics to count page views; it sets no cookie and does not follow you to other sites. The app shows no ads and sells no data.',
        'The web server log records the IP address, browser, page path and time; never query strings or the referring page, and the codes of share and invite links never enter the log. Rate limits count requests per IP address or account in memory only, never written down.',
        `Every day the server backs up the database and the uploaded files and keeps each backup for ${BACKUP_KEEP_DAYS} days. Deleted data may therefore remain in a backup for up to ${BACKUP_KEEP_DAYS} days. The secret that encrypts AI keys is not in the backups.`,
      ],
    },
    {
      id: 'delete',
      heading: 'Deleting your data',
      paragraphs: ['In Settings, "Delete my data" (type DELETE to confirm) deletes at once, in one go:'],
      items: [
        'unpublished texts that are not official (drafts, private, waiting for review, returned, rejected), every text in the trash, every text in your personal Space and that Space itself;',
        'community texts you published, if you tick "Also remove the community texts I published";',
        'uploaded files no remaining text uses, from the disk too;',
        'your AI keys and key choice, Copilot history, reading and journey progress, favourites, notifications, Canvases, comments, and the record of share links you opened;',
        'every session, and on the device in use: offline copies, drafts and the remembered account.',
      ],
    },
    {
      id: 'kept',
      heading: 'What stays after deleting',
      items: [
        'Official texts outside your personal Space, at any stage: they belong to the workspace.',
        'Community texts you published, if you did not tick the box; their author shows as "Deleted account".',
        'The versions and review decisions you wrote on the texts that stay, and the audit log (with a line saying the account deleted its data).',
        `Backups, until their ${BACKUP_KEEP_DAYS} days are up.`,
        `Share links, API tokens and invite links you made are revoked. Your name, email and picture are removed from the account: only a nameless row remains so the texts that stay keep an author. Signing in again with the same ${account} account creates a new, empty {app} account. The shared ${account} account is managed by ${idp}; deleting your data here does not delete it.`,
      ],
      link: { href: '/settings', label: 'Open Settings' },
    },
    {
      id: 'contact',
      heading: 'Contact',
      paragraphs: [`Questions, or help deleting your data: message ${CONTACT.en}.`],
    },
  ],
};

const TERMS_VI: LegalDoc = {
  title: 'Điều khoản sử dụng',
  updated: UPDATED.vi,
  intro: `{app} (${host}) là knowledge base miễn phí, không quảng cáo. Dùng app nghĩa là bạn đồng ý với các điều dưới đây và với cách app xử lý dữ liệu ở trang Quyền riêng tư.`,
  sections: [
    {
      id: 'account',
      heading: 'Tài khoản',
      items: [
        `Bạn dùng app bằng tài khoản ${account} (${idp}); giữ tài khoản đó an toàn là việc của bạn.`,
        'Quản trị có thể đổi vai trò của bạn, hoặc gỡ bạn khỏi workspace: khi đó bạn không đăng nhập được cho tới khi được khôi phục, bài chờ duyệt của bạn về bản nháp, bài đã duyệt giữ nguyên.',
      ],
    },
    {
      id: 'texts',
      heading: 'Nội dung bạn đưa lên',
      items: [
        'Bạn chịu trách nhiệm về bài, bình luận và tệp mình đưa lên. Chỉ đưa lên thứ bạn có quyền chia sẻ; không đăng nội dung trái pháp luật, xúc phạm, lừa đảo, mã độc hay thông tin riêng của người khác.',
        'Bài gửi duyệt được người duyệt hoặc quản trị xem trước khi xuất bản; Jev sơ duyệt chỉ là gợi ý cho họ, không phải quyết định. Quản trị có thể trả lại, từ chối, ẩn hay hiện lại bài.',
        'Bài đã xuất bản là bài công khai: người dùng app đọc và tìm thấy được, Copilot dùng làm nguồn, và tác giả hay quản trị chia sẻ được bằng link. Người nhận link có quyền "Remix" chép được bài thành bản nháp của họ.',
        'Bài chính thức thuộc workspace và ở lại khi bạn xoá dữ liệu; bài cộng đồng đã xuất bản ở lại nếu bạn không chọn gỡ (chi tiết ở trang Quyền riêng tư).',
      ],
    },
    {
      id: 'ai',
      heading: 'AI',
      items: [
        'Câu trả lời của AI có thể sai. Copilot chỉ trả lời từ nguồn trong kho và ghi số nguồn sau mỗi câu: hãy mở nguồn để kiểm trước khi dựa vào.',
        'Khi dùng key riêng, bạn tuân theo điều khoản của nhà cung cấp AI và tự trả phí cho các lần gọi bằng key đó. App giới hạn số lần gọi AI mỗi phút.',
      ],
    },
    {
      id: 'share',
      heading: 'Link chia sẻ',
      items: [
        'Ai có link đều thấy tên bài, tác giả và các mục của bài, nên chỉ gửi link cho người bạn muốn. Link hết hiệu lực khi hết hạn, khi bị thu hồi, hoặc khi bài thôi được xuất bản.',
      ],
    },
    {
      id: 'fair-use',
      heading: 'Dùng hợp lý',
      items: [
        'Không dò quét, tấn công hay làm quá tải dịch vụ, không né giới hạn tần suất, không tìm cách đọc bài bạn không có quyền đọc. Truy cập tự động chỉ qua API quản trị, bằng token do quản trị tạo.',
      ],
    },
    {
      id: 'liability',
      heading: 'Trách nhiệm',
      paragraphs: [
        'App được cung cấp "như hiện có". Nội dung trong kho để tham khảo, không thay cho lời khuyên chuyên môn. Dữ liệu được sao lưu hằng ngày, nhưng hãy giữ bản riêng của những gì quan trọng với bạn. Nhà phát triển có thể thay đổi, tạm dừng hay ngừng app, và có thể gỡ nội dung hay tài khoản vi phạm điều khoản. Điều khoản có thể được cập nhật; bản mới nhất luôn ở trang này.',
      ],
    },
    {
      id: 'contact',
      heading: 'Liên hệ',
      paragraphs: [`Nhắn ${CONTACT.vi}.`],
    },
  ],
};

const TERMS_EN: LegalDoc = {
  title: 'Terms of use',
  updated: UPDATED.en,
  intro: `{app} (${host}) is a free knowledge base with no ads. By using it you agree to the terms below and to how the app handles data as the Privacy page describes.`,
  sections: [
    {
      id: 'account',
      heading: 'Your account',
      items: [
        `You use the app with your ${account} account (${idp}); keeping that account safe is up to you.`,
        'Admins can change your role or remove you from the workspace: you then cannot sign in until restored, your texts waiting for review go back to drafts, and approved texts stay as they are.',
      ],
    },
    {
      id: 'texts',
      heading: 'What you put in',
      items: [
        'You are responsible for the texts, comments and files you put in. Only put in what you have the right to share; post nothing unlawful, abusive, fraudulent, malicious, or anyone else’s private information.',
        'A text sent for review is read by a reviewer or an admin before it is published; Jev’s pre-review is only a hint for them, not a decision. Admins can return, reject, hide or show a text again.',
        'A published text is public: app users can read and find it, the Copilot uses it as a source, and its author or an admin can share it by link. Someone receiving a link with "Remix" allowed can copy the text into their own drafts.',
        'Official texts belong to the workspace and stay when you delete your data; community texts you published stay unless you choose to remove them (details on the Privacy page).',
      ],
    },
    {
      id: 'ai',
      heading: 'AI',
      items: [
        'AI answers can be wrong. The Copilot answers only from sources in the knowledge base and numbers them after each sentence: open the sources to check before you rely on an answer.',
        'When you use your own key, you follow the AI provider’s terms and pay for the calls made with that key. The app limits AI calls per minute.',
      ],
    },
    {
      id: 'share',
      heading: 'Share links',
      items: [
        'Anyone with a link sees the text’s title, author and sections, so send links only to the people you mean. A link stops working when it expires, is revoked, or its text is no longer published.',
      ],
    },
    {
      id: 'fair-use',
      heading: 'Fair use',
      items: [
        'Do not scan, attack or overload the service, work around rate limits, or try to read texts you may not read. Automated access goes only through the admin API, with a token an admin made.',
      ],
    },
    {
      id: 'liability',
      heading: 'Liability',
      paragraphs: [
        'The app is provided "as is". The knowledge base is for reference, not professional advice. Data is backed up daily, but keep your own copy of anything that matters to you. The developer may change, pause or stop the app, and may remove content or accounts that break these terms. These terms may be updated; the latest version is always on this page.',
      ],
    },
    {
      id: 'contact',
      heading: 'Contact',
      paragraphs: [`Message ${CONTACT.en}.`],
    },
  ],
};

export const LEGAL_DOCS: Record<LegalKind, Record<Locale, LegalDoc>> = {
  privacy: { vi: PRIVACY_VI, en: PRIVACY_EN },
  terms: { vi: TERMS_VI, en: TERMS_EN },
};

/** The address of each page. */
export const LEGAL_PATHS: Record<LegalKind, string> = { privacy: '/privacy', terms: '/terms' };
