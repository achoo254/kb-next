import { screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { answer } from '../test/api-fakes';
import { renderWithI18n } from '../test/render';
import { NewNote, newNoteRequest } from './new-note';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('newNoteRequest', () => {
  it('reads where the note goes and its kind from the query', () => {
    expect(newNoteRequest('')).toEqual({ type: 'note' });
    expect(newNoteRequest('?space=networking&collection=c1&type=process')).toEqual({ type: 'process', space: 'networking', collection: 'c1' });
    expect(newNoteRequest('?type=lab')).toEqual({ type: 'note' });
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
});
