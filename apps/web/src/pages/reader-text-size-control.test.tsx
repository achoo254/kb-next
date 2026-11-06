import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { answer } from '../test/api-fakes';
import { renderWithI18n } from '../test/render';
import { DEFAULT_READER_TEXT_SIZE, READER_TEXT_SIZE_KEY, applyReaderTextSize, nextReaderTextSize, readStoredReaderTextSize } from '../ui/reader-text-size';
import { ReaderTextSizeControl, keepReadingPlace } from './reader-text-size-control';

let fetchMock: ReturnType<typeof vi.fn<(path: string, init?: RequestInit) => Promise<Response>>>;

function cssSize(): string {
  return document.documentElement.style.getPropertyValue('--reader-text-size');
}

function patched(): unknown[] {
  return fetchMock.mock.calls.filter(([, init]) => init?.method === 'PATCH').map(([, init]) => JSON.parse(String(init?.body)));
}

beforeEach(() => {
  applyReaderTextSize(DEFAULT_READER_TEXT_SIZE);
  localStorage.clear();
  fetchMock = vi.fn((_path: string, _init?: RequestInit) => Promise.resolve(answer(200, {})));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('the reader text size', () => {
  it('steps through 16, 17, 18 and 20px', () => {
    expect(nextReaderTextSize(17, 1)).toBe(18);
    expect(nextReaderTextSize(18, 1)).toBe(20);
    expect(nextReaderTextSize(20, 1)).toBeNull();
    expect(nextReaderTextSize(17, -1)).toBe(16);
    expect(nextReaderTextSize(16, -1)).toBeNull();
  });

  it('reads the copy kept in this browser, the default for anything else', () => {
    localStorage.setItem(READER_TEXT_SIZE_KEY, '20');
    expect(readStoredReaderTextSize()).toBe(20);
    for (const stored of ['19', 'big', '']) {
      localStorage.setItem(READER_TEXT_SIZE_KEY, stored);
      expect(readStoredReaderTextSize()).toBe(17);
    }
  });
});

describe('ReaderTextSizeControl', () => {
  it('makes the text larger and smaller, applies it at once, keeps a copy and saves it to the account', async () => {
    renderWithI18n(<ReaderTextSizeControl />);
    const group = screen.getByRole('group', { name: 'Text size' });
    expect(group.textContent).toContain('17px');
    fireEvent.click(screen.getByRole('button', { name: 'Larger text' }));
    expect(cssSize()).toBe('18px');
    expect(localStorage.getItem(READER_TEXT_SIZE_KEY)).toBe('18');
    expect(screen.getByText('18px')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Smaller text' }));
    fireEvent.click(screen.getByRole('button', { name: 'Smaller text' }));
    expect(cssSize()).toBe('16px');
    await waitFor(() => expect(patched()).toEqual([{ readerTextSize: 18 }, { readerTextSize: 17 }, { readerTextSize: 16 }]));
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/me');
  });

  it('stops at the ends of the scale but keeps the button focusable for the keyboard', () => {
    renderWithI18n(<ReaderTextSizeControl />);
    const larger = screen.getByRole('button', { name: 'Larger text' });
    larger.focus();
    fireEvent.click(larger);
    fireEvent.click(larger);
    expect(cssSize()).toBe('20px');
    expect(larger.getAttribute('aria-disabled')).toBe('true');
    expect(document.activeElement).toBe(larger);
    fireEvent.click(larger);
    expect(cssSize()).toBe('20px');
    expect(patched()).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Smaller text' }).getAttribute('aria-disabled')).toBe('false');
  });

  it('keeps the size in this browser when the account cannot be saved', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    fetchMock.mockResolvedValue(answer(503, { error: 'unavailable' }));
    renderWithI18n(<ReaderTextSizeControl />);
    fireEvent.click(screen.getByRole('button', { name: 'Larger text' }));
    await waitFor(() => expect(error).toHaveBeenCalledWith('reader text size not saved', expect.anything()));
    expect(cssSize()).toBe('18px');
    expect(localStorage.getItem(READER_TEXT_SIZE_KEY)).toBe('18');
  });

  it('follows a size applied elsewhere (the session)', () => {
    renderWithI18n(<ReaderTextSizeControl phone />);
    act(() => applyReaderTextSize(20));
    expect(screen.getByText('20px')).toBeTruthy();
    expect(screen.getByRole('group').className).toContain('reader-text-size-phone');
  });
});

/** A passage whose top moves by `grow` once the text size changes (the text above it reflowed). */
function passage(top: number, height: number, grow: { moved: boolean; by: number }): HTMLElement {
  const element = document.createElement('section');
  element.className = 'reader-passage';
  element.getBoundingClientRect = () => {
    const at = top + (grow.moved ? grow.by : 0);
    return { top: at, bottom: at + height, left: 0, right: 0, width: 0, height, x: 0, y: at, toJSON: () => ({}) };
  };
  return element;
}

describe('keepReadingPlace', () => {
  it('scrolls the page so the passage being read stays where it was', () => {
    const grow = { moved: false, by: 0 };
    // the first passage is above the view; the second one is being read
    document.body.append(passage(-500, 300, { moved: false, by: 0 }), passage(-200, 600, grow));
    const scrollBy = vi.spyOn(window, 'scrollBy').mockImplementation(() => undefined);
    keepReadingPlace(() => {
      grow.moved = true;
      grow.by = 40;
    });
    expect(scrollBy).toHaveBeenCalledWith(0, 40);
  });

  it('scrolls the reading panel in its own (zoomed) px', () => {
    const grow = { moved: false, by: 0 };
    const panel = document.createElement('div');
    panel.style.overflowY = 'auto';
    Object.defineProperty(panel, 'scrollHeight', { value: 4000 });
    Object.defineProperty(panel, 'clientHeight', { value: 800 });
    let scrolled = 0;
    Object.defineProperty(panel, 'scrollTop', { get: () => scrolled, set: (value: number) => (scrolled = value) });
    // the board is zoomed to 0.5: 800 panel px are 400 on screen
    panel.getBoundingClientRect = () => ({ top: 100, bottom: 500, left: 0, right: 0, width: 0, height: 400, x: 0, y: 100, toJSON: () => ({}) });
    panel.append(passage(200, 300, grow));
    document.body.append(panel);
    keepReadingPlace(() => {
      grow.moved = true;
      grow.by = 30;
    });
    expect(panel.scrollTop).toBe(60);
  });

  it('just applies the change outside a document', () => {
    const change = vi.fn();
    keepReadingPlace(change);
    expect(change).toHaveBeenCalledTimes(1);
  });
});
