/**
 * The seeded data of boards C13 and C15 (KB_SEED=mock, apps/server/src/db/seed-data.ts) and Jev's suggestion the
 * C15 board shows (E2E has no Jev key, so the suggestion is answered here like the AI answers of ai-boards.ts).
 */

/** The seed's "Giao thức DHCP", the node picked on C13. */
export const C13_DHCP_ID = '989fedf1-beab-4f13-894d-111654ebdc45';

/** The owner's canvas "DHCP từ A đến Z" (seedId('canvas:dhcp-a-z')). */
export const C15_CANVAS_ID = '8bb6d274-c582-491b-88b0-06fdcd845e55';

/** C15: "Jev gợi ý: nối Ý tưởng ↔ Sơ đồ DORA · 0,91" (the idea card and the DORA diagram of the seed). */
export const C15_SUGGESTION = { suggestion: { from: 'idea', to: 'diag', relevance: 91 } };
