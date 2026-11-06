import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Journey, JourneyStep } from '../api/journey-api';
import { answer } from '../test/api-fakes';
import { renderWithI18n } from '../test/render';
import { JourneyRunScreen } from './journey-run';

const NET = { slug: 'networking', nameVi: 'Networking', nameEn: 'Networking', tint: '#C4B5FD', glow: '#8B5CF6' };
const ID = 'j1';

function stepOf(id: string, title: string, kind: JourneyStep['kind'], done: boolean, note: string | null, docTitle: string | null): JourneyStep {
  return { id, kind, title, restricted: false, minutes: 6, note, done, document: docTitle ? { id: `d-${id}`, title: docTitle, type: kind === 'lab' ? 'lab' : 'note', summary: `${docTitle} in one line.`, space: NET } : null };
}

function journeyOf(done: boolean[], patch: Partial<Journey> = {}): Journey {
  const steps = [
    stepOf('s1', 'Cắm mạng', 'read', false, 'Máy mới vào mạng. Chưa có IP, chưa biết ai.', 'Packet Journey'),
    stepOf('s2', 'DHCP', 'lab', false, 'Hét lên cả mạng: ai cấp IP cho mình với?', 'Giao thức DHCP'),
    stepOf('s3', 'ARP', 'lab', false, 'Hỏi: router ở địa chỉ MAC nào?', 'Giao thức ARP'),
    stepOf('s4', 'DNS', 'quiz', false, null, 'Tìm hiểu giao thức DNS'),
    stepOf('s5', 'Nghỉ', 'note', false, null, null),
  ].map((s, i) => ({ ...s, done: done[i] ?? false }));
  return {
    id: ID,
    title: 'Máy mới vào mạng',
    lang: 'vi',
    origin: 'official',
    status: 'approved',
    planet: null,
    rev: '2026-11-05T10:00:00.000Z',
    space: { ...NET, kind: 'public' },
    mine: false,
    editable: false,
    jev: false,
    steps,
    ...patch,
  };
}

let reply: () => Response;
let marks: Array<{ step: string; done: boolean }>;
let markReply: (done: boolean) => Response;
let posts: unknown[];

