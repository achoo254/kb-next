/**
 * The answers boards F03 (Key riêng) and F04 (Dịch bằng AI) show, in the API's shape, for the parity shots. E2E runs
 * without a key secret file and without any AI provider, so the screens are held in the boards' default state:
 * F03 by answering /api/me/keys with the board's three keys (OpenAI valid ••••a1b2 and in use, no Gemini key, Claude
 * out of credit, checked at 21:10 and 20:40 on the shot's day), F04 by answering the document with the board's five
 * DHCP paragraphs and by a translation stream that stops at "Request: the device asks for" (70%) and stays open.
 */

/** The seed's "Giao thức DHCP" (KB_SEED=mock), opened on F04. */
export const F04_DOCUMENT_ID = '989fedf1-beab-4f13-894d-111654ebdc45';

/** The shot's "now" on F03: 22:00 in Saigon on 04/11/2026, the day of the board's checks. */
export const F03_CLOCK = '2026-11-04T15:00:00.000Z';

const T = '2026-11-03T14:05:00.000Z';

export const F03_KEYS = {
  available: true,
  keys: [
    { provider: 'openai', last4: 'a1b2', status: 'ok', updatedAt: '2026-11-04T14:10:00.000Z', lastCheckedAt: '2026-11-04T14:10:00.000Z' },
    { provider: 'anthropic', last4: '7c1d', status: 'quota', updatedAt: '2026-11-04T13:40:00.000Z', lastCheckedAt: '2026-11-04T13:40:00.000Z' },
  ],
  prefs: { provider: 'openai', model: 'gpt-4.1-mini' },
  active: { provider: 'openai', model: 'gpt-4.1-mini', last4: 'a1b2' },
  models: {
    openai: [
      { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini' },
      { id: 'gpt-4.1-nano', label: 'GPT-4.1 nano (rẻ hơn)' },
    ],
    gemini: [
      { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash' },
      { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite (rẻ hơn)' },
    ],
    anthropic: [
      { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5' },
      { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 (tốt hơn, đắt hơn)' },
    ],
  },
};

const PARAGRAPHS: ReadonlyArray<readonly [string, string]> = [
  ['Máy mới cắm vào mạng chưa có địa chỉ IP, nên chưa nói chuyện được với ai.', 'A new device on the network has no IP address yet, so it cannot talk to anyone.'],
  ['Discover: máy gửi broadcast tới 255.255.255.255, hỏi ai cấp được IP.', 'Discover: the device broadcasts to 255.255.255.255, asking who can give it an IP.'],
  ['Offer: DHCP server trả lời, mời một địa chỉ còn trống.', 'Offer: a DHCP server replies with a free address.'],
  ['Request: máy xin đúng địa chỉ được mời.', 'Request: the device asks for exactly that address.'],
  ['Acknowledge: server chốt, cho mượn IP trong một thời hạn (lease).', 'Acknowledge: the server confirms and lends the IP for a period (the lease).'],
];

const NET = { slug: 'networking', nameVi: 'Networking', nameEn: 'Networking', tint: '#C4B5FD', glow: '#8B5CF6' };

/** GET /api/documents/<F04_DOCUMENT_ID>: the board's DHCP text, one paragraph per line of the board. */
export const F04_DOCUMENT = {
  lang: 'vi',
  translationAvailable: true,
  document: {
    id: F04_DOCUMENT_ID,
    title: 'Giao thức DHCP',
    type: 'lab',
    origin: 'official',
    status: 'approved',
    lang: 'vi',
    aiTranslated: false,
    updatedAt: T,
    authorName: 'Đạt',
    translations: ['vi'],
    collectionId: null,
    space: { ...NET, art: '/art/crystal-networking.webp', kind: 'public' },
    readProgress: 0,
    sourceUrl: null,
    createdAt: T,
    readingMinutes: 1,
    reviewedBy: 'Linh',
    readAnchor: null,
    collection: null,
  },
  translations: [{ id: F04_DOCUMENT_ID, lang: 'vi', aiTranslated: false }],
  toc: [{ anchor: 'tong-quan', title: null, level: 2 }],
  chunks: [{ anchor: 'tong-quan', heading: null, markdown: PARAGRAPHS.map(([vi]) => vi).join('\n\n') }],
  backlinks: [],
  outgoing: [],
  related: [],
  versions: [],
};

function event(name: string, data: unknown): string {
  return `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** The translation stream up to the board's moment: the title, three paragraphs, and the fourth half written. */
export const F04_STREAM = [
  event('paragraph', { index: 0, text: '# DHCP protocol' }),
  ...PARAGRAPHS.slice(0, 3).map(([, en], i) => event('paragraph', { index: i + 1, text: en })),
  event('paragraph', { index: 4, text: 'Request: the device asks for' }),
].join('');
