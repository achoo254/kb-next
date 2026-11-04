import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { listSpaces } from '../access/content';
import { GUEST } from '../access/viewer';
import { createDocument, createUser } from '../../test/content-fixtures';
import { type FakeIdp, startFakeIdp } from '../../test/fake-idp';
import { api, signIn } from '../../test/sign-in';
import { type TestServer, startTestServer } from '../../test/test-server';
import type { SpaceListItem } from '../api/content-routes';
import { type DbHandle, openPglite } from '../db/client';
import { seedDatabase, seedId } from '../db/seed-database';
import type { JevChoiceQuestion, JevChoiceResult, JevJudge } from '../jev/jev-client';
import { seedMockCaptions } from './seed-captions';
import { type CaptionInput, MAX_CAPTION_CHARS, SpaceCaptions, captionCandidates, captionInputsFor, captionSignature, fallbackCaption } from './space-captions';

const space = (over: Partial<CaptionInput['space']> = {}): CaptionInput['space'] => ({
  id: seedId('space:test'),
  kind: 'public',
  nameVi: 'Networking',
  nameEn: 'Networking',
  unitVi: 'lab',
  unitEn: 'labs',
  ...over,
});

/** A Jev stand-in that picks, for every question, the option `pick` names (default: the first). */
function fakeJev(pick: (options: string[]) => string = (options) => options[0] ?? ''): JevJudge & { calls: Array<Record<string, JevChoiceQuestion>> } {
  const calls: Array<Record<string, JevChoiceQuestion>> = [];
  return {
    calls,
    choose: vi.fn((_purpose: string, _state: unknown, questions: Record<string, JevChoiceQuestion>): Promise<JevChoiceResult> => {
      calls.push(questions);
      const answers = Object.fromEntries(Object.entries(questions).map(([id, q]) => [id, { choice: pick(Object.keys(q.criteria)), confidence: 0.9 }]));
      return Promise.resolve({ answers, usage: { inputTokens: 120 * Object.keys(questions).length, outputTokens: 0 } });
    }),
  };
}

describe('caption candidates', () => {
  it('offers the counts of C09 in both languages, short enough for a crystal', () => {
    const net = captionCandidates({ space: space(), counts: { lab: 8, note: 4, journey: 1 } });
    expect(net).toEqual([
      { vi: '8 lab', en: '8 labs' },
      { vi: '8 lab · 4 ghi chú', en: '8 labs · 4 notes' },
      { vi: '13 bài', en: '13 docs' },
      { vi: '4 ghi chú', en: '4 notes' },
    ]);
    const weekly = captionCandidates({ space: space({ unitVi: 'tuần', unitEn: 'weeks' }), counts: { note: 5 } });
    expect(weekly).toEqual([
      { vi: '5 tuần', en: '5 weeks' },
      { vi: '5 ghi chú', en: '5 notes' },
      { vi: '5 bài', en: '5 docs' },
    ]);
    const personal = captionCandidates({ space: space({ kind: 'personal', unitVi: 'tệp', unitEn: 'files' }), counts: { office: 3 } });
    expect(personal).toEqual([
      { vi: '3 tệp · riêng tư', en: '3 files · private' },
      { vi: '3 tệp', en: '3 files' },
      { vi: '3 bài', en: '3 docs' },
    ]);
    // One of a unit drops the English plural.
    expect(captionCandidates({ space: space({ unitVi: 'phần', unitEn: 'parts' }), counts: { lab: 1 } })[0]).toEqual({ vi: '1 phần', en: '1 part' });
  });

  it('keeps 2 to 5 candidates within the length limit, and only the plain count for an empty Space', () => {
    const many = captionCandidates({ space: space({ kind: 'personal', unitVi: 'bài tập', unitEn: 'exercises' }), counts: { process: 120, web: 99, lab: 3 } });
    expect(many.length).toBeGreaterThanOrEqual(2);
    expect(many.length).toBeLessThanOrEqual(5);
    for (const c of many) {
      expect([...c.vi].length).toBeLessThanOrEqual(MAX_CAPTION_CHARS);
      expect([...c.en].length).toBeLessThanOrEqual(MAX_CAPTION_CHARS);
    }
    expect(captionCandidates({ space: space(), counts: {} })).toEqual([fallbackCaption(0)]);
  });

  it('changes signature when the counts change, not otherwise', () => {
    const input = { space: space(), counts: { lab: 8 } };
    const same = captionSignature(input, captionCandidates(input));
    expect(captionSignature(input, captionCandidates({ ...input, counts: { lab: 8 } }))).toBe(same);
    expect(captionSignature(input, captionCandidates({ ...input, counts: { lab: 9 } }))).not.toBe(same);
  });
});

