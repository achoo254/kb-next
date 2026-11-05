/**
 * The journey screens' logic, free of React: the builder's state (C07: steps added, moved, changed, removed) and the
 * run's (Flow: which step is current, how far the account got, where each crystal sits on the path).
 */
import { type JourneyStep, MAX_STEPS, type Planet, PLANETS, type PoolDocument, STEP_MINUTES_MAX, STEP_TITLE_MAX, type StepDraft, type StepKind } from '../api/journey-api';

/** A step being edited: the draft the server gets, and a key that stays the same while the step lives on this page. */
export interface EditStep extends StepDraft {
  key: string;
}

export interface BuilderState {
  title: string;
  planet: Planet | null;
  steps: EditStep[];
}

/** The estimate a new step starts with, by kind (as the server's). */
export const DEFAULT_MINUTES: Record<StepKind, number> = { read: 5, lab: 10, quiz: 5, note: 3 };

let keys = 0;
/** A key for a step that has no server id yet. */
export function freshKey(): string {
  keys += 1;
  return `new-${keys}`;
}

/**
 * The builder's state of a journey as loaded. A step whose document the account may no longer open came without its
 * title: it reads `privateTitle` ("Tài liệu riêng tư").
 */
export function startState(journey: { title: string; planet: Planet | null; steps: readonly JourneyStep[] }, privateTitle: string): BuilderState {
  return {
    title: journey.title,
    planet: journey.planet,
    steps: journey.steps.map((s) => ({ key: s.id, id: s.id, kind: s.kind, title: s.title || privateTitle, minutes: s.minutes, documentId: s.document?.id ?? null, note: s.note })),
  };
}

/** A title cut to one step line ("Tiêu đề 1 dòng"). */
export function stepTitle(text: string): string {
  const line = text.replace(/\s+/g, ' ').trim();
  return line.length <= STEP_TITLE_MAX ? line : `${line.slice(0, STEP_TITLE_MAX - 1).trimEnd()}…`;
}

/** A step reading `doc`: a lab is done as a lab, anything else is read. */
export function stepFor(doc: Pick<PoolDocument, 'id' | 'title' | 'type'>): EditStep {
  const kind: StepKind = doc.type === 'lab' ? 'lab' : 'read';
  return { key: freshKey(), id: null, kind, title: stepTitle(doc.title), minutes: DEFAULT_MINUTES[kind], documentId: doc.id, note: null };
}

/** Adds a step for `doc` at the end, unless the journey already reads it or is full. */
export function addDocument(state: BuilderState, doc: Pick<PoolDocument, 'id' | 'title' | 'type'>): BuilderState {
  if (state.steps.length >= MAX_STEPS || state.steps.some((s) => s.documentId === doc.id)) return state;
  return { ...state, steps: [...state.steps, stepFor(doc)] };
}

/** Moves the step at `from` to `to` (both clamped to the list). */
export function moveStep(state: BuilderState, from: number, to: number): BuilderState {
  const target = Math.max(0, Math.min(state.steps.length - 1, to));
  if (from === target || from < 0 || from >= state.steps.length) return state;
  const steps = [...state.steps];
  const [moved] = steps.splice(from, 1);
  if (!moved) return state;
  steps.splice(target, 0, moved);
  return { ...state, steps };
}

export function removeStep(state: BuilderState, index: number): BuilderState {
  return { ...state, steps: state.steps.filter((_, i) => i !== index) };
}

export type StepPatch = Partial<Pick<StepDraft, 'kind' | 'title' | 'minutes' | 'documentId' | 'note'>>;

/** Changes one step; minutes stay within 1–240. */
export function updateStep(state: BuilderState, index: number, patch: StepPatch): BuilderState {
  const minutes = patch.minutes === undefined ? undefined : Math.max(1, Math.min(STEP_MINUTES_MAX, Math.round(patch.minutes)));
  return { ...state, steps: state.steps.map((s, i) => (i === index ? { ...s, ...patch, ...(minutes === undefined ? {} : { minutes }) } : s)) };
}

export function totalMinutes(steps: ReadonlyArray<Pick<StepDraft, 'minutes'>>): number {
  return steps.reduce((sum, s) => sum + s.minutes, 0);
}

/** The next cover colour ("Đổi màu bìa"): the planet colours in turn, from the default (violet). */
export function nextPlanet(planet: Planet | null): Planet {
  const index = PLANETS.indexOf(planet ?? 'violet');
  return PLANETS[(index + 1) % PLANETS.length] ?? 'violet';
}