beforeEach(() => {
  marks = [];
  posts = [];
  reply = () => answer(200, journeyOf([true, true, false, false, false]));
  markReply = (done) => answer(200, { done });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === `/api/journeys/${ID}`) return reply();
      const mark = /^\/api\/journeys\/j1\/steps\/(\w+)\/progress$/.exec(url);
      if (mark && init?.method === 'PUT') {
        const { done } = JSON.parse(String(init.body)) as { done: boolean };
        marks.push({ step: mark[1] ?? '', done });
        return markReply(done);
      }
      if (url === '/api/journeys' && init?.method === 'POST') {
        posts.push(JSON.parse(String(init.body)));
        return answer(201, { id: 'copy' });
      }
      return answer(404, { error: 'not-found' });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function card(): ReturnType<typeof within> {
  const el = document.querySelector<HTMLElement>('[data-id="journey-card"]');
  if (!el) throw new Error('no step card');
  return within(el);
}

function runState(): string | null | undefined {
  return document.querySelector('[data-id="journey-run"]')?.getAttribute('data-state');
}

describe('JourneyRunScreen (Flow)', () => {
  it('lights the path up to the step to do, opens its card and moves on when it is done', async () => {
    renderWithI18n(<JourneyRunScreen id={ID} />);
    expect(await screen.findByRole('heading', { name: 'Máy mới vào mạng' })).toBeTruthy();
    expect(runState()).toBe('in-progress');
    expect(screen.getByText('Under way · 2/5')).toBeTruthy();
    expect(screen.getByText('5 steps · ~30 min')).toBeTruthy();
    const path = within(screen.getByRole('list', { name: 'The path through the steps' }));
    expect(path.getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['Step 1: Cắm mạng, done', 'Step 2: DHCP, done', 'Step 3: ARP', 'Step 4: DNS, not reached yet', 'Step 5: Nghỉ, not reached yet']);
    expect(path.getByRole('button', { name: 'Step 3: ARP' }).getAttribute('aria-current')).toBe('step');
    expect(card().getByText('Step 3 / 5 · ARP')).toBeTruthy();
    expect(card().getByText('Hỏi: router ở địa chỉ MAC nào?')).toBeTruthy();
    expect(card().getByRole('link', { name: 'Open the ARP lab →' }).getAttribute('href')).toBe('/d/d-s3');

    fireEvent.click(card().getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(card().getByText('Step 4 / 5 · DNS')).toBeTruthy());
    expect(marks).toEqual([{ step: 's3', done: true }]);
    expect(screen.getByText('Under way · 3/5')).toBeTruthy();
    // A quiz without a note reads its document's line.
    expect(card().getByText('Tìm hiểu giao thức DNS in one line.')).toBeTruthy();
    expect(card().getByRole('link', { name: 'Take the DNS quiz →' })).toBeTruthy();

    fireEvent.click(card().getByRole('button', { name: 'Next step' }));
    expect(card().getByText('Step 5 / 5 · Nghỉ')).toBeTruthy();
    expect(card().queryByRole('link')).toBeNull();
  });

  it('starts at the first step, and keeps a step whose document was read to the end done', async () => {
    reply = () => answer(200, journeyOf([false, false, false, false, false]));
    markReply = () => answer(200, { done: true });
    renderWithI18n(<JourneyRunScreen id={ID} />);
    expect(await screen.findByText('Not started')).toBeTruthy();
    expect(card().getByText('Step 1 / 5 · Cắm mạng')).toBeTruthy();
    expect(card().getByRole('link', { name: 'Open Packet Journey →' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Step 2: DHCP, not reached yet' }));
    fireEvent.click(card().getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.getByText('Under way · 1/5')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Step 2: DHCP, done' }));
    fireEvent.click(card().getByRole('button', { name: 'Mark as not done' }));
    expect(await screen.findByText('You read this document to the end, so this step counts as done.')).toBeTruthy();
    expect(screen.getByText('Under way · 1/5')).toBeTruthy();
  });

  it('says when the progress could not be saved, and puts the step back', async () => {
    markReply = () => answer(500, { error: 'internal' });
    renderWithI18n(<JourneyRunScreen id={ID} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Done' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Could not save your progress, try again later.');
    expect(screen.getByText('Under way · 2/5')).toBeTruthy();
    expect(card().getByText('Step 3 / 5 · ARP')).toBeTruthy();
  });

  it('names a step whose document the account may not open with a neutral label', async () => {
    const journey = journeyOf([false]);
    const hidden = { ...journey, steps: journey.steps.map((s, i) => (i === 1 ? { ...s, title: '', restricted: true, document: null } : s)) };
    reply = () => answer(200, hidden);
    renderWithI18n(<JourneyRunScreen id={ID} />);
    expect(await screen.findByRole('button', { name: 'Step 2: Private document, not reached yet' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Step 2: Private document, not reached yet' }));
    expect(card().getByText('Step 2 / 5 · Private document')).toBeTruthy();
    expect(card().queryByRole('link')).toBeNull();
  });

  it('shows a walked journey as completed', async () => {
    reply = () => answer(200, journeyOf([true, true, true, true, true]));
    renderWithI18n(<JourneyRunScreen id={ID} />);
    expect(await screen.findByText('Completed')).toBeTruthy();
    expect(runState()).toBe('done');
    expect(card().getByText('You walked the whole journey')).toBeTruthy();
    expect(card().getByText('5/5 steps done. Your progress is kept on your account.')).toBeTruthy();
  });

  it('remixes someone else’s journey into a draft of the account’s own; its author edits instead', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign, pathname: `/journey/${ID}`, search: '' });
    const { unmount } = renderWithI18n(<JourneyRunScreen id={ID} />);
    expect((await screen.findByRole('link', { name: 'Share' })).getAttribute('href')).toBe('/d/j1/share');
    fireEvent.click(screen.getByRole('button', { name: 'Remix' }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/journey/copy/edit'));
    expect(posts).toEqual([{ from: ID }]);
    unmount();

    reply = () => answer(200, journeyOf([false], { mine: true, editable: true, origin: 'own', status: 'draft' }));
    renderWithI18n(<JourneyRunScreen id={ID} />);
    expect((await screen.findByRole('link', { name: 'Edit the journey' })).getAttribute('href')).toBe('/journey/j1/edit');
    expect(screen.queryByRole('button', { name: 'Remix' })).toBeNull();
  });

  it('shows a journey without steps, and a journey that cannot be opened', async () => {
    reply = () => answer(200, journeyOf([], { steps: [], editable: true, mine: true }));
    const { unmount } = renderWithI18n(<JourneyRunScreen id={ID} />);
    expect(await screen.findByText('This journey has no steps yet')).toBeTruthy();
    expect(runState()).toBe('empty');
    unmount();
    reply = () => answer(403, { error: 'no-access' });
    renderWithI18n(<JourneyRunScreen id={ID} />);
    await waitFor(() => expect(runState()).toBe('forbidden'));
  });
});

describe('JourneyRunScreen on a phone', () => {
  beforeEach(() => {
    document.documentElement.dataset.device = 'phone';
  });
  afterEach(() => {
    delete document.documentElement.dataset.device;
  });

  it('lists the steps top to bottom with the open step’s card under its step, and moves on when it is done', async () => {
    renderWithI18n(<JourneyRunScreen id={ID} />);
    expect(await screen.findByRole('heading', { name: 'Máy mới vào mạng' })).toBeTruthy();
    expect(document.querySelector('[data-screen="Flow"]')?.closest('.phone-shell')).not.toBeNull();
    expect(screen.getByText('Under way · 2/5')).toBeTruthy();
    const path = within(screen.getByRole('list', { name: 'The path through the steps' }));
    expect(path.getAllByRole('button', { name: /^Step \d/ }).map((b) => b.getAttribute('aria-label'))).toEqual([
      'Step 1: Cắm mạng, done',
      'Step 2: DHCP, done',
      'Step 3: ARP',
      'Step 4: DNS, not reached yet',
      'Step 5: Nghỉ, not reached yet',
    ]);
    const arp = path.getByRole('button', { name: 'Step 3: ARP' });
    expect(arp.getAttribute('aria-current')).toBe('step');
    expect(arp.closest('li')?.querySelector('[data-id="journey-card"]')).not.toBeNull();
    expect(card().getByText('Hỏi: router ở địa chỉ MAC nào?')).toBeTruthy();
    expect(card().getByRole('link', { name: 'Open the ARP lab →' }).getAttribute('href')).toBe('/d/d-s3');

    fireEvent.click(card().getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(card().getByText('Step 4 / 5 · DNS')).toBeTruthy());
    expect(marks).toEqual([{ step: 's3', done: true }]);
    expect(screen.getByText('Under way · 3/5')).toBeTruthy();
    fireEvent.click(card().getByRole('button', { name: 'Next step' }));
    expect(card().getByText('Step 5 / 5 · Nghỉ')).toBeTruthy();
    fireEvent.click(path.getByRole('button', { name: 'Step 1: Cắm mạng, done' }));
    expect(card().getByRole('button', { name: 'Mark as not done' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Remix' })).toBeTruthy();
  });

  it('shows a walked journey as completed, and the states before it opens in the phone frame', async () => {
    reply = () => answer(200, journeyOf([true, true, true, true, true]));
    const { unmount } = renderWithI18n(<JourneyRunScreen id={ID} />);
    expect(await screen.findByText('You walked the whole journey')).toBeTruthy();
    expect(runState()).toBe('done');
    unmount();
    reply = () => answer(404, { error: 'not-found' });
    renderWithI18n(<JourneyRunScreen id={ID} />);
    await waitFor(() => expect(runState()).toBe('not-found'));
    expect(document.querySelector('[data-id="journey-run"]')?.closest('.phone-shell')).not.toBeNull();
  });
});
