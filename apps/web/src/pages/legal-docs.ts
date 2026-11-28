/**
 * The text of /privacy and /terms in Vietnamese, English and Simplified Chinese. `{app}` is the brand name (filled by `format`); hosts and
 * the account name come from brand.ts. Every duration the server enforces is printed from apps/server/src/retention.ts,
 * so the page says what the code does. The facts behind the rest: docs/settings-and-roles.md (what deleting your data
 * removes and keeps), docs/deployment-guide.md ("Key riêng", "Link chia sẻ", "Sao lưu và khôi phục").
 */
import { IDP_ACCOUNT_URL } from '../brand';
import type { Locale } from '../i18n/i18n';
import { BRAND_WORDS } from '../layout/brand-words';
import {
  ADMIN_CALL_LOG_DAYS,
  BACKUP_KEEP_DAYS,
  PRESENT_VIEWS_KEEP_DAYS,
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
const CONTACT = { vi: 'Trang Facebook Hoandat Apps', en: 'the Hoandat Apps Facebook Page', 'zh-CN': 'Hoandat Apps 的 Facebook 主页' } as const;

const UPDATED = { vi: 'Cập nhật ngày 13/11/2026', en: 'Last updated 13 November 2026', 'zh-CN': '最后更新：2026 年 11 月 13 日' } as const;

/** Where an account is deleted: the hoandat account page, at its deletion section (auth-next ADR 0018). */
const ACCOUNT_DELETE_URL = `${IDP_ACCOUNT_URL}#account-delete`;

const PRIVACY_VI: LegalDoc = {
  title: 'Quyền riêng tư',
  updated: UPDATED.vi,
  intro: `{app} (${host}) là kho tri thức song ngữ Anh – Việt của hệ sinh thái ${account}, do một nhà phát triển độc lập vận hành. Trang này nói rõ app giữ gì, gửi gì đi đâu, giữ bao lâu và cách bạn xoá dữ liệu của mình.`,
  sections: [
    {
      id: 'account',
      heading: 'Tài khoản và đăng nhập',
      items: [
        `Bạn đăng nhập bằng tài khoản ${account} qua ${idp}, dùng chung cho các app ${account}. {app} không bao giờ thấy mật khẩu của bạn.`,
        'App xin quyền "openid profile email" và nhận mã định danh tài khoản, tên hiển thị, email và địa chỉ ảnh đại diện. Chúng được lưu cùng tài khoản và cập nhật mỗi lần bạn đăng nhập. App không gửi email cho bạn.',
        'Ảnh đại diện do trình duyệt tải thẳng từ nơi giữ ảnh (Google hoặc GitHub); app không lưu bản sao.',
        'App lưu thêm cài đặt của bạn: ngôn ngữ, giao diện Sáng/Tối, giảm chuyển động, các Space bạn chọn lúc bắt đầu, và vai trò của bạn trong workspace (Thành viên, Quản trị).',
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
        'Máy chủ lưu bài bạn viết cùng các phiên bản của nó, bình luận, yêu thích, tiến độ đọc và tiến độ lối đi tri thức, Canvas của bạn, thông báo gửi cho bạn (nhắc tên, bình luận, bài lâu chưa cập nhật, quản trị ẩn hay hiện bài của bạn) và lịch sử Copilot (câu hỏi, câu trả lời, nguồn đã trích; chỉ bạn xem được).',
        'Bạn tự chọn đăng bài công khai hay giữ riêng tư. Bài đã đăng và đang hiện là bài công khai: mọi người, kể cả khách chưa đăng nhập, đọc và tìm thấy được ngay khi bạn đăng. Bài nháp và bài riêng tư chỉ bạn đọc được; bạn sửa, gỡ xuống hay xoá bài của mình bất cứ lúc nào. Quản trị đọc được mọi bài, kể cả bài riêng tư.',
        `Bài bạn xoá nằm trong thùng rác ${TRASH_DAYS} ngày rồi tự xoá hẳn, cùng các phiên bản và tệp của nó. Bạn xoá hẳn sớm hơn được.`,
        'Trí nhớ của AI: khi bạn nối AI của mình (qua Chat hay MCP), AI có thể tự ghi điều bạn kể về bản thân thành ghi chú riêng tư trong mục "Trí nhớ" của Space cá nhân, không hỏi trước từng lần; mỗi lần ghi có link hoàn tác trong 24 giờ. App từ chối những gì nhận ra là bí mật, số giấy tờ tuỳ thân hay số tài khoản tài chính (nhận theo mẫu, không bảo đảm bắt được mọi trường hợp); chủ đề nhạy cảm (sức khoẻ, tôn giáo, chính trị…) do AI tự nhận ra và bỏ qua trừ khi bạn bật. Tạm dừng thì AI không ghi và không đọc trí nhớ. AI của tài khoản khác, kể cả quản trị, không đọc được trí nhớ của bạn. Ở trang Trí nhớ bạn xem, sửa, xoá từng mục, tạm dừng hay xoá toàn bộ trí nhớ.',
        'Tệp tải lên (docx, xlsx, pptx, pdf, md, tối đa 25 MB) được lưu trên ổ đĩa của máy chủ {app}, dưới một tên ngẫu nhiên. Chữ trong tệp được trích bằng Apache Tika (kèm OCR Tesseract cho trang quét) chạy ngay trên cùng máy chủ: bước trích chữ không gửi tệp ra ngoài. Một phần chữ trích được thì Jev đọc để chấm (xem mục Jev).',
        'Trình sửa Office chạy trong trình duyệt của bạn, tải từ một tên miền riêng của {app}; tệp không đi qua dịch vụ của bên thứ ba.',
        `Khi bạn xem một bài dạng slide, máy chủ ghi bài đó, bạn xem tới slide thứ mấy và bộ slide có bao nhiêu slide, để biết slide có được xem hết không. Bản ghi không có tài khoản hay địa chỉ IP của bạn, và tự xoá sau ${PRESENT_VIEWS_KEEP_DAYS} ngày. Bảng màu slide bạn chọn chỉ được nhớ trên trình duyệt của bạn.`,
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
      heading: 'Jev (TypeSafe): tìm kiếm và phân loại',
      paragraphs: [
        'Jev là dịch vụ chấm điểm của TypeSafe (typesafe.ai). Máy chủ {app} gọi Jev bằng key của chính máy chủ, cho mọi người dùng, và Jev chỉ trả về lựa chọn và điểm số, không viết chữ. Tuỳ việc, máy chủ gửi tới Jev:',
      ],
      items: [
        'tìm kiếm theo nghĩa: câu bạn tìm, tiêu đề và tóm tắt (hoặc đoạn đầu) của các bài ứng viên, rồi các đoạn của những bài được chọn;',
        'Copilot: câu hỏi và các đoạn ứng viên (để chọn nguồn và biết kho đã đủ để trả lời chưa), rồi các câu trong câu trả lời cùng đoạn nguồn chúng trích (để kiểm trích dẫn);',
        'gợi ý nối bài trong Graph và Canvas, gợi ý bước tiếp của lối đi tri thức: tiêu đề và một đoạn ngắn (tóm tắt, đoạn đầu, nội dung thẻ Canvas);',
        'tệp tải lên: mẫu chữ của từng trang (lớp chữ có đọc được không, OCR có ra chữ không), tiêu đề và một phần nội dung (để gợi ý Collection và thẻ).',
        'Bài ứng viên chỉ gồm bài bạn được đọc, nên có thể có bài riêng tư của bạn. App ghi số lần gọi và số token mỗi ngày để theo dõi chi phí; bản ghi đó không chứa nội dung gửi đi hay câu trả lời.',
        'Tìm kiếm theo từ khoá chạy bằng Meilisearch trên chính máy chủ {app}.',
      ],
    },
    {
      id: 'share',
      heading: 'Link chia sẻ',
      items: [
        'Tác giả hay quản trị tạo được link cho bài đã đăng. Link chỉ chứa một mã ngẫu nhiên; máy chủ chỉ lưu bản băm (sha256) và 4 ký tự cuối của mã, không bao giờ lưu hay ghi log chính mã đó. Link có thể hết hạn (sau 7 hoặc 30 ngày) và thu hồi được bất cứ lúc nào.',
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
        `Những bản này chỉ nằm trên máy đó. "Xoá bộ nhớ đệm" ở Cài đặt xoá các bản đã có trên máy chủ; đăng xuất thì máy thôi hiện bản offline của bạn cho tới khi bạn đăng nhập lại; xoá tài khoản không xoá được chúng: muốn bỏ hẳn, xoá dữ liệu trang web của ${host} trong trình duyệt.`,
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
      heading: 'Xoá tài khoản và dữ liệu của bạn',
      paragraphs: [
        `Tài khoản ${account} chỉ xoá được ở trang tài khoản trên ${idp}. Khi bạn xoá ở đó, ${idp} báo cho {app} và {app} xoá hẳn ngay, trong một lần:`,
      ],
      items: [
        'bài không phải bài chính thức chưa xuất bản (nháp, riêng tư, kể cả bài còn lại từ vòng duyệt cũ), mọi bài trong thùng rác, mọi bài trong Space cá nhân và chính Space đó;',
        'tệp tải lên không còn bài nào dùng, cả tệp trên đĩa;',
        'key AI và lựa chọn key, lịch sử Copilot, tiến độ đọc và lối đi, yêu thích, thông báo, Canvas, bình luận, dấu vết bạn đã mở link chia sẻ;',
        'mọi phiên đăng nhập.',
      ],
      link: { href: ACCOUNT_DELETE_URL, label: 'Mở trang xoá tài khoản' },
    },
    {
      id: 'kept',
      heading: 'Những gì còn lại sau khi xoá',
      items: [
        'Bài chính thức ngoài Space cá nhân, ở bất kỳ bước nào: chúng thuộc workspace.',
        'Bài cộng đồng đã xuất bản: đó là bài công khai người khác đọc và dẫn tới, tác giả hiện là "Tài khoản đã xoá". Muốn gỡ, hãy thôi xuất bản hay xoá chúng trước khi xoá tài khoản.',
        'Các phiên bản và quyết định duyệt bạn viết trên những bài còn lại, và nhật ký kiểm toán (thêm một dòng ghi tài khoản đã bị xoá).',
        `Bản sao lưu, cho tới khi hết ${BACKUP_KEEP_DAYS} ngày.`,
        'Link chia sẻ, token API và link mời bạn tạo bị thu hồi. Tên, email và ảnh bị xoá khỏi tài khoản: chỉ còn một dòng không tên để bài giữ lại vẫn có tác giả.',
      ],
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
  intro: `{app} (${host}) is a bilingual English – Vietnamese library of the ${account} ecosystem, run by an independent developer. This page says what the app keeps, what it sends where, for how long, and how you delete your data.`,
  sections: [
    {
      id: 'account',
      heading: 'Your account and signing in',
      items: [
        `You sign in with your ${account} account through ${idp}, shared by the ${account} apps. {app} never sees your password.`,
        'The app asks for the "openid profile email" scopes and receives an account identifier, your display name, email and the address of your profile picture. They are stored with your account and updated each time you sign in. The app sends you no email.',
        'Your browser loads the profile picture straight from where it is kept (Google or GitHub); the app keeps no copy.',
        'The app also stores your settings: language, light or dark theme, reduced motion, the Spaces you picked when you started, and your role in the workspace (Member, Admin).',
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
        'The server keeps the texts you write with their versions, your comments, favourites, reading and journey progress, your Canvases, the notifications sent to you (mentions, comments, texts not updated for a long time, an admin hiding or showing a text of yours) and your Copilot history (questions, answers, the sources cited; only you can see it).',
        'You choose to publish a text or keep it private. A published text that is not hidden is public: everyone, guests who are not signed in included, can read and find it as soon as you publish it. Drafts and private texts are readable by you only; you can edit, take down or delete your texts at any time. Admins can read every text, private ones included.',
        `A text you delete stays in the trash for ${TRASH_DAYS} days, then is deleted for good with its versions and files. You can delete it for good sooner.`,
        'AI memory: when you connect your own AI (through Chat or MCP), it may write down what you tell it about yourself as private notes in the "Memory" Collection of your personal Space, without asking each time; every write has an undo link valid for 24 hours. The app refuses what it recognises as secrets, identity document numbers or financial account numbers (by pattern, so not every case is caught); sensitive topics (health, religion, politics…) are recognised by the AI and left out unless you turn them on. While paused, the AI neither saves nor reads your memory. Another account’s AI, an admin’s included, cannot read your memory. On the Memory page you can view, edit or delete each entry, pause memory or delete all of it.',
        'Uploaded files (docx, xlsx, pptx, pdf, md, up to 25 MB) are stored on the disk of the {app} server under a random name. Their text is extracted with Apache Tika (with Tesseract OCR for scanned pages) running on that same server: extraction sends no file anywhere. Jev reads part of the extracted text to rate it (see the Jev section).',
        'The Office editor runs in your browser, loaded from a domain of {app} itself; files do not go through any third-party service.',
        `When you view a text as slides, the server records the text, how far you got and how many slides the deck has, to learn whether slides are watched to the end. The record holds neither your account nor your IP address, and is deleted after ${PRESENT_VIEWS_KEEP_DAYS} days. The slide palette you pick is remembered in your browser only.`,
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
      heading: 'Jev (TypeSafe): search and sorting',
      paragraphs: [
        'Jev is the judgment service of TypeSafe (typesafe.ai). The {app} server calls Jev with the server’s own key, for every user, and Jev only returns choices and scores; it writes no text. Depending on the task, the server sends Jev:',
      ],
      items: [
        'search by meaning: your query, the titles and summaries (or first passage) of candidate texts, then the passages of the texts chosen;',
        'the Copilot: your question and the candidate passages (to pick sources and tell whether the knowledge base can answer), then the sentences of the answer with the passages they cite (to check citations);',
        'link suggestions in the Graph and Canvas, and next-step suggestions in a knowledge journey: titles and a short text (summary, first passage, Canvas card text);',
        'uploaded files: a sample of each page’s text (whether its text layer is readable, whether OCR found text), the title and part of the text (to suggest a Collection and tags).',
        'Candidate texts are only texts you may read, so they can include your private ones. The app records the number of calls and tokens per day to watch the cost; that record holds nothing that was sent or answered.',
        'Keyword search runs on Meilisearch on the {app} server itself.',
      ],
    },
    {
      id: 'share',
      heading: 'Share links',
      items: [
        'An author or an admin can make a link to a published text. The link holds only a random code; the server stores only its hash (sha256) and last 4 characters, and never stores or logs the code itself. A link can expire (after 7 or 30 days) and can be revoked at any time.',
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
        `These copies stay on that device. "Clear the cache" in Settings removes the copies the server already has; signing out stops the device showing your offline copies until you sign in again; deleting the account does not remove them: to get rid of them for good, clear the site data of ${host} in the browser.`,
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
      heading: 'Deleting your account and data',
      paragraphs: [
        `Your ${account} account is deleted only on the account page at ${idp}. When you delete it there, ${idp} tells {app}, and {app} deletes at once, in one go:`,
      ],
      items: [
        'unpublished texts that are not official (drafts, private, and those left from the former review step), every text in the trash, every text in your personal Space and that Space itself;',
        'uploaded files no remaining text uses, from the disk too;',
        'your AI keys and key choice, Copilot history, reading and journey progress, favourites, notifications, Canvases, comments, and the record of share links you opened;',
        'every session.',
      ],
      link: { href: ACCOUNT_DELETE_URL, label: 'Open the account deletion page' },
    },
    {
      id: 'kept',
      heading: 'What stays after deleting',
      items: [
        'Official texts outside your personal Space, at any stage: they belong to the workspace.',
        'Community texts you published: they are public texts others read and link to, and their author shows as "Deleted account". To take them down, unpublish or delete them before deleting the account.',
        'The versions and review decisions you wrote on the texts that stay, and the audit log (with a line saying the account was deleted).',
        `Backups, until their ${BACKUP_KEEP_DAYS} days are up.`,
        'Share links, API tokens and invite links you made are revoked. Your name, email and picture are removed from the account: only a nameless row remains so the texts that stay keep an author.',
      ],
    },
    {
      id: 'contact',
      heading: 'Contact',
      paragraphs: [`Questions, or help deleting your data: message ${CONTACT.en}.`],
    },
  ],
};

const PRIVACY_ZH: LegalDoc = {
  title: '隐私',
  updated: UPDATED['zh-CN'],
  intro: `{app}（${host}）是 ${account} 生态系统中的英越双语知识库，由一名独立开发者运营。本页说明应用保存什么、把什么发送到哪里、保存多久，以及你如何删除自己的数据。`,
  sections: [
    {
      id: 'account',
      heading: '你的账号与登录',
      items: [
        `你通过 ${idp} 使用 ${account} 账号登录，这个账号由各个 ${account} 应用共用。{app} 从不接触你的密码。`,
        '应用请求 "openid profile email" 权限范围，获得账号标识、显示名称、邮箱和头像地址。这些信息与你的账号一起保存，并在每次登录时更新。应用不会给你发邮件。',
        '头像由你的浏览器直接从其存放处（Google 或 GitHub）加载，应用不保存副本。',
        '应用还保存你的设置：语言、浅色或深色主题、减少动态效果、开始使用时选择的空间，以及你在工作区中的角色（成员、管理员）。',
        '管理员可以在工作区设置页面看到每个账号的名称、邮箱和角色。',
      ],
    },
    {
      id: 'cookies',
      heading: 'Cookie 与会话',
      items: [
        `__Host-kb_session 让你保持登录最长 ${SESSION_ABSOLUTE_DAYS} 天；连续 ${SESSION_IDLE_DAYS} 天未使用会提前失效。服务器只保存它的哈希值（sha256）。无论在应用中还是在 ${idp} 上退出登录，服务器上的会话都会结束。`,
        `kb_login 只在登录过程中存在（最多 10 分钟）：它保存往返 ${idp} 时的防伪代码。`,
        `hd_lang 记住你选择的语言，由各个 ${account} 应用共用。`,
        '应用不使用任何广告或追踪 Cookie。',
      ],
    },
    {
      id: 'texts',
      heading: '你的文章、文件与动态',
      items: [
        '服务器保存你写的文章及其各个版本、你的评论、收藏、阅读和学习路径进度、你的画布、发给你的通知（提及、评论、长期未更新的文章、管理员隐藏或重新显示你的文章），以及你的 Copilot 历史（问题、回答、引用的来源；只有你能看到）。',
        '你可以选择发布文章或保持私密。已发布且未被隐藏的文章是公开的：发布后，所有人（包括未登录的访客）都能阅读和搜索到。草稿和私密文章只有你能读；你可以随时编辑、撤下或删除自己的文章。管理员可以阅读所有文章，包括私密文章。',
        `你删除的文章会在回收站中保留 ${TRASH_DAYS} 天，之后连同其版本和文件被永久删除。你也可以提前永久删除。`,
        'AI 记忆：当你连接自己的 AI（通过 Chat 或 MCP）时，它可能会把你告诉它的关于你自己的事情，作为私密笔记写入你个人空间中的“记忆”合集，无需每次询问；每次写入都附有 24 小时内有效的撤销链接。应用会拒绝它识别出的密钥、证件号码或金融账号（按格式识别，因此并非所有情况都能识别）；敏感话题（健康、宗教、政治…）由 AI 识别并排除，除非你开启。暂停期间，AI 既不保存也不读取你的记忆。其他账号的 AI（包括管理员的）都无法读取你的记忆。在记忆页面，你可以查看、编辑或删除每一条，暂停记忆或全部删除。',
        '上传的文件（docx、xlsx、pptx、pdf、md，最大 25 MB）以随机名称保存在 {app} 服务器的磁盘上。文件中的文字由同一台服务器上运行的 Apache Tika（扫描页使用 Tesseract OCR）提取：提取过程不会把文件发送到任何地方。Jev 会读取部分提取出的文字进行评估（见 Jev 一节）。',
        'Office 编辑器在你的浏览器中运行，从 {app} 自己的域名加载；文件不经过任何第三方服务。',
        `当你以幻灯片形式查看文章时，服务器会记录文章、你看到第几页以及幻灯片总页数，用来了解幻灯片是否被看完。该记录既不包含你的账号，也不包含你的 IP 地址，并在 ${PRESENT_VIEWS_KEEP_DAYS} 天后删除。你选择的幻灯片配色只记在你的浏览器中。`,
      ],
    },
    {
      id: 'ai',
      heading: 'Copilot 与 AI 使用你自己的密钥',
      items: [
        'Copilot、阅读时的 AI 按钮（解释、总结）、编辑器中的“AI 写作助手”和 AI 翻译，只使用你自己的 AI 密钥和你选择的服务商：OpenAI、Google Gemini 或 Anthropic Claude。{app} 服务器没有用于这些功能的 AI 密钥；没有你的密钥，什么都不会发送。',
        '当你提问时，服务器会把你的问题、你选中的段落（如有）以及知识库中作为来源的摘录发送给该服务商。“AI 写作助手”发送你正在写的草稿的标题和正文；翻译发送待翻译的文章。服务商按照其适用于你账号的条款和政策处理收到的内容。',
        '当 Jev 判断知识库无法回答时，Copilot 会直接说明，不会调用服务商。',
        '密钥在保存前使用 AES-256-GCM 加密，加密用的密钥保存在数据库之外：数据库或备份泄露也不会泄露密钥。应用只再显示最后 4 个字符，密钥从不写入日志，你可以随时在“自有密钥”页面删除密钥。',
        'Copilot 的回答保存在你的历史中；翻译保存为你的草稿；“AI 写作助手”的建议不会保存。',
      ],
      link: { href: '/settings/keys', label: '打开自有密钥' },
    },
    {
      id: 'jev',
      heading: 'Jev（TypeSafe）：搜索与排序',
      paragraphs: [
        'Jev 是 TypeSafe（typesafe.ai）的判断服务。{app} 服务器用服务器自己的密钥为所有用户调用 Jev，Jev 只返回选择和评分，不写任何文字。根据任务不同，服务器会发送给 Jev：',
      ],
      items: [
        '语义搜索：你的查询、候选文章的标题和摘要（或第一段），然后是所选文章的段落；',
        'Copilot：你的问题和候选段落（用来挑选来源并判断知识库能否回答），然后是回答中的句子及其引用的段落（用来核对引用）；',
        '图谱和画布中的链接建议，以及知识路径中的下一步建议：标题和一段短文（摘要、第一段、画布卡片文字）；',
        '上传的文件：每页文字的样本（文字层是否可读、OCR 是否识别出文字）、标题和部分正文（用来建议合集和标签）。',
        '候选文章只包括你有权阅读的文章，因此可能包含你的私密文章。应用按天记录调用次数和 token 数量以控制成本；该记录不包含任何发送或返回的内容。',
        '关键词搜索在 {app} 服务器自身的 Meilisearch 上运行。',
      ],
    },
    {
      id: 'share',
      heading: '分享链接',
      items: [
        '作者或管理员可以为已发布的文章创建链接。链接只包含一个随机代码；服务器只保存它的哈希值（sha256）和最后 4 个字符，从不保存或记录代码本身。链接可以设置过期（7 天或 30 天后），也可以随时撤销。',
        `每次有人打开链接（作者或管理员除外），服务器会在链接的访问历史中记录打开时间和打开的账号，未登录时记为“访客”；作者和管理员可以查看。超过 ${SHARE_OPENINGS_KEEP_DAYS} 天的打开记录会自动删除。链接粘贴到 Zalo 或 Messenger 时显示的预览卡片不算作一次打开。`,
      ],
    },
    {
      id: 'admin',
      heading: '管理与日志',
      items: [
        '审计日志记录谁在何时做了什么：角色变更、移除和恢复成员、邀请链接、API 令牌、登录、数据删除、隐藏和显示文章。它从不记录令牌、邮箱或文章内容，且只有管理员可以查看。',
        `管理员 API 调用日志（方法、路径、结果、创建或修改的文章）保留 ${ADMIN_CALL_LOG_DAYS} 天。`,
      ],
    },
    {
      id: 'device',
      heading: '在你的设备上',
      items: [
        '为了离线阅读和编辑，你的浏览器会在 IndexedDB 中保存 Office 文件副本、未发送的草稿和离线保存的 Office 文件；正在编辑的画布在 localStorage 中有一份草稿。浏览器还会记住你的主题、视图和上次使用的账号，因此离线副本只对该账号打开。',
        `这些副本留在该设备上。设置中的“清除缓存”会移除服务器已有的副本；退出登录后，设备在你重新登录前不再显示你的离线副本；删除账号不会移除它们：要彻底清除，请在浏览器中清除 ${host} 的网站数据。`,
      ],
    },
    {
      id: 'server',
      heading: '服务器、网站日志与备份',
      items: [
        '所有流量都经过 Cloudflare（防护和加速）。网站可能使用 Cloudflare Web Analytics 统计页面浏览量；它不设置 Cookie，也不会在其他网站上追踪你。应用不展示广告，也不出售数据。',
        '网站服务器日志记录 IP 地址、浏览器、页面路径和时间；从不记录查询字符串或来源页面，分享链接和邀请链接的代码也从不进入日志。访问频率限制只在内存中按 IP 地址或账号计数，从不写入存储。',
        `服务器每天备份数据库和上传的文件，每份备份保留 ${BACKUP_KEEP_DAYS} 天。因此，已删除的数据可能在备份中最多保留 ${BACKUP_KEEP_DAYS} 天。加密 AI 密钥所用的密钥不在备份中。`,
      ],
    },
    {
      id: 'delete',
      heading: '删除你的账号和数据',
      paragraphs: [
        `你的 ${account} 账号只能在 ${idp} 的账号页面删除。你在那里删除后，${idp} 会通知 {app}，{app} 会立即一次性删除：`,
      ],
      items: [
        '未发布且非官方的文章（草稿、私密文章，以及旧审核流程遗留的文章）、回收站中的所有文章、你个人空间中的所有文章以及该空间本身；',
        '不再被任何剩余文章使用的上传文件，包括磁盘上的文件；',
        '你的 AI 密钥和密钥选择、Copilot 历史、阅读和学习路径进度、收藏、通知、画布、评论，以及你打开过的分享链接记录；',
        '所有会话。',
      ],
      link: { href: ACCOUNT_DELETE_URL, label: '打开账号删除页面' },
    },
    {
      id: 'kept',
      heading: '删除后保留的内容',
      items: [
        '你个人空间之外的官方文章，无论处于哪个阶段：它们属于工作区。',
        '你发布的社区文章：它们是他人阅读和链接的公开文章，作者将显示为“已删除的账号”。如要撤下，请在删除账号前取消发布或删除。',
        '你在保留文章上写的版本和审核决定，以及审计日志（附有一条说明账号已删除的记录）。',
        `备份，直到其 ${BACKUP_KEEP_DAYS} 天保留期结束。`,
        '你创建的分享链接、API 令牌和邀请链接会被撤销。你的名称、邮箱和头像会从账号中移除：只保留一条无名记录，让保留的文章仍有作者。',
      ],
    },
    {
      id: 'contact',
      heading: '联系',
      paragraphs: [`如有疑问，或需要帮助删除数据：请在 ${CONTACT['zh-CN']}留言。`],
    },
  ],
};

const TERMS_VI: LegalDoc = {
  title: 'Điều khoản sử dụng',
  updated: UPDATED.vi,
  intro: `{app} (${host}) là kho tri thức miễn phí, không quảng cáo. Dùng app nghĩa là bạn đồng ý với các điều dưới đây và với cách app xử lý dữ liệu ở trang Quyền riêng tư.`,
  sections: [
    {
      id: 'account',
      heading: 'Tài khoản',
      items: [
        `Bạn dùng app bằng tài khoản ${account} (${idp}); giữ tài khoản đó an toàn là việc của bạn.`,
        'Quản trị có thể đổi vai trò của bạn, hoặc gỡ bạn khỏi workspace: khi đó bạn không đăng nhập được cho tới khi được khôi phục, bài của bạn giữ nguyên.',
      ],
    },
    {
      id: 'texts',
      heading: 'Nội dung bạn đưa lên',
      items: [
        'Bạn chịu trách nhiệm về bài, bình luận và tệp mình đưa lên. Chỉ đưa lên thứ bạn có quyền chia sẻ; không đăng nội dung trái pháp luật, xúc phạm, lừa đảo, mã độc hay thông tin riêng của người khác.',
        'Bạn tự chọn đăng bài công khai hay giữ riêng tư; bài công khai thì mọi người đọc được ngay khi đăng. Quản trị quản lý mọi bài: có thể ẩn, hiện lại, sửa, chuyển chỗ hay xoá bài. Bài quản trị đã ẩn chỉ hiện lại khi quản trị bật hiện.',
        'Bài đã xuất bản là bài công khai: người dùng app đọc và tìm thấy được, Copilot dùng làm nguồn, và tác giả hay quản trị chia sẻ được bằng link. Người nhận link có quyền "Remix" chép được bài thành bản nháp của họ.',
        'Bài chính thức thuộc workspace và ở lại khi tài khoản của bạn bị xoá; bài cộng đồng đã xuất bản cũng ở lại, ghi tác giả "Tài khoản đã xoá" (chi tiết ở trang Quyền riêng tư).',
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
  intro: `{app} (${host}) is a free library with no ads. By using it you agree to the terms below and to how the app handles data as the Privacy page describes.`,
  sections: [
    {
      id: 'account',
      heading: 'Your account',
      items: [
        `You use the app with your ${account} account (${idp}); keeping that account safe is up to you.`,
        'Admins can change your role or remove you from the workspace: you then cannot sign in until restored, and your texts stay as they are.',
      ],
    },
    {
      id: 'texts',
      heading: 'What you put in',
      items: [
        'You are responsible for the texts, comments and files you put in. Only put in what you have the right to share; post nothing unlawful, abusive, fraudulent, malicious, or anyone else’s private information.',
        'You choose to publish a text or keep it private; a public text is readable by everyone as soon as it is published. Admins manage every text: they can hide, show again, edit, move or delete it. A text an admin hid shows again only when an admin shows it.',
        'A published text is public: app users can read and find it, the Copilot uses it as a source, and its author or an admin can share it by link. Someone receiving a link with "Remix" allowed can copy the text into their own drafts.',
        'Official texts belong to the workspace and stay when your account is deleted; community texts you published stay too, by "Deleted account" (details on the Privacy page).',
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

const TERMS_ZH: LegalDoc = {
  title: '使用条款',
  updated: UPDATED['zh-CN'],
  intro: `{app}（${host}）是免费、无广告的知识库。使用本应用即表示你同意以下条款，以及隐私页面所述的数据处理方式。`,
  sections: [
    {
      id: 'account',
      heading: '你的账号',
      items: [
        `你使用自己的 ${account} 账号（${idp}）使用本应用；保护该账号的安全由你负责。`,
        '管理员可以更改你的角色或将你移出工作区：此后在恢复之前你无法登录，你的文章保持原样。',
      ],
    },
    {
      id: 'texts',
      heading: '你放入的内容',
      items: [
        '你对自己放入的文章、评论和文件负责。只放入你有权分享的内容；不要发布任何违法、辱骂、欺诈、恶意的内容或他人的私人信息。',
        '你可以选择发布文章或保持私密；公开文章一经发布，所有人都能阅读。管理员管理所有文章：可以隐藏、重新显示、编辑、移动或删除。被管理员隐藏的文章只有在管理员重新显示后才会再次出现。',
        '已发布的文章是公开的：应用用户可以阅读和搜索到它，Copilot 会把它作为来源，作者或管理员可以通过链接分享它。收到允许“Remix”的链接的人可以把文章复制到自己的草稿中。',
        '官方文章属于工作区，在你的账号删除后仍会保留；你发布的社区文章也会保留，作者显示为“已删除的账号”（详见隐私页面）。',
      ],
    },
    {
      id: 'ai',
      heading: 'AI',
      items: [
        'AI 的回答可能出错。Copilot 只根据知识库中的来源回答，并在每句话后标注来源编号：在依赖某个回答之前，请打开来源进行核对。',
        '使用你自己的密钥时，你需遵守 AI 服务商的条款，并为使用该密钥产生的调用付费。应用会限制每分钟的 AI 调用次数。',
      ],
    },
    {
      id: 'share',
      heading: '分享链接',
      items: [
        '任何拿到链接的人都能看到文章的标题、作者和各个章节，因此只把链接发给你想分享的人。链接在过期、被撤销或文章不再发布时失效。',
      ],
    },
    {
      id: 'fair-use',
      heading: '合理使用',
      items: [
        '不要扫描、攻击服务或使其过载，不要绕过访问频率限制，也不要试图阅读你无权阅读的文章。自动化访问只能通过管理员 API，使用管理员创建的令牌。',
      ],
    },
    {
      id: 'liability',
      heading: '责任',
      paragraphs: [
        '本应用按“现状”提供。知识库仅供参考，不构成专业建议。数据每天备份，但对你重要的内容请自行保留副本。开发者可能更改、暂停或停止本应用，并可能删除违反本条款的内容或账号。本条款可能更新；最新版本始终在本页。',
      ],
    },
    {
      id: 'contact',
      heading: '联系',
      paragraphs: [`请在 ${CONTACT['zh-CN']}留言。`],
    },
  ],
};

export const LEGAL_DOCS: Record<LegalKind, Record<Locale, LegalDoc>> = {
  privacy: { vi: PRIVACY_VI, en: PRIVACY_EN, 'zh-CN': PRIVACY_ZH },
  terms: { vi: TERMS_VI, en: TERMS_EN, 'zh-CN': TERMS_ZH },
};

/** The address of each page. */
export const LEGAL_PATHS: Record<LegalKind, string> = { privacy: '/privacy', terms: '/terms' };