describe('captions chosen by Jev', () => {
  let database: DbHandle;
  const net: CaptionInput = { space: { ...space(), id: seedId('space:net') }, counts: { lab: 8, note: 4 } };
  const linux: CaptionInput = { space: { ...space({ unitVi: 'bài tập', unitEn: 'exercises' }), id: seedId('space:lnx'), nameVi: 'Linux', nameEn: 'Linux' }, counts: { lab: 3 } };

  beforeAll(async () => {
    database = await openPglite();
    await seedDatabase(database.db, 'seed-owner');
  });
  afterAll(async () => {
    await database.close();
  });

  it('asks once per counts signature, in one request for all Spaces, and keeps the choice', async () => {
    const jev = fakeJev();
    const captions = new SpaceCaptions(database.db, jev);
    const first = await captions.captionsFor([net, linux]);
    expect(first.get(net.space.id)).toEqual({ vi: '8 lab', en: '8 labs' });
    expect(first.get(linux.space.id)).toEqual({ vi: '3 bài tập', en: '3 exercises' });
    expect(jev.calls).toHaveLength(1);
    expect(Object.values(jev.calls[0] ?? {}).map((q) => Object.keys(q.criteria))).toEqual([
      ['8 lab', '8 lab · 4 ghi chú', '12 bài', '4 ghi chú'],
      ['3 bài tập', '3 lab', '3 bài'],
    ]);

    // Another page view, even from a fresh process: the stored choice.
    expect(await new SpaceCaptions(database.db, jev).captionsFor([net, linux])).toEqual(first);
    expect(jev.calls).toHaveLength(1);

    // Linux gains an exercise: only Linux is asked again.
    await captions.captionsFor([net, { ...linux, counts: { lab: 4 } }]);
    expect(jev.calls).toHaveLength(2);
    expect(Object.keys(jev.calls[1] ?? {})).toHaveLength(1);
  });

  it('shares one call between page views at the same time', async () => {
    const jev = fakeJev();
    const captions = new SpaceCaptions(database.db, jev);
    const docker: CaptionInput = { space: { ...space({ unitVi: 'phần', unitEn: 'parts' }), id: seedId('space:dkr') }, counts: { lab: 3 } };
    await Promise.all([captions.captionsFor([docker]), captions.captionsFor([docker])]);
    expect(jev.calls).toHaveLength(1);
  });

  it('falls back to the plain count without a key, on a failure or an answer outside the options', async () => {
    const weekly: CaptionInput = { space: { ...space({ unitVi: 'tuần', unitEn: 'weeks' }), id: seedId('space:wk') }, counts: { note: 5 } };
    expect((await new SpaceCaptions(database.db, null).captionsFor([weekly])).get(weekly.space.id)).toEqual({ vi: '5 bài', en: '5 docs' });

    let clock = new Date('2026-11-04T08:00:00Z');
    const failing: JevJudge = { choose: vi.fn(() => Promise.reject(new Error('Jev space-caption failed: TimeoutError'))) };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const captions = new SpaceCaptions(database.db, failing, () => clock);
      expect((await captions.captionsFor([weekly])).get(weekly.space.id)).toEqual({ vi: '5 bài', en: '5 docs' });
      // A failure is not retried on every page view…
      await captions.captionsFor([weekly]);
      expect(failing.choose).toHaveBeenCalledTimes(1);
      // …only after an hour.
      clock = new Date(clock.getTime() + 61 * 60 * 1000);
      const answering = fakeJev((options) => options[1] ?? '');
      expect((await new SpaceCaptions(database.db, answering, () => clock).captionsFor([weekly])).get(weekly.space.id)).toEqual({ vi: '5 ghi chú', en: '5 notes' });
    } finally {
      warn.mockRestore();
    }

    const obs: CaptionInput = { space: { ...space(), id: seedId('space:obs') }, counts: { lab: 1, note: 1 } };
    const offList = fakeJev(() => 'something else');
    expect((await new SpaceCaptions(database.db, offList).captionsFor([obs])).get(obs.space.id)).toEqual({ vi: '2 bài', en: '2 docs' });
  });

  it('does not ask about a Space with one possible caption', async () => {
    const jev = fakeJev();
    const empty: CaptionInput = { space: { ...space(), id: seedId('space:k8s') }, counts: {} };
    expect((await new SpaceCaptions(database.db, jev).captionsFor([empty])).get(empty.space.id)).toEqual({ vi: '0 bài', en: '0 docs' });
    expect(jev.calls).toHaveLength(0);
  });
});

