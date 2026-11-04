import { describe, expect, it, vi } from 'vitest';
import type { ChunkRow } from '../access/content';
import { JEV_MAX_CHOICE_OPTIONS, type JevJudge, type JevQuestion, type JevResult } from '../jev/jev-client';
import { MIN_RELEVANCE, chosenDocuments, searchByMeaning, type MeaningCandidate } from './meaning-search';

const candidate = (documentId: string, title: string, summary: string): MeaningCandidate => ({ documentId, title: { vi: title }, summary: { vi: summary } });
const chunk = (id: string, documentId: string, text: string): ChunkRow => ({ id, documentId, anchor: id, position: 0, heading: null, text });

/** Jev at its boundary: answers each call with what `answer` returns, recording the calls. */
function judge(answer: (purpose: string, state: unknown, questions: Record<string, JevQuestion>) => JevResult['answers']) {
  const calls: Array<{ purpose: string; state: unknown; questions: Record<string, JevQuestion> }> = [];
  const jev: JevJudge = {
    choose: vi.fn(() => Promise.reject(new Error('not used'))),
    ask: vi.fn((purpose: string, state: unknown, questions: Record<string, JevQuestion>) => {
      calls.push({ purpose, state, questions });
      return Promise.resolve({ answers: answer(purpose, state, questions), usage: { inputTokens: 100, outputTokens: 10 } });
    }),
  };
  return { jev, calls };
}

describe('search by meaning', () => {
  const docs = [candidate('dhcp', 'Giao thức DHCP', 'Máy mới xin IP qua DORA'), candidate('dns', 'DNS', 'Tên miền thành IP'), candidate('swap', 'Swap', 'Bộ nhớ ảo')];
  const passages = [chunk('c-dora', 'dhcp', 'Máy mới chưa có IP, xin IP qua 4 bước DORA'), chunk('c-lease', 'dhcp', 'Lease và gia hạn'), chunk('c-dns', 'dns', 'DNS đổi tên miền')];

  it('chooses documents, rates their passages and returns the good ones best first', async () => {
    const { jev, calls } = judge((purpose, _state, questions) => {
      if (purpose === 'search-documents') {
        return { document: { type: 'choice', choice: 'D001', confidence: 0.8, probabilities: { D001: 0.7, D002: 0.25, D003: 0.05 } }, exists: { type: 'noul', noul: 0.96 } };
      }
      const scores: Record<string, number> = { P01: 2.9, P02: 1.2, P03: 1.6 };
      return Object.fromEntries(Object.keys(questions).map((id) => [id, { type: 'score' as const, score: scores[id] ?? 0, confidence: 0.9, probabilities: {} }]));
    });
    const load = vi.fn((ids: readonly string[]) => Promise.resolve(passages.filter((p) => ids.includes(p.documentId))));
    const outcome = await searchByMeaning(jev, 'how does a computer get an IP automatically', docs, load);

    expect(calls.map((c) => c.purpose)).toEqual(['search-documents', 'search-passages']);
    // The documents are in the state under short ids; the options are those ids.
    const first = calls[0];
    expect(Object.keys((first?.state as { documents: object }).documents)).toEqual(['D001', 'D002', 'D003']);
    expect(first?.questions.document).toMatchObject({ type: 'choice', criteria: { D001: null, D002: null, D003: null } });
    // D002 (0.25) is within reach of the top one; D003 (0.05) is not.
    expect(load).toHaveBeenCalledWith(['dhcp', 'dns'], 8);
    expect(Object.values(calls[1]?.questions ?? {}).every((q) => q.type === 'score' && q.criteria.length === 4)).toBe(true);

    expect(outcome.hits.map((h) => h.chunkId)).toEqual(['c-dora', 'c-dns']);
    expect(outcome.hits[0]?.relevance).toBeCloseTo(2.9 / 3);
    expect(outcome.hits.every((h) => h.relevance >= MIN_RELEVANCE)).toBe(true);
    expect(outcome).toMatchObject({ calls: 2, usage: { inputTokens: 200, outputTokens: 20 } });
  });

  it('rates nothing when Jev says no document addresses the query', async () => {
    const { jev, calls } = judge(() => ({ document: { type: 'choice', choice: 'D003', confidence: 0.1, probabilities: { D003: 0.4 } }, exists: { type: 'noul', noul: 0.04 } }));
    const outcome = await searchByMeaning(jev, 'sao lưu etcd', docs, () => Promise.resolve(passages));
    expect(outcome.hits).toEqual([]);
    expect(calls).toHaveLength(1);
  });

  it('offers at most 255 documents and asks nothing without any', async () => {
    const many = Array.from({ length: 300 }, (_, i) => candidate(`d${i}`, `Bài ${i}`, 'Một bài mẫu'));
    const { jev, calls } = judge(() => ({ exists: { type: 'noul', noul: 0 } }));
    await searchByMeaning(jev, 'x', many, () => Promise.resolve([]));
    const criteria = calls[0]?.questions.document;
    expect(criteria?.type === 'choice' ? Object.keys(criteria.criteria) : []).toHaveLength(JEV_MAX_CHOICE_OPTIONS);
    expect((await searchByMeaning(jev, 'x', [], () => Promise.resolve([]))).calls).toBe(0);
  });

  it('passes a Jev failure on to the caller', async () => {
    const jev: JevJudge = { choose: vi.fn(), ask: vi.fn(() => Promise.reject(new Error('Jev search-documents failed: TimeoutError'))) };
    await expect(searchByMeaning(jev, 'dhcp', docs, () => Promise.resolve(passages))).rejects.toThrow(/TimeoutError/);
  });

  it('keeps the top document, then any with a real share of the probability', () => {
    const ids = new Map([
      ['D001', 'a'],
      ['D002', 'b'],
      ['D003', 'c'],
      ['D004', 'd'],
    ]);
    expect(chosenDocuments({ D001: 0.05, D002: 0.04, D003: 0.02, D004: 0.01 }, ids).map((d) => d.documentId)).toEqual(['a']);
    expect(chosenDocuments({ D001: 0.3, D002: 0.3, D003: 0.3, D004: 0.1 }, ids)).toHaveLength(3);
  });
});
