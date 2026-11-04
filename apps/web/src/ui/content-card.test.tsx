import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithI18n } from '../test/render';
import { CollectionCard, DocCard, SpaceCard } from './content-card';
import { Nebula, ParticleField, particles } from './effects';
import { Planet } from './planet';

describe('content cards and effects', () => {
  it('cards link to their content and a document card carries its origin', () => {
    renderWithI18n(
      <>
        <DocCard href="/d/dhcp" origin="community" title="Giao thức DHCP" meta="Lab" />
        <SpaceCard href="/s/networking" name="Networking" meta="8 lab" />
        <CollectionCard href="/s/networking" title="Giao thức nền tảng" />
      </>,
    );
    expect(screen.getByRole('link', { name: /Giao thức DHCP/ }).textContent).toContain('Community');
    expect(screen.getByRole('link', { name: /Networking/ }).getAttribute('href')).toBe('/s/networking');
    expect(screen.getByRole('link', { name: /Giao thức nền tảng/ })).toBeTruthy();
  });

  it('planets and effects are decorative', () => {
    const { container } = renderWithI18n(
      <>
        <Planet size={44} tone="cyan" />
        <Nebula />
        <ParticleField count={5} />
      </>,
    );
    expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(3);
    expect(container.querySelectorAll('.kf-particles span')).toHaveLength(5);
    expect(particles(2)).toEqual([
      { x: 0, y: 11, r: 3, delay: 0 },
      { x: 37, y: 64, r: 2, delay: 0.4 },
    ]);
  });
});
