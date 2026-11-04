import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { setTheme } from './theme';
import { UniverseBackdrop } from './universe-backdrop';

describe('UniverseBackdrop', () => {
  afterEach(() => setTheme(null));

  it('shows the landscape of the theme in use and follows data-theme', async () => {
    const { container } = render(<UniverseBackdrop veil="strong">nội dung</UniverseBackdrop>);
    const img = (): HTMLImageElement | null => container.querySelector('.universe-bg img');
    expect(img()?.getAttribute('src')).toBe('/art/bg-universe-dark.webp');
    expect(container.querySelector('source')?.getAttribute('srcset')).toBe('/art/bg-universe-mobile.webp');
    expect(container.querySelector<HTMLElement>('.universe')?.dataset.veil).toBe('strong');
    // the theme is watched with a MutationObserver, which reports after a microtask
    await act(async () => setTheme('light'));
    expect(img()?.getAttribute('src')).toBe('/art/bg-universe-light.webp');
    expect(container.querySelector('source')).toBeNull();
  });

  it('draws the 46 stars of C09 unless turned off', () => {
    const { container, rerender } = render(<UniverseBackdrop />);
    expect(container.querySelectorAll('.universe-star')).toHaveLength(46);
    rerender(<UniverseBackdrop stars={false} />);
    expect(container.querySelectorAll('.universe-star')).toHaveLength(0);
  });
});
