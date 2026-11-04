/**
 * Strings of the Space screen (C10) and the labels it shares with the reader (C11): document kinds, read progress,
 * member roles. Kept beside the screens so each screen's strings evolve with it; `{app}` and `{name}` placeholders
 * are filled by `format` like the app's own dictionary (i18n/messages.ts).
 */
import { useMemo } from 'react';
import { format, type Locale, useI18n } from '../i18n/i18n';

export const spaceVi = {
  'space.kicker.public': 'SPACE · CHÍNH THỨC',
  'space.kicker.personal': 'SPACE · RIÊNG TƯ',
  'space.collectionCount': '{count} bộ sưu tập',
  'space.views': 'Cách xem Space',
  'space.view.overview': 'Tổng quan',
  'space.view.canvas': 'Canvas',
  'space.view.graph': 'Graph',
  'space.askCopilot': 'Hỏi Copilot về Space này',
  'space.collections': 'Bộ sưu tập',
  'space.documentCount': '{count} tài liệu',
  'space.documents': 'Tài liệu trong bộ sưu tập',
  'space.allDocuments': 'Tài liệu',
  'space.filter': 'Lọc theo nguồn',
  'space.filter.all': 'Tất cả',
  'space.filter.official': 'Chính thức',
  'space.filter.community': 'Cộng đồng',
  'space.sortInProgress': 'Sắp xếp: Đọc dở trước',
  'space.loading': 'Đang mở Space…',
  'space.loadingLabel': 'Đang tải Space',
  'space.empty.title': 'Bộ sưu tập này còn trống',
  'space.empty.text': 'Viết bài đầu tiên. Quản trị duyệt xong, bài sẽ hiện ở đây cho mọi người.',
  'space.empty.action': 'Viết bài đầu tiên',
  'space.filteredEmpty': 'Không có tài liệu nào khớp bộ lọc này.',
  'space.members': 'Thành viên & quyền',
  'space.membersLabel': 'Thành viên và quyền',
  'space.who.read': 'Ai xem',
  'space.who.contribute': 'Đóng góp',
  'space.who.review': 'Duyệt',
  'space.read.public': 'Mọi người đã đăng nhập',
  'space.read.personal': 'Chỉ bạn',
  'space.contribute.public': 'Thành viên viết bài, gửi duyệt',
  'space.contribute.personal': 'Chỉ bạn',
  'space.review.personal': 'Không cần duyệt',
  'space.review.nobody': 'Chưa có người duyệt',
  'space.related': 'Space liên quan',
  'space.relatedNote': 'Nối với Space này vì có bài của hai bên liên kết với nhau.',
  'space.relatedLabel': '{name}, {caption}, độ liên quan {relevance}',
  'space.relatedNone': 'Chưa có Space nào liên kết với Space này.',
  'role.owner': 'Chủ sở hữu',
  'role.admin': 'Quản trị',
  'role.reviewer': 'Người duyệt',
  'role.member': 'Thành viên',
  'kind.lab': 'Lab',
  'kind.note': 'Ghi chú',
  'kind.process': 'Quy trình',
  'kind.office': 'Tệp',
  'kind.officeWord': 'Tệp Word',
  'kind.officeExcel': 'Tệp Excel',
  'kind.officePowerPoint': 'Tệp PowerPoint',
  'kind.officePdf': 'Tệp PDF',
  'kind.web': 'Trang web',
  'kind.journey': 'Lối đi',
  'kind.yours': 'Của bạn',
  'progress.unread': 'Chưa đọc',
  'progress.done': 'Đã đọc',
  'progress.percent': '{percent}%',
  'progress.label': 'Đã đọc {percent}%',
};

export type SpaceMessageKey = keyof typeof spaceVi;

export const spaceEn: Record<SpaceMessageKey, string> = {
  'space.kicker.public': 'SPACE · OFFICIAL',
  'space.kicker.personal': 'SPACE · PRIVATE',
  'space.collectionCount': '{count} collections',
  'space.views': 'Ways to view the Space',
  'space.view.overview': 'Overview',
  'space.view.canvas': 'Canvas',
  'space.view.graph': 'Graph',
  'space.askCopilot': 'Ask Copilot about this Space',
  'space.collections': 'Collections',
  'space.documentCount': '{count} documents',
  'space.documents': 'Documents in the collection',
  'space.allDocuments': 'Documents',
  'space.filter': 'Filter by origin',
  'space.filter.all': 'All',
  'space.filter.official': 'Official',
  'space.filter.community': 'Community',
  'space.sortInProgress': 'Sort: in progress first',
  'space.loading': 'Opening the Space…',
  'space.loadingLabel': 'Loading the Space',
  'space.empty.title': 'This collection is empty',
  'space.empty.text': 'Write the first piece. Once an admin approves it, it shows here for everyone.',
  'space.empty.action': 'Write the first piece',
  'space.filteredEmpty': 'No document matches this filter.',
  'space.members': 'Members & permissions',
  'space.membersLabel': 'Members and permissions',
  'space.who.read': 'Who reads',
  'space.who.contribute': 'Contributing',
  'space.who.review': 'Reviewing',
  'space.read.public': 'Everyone signed in',
  'space.read.personal': 'Only you',
  'space.contribute.public': 'Members write and submit for review',
  'space.contribute.personal': 'Only you',
  'space.review.personal': 'No review needed',
  'space.review.nobody': 'No reviewer yet',
  'space.related': 'Related Spaces',
  'space.relatedNote': 'Linked to this Space because documents of both link to each other.',
  'space.relatedLabel': '{name}, {caption}, relevance {relevance}',
  'space.relatedNone': 'No Space links to this one yet.',
  'role.owner': 'Owner',
  'role.admin': 'Admin',
  'role.reviewer': 'Reviewer',
  'role.member': 'Member',
  'kind.lab': 'Lab',
  'kind.note': 'Note',
  'kind.process': 'Process',
  'kind.office': 'File',
  'kind.officeWord': 'Word file',
  'kind.officeExcel': 'Excel file',
  'kind.officePowerPoint': 'PowerPoint file',
  'kind.officePdf': 'PDF file',
  'kind.web': 'Web page',
  'kind.journey': 'Path',
  'kind.yours': 'Yours',
  'progress.unread': 'Not read',
  'progress.done': 'Read',
  'progress.percent': '{percent}%',
  'progress.label': '{percent}% read',
};

export type ScreenTranslate<K extends string> = (key: K, vars?: Record<string, string | number>) => string;

/** A translate function over a screen's own vi/en strings, in the page's language. */
export function useScreenText<K extends string>(dictionaries: Record<Locale, Record<K, string>>): { t: ScreenTranslate<K>; locale: Locale } {
  const { locale } = useI18n();
  return useMemo(() => {
    const dictionary = dictionaries[locale];
    return { t: (key, vars) => format(dictionary[key], vars), locale };
  }, [dictionaries, locale]);
}

const SPACE_TEXT: Record<Locale, Record<SpaceMessageKey, string>> = { vi: spaceVi, en: spaceEn };

export function useSpaceText(): { t: ScreenTranslate<SpaceMessageKey>; locale: Locale } {
  return useScreenText(SPACE_TEXT);
}