describe('GET /api/spaces with Jev', () => {
  let server: TestServer;
  const jev = fakeJev();

  beforeAll(async () => {
    server = await startTestServer({}, {}, () => new Date(), jev);
    await seedDatabase(server.database.db, 'seed-owner');
  });
  afterAll(async () => {
    await server.close();
  });

  const captions = async (): Promise<Record<string, string>> => {
    const body = (await (await fetch(`${server.origin}/api/spaces`)).json()) as { spaces: SpaceListItem[] };
    return Object.fromEntries(body.spaces.map((s) => [s.slug, s.caption.vi]));
  };

  it('shows Jev’s choices, asking again only when a Space’s counts change', async () => {
    expect(await captions()).toEqual({
      networking: '8 lab',
      kubernetes: '2 bài',
      linux: '3 bài tập',
      observability: '1 lab',
      docker: '3 phần',
      weekly: '5 tuần',
    });
    expect(await captions()).toMatchObject({ networking: '8 lab' });
    expect(jev.calls).toHaveLength(1);

    await createDocument(server.database.db, { spaceId: seedId('space:obs'), authorId: await createUser(server.database.db), type: 'lab' });
    expect(await captions()).toMatchObject({ observability: '2 lab' });
    expect(jev.calls).toHaveLength(2);
    expect(Object.keys(jev.calls[1] ?? {})).toHaveLength(1);
  });
});

describe('board captions seeded for E2E (KB_SEED=mock)', () => {
  let idp: FakeIdp;
  let server: TestServer;
  let owner: string;
  const SECRET = 'test-secret-'.padEnd(40, 'x');
  const BOARD = { networking: '8 lab', kubernetes: '2 bài', linux: '3 bài tập', observability: '1 lab', docker: '3 phần', weekly: '5 tuần' };

  beforeAll(async () => {
    idp = await startFakeIdp({ clientId: 'kb-web', clientSecret: SECRET, sub: 'e2e-account' });
    server = await startTestServer({ AUTH_ISSUER: idp.issuer, AUTH_CLIENT_SECRET: SECRET });
    const { ownerId } = await seedDatabase(server.database.db, 'e2e-account');
    expect(await seedMockCaptions(server.database.db, server.config.adminSubs, ownerId)).toBe(13);
    owner = await signIn(server);
  });
  afterAll(async () => {
    await server.close();
    await idp.close();
  });

  const captionsAs = async (cookie?: string): Promise<Record<string, string>> => {
    const res = await api(server, '/api/spaces', cookie ? { cookie } : {});
    const body = (await res.json()) as { spaces: SpaceListItem[] };
    return Object.fromEntries(body.spaces.map((s) => [s.kind === 'personal' ? 'personal' : s.slug, s.caption.vi]));
  };

  it('shows the board’s captions to the seed’s owner and to a guest, without a key', async () => {
    expect(await captionsAs(owner)).toEqual({ ...BOARD, personal: '3 tệp · riêng tư' });
    expect(await captionsAs()).toEqual(BOARD);
  });

  it('are read like Jev’s choices: a key does not ask Jev again for those counts', async () => {
    const jev = fakeJev();
    const captions = new SpaceCaptions(server.database.db, jev);
    const inputs = await captionInputsFor(server.database.db, GUEST, await listSpaces(server.database.db, GUEST));
    const chosen = await captions.captionsFor(inputs);
    expect(chosen.get(seedId('space:net'))).toEqual({ vi: '8 lab', en: '8 labs' });
    expect(jev.calls).toHaveLength(0);
  });
});
