import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OrbitField, supportsOffsetPath } from './orbit-field';

const ORBIT = 'M18 130 A92 60 0 1 1 202 130 A92 60 0 1 1 18 130';
const props = {
  width: 220,
  height: 260,
  orbits: [{ d: ORBIT }],
  gradientX: [18, 202] as const,
  tints: [{ cx: 180, cy: 91, space: 'networking' as const }],
  dots: [{ orbit: 0, size: 9, tone: 'sky' as const, duration: 16, delay: -2 }],
};

describe('OrbitField', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('runs the dots along the orbit when the browser supports offset-path', () => {
    vi.stubGlobal('CSS', { supports: () => true });
    expect(supportsOffsetPath()).toBe(true);
    const { container } = render(<OrbitField {...props} />);
    expect(container.firstElementChild?.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelectorAll('mask')).toHaveLength(1);
    const dot = container.querySelector<HTMLElement>('.kf-orbit-dot');
    expect(dot?.style.animationDuration).toBe('16s');
  });

  it('keeps the orbits still and leaves the dots out without offset-path', () => {
    vi.stubGlobal('CSS', { supports: () => false });
    const { container } = render(<OrbitField {...props} />);
    expect(container.querySelector('.kf-orbit-dot')).toBeNull();
    expect(container.querySelectorAll('path').length).toBeGreaterThan(0);
  });
});
