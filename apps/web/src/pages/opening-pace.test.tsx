import { act, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/i18n';
import { renderWithI18n } from '../test/render';
import { OPENING_MIN_MS, OPENING_STEP_MS, openingEndsAt, pacedStage, resetOpeningClock, useOpeningFinished } from './opening-pace';
import { UniverseOpening } from './login-page';

function Entry({ done }: { done: boolean }): ReactNode {
  const finished = useOpeningFinished(done);
  return finished ? <p>Universe</p> : <UniverseOpening stage={done ? 'ready' : 'universe'} />;
}

const state = (step: string): string | null | undefined => document.querySelector(`[data-id="opening-step-${step}"]`)?.getAttribute('data-state');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
  resetOpeningClock();
});

afterEach(() => {
  vi.useRealTimers();
  resetOpeningClock();
  delete document.documentElement.dataset.motion;
});

describe('the pace of the opening card', () => {
  it('shows at most one more step per beat, and follows the work as it goes with reduced motion', () => {
    expect(pacedStage('ready', 0, false)).toBe('auth');
    expect(pacedStage('ready', OPENING_STEP_MS, false)).toBe('universe');
    expect(pacedStage('ready', 2 * OPENING_STEP_MS, false)).toBe('ready');
    expect(pacedStage('universe', 5000, false)).toBe('universe');
    expect(pacedStage('ready', 0, true)).toBe('ready');
  });

  it('ends after the minimum time for quick work, a beat after "Sẵn sàng" for slow work, never later', () => {
    expect(openingEndsAt(100, false)).toBe(OPENING_MIN_MS);
    expect(openingEndsAt(3000, false)).toBe(3000 + OPENING_STEP_MS);
    expect(openingEndsAt(100, true)).toBe(100 + OPENING_STEP_MS);
  });

  it('ticks every step, shows all three done, then gives way (quick work)', () => {
    const view = renderWithI18n(<Entry done={false} />);
    expect(state('auth')).toBe('running');
    view.rerender(
      <I18nProvider>
        <Entry done />
      </I18nProvider>,
    );
    expect(state('auth')).toBe('running');
    act(() => vi.advanceTimersByTime(OPENING_STEP_MS));
    expect(state('auth')).toBe('done');
    expect(state('universe')).toBe('running');
    act(() => vi.advanceTimersByTime(OPENING_STEP_MS));
    expect([state('auth'), state('universe'), state('ready')]).toEqual(['done', 'done', 'done']);
    expect(screen.queryByText('Universe')).toBeNull();
    act(() => vi.advanceTimersByTime(OPENING_MIN_MS - 2 * OPENING_STEP_MS - 1));
    expect(screen.queryByText('Universe')).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByText('Universe')).toBeTruthy();
  });

  it('with reduced motion shows the final state for a beat only', () => {
    document.documentElement.dataset.motion = 'reduce';
    const view = renderWithI18n(<Entry done={false} />);
    act(() => vi.advanceTimersByTime(2000));
    view.rerender(
      <I18nProvider>
        <Entry done />
      </I18nProvider>,
    );
    expect([state('auth'), state('universe'), state('ready')]).toEqual(['done', 'done', 'done']);
    act(() => vi.advanceTimersByTime(OPENING_STEP_MS - 1));
    expect(screen.queryByText('Universe')).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByText('Universe')).toBeTruthy();
  });
});
