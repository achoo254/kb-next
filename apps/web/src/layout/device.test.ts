import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { currentDevice, deviceFor, useDevice } from './device';

afterEach(() => {
  delete document.documentElement.dataset.device;
});

describe('deviceFor', () => {
  it('splits phones, tablets and desktops at 640 and 1279px', () => {
    expect(deviceFor(390)).toBe('phone');
    expect(deviceFor(640)).toBe('phone');
    expect(deviceFor(641)).toBe('tablet');
    expect(deviceFor(1180)).toBe('tablet');
    expect(deviceFor(1279)).toBe('tablet');
    expect(deviceFor(1280)).toBe('desktop');
    expect(deviceFor(1440)).toBe('desktop');
  });

  it('takes an unknown width for a desktop', () => {
    expect(deviceFor(0)).toBe('desktop');
    expect(deviceFor(Number.NaN)).toBe('desktop');
  });
});

describe('useDevice', () => {
  it('reads data-device on <html> (desktop without it) and follows its changes', async () => {
    expect(currentDevice()).toBe('desktop');
    const { result } = renderHook(() => useDevice());
    expect(result.current).toBe('desktop');
    await act(async () => {
      document.documentElement.dataset.device = 'phone';
      // the MutationObserver reports after the current task
      await Promise.resolve();
    });
    expect(result.current).toBe('phone');
    await act(async () => {
      document.documentElement.dataset.device = 'nonsense';
      await Promise.resolve();
    });
    expect(result.current).toBe('desktop');
  });
});
