import { act, fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithI18n } from '../test/render';
import { CreatePhone, bloomPlace } from './create-phone';

describe('bloomPlace', () => {
  it('lays the five crystals on the board arc', () => {
    expect(bloomPlace(200)).toEqual({ x: 22, y: 636 });
    expect(bloomPlace(270)).toEqual({ x: 163, y: 513 });
    expect(bloomPlace(340)).toEqual({ x: 304, y: 636 });
  });
});

describe('CreatePhone', () => {
  it('links what a phone can create, turns "+" into "×", and says a phone has no Canvas', () => {
    renderWithI18n(<CreatePhone />);
    expect(screen.getByRole('link', { name: 'Note' }).getAttribute('href')).toBe('/new');
    expect(screen.getByRole('link', { name: 'Upload Office' }).getAttribute('href')).toBe('/upload');
    expect(screen.getByRole('link', { name: 'Path' }).getAttribute('href')).toBe('/journey/new');
    expect(screen.getByRole('link', { name: 'Close' }).getAttribute('href')).toBe('/u');
    const canvas = screen.getByRole('button', { name: 'Canvas' });
    expect(canvas.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(canvas);
    expect(screen.getByRole('status').textContent).toBe('Canvas is on desktop and tablet only.');
  });

  it('opens the templates in a sheet, each a link creating its draft; the sheet closes by its handle or Escape', async () => {
    renderWithI18n(<CreatePhone />);
    const open = screen.getByRole('button', { name: 'From a template' });
    open.focus();
    fireEvent.click(open);
    const sheet = screen.getByRole('dialog', { name: 'Pick a template' });
    expect(open.getAttribute('aria-expanded')).toBe('true');
    expect(within(sheet).getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual([
      '/new?template=lab',
      '/new?template=meeting',
      '/new?template=runbook',
      '/new?template=exercise',
      '/new?template=compare',
    ]);
    expect(within(sheet).getByRole('link', { name: 'Create from the Incident runbook template' })).toBeTruthy();
    expect(document.activeElement).toBe(sheet);
    await act(async () => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(open);
    fireEvent.click(open);
    fireEvent.click(within(screen.getByRole('dialog')).getAllByRole('button', { name: 'Close' })[0] ?? document.body);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
