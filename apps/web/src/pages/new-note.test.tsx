import { screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { answer } from '../test/api-fakes';
import { renderWithI18n } from '../test/render';
import { findTemplate } from './create-templates';
import { NewNote, newNoteRequest } from './new-note';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('newNoteRequest', () => {
  it('reads where the note goes and its kind from the query', () => {
    expect(newNoteRequest('', 'vi')).toEqual({ type: 'note' });
    expect(newNoteRequest('?space=networking&collection=c1&type=process', 'vi')).toEqual({ type: 'process', space: 'networking', collection: 'c1' });
    expect(newNoteRequest('?type=lab', 'vi')).toEqual({ type: 'note' });
  });

  it('starts from a template in the reader’s language; an unknown template is a plain note', () => {
    const lab = findTemplate('lab');
    expect(newNoteRequest('?template=lab', 'vi')).toEqual({ type: 'note', title: 'Lab: [chủ đề]', body: lab?.text.vi.body, lang: 'vi', planet: 'violet' });
    expect(newNoteRequest('?template=runbook', 'en')).toMatchObject({ type: 'process', title: 'Runbook: [incident]', lang: 'en', planet: 'amber' });
    expect(newNoteRequest('?template=nope', 'en')).toEqual({ type: 'note' });
  });
});

describe('NewNote', () => {
  it('creates one note per visit, and offers to try again when it fails', async () => {
    const fetchMock = vi.fn(async () => answer(500, { error: 'internal' }));
    vi.stubGlobal('fetch', fetchMock);
    window.history.replaceState(null, '', '/new');
    renderWithI18n(<NewNote />);
    expect(await screen.findByText('Could not create the note.')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/documents', expect.objectContaining({ method: 'POST', body: JSON.stringify({ type: 'note' }) }));
    screen.getByRole('button', { name: 'Retry' }).click();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it('creates the draft from a template in the personal Space and replaces itself with its editor', async () => {
    const replace = vi.fn();
    vi.stubGlobal('location', { ...window.location, replace, pathname: '/new', search: '?template=meeting' });
    const fetchMock = vi.fn(async (_path: string, init?: RequestInit) => {
      const body: unknown = JSON.parse(typeof init?.body === 'string' ? init.body : '{}');
      return answer(201, {
        id: 'doc-9',
        ...(typeof body === 'object' && body !== null ? body : {}),
        origin: 'own',
        status: 'draft',
        rev: '2026-11-06T09:00:00.000Z',
        version: 1,
        savedAt: '2026-11-06T09:00:00.000Z',
        space: { slug: 'personal-me', nameVi: 'Vũ trụ của bạn', nameEn: 'Your universe', tint: '#F9A8D4', glow: '#EC4899', kind: 'personal' },
        collection: null,
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    renderWithI18n(<NewNote />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/d/doc-9/edit'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const sent: unknown = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    // jsdom reads English; no Space in the query, so the server puts the draft in the personal Space
    expect(sent).toEqual({ type: 'note', title: 'Meeting: [topic] · [date]', body: findTemplate('meeting')?.text.en.body, lang: 'en', planet: 'cyan' });
  });
});
