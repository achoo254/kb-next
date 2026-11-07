/**
 * Boards H03 and C19 draw an admin's settings: H03 with the account in the dark theme, its OpenAI key in use and the
 * way to the workspace settings; C19 with four members (the bootstrap admin Đạt, Linh, Minh and An)
 * and an invite link just made. The E2E account is an ordinary member with the theme left to the system, so the shots
 * answer /api/me as an admin's and the workspace API with the board's data; the screens are the real ones
 * (apps/web/src/pages/settings-screen.tsx, workspace-screen.tsx; their states are checked in their vitest files).
 */

/** 03/11/2026 21:40 in Saigon: "vừa xong", "21:10", "hôm qua", "20:30". */
export const C19_CLOCK = '2026-11-03T14:40:00.000Z';
const at = (iso: string): string => new Date(Date.parse(iso)).toISOString();

export const C19_MEMBERS = {
  total: 4,
  members: [
    { id: 'c1900000-0000-4000-8000-000000000001', name: 'Đạt', email: '[EMAIL]', picture: null, role: 'admin', bootstrap: true, you: true, lastSeenAt: at('2026-11-03T14:39:40.000Z'), joinedAt: at('2026-10-01T02:00:00.000Z'), removedAt: null },
    { id: 'c1900000-0000-4000-8000-000000000002', name: 'Linh', email: '[EMAIL]', picture: null, role: 'member', bootstrap: false, you: false, lastSeenAt: at('2026-11-03T14:10:00.000Z'), joinedAt: at('2026-10-02T02:00:00.000Z'), removedAt: null },
    { id: 'c1900000-0000-4000-8000-000000000003', name: 'Minh', email: '[EMAIL]', picture: null, role: 'member', bootstrap: false, you: false, lastSeenAt: at('2026-11-02T12:00:00.000Z'), joinedAt: at('2026-10-03T02:00:00.000Z'), removedAt: null },
    { id: 'c1900000-0000-4000-8000-000000000004', name: 'An', email: '[EMAIL]', picture: null, role: 'member', bootstrap: false, you: false, lastSeenAt: at('2026-11-03T13:30:00.000Z'), joinedAt: at('2026-10-04T02:00:00.000Z'), removedAt: null },
  ],
};

/** The link just made (the board's "kb.hoandat.com/i/[MÃ MỜI]"); its token is the board's placeholder length. */
export const C19_INVITE = {
  token: 'MAMOI0000000000000000000000000xy',
  url: 'https://kb.hoandat.com/i/[MÃ MỜI]',
  invite: { id: 'c19i0000-0000-4000-8000-000000000001', last4: '00xy', role: 'member', expiresAt: '2026-11-10T14:40:00.000Z', acceptedCount: 0 },
};

/** The account of H03 as an admin's, in the dark theme the board draws. */
export const H03_ME = { theme: 'dark', reducedMotion: false, role: 'admin', isAdmin: true, roleLocked: true, name: 'dattqh', email: '[EMAIL]' };
