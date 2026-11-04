import { describe, expect, it } from 'vitest';
import { SCENE_ORBITS } from '../layout/universe-scene';
import { FpsGuard } from './fps-guard';
import { arcTable, floatOffset, lapProgress, parseEllipse, pointAtProgress, pointOn, tintWeight } from './orbit-geometry';

/** Feeds `fps` frames per second to the guard for `ms`, starting at `from`; answers the last verdict and the time. */
function run(guard: FpsGuard, fps: number, from: number, ms: number): { verdict: 'ok' | 'low'; at: number } {
  let verdict: 'ok' | 'low' = 'ok';
  let now = from;
  for (; now <= from + ms; now += 1000 / fps) verdict = guard.frame(now);
  return { verdict, at: now };
}

describe('FpsGuard', () => {
  it('stays in 3D at 60 fps and gives up after 2 s under 30 fps', () => {
    const guard = new FpsGuard();
    expect(run(guard, 60, 0, 3000).verdict).toBe('ok');
    expect(guard.fps).toBeGreaterThan(55);
    const slow = run(guard, 20, 3000, 1500);
    expect(slow.verdict).toBe('ok');
    expect(run(guard, 20, slow.at, 800).verdict).toBe('low');
  });

  it('does not count a hidden tab (a long gap) as slow frames', () => {
    const guard = new FpsGuard();
    run(guard, 60, 0, 1000);
    expect(guard.frame(10_000)).toBe('ok');
    expect(run(guard, 60, 10_016, 3000).verdict).toBe('ok');
  });
});

describe('orbit geometry', () => {
  it('reads the 2D orbits as ellipses round the orb, starting where the SVG path starts', () => {
    const [main, tilted, wide] = SCENE_ORBITS.map((orbit) => parseEllipse(orbit.d));
    expect(main).toMatchObject({ cx: 700, cy: 335, rx: 260, ry: 200, rotation: 0 });
    expect(tilted?.cx).toBeCloseTo(700);
    expect(wide?.rotation).toBeCloseTo((19 * Math.PI) / 180);
    const start = tilted ? pointOn(tilted, 0) : { x: 0, y: 0 };
    expect(start.x).toBeCloseTo(954, 0);
    expect(start.y).toBeCloseTo(72, 0);
  });

  it('moves dots by length along the lap, with CSS delays and direction', () => {
    const table = arcTable(parseEllipse(SCENE_ORBITS[0]?.d ?? ''));
    const half = pointAtProgress(table, 0.5);
    expect(half.x).toBeCloseTo(440, 0);
    expect(lapProgress(6.5, 26, -6.5)).toBeCloseTo(0.5);
    expect(lapProgress(0, 15, -2.6, true)).toBeCloseTo(1 - 2.6 / 15);
  });

  it('floats like the 2D crystals and fades a crystal’s colour out from its centre', () => {
    expect(floatOffset(-100)).toBe(0);
    expect(floatOffset(3000)).toBeCloseTo(-10);
    expect(floatOffset(6000)).toBeCloseTo(0);
    expect(tintWeight(0, 125)).toBe(1);
    expect(tintWeight(125, 125)).toBe(0);
    expect(tintWeight(0.45 * 125, 125)).toBeCloseTo(0.85);
  });
});
