import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Skeleton } from './skeleton';

describe('Skeleton', () => {
  it('holds the size of the content and stays out of the accessibility tree', () => {
    const { container } = render(<Skeleton circle width={48} height={48} tone="glow" />);
    const bone = container.querySelector<HTMLElement>('.kf-skeleton');
    expect(bone?.getAttribute('aria-hidden')).toBe('true');
    expect(bone?.style.width).toBe('48px');
    expect(bone?.style.borderRadius).toBe('50%');
    expect(bone?.dataset.tone).toBe('glow');
  });
});
