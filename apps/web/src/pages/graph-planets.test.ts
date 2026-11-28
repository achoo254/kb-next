import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ICE_PLANET, hueOf, planetForColour } from './graph-planets';

describe('graph planets', () => {
  it('reads the hue and chroma of a #rrggbb colour', () => {
    expect(hueOf('#DC2626')?.hue).toBeCloseTo(0, 0);
    expect(hueOf('#84CC16')?.hue).toBeCloseTo(84, 0);
    expect(hueOf('#ffffff')?.chroma).toBe(0);
    expect(hueOf('violet')).toBeNull();
  });

  it("gives each Space's glow the planet of the nearest colour", () => {
    expect(planetForColour('#8B5CF6')).toBe('/art/planet-violet.webp'); // Networking
    expect(planetForColour('#3B82F6')).toBe('/art/planet-blue.webp'); // Kubernetes
    expect(planetForColour('#84CC16')).toBe('/art/planet-lime.webp'); // Web & API
    expect(planetForColour('#DC2626')).toBe('/art/planet-crimson.webp'); // Email
    expect(planetForColour('#4F46E5')).toBe('/art/planet-indigo.webp'); // Law & standards
    expect(planetForColour('#E879F9')).toBe('/art/planet-magenta.webp'); // CI/CD
    expect(planetForColour('#F97316')).toBe('/art/planet-ember.webp'); // Cloud
  });

  it('draws a pale or unknown colour as the ice planet', () => {
    expect(planetForColour('#F5F3FF')).toBe(ICE_PLANET);
    expect(planetForColour(undefined)).toBe(ICE_PLANET);
  });

  it('has every planet it offers in public/art', () => {
    const publicDir = path.resolve(import.meta.dirname, '../../public');
    for (const glow of ['#DC2626', '#EA580C', '#F59E0B', '#84CC16', '#10B981', '#06B6D4', '#2563EB', '#4F46E5', '#8B5CF6', '#D946EF', '#F472B6', '#F5F3FF']) {
      const art = planetForColour(glow);
      expect(existsSync(path.join(publicDir, art)), art).toBe(true);
    }
  });
});