/**
 * What the server gets: the steps without their page keys, a note step without a document. A step whose title was
 * cleared is saved as `untitled(n)` ("Bước 3"): the server needs one.
 */
export function draftOf(state: BuilderState, untitled: (n: number) => string): { title: string; planet: Planet | null; steps: StepDraft[] } {
  return {
    title: state.title.trim(),
    planet: state.planet,
    steps: state.steps.map(({ key: _key, ...step }, i) => ({ ...step, title: step.title.trim() || untitled(i + 1), documentId: step.kind === 'note' ? null : step.documentId })),
  };
}

/**
 * Gives the steps a save created their server ids: `sent` are the steps as saved, `ids` the ids the server answered
 * in the same order. Steps changed since keep their changes; removed ones stay removed.
 */
export function withSavedIds(state: BuilderState, sent: readonly EditStep[], ids: readonly string[]): BuilderState {
  const idOf = new Map(sent.map((s, i) => [s.key, ids[i] ?? null]));
  let changed = false;
  const steps = state.steps.map((s) => {
    const id = idOf.get(s.key);
    if (id === undefined || id === null || s.id === id) return s;
    changed = true;
    return { ...s, id };
  });
  return changed ? { ...state, steps } : state;
}

// ── The run (Flow) ──────────────────────────────────────────────────────────────────────────────────────────────

export type RunState = 'not-started' | 'in-progress' | 'done';

export function runState(steps: ReadonlyArray<Pick<JourneyStep, 'done'>>): RunState {
  const done = steps.filter((s) => s.done).length;
  if (steps.length > 0 && done === steps.length) return 'done';
  return done === 0 ? 'not-started' : 'in-progress';
}

/** The step to do now: the first not done; null when every step is. */
export function currentStep(steps: ReadonlyArray<Pick<JourneyStep, 'done'>>): number | null {
  const index = steps.findIndex((s) => !s.done);
  return index === -1 ? null : index;
}

/** The step after `index` still to do (wrapping round), else the next one. */
export function nextToDo(steps: ReadonlyArray<Pick<JourneyStep, 'done'>>, index: number): number {
  for (let k = 1; k <= steps.length; k += 1) {
    const i = (index + k) % steps.length;
    if (!steps[i]?.done) return i;
  }
  return Math.min(index + 1, steps.length - 1);
}

/** Board px of the run's path: the board's five crystal centres, left to right, which longer or shorter paths follow. */
const BOARD_X = [230, 480, 760, 1010, 1250] as const;
const PATH_HEIGHTS = [560, 380, 500, 330, 480] as const;
/** Closest two crystals (120 px wide) may sit; a longer journey widens the path and scrolls. */
const MIN_GAP = 130;

/** Where along the board's path a share `t` (0–1) of its width falls (piecewise between the board's centres). */
function boardX(t: number): number {
  const scaled = t * (BOARD_X.length - 1);
  const i = Math.min(BOARD_X.length - 2, Math.floor(scaled));
  const from = BOARD_X[i] ?? BOARD_X[0];
  const to = BOARD_X[i + 1] ?? from;
  return from + (to - from) * (scaled - i);
}

/** The centre of each crystal on the path (Flow): spread from left to right, up and down as on the board. */
export function stopPlaces(count: number): Array<{ x: number; y: number }> {
  if (count <= 0) return [];
  const left = BOARD_X[0];
  const span = (BOARD_X.at(-1) ?? left) - left;
  const fits = count === 1 || span / (count - 1) >= MIN_GAP;
  return Array.from({ length: count }, (_, i) => ({
    x: Math.round(count === 1 ? left : fits ? boardX(i / (count - 1)) : left + i * MIN_GAP),
    y: PATH_HEIGHTS[i % PATH_HEIGHTS.length] ?? PATH_HEIGHTS[0],
  }));
}

/** The width the path needs (the board's, or more for a long journey). */
export function pathWidth(count: number): number {
  const last = stopPlaces(count).at(-1);
  return Math.max(1440, (last?.x ?? 0) + 190);
}

/** A line between two crystals: its start, length and angle (deg). */
export function segment(a: { x: number; y: number }, b: { x: number; y: number }): { x: number; y: number; length: number; angle: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return { x: a.x, y: a.y, length: Math.sqrt(dx * dx + dy * dy), angle: (Math.atan2(dy, dx) * 180) / Math.PI };
}
