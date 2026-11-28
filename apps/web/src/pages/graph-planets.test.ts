import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { allPlanetArt, hueOf, planetColour, planetFor } from './graph-planets';

describe('graph planets', () => {
  it('reads the hue and chroma of a #rrggbb colour', () => {
    expect(hueOf('#DC2626')?.hue).toBeCloseTo(0, 0);
    expect(hueOf('#84CC16')?.hue).toBeCloseTo(84, 0);
    expect(hueOf('#ffffff')?.chroma).toBe(0);
    expect(hueOf('violet')).toBeNull();
  });

  it("gives each Space's glow the planet colour nearest it", () => {
    expect(planetColour('#8B5CF6')).toBe('violet'); // Networking
    expect(planetColour('#3B82F6')).toBe('blue'); // Kubernetes
    expect(planetColour('#84CC16')).toBe('lime'); // Web & API
    expect(planetColour('#DC2626')).toBe('crimson'); // Email
    expect(planetColour('#4F46E5')).toBe('indigo'); // Law & standards
    expect(planetColour('#E879F9')).toBe('magenta'); // CI/CD
    expect(planetColour('#F97316')).toBe('ember'); // Cloud
  });

  it('draws a pale or unknown colour as an ice planet', () => {
    expect(planetColour('#F5F3FF')).toBe('ice');
    expect(planetColour(undefined)).toBe('ice');
  });

  it('keeps a node on one planet and mixes the kinds across a Space', () => {
    expect(planetFor('#8B5CF6', 'doc-1')).toBe(planetFor('#8B5CF6', 'doc-1'));
    const kinds = new Set(Array.from({ length: 30 }, (_, i) => planetFor('#8B5CF6', `doc-${i}`)));
    expect(kinds.size).toBe(3);
    for (const art of kinds) expect(art).toMatch(/^\/art\/planet-violet(-banded|-rocky)?\.webp$/);
  });

  it('has every planet it can show in public/art', () => {
    const publicDir = path.resolve(import.meta.dirname, '../../public');
    const all = allPlanetArt();
    expect(all).toHaveLength(36);
    for (const art of all) expect(existsSync(path.join(publicDir, art)), art).toBe(true);
  });
});
