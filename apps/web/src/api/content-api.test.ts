import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, BAD_RESPONSE, NETWORK_ERROR } from './api-client';
import { completeOnboarding, fetchComments, fetchDocument, fetchMe, fetchRecent, fetchSpace, fetchSpaces, postComment, readErrorOf, saveReadingProgress, updateMe } from './content-api';

const ME = {
  name: 'Đạt',
  email: 'dat@example.com',
  picture: null,
  lang: 'vi',
  theme: 'system',
  role: 'member',
  isAdmin: false,
  onboardedAt: null,
  interests: [],
};

const SUMMARY = {
  id: '6f1c3c9e-0d5e-4c1e-8a7f-1d2e3f4a5b6c',
  title: 'Giao thức DHCP',
  type: 'lab',
  origin: 'official',
  status: 'approved',
  lang: 'vi',
  aiTranslated: false,
  updatedAt: '2026-11-03T14:05:00.000Z',
  authorName: 'Đạt',
  translations: ['vi', 'en'],
  collectionId: null,
  space: { slug: 'networking', nameVi: 'Networking', nameEn: 'Networking', tint: '#C4B5FD', glow: '#8B5CF6' },
  readProgress: 72,
};

function answer(status: number, body: unknown): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn((_path: string, _init?: RequestInit) => Promise.resolve(Response.json(body, { status })));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('content API client', () => {
  it('reads the account and sends settings and onboarding as JSON', async () => {
    const fetchMock = answer(200, ME);
    expect(await fetchMe()).toEqual(ME);
    await updateMe({ theme: 'dark' });
    await completeOnboarding({ lang: 'en', interests: ['networking'] });
    expect(fetchMock.mock.calls.map(([path, init]) => [path, init?.method ?? 'GET', init?.body ?? null])).toEqual([
      ['/api/me', 'GET', null],
      ['/api/me', 'PATCH', '{"theme":"dark"}'],
      ['/api/me/onboarding', 'POST', '{"lang":"en","interests":["networking"]}'],
    ]);
  });

  it('asks for texts in a language only when one is given', async () => {
    const fetchMock = answer(200, { documents: [SUMMARY] });
    expect(await fetchRecent()).toEqual([SUMMARY]);
    await fetchRecent('en');
    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual(['/api/recent', '/api/recent?lang=en']);
  });

  it('escapes the slug and id in the path', async () => {
    const fetchMock = answer(404, { error: 'not-found' });
    await expect(fetchSpace('a/b')).rejects.toBeInstanceOf(ApiError);
    await expect(fetchDocument('x?y', 'vi')).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual(['/api/spaces/a%2Fb', '/api/documents/x%3Fy?lang=vi']);
  });

  it('turns an answer that is not the documented shape into BAD_RESPONSE', async () => {
    answer(200, { spaces: [{ slug: 'networking' }] });
    await expect(fetchSpaces()).rejects.toMatchObject({ code: BAD_RESPONSE });
    answer(200, { ...ME, onboardedAt: 'yesterday' });
    await expect(fetchMe()).rejects.toMatchObject({ code: BAD_RESPONSE });
  });

  it('names the screen of a Space or document that cannot be opened', async () => {
    for (const code of ['not-found', 'no-access', 'hidden'] as const) {
      answer(code === 'not-found' ? 404 : 403, { error: code });
      const error: unknown = await fetchDocument(SUMMARY.id).catch((e: unknown) => e);
      expect(readErrorOf(error)).toBe(code);
    }
    answer(401, { error: 'sign-in-required' });
    expect(readErrorOf(await fetchMe().catch((e: unknown) => e))).toBeNull();
    expect(readErrorOf(new ApiError(0, NETWORK_ERROR))).toBeNull();
    expect(readErrorOf(new Error('no-access'))).toBeNull();
  });

  it('sends reading progress and comments to the document’s routes', async () => {
    const fetchMock = answer(200, { progress: 72, anchor: 'dora' });
    expect(await saveReadingProgress('doc-1', 72, 'dora')).toEqual({ progress: 72, anchor: 'dora' });
    answer(200, { open: true, comments: [] });
    expect(await fetchComments('doc-1')).toEqual({ open: true, comments: [] });
    const comment = {
      id: 'c1',
      anchor: null,
      body: 'Cảm ơn!',
      createdAt: '2026-11-03T12:05:00.000Z',
      updatedAt: '2026-11-03T12:05:00.000Z',
      author: { name: 'Minh', picture: null, role: 'member' },
      mine: true,
    };
    const posting = answer(201, comment);
    expect(await postComment('doc-1', 'Cảm ơn!')).toEqual(comment);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/documents/doc-1/progress');
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('PUT');
    expect(posting.mock.calls[0]?.[1]?.body).toBe('{"body":"Cảm ơn!","anchor":null}');
  });
});
