import { describe, expect, it } from 'vitest';
import { type BuilderState, addDocument, startState, currentStep, draftOf, moveStep, nextPlanet, nextToDo, pathWidth, removeStep, runState, stepTitle, stopPlaces, totalMinutes, updateStep, withSavedIds } from './journey-model';

const DOC = { id: 'arp', title: 'Giao thức ARP', type: 'lab' as const };

function state(): BuilderState {
  return {
    title: 'Máy mới vào mạng',
    planet: null,
    steps: [
      { key: 's1', id: 's1', kind: 'read', title: 'Packet Journey', minutes: 4, documentId: 'osi', note: null },
      { key: 's2', id: 's2', kind: 'lab', title: 'DHCP xin IP', minutes: 12, documentId: 'dhcp', note: null },
    ],
  };
}

describe('the builder state', () => {
  it('adds a document once, as a lab or a read, with the kind’s time and a one-line title', () => {
    const added = addDocument(state(), DOC);
    expect(added.steps.at(-1)).toMatchObject({ id: null, kind: 'lab', title: 'Giao thức ARP', minutes: 10, documentId: 'arp' });
    expect(addDocument(added, DOC)).toBe(added);
    expect(addDocument(state(), { id: 'n', title: 'Ghi chú', type: 'note' }).steps.at(-1)).toMatchObject({ kind: 'read', minutes: 5 });
    expect(stepTitle('x'.repeat(60))).toHaveLength(48);
    expect(stepTitle('  một   dòng ')).toBe('một dòng');
  });

  it('moves, changes and removes steps, minutes kept within 1–240', () => {
    const moved = moveStep(state(), 1, 0);
    expect(moved.steps.map((s) => s.key)).toEqual(['s2', 's1']);
    expect(moveStep(state(), 0, -1)).toEqual(state());
    expect(moveStep(state(), 0, 9).steps.map((s) => s.key)).toEqual(['s2', 's1']);
    expect(updateStep(state(), 0, { minutes: 0 }).steps[0]?.minutes).toBe(1);
    expect(updateStep(state(), 0, { minutes: 999 }).steps[0]?.minutes).toBe(240);
    expect(updateStep(state(), 1, { kind: 'quiz', title: 'Kiểm tra DORA' }).steps[1]).toMatchObject({ kind: 'quiz', title: 'Kiểm tra DORA', minutes: 12 });
    expect(removeStep(state(), 0).steps.map((s) => s.key)).toEqual(['s2']);
    expect(totalMinutes(state().steps)).toBe(16);
  });

  it('sends the steps without their keys, a note step without its document, a cleared title as "Step n"', () => {
    const s = updateStep(updateStep(state(), 0, { kind: 'note', note: 'Nghỉ' }), 1, { title: '   ' });
    expect(draftOf(s, (n) => `Bước ${n}`).steps).toEqual([
      { id: 's1', kind: 'note', title: 'Packet Journey', minutes: 4, documentId: null, note: 'Nghỉ' },
      { id: 's2', kind: 'lab', title: 'Bước 2', minutes: 12, documentId: 'dhcp', note: null },
    ]);
  });

  it('gives new steps the ids a save answered, keeping later changes', () => {
    const added = addDocument(state(), DOC);
    const sent = added.steps;
    const changed = updateStep(added, 2, { minutes: 3 });
    const withIds = withSavedIds(changed, sent, ['s1', 's2', 'new-id']);
    expect(withIds.steps[2]).toMatchObject({ id: 'new-id', minutes: 3 });
    expect(withSavedIds(withIds, sent, ['s1', 's2', 'new-id'])).toBe(withIds);
  });

  it('opens a step that came without its title under the private label', () => {
    const step = { id: 'x', kind: 'read' as const, title: '', restricted: true, minutes: 5, note: null, document: null, done: false };
    expect(startState({ title: 'T', planet: null, steps: [step] }, 'Private document').steps[0]).toMatchObject({ title: 'Private document', documentId: null });
  });

  it('turns the cover through the planet colours', () => {
    expect(nextPlanet(null)).toBe('teal');
    expect(nextPlanet('pink')).toBe('violet');
  });
});

describe('the run', () => {
  const steps = (done: boolean[]) => done.map((d) => ({ done: d }));

  it('says how far the account got and which step is next', () => {
    expect(runState(steps([false, false]))).toBe('not-started');
    expect(runState(steps([true, false]))).toBe('in-progress');
    expect(runState(steps([true, true]))).toBe('done');
    expect(runState([])).toBe('not-started');
    expect(currentStep(steps([true, false, false]))).toBe(1);
    expect(currentStep(steps([true, true]))).toBeNull();
    expect(nextToDo(steps([false, true, false]), 0)).toBe(2);
    expect(nextToDo(steps([false, true, true]), 2)).toBe(0);
  });

  it('lays five crystals where the board does, and widens the path for a long journey', () => {
    expect(stopPlaces(5)).toEqual([
      { x: 230, y: 560 },
      { x: 480, y: 380 },
      { x: 760, y: 500 },
      { x: 1010, y: 330 },
      { x: 1250, y: 480 },
    ]);
    expect(stopPlaces(1)).toEqual([{ x: 230, y: 560 }]);
    expect(stopPlaces(3).map((p) => p.x)).toEqual([230, 760, 1250]);
    expect(pathWidth(5)).toBe(1440);
    expect(pathWidth(12)).toBe(230 + 11 * 130 + 190);
  });
});
