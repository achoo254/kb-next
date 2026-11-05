import { fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SpaceDetail } from '../api/content-api';
import { renderWithI18n } from '../test/render';
import { UniversePhone, placePhonePlanets, tallySpace } from './universe-phone';
import { BOARD_SPACES, doc, space } from './universe-test-data';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function detailOf(slug: string, documents: SpaceDetail['uncollected']): SpaceDetail {
  const base = BOARD_SPACES.find((entry) => entry.slug === slug) ?? space(slug);
  return {
    space: { ...base, descriptionVi: `Mô tả ${slug}`, descriptionEn: `About ${slug}` },
    members: [],
    permissions: { canCreate: false, canReview: false, canAdmin: false },
    collections: [],
    uncollected: documents,
    related: [],
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('placePhonePlanets', () => {
  it('puts the six kinds of the board on their places and leaves a seventh Space off the compact orbit', () => {
    const planets = placePhonePlanets(BOARD_SPACES);
    expect(planets).toHaveLength(6);
    expect(planets.map((planet) => planet.kind)).toEqual(['observability', 'kubernetes', 'docker', 'personal', 'linux', 'networking']);
    expect(planets.find((planet) => planet.kind === 'networking')).toMatchObject({ x: 72, y: 177, d: 76 });
    expect(planets.some((planet) => planet.space.slug === 'weekly')).toBe(false);
  });

  it('gives a free place to a Space of another kind', () => {
    const planets = placePhonePlanets([space('networking'), space('weekly'), space('security', { art: '/art/x.webp' })]);
    expect(planets).toHaveLength(3);
    expect(new Set(planets.map((planet) => `${planet.x},${planet.y}`)).size).toBe(3);
  });
});

describe('tallySpace', () => {
  it('counts the texts by origin, pending ones apart', () => {
    const tally = tallySpace({
      collections: [],
      uncollected: [doc('a'), doc('b'), doc('c', { origin: 'community' }), doc('d', { origin: 'own', status: 'private' }), doc('e', { origin: 'community', status: 'pending' })],
    });
    expect(tally).toMatchObject({ official: 2, community: 1, own: 1, pending: 1 });
    expect(tally.documents).toHaveLength(5);
  });
});

describe('UniversePhone', () => {
  it('opens on Networking with its sheet, and a tapped planet brings its own Space up', async () => {
    const fetch = vi.fn(async (url: string) => {
      if (url.startsWith('/api/spaces/networking')) return json(detailOf('networking', [doc('dhcp', { title: 'Giao thức DHCP' }), doc('j', { type: 'journey', title: 'Máy mới vào mạng' })]));
      if (url.startsWith('/api/spaces/docker')) return json(detailOf('docker', [doc('basics', { title: 'Docker cơ bản', origin: 'community' })]));
      return json({ error: 'not-found' }, 404);
    });
    vi.stubGlobal('fetch', fetch);
    renderWithI18n(<UniversePhone data={{ status: 'ready', spaces: BOARD_SPACES, recent: [] }} online onRetry={() => undefined} />);
    expect(document.querySelector('[data-screen="Mobile"]')).not.toBeNull();
    await screen.findByRole('link', { name: 'Giao thức DHCP' });
    expect(screen.getByRole('heading', { name: 'Networking' })).toBeTruthy();
    expect(screen.getByText('2 official')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'See the path' }).getAttribute('href')).toBe('/journey/j');
    expect(screen.getByRole('link', { name: 'Ask AI' }).getAttribute('href')).toContain('scope=space%3Anetworking');

    fireEvent.click(screen.getByRole('button', { name: 'docker, 2 texts' }));
    await screen.findByRole('link', { name: 'Docker cơ bản' });
    expect(screen.getByText('1 community')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'See the path' })).toBeNull();

    const handle = screen.getByRole('button', { name: 'Expand' });
    fireEvent.click(handle);
    expect(document.querySelector('.phone-sheet-open')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Collapse' })).toBeTruthy();
  });

  it('offers to try again when the Universe did not load', () => {
    const retry = vi.fn();
    renderWithI18n(<UniversePhone data={{ status: 'failed' }} online onRetry={retry} />);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledOnce();
  });
});
