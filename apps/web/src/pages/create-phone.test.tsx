import { fireEvent, screen } from '@testing-library/react';
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
});
