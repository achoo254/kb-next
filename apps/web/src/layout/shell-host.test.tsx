import { type RenderResult, render, screen } from '@testing-library/react';
import { type ReactNode, useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/i18n';
import { answer } from '../test/api-fakes';
import { renderWithI18n } from '../test/render';
import { AppShell, ShellHost } from './app-shell';
import { createShellHostStore } from './shell-host-store';

let mounts = 0;

/** Counts the mounts of the content of a screen: the content is the screen's own and mounts with it. */
function Content({ label }: { label: string }): ReactNode {
  useEffect(() => {
    mounts += 1;
  }, []);
  return <h1>{label}</h1>;
}

type Page = 'space' | 'reader' | 'phone';

function Page({ page }: { page: Page }): ReactNode {
  if (page === 'phone') return <div data-id="phone-page">phone</div>;
  return page === 'space' ? (
    <AppShell screen="C10" rail="spaces" className="space-shell">
      <Content label="Space" />
    </AppShell>
  ) : (
    <AppShell screen="C11" view="docs" veil="strong" className="reader-shell" breadcrumb={[{ label: 'Universe', href: '/u' }, { label: 'DHCP' }]}>
      <Content label="Reader" />
    </AppShell>
  );
}

/** The app's shape: the host, and the screen below it keyed by the page so each page mounts afresh. */
function Pages({ page }: { page: Page }): ReactNode {
  return (
    <ShellHost>
      <Page key={page} page={page} />
    </ShellHost>
  );
}

function renderPages(page: Page): RenderResult & { go(page: Page): void } {
  const result = render(<Pages page={page} />, { wrapper: I18nProvider });
  return { ...result, go: (next) => result.rerender(<Pages page={next} />) };
}

beforeEach(() => {
  mounts = 0;
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(answer(200, {}))));
});

afterEach(() => vi.unstubAllGlobals());

describe('the persistent shell', () => {
  it('keeps the frame mounted from screen to screen and swaps only the content', () => {
    const { container, go } = renderPages('space');
    const rail = container.querySelector('.app-shell-rail');
    const main = container.querySelector('main#content');
    expect(rail).not.toBeNull();
    expect(main?.getAttribute('data-screen')).toBe('C10');
    expect(screen.getByRole('heading', { name: 'Space' }).closest('main')).toBe(main);

    go('reader');
    // the same elements, not new ones: nothing of the frame was mounted again
    expect(container.querySelector('.app-shell-rail')).toBe(rail);
    expect(container.querySelector('main#content')).toBe(main);
    expect(main?.getAttribute('data-screen')).toBe('C11');
    expect(container.querySelector('.universe')?.className).toContain('reader-shell');
    expect(container.querySelector('[data-id="breadcrumb"]')).not.toBeNull();
    expect(screen.queryByRole('heading', { name: 'Space' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Reader' }).closest('main')).toBe(main);
    expect(mounts).toBe(2);
  });

  it('puts the frame where a screen\'s own shell was, and draws exactly one', () => {
    const { container } = renderPages('space');
    expect(container.querySelectorAll('.app-shell')).toHaveLength(1);
    expect(container.firstElementChild?.classList.contains('app-shell')).toBe(true);
  });

  it('withdraws the frame for a screen without a shell and draws it again after', () => {
    const { container, go } = renderPages('space');
    go('phone');
    expect(container.querySelector('.app-shell')).toBeNull();
    expect(screen.getByText('phone')).toBeTruthy();
    go('reader');
    expect(container.querySelector('main#content')?.getAttribute('data-screen')).toBe('C11');
    expect(screen.getByRole('heading', { name: 'Reader' })).toBeTruthy();
  });

  it('draws its own frame in place outside a host (tests, the dev kit)', () => {
    const { container } = renderWithI18n(
      <AppShell screen="C12" rail="search">
        <p>alone</p>
      </AppShell>,
    );
    expect(container.querySelectorAll('.app-shell')).toHaveLength(1);
    expect(screen.getByText('alone').closest('main')?.getAttribute('data-screen')).toBe('C12');
  });
});

describe('the shell host store', () => {
  it('shows the shell mounted last and follows its props', () => {
    const store = createShellHostStore<{ screen: string }>();
    const seen: Array<string | undefined> = [];
    store.subscribeShell(() => seen.push(store.shell()?.screen));
    store.publish('a', { screen: 'C10' });
    store.publish('b', { screen: 'C11' });
    store.publish('a', { screen: 'C10b' });
    store.withdraw('b');
    store.withdraw('a');
    store.withdraw('a');
    expect(seen).toEqual(['C10', 'C11', 'C10b', undefined]);
  });

  it('tells about its main element only when it changes', () => {
    const store = createShellHostStore<object>();
    const listener = vi.fn();
    const stop = store.subscribeMain(listener);
    const main = document.createElement('main');
    store.setMain(main);
    store.setMain(main);
    stop();
    store.setMain(null);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.main()).toBeNull();
  });
});
