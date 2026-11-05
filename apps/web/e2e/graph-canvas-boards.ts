/**
 * The seeded data of boards C13, C15, C02 and C17 (KB_SEED=mock, apps/server/src/db/seed-data.ts) and Jev's suggestion the
 * C15 board shows (E2E has no Jev key, so the suggestion is answered here like the AI answers of ai-boards.ts).
 */

/** The seed's "Giao thức DHCP", the node picked on C13. */
export const C13_DHCP_ID = '989fedf1-beab-4f13-894d-111654ebdc45';

/** The owner's canvas "DHCP từ A đến Z" (seedId('canvas:dhcp-a-z')). */
export const C15_CANVAS_ID = '8bb6d274-c582-491b-88b0-06fdcd845e55';

/** C15: "Jev gợi ý: nối Ý tưởng ↔ Sơ đồ DORA · 0,91" (the idea card and the DORA diagram of the seed). */
export const C15_SUGGESTION = { suggestion: { from: 'idea', to: 'diag', relevance: 91 } };

/** The owner's draft "Máy mới xin IP thế nào" of board C02 (seedId('document:new-host-ip')), last saved 20/10 21:24. */
export const C02_DRAFT_ID = 'c5558d12-5814-45e0-8e97-6d23656aed6a';
/** The day of that save, a few minutes later: the save chip reads "Đã lưu 21:24" (the time alone, as on the board). */
export const C02_CLOCK = '2026-10-20T14:30:00.000Z';
