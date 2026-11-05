import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Journey, JourneyDraft } from '../api/journey-api';
import { answer } from '../test/api-fakes';
import { renderWithI18n } from '../test/render';
import { JourneyBuilderScreen, NewJourney } from './journey-builder';

const NET = { slug: 'networking', nameVi: 'Networking', nameEn: 'Networking', tint: '#C4B5FD', glow: '#8B5CF6' };
const OBS = { slug: 'observability', nameVi: 'Observability', nameEn: 'Observability', tint: '#86EFAC', glow: '#10B981' };
const ID = 'j1';

const docOf = (id: string, title: string, type: 'lab' | 'note' = 'lab', space = NET) => ({ id, title, type, space });

function journeyOf(patch: Partial<Journey> = {}): Journey {
  return {
    id: ID,
    title: 'Máy mới vào mạng',
    lang: 'vi',
    origin: 'own',
    status: 'draft',
    planet: null,
    rev: '2026-11-05T10:00:00.000Z',
    space: { ...NET, kind: 'public' },
    mine: true,
    editable: true,
    jev: true,
    steps: [
      { id: 's1', kind: 'read', title: 'Packet Journey', restricted: false, minutes: 4, note: null, document: { ...docOf('osi', 'Packet Journey'), summary: null }, done: false },
      { id: 's2', kind: 'lab', title: 'DHCP xin IP', restricted: false, minutes: 12, note: null, document: { ...docOf('dhcp', 'Giao thức DHCP'), summary: null }, done: false },
    ],
    ...patch,
  };
}

const POOL = [docOf('osi', 'Packet Journey'), docOf('dhcp', 'Giao thức DHCP'), docOf('arp', 'ARP'), docOf('vlogs', 'Xem log mạng', 'note', OBS)];
const NEXT = [{ ...docOf('icmp', 'Ping kiểm tra đường'), probability: 0.88 }];

interface Saved {
  body: JourneyDraft & { baseRev: string };
  keepalive: boolean;
}

let saves: Saved[];
let journey: () => Response;
let suggestions: () => Response;
let saveReply: (body: Saved['body']) => Response;
let suggestionCalls: number;

beforeEach(() => {
  saves = [];
  suggestionCalls = 0;
  journey = () => answer(200, journeyOf());
  suggestions = () => answer(200, { suggestions: NEXT });
  saveReply = (body) => answer(200, { rev: `rev-${saves.length}`, stepIds: body.steps.map((s, i) => s.id ?? `saved-${i}`) });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === `/api/journeys/${ID}/edit`) return journey();
      if (url === `/api/journeys/${ID}/pool`) return answer(200, { documents: POOL });
      if (url === `/api/journeys/${ID}/suggestions`) {
        suggestionCalls += 1;
        return suggestions();
      }
      if (url === `/api/journeys/${ID}` && init?.method === 'PUT') {
        const body = JSON.parse(String(init.body)) as Saved['body'];
        saves.push({ body, keepalive: init.keepalive === true });
        return saveReply(body);
      }
      return answer(404, { error: 'not-found' });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function stepNames(): string[] {
  return within(screen.getByRole('region', { name: 'Steps of the journey' }))
    .queryAllByRole('listitem')
    .map((li) => li.querySelector('.jb-step-name')?.textContent ?? '');
}

async function ready(): Promise<void> {
  await screen.findByRole('region', { name: 'Steps of the journey' });
}

describe('JourneyBuilderScreen (C07)', () => {
  it('shows the steps, their total, Jev’s next step and the pool, the first step open for editing', async () => {
    renderWithI18n(<JourneyBuilderScreen id={ID} />);
    await ready();
    expect(stepNames()).toEqual(['Packet Journey', 'DHCP xin IP']);
    expect(screen.getByText('2 steps · ~16 min')).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Journey name' })).toHaveProperty('value', 'Máy mới vào mạng');
    expect(await screen.findByText('After DHCP xin IP · 0.88 relevant')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add Ping kiểm tra đường' })).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Packet Journey is already in the journey' })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Add ARP to the journey' })).toHaveProperty('disabled', false);
    const editor = within(screen.getByRole('complementary', { name: 'Edit the selected step' }));
    expect(editor.getByText('Step 1')).toBeTruthy();
    expect(editor.getByRole('textbox', { name: 'One-line title' })).toHaveProperty('value', 'Packet Journey');
    expect(editor.getByRole('button', { name: 'Read' }).getAttribute('aria-pressed')).toBe('true');
    expect(editor.getByRole('combobox', { name: 'Source document' })).toHaveProperty('value', 'osi');
    expect(screen.getByRole('link', { name: /Preview/ }).getAttribute('href')).toBe('/journey/j1');
    expect(screen.getByRole('link', { name: 'Send for review' }).getAttribute('href')).toBe('/d/j1/publish');
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
  });

  it('adds a step from the pool and from Jev, autosaves after the pause, and gives new steps their ids', async () => {
    renderWithI18n(<JourneyBuilderScreen id={ID} />);
    await ready();
    fireEvent.click(await screen.findByRole('button', { name: 'Add ARP to the journey' }));
    expect(stepNames()).toEqual(['Packet Journey', 'DHCP xin IP', 'ARP']);
    expect(screen.getByText('Added step ARP.')).toBeTruthy();
    expect(within(screen.getByRole('complementary', { name: 'Edit the selected step' })).getByText('Step 3')).toBeTruthy();
    await waitFor(() => expect(saves).toHaveLength(1), { timeout: 2000 });
    expect(saves[0]?.body).toEqual({
      title: 'Máy mới vào mạng',
      planet: null,
      baseRev: '2026-11-05T10:00:00.000Z',
      steps: [
        { id: 's1', kind: 'read', title: 'Packet Journey', minutes: 4, documentId: 'osi', note: null },
        { id: 's2', kind: 'lab', title: 'DHCP xin IP', minutes: 12, documentId: 'dhcp', note: null },
        { id: null, kind: 'lab', title: 'ARP', minutes: 10, documentId: 'arp', note: null },
      ],
    });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Saved ✓' })).toBeTruthy());
    // The documents changed: Jev is asked again.
    await waitFor(() => expect(suggestionCalls).toBe(2));

    fireEvent.click(screen.getByRole('button', { name: 'Add Ping kiểm tra đường' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(saves).toHaveLength(2));
    expect(saves[1]?.body.baseRev).toBe('rev-1');
    expect(saves[1]?.body.steps.map((s) => s.id)).toEqual(['s1', 's2', 'saved-2', null]);
  });

  it('reorders by keyboard, by the arrows and by dragging; removes a step', async () => {
    renderWithI18n(<JourneyBuilderScreen id={ID} />);
    await ready();
    const first = screen.getByRole('button', { name: 'Select step 1' });
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowDown', altKey: true });
    expect(stepNames()).toEqual(['DHCP xin IP', 'Packet Journey']);
    expect(screen.getByText('Packet Journey: now step 2 of 2.')).toBeTruthy();
    await waitFor(() => expect(document.activeElement?.getAttribute('aria-label')).toBe('Select step 2'));

    fireEvent.click(screen.getByRole('button', { name: 'Up' }));
    expect(stepNames()).toEqual(['Packet Journey', 'DHCP xin IP']);

    const items = within(screen.getByRole('region', { name: 'Steps of the journey' })).getAllByRole('listitem');
    const data = { effectAllowed: '', dropEffect: '', setData: vi.fn() };
    fireEvent.dragStart(items[0] as HTMLElement, { dataTransfer: data });
    fireEvent.dragOver(items[1] as HTMLElement, { dataTransfer: data });
    fireEvent.drop(items[1] as HTMLElement, { dataTransfer: data });
    expect(stepNames()).toEqual(['DHCP xin IP', 'Packet Journey']);

    fireEvent.click(screen.getByRole('button', { name: 'Remove step' }));
    expect(stepNames()).toEqual(['DHCP xin IP']);
    expect(screen.getByText('Removed step Packet Journey.')).toBeTruthy();
    await waitFor(() => expect(saves.at(-1)?.body.steps.map((s) => s.title)).toEqual(['DHCP xin IP']), { timeout: 2000 });
  });

  it('edits the selected step: title, kind, time, a note instead of a document, and the cover colour', async () => {
    renderWithI18n(<JourneyBuilderScreen id={ID} />);
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Select step 2' }));
    const editor = within(screen.getByRole('complementary', { name: 'Edit the selected step' }));
    fireEvent.change(editor.getByRole('textbox', { name: 'One-line title' }), { target: { value: 'Kiểm tra DORA' } });
    fireEvent.click(editor.getByRole('button', { name: 'Quiz' }));
    fireEvent.click(editor.getByRole('button', { name: '1 minute more' }));
    expect(editor.getByText('13 min')).toBeTruthy();
    fireEvent.click(editor.getByRole('button', { name: 'Note' }));
    fireEvent.change(editor.getByRole('textbox', { name: 'Note' }), { target: { value: 'Ôn lại 4 bước.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Change cover colour' }));
    expect(document.querySelector('[data-id="journey-story"]')?.getAttribute('data-planet')).toBe('teal');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(saves).toHaveLength(1));
    expect(saves[0]?.body.planet).toBe('teal');
    expect(saves[0]?.body.steps[1]).toEqual({ id: 's2', kind: 'note', title: 'Kiểm tra DORA', minutes: 13, documentId: null, note: 'Ôn lại 4 bước.' });
  });

  it('shows the empty journey, and hides Jev when the server has none', async () => {
    journey = () => answer(200, journeyOf({ steps: [], jev: false }));
    renderWithI18n(<JourneyBuilderScreen id={ID} />);
    expect(await screen.findByText('No steps yet')).toBeTruthy();
    expect(screen.getByText('Pick a document on the left or take a suggestion from Jev.')).toBeTruthy();
    expect(screen.getByText('Select a step to edit it.')).toBeTruthy();
    expect(screen.queryByText('Jev suggests the next step')).toBeNull();
    expect(suggestionCalls).toBe(0);
  });

  it('says when Jev cannot suggest, and asks again', async () => {
    suggestions = () => answer(502, { error: 'jev-failed' });
    renderWithI18n(<JourneyBuilderScreen id={ID} />);
    const retry = await screen.findByRole('button', { name: 'Try again' });
    expect(screen.getByText(/Jev could not suggest anything/)).toBeTruthy();
    suggestions = () => answer(200, { suggestions: NEXT });
    fireEvent.click(retry);
    expect(await screen.findByRole('button', { name: 'Add Ping kiểm tra đường' })).toBeTruthy();
  });

  it('stops autosaving when another tab saved, and says so', async () => {
    saveReply = () => answer(409, { error: 'stale', rev: 'other' });
    renderWithI18n(<JourneyBuilderScreen id={ID} />);
    await ready();
    fireEvent.change(screen.getByRole('textbox', { name: 'Journey name' }), { target: { value: 'Tên mới' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('This journey was just saved in another tab. Reload the page to keep editing.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Changed in another tab' })).toHaveProperty('disabled', true);
  });

  it('opens a locked journey as locked, and a missing one as not found', async () => {
    journey = () => answer(403, { error: 'locked' });
    const { unmount } = renderWithI18n(<JourneyBuilderScreen id={ID} />);
    expect(await screen.findByText('This journey is waiting for review or published')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'View the journey' }).getAttribute('href')).toBe('/journey/j1');
    unmount();
    journey = () => answer(404, { error: 'not-found' });
    renderWithI18n(<JourneyBuilderScreen id={ID} />);
    await waitFor(() => expect(document.querySelector('[data-id="journey-builder"]')?.getAttribute('data-state')).toBe('not-found'));
  });
});

describe('NewJourney', () => {
  it('creates a draft journey and replaces itself with its builder', async () => {
    const replace = vi.fn();
    vi.stubGlobal('location', { ...window.location, replace, pathname: '/journey/new', search: '' });
    let attempt = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input) !== '/api/journeys') return answer(404, {});
        attempt += 1;
        return attempt === 1 ? answer(500, { error: 'internal' }) : answer(201, { id: 'new-j' });
      }),
    );
    renderWithI18n(<NewJourney />);
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    await act(async () => {
      await Promise.resolve();
    });
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/journey/new-j/edit'));
  });
});
