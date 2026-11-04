import { act, fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithI18n } from '../test/render';
import { ErrorPanel, ErrorScreen } from './error-screen';

function artOf(kind: string): string | null | undefined {
  return document.querySelector(`[data-id="error-${kind}"] img`)?.getAttribute('src');
}

describe('ErrorPanel', () => {
  it('draws each error with its AI art (phase 2 table)', () => {
    renderWithI18n(
      <>
        <ErrorPanel kind="not-found" />
        <ErrorPanel kind="forbidden" />
        <ErrorPanel kind="server" />
        <ErrorPanel kind="maintenance" />
      </>,
    );
    expect(artOf('not-found')).toBe('/art/ill-blackhole.webp');
    expect(artOf('forbidden')).toBe('/art/ill-vault-lock.webp');
    expect(artOf('server')).toBe('/art/ill-crystal-cracked.webp');
    expect(artOf('maintenance')).toBe('/art/ill-satellite-repair.webp');
    expect(screen.getByRole('heading', { name: 'Lost in a black hole' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Back to the universe' }).getAttribute('href')).toBe('/u');
    // Without a request handler, a private page only offers the way back.
    expect(screen.queryByRole('button', { name: 'Request access' })).toBeNull();
    expect(screen.getByText('Back soon. Files saved on this device still open.')).toBeTruthy();
  });

  it('sends an access request once and says it was sent', async () => {
    let calls = 0;
    renderWithI18n(<ErrorPanel kind="forbidden" backHref="/s/networking" onRequestAccess={async () => void calls++} />);
    expect(screen.getByRole('link', { name: 'Back' }).getAttribute('href')).toBe('/s/networking');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Request access' })));
    const sent = screen.getByRole('button', { name: 'Request sent' }) as HTMLButtonElement;
    expect(sent.disabled).toBe(true);
    expect(calls).toBe(1);
  });

  it('says when the access request did not go through', async () => {
    renderWithI18n(<ErrorPanel kind="forbidden" onRequestAccess={() => Promise.reject(new Error('down'))} />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Request access' })));
    expect(screen.getByRole('alert').textContent).toBe('The request did not go through. Please try again later.');
    expect(screen.getByRole('button', { name: 'Request access' })).toBeTruthy();
  });

  it('shows the retry as busy until it is over', async () => {
    let finish: () => void = () => undefined;
    renderWithI18n(<ErrorPanel kind="server" onRetry={() => new Promise<void>((resolve) => (finish = resolve))} />);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect((screen.getByRole('button', { name: 'Retrying…' }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => finish());
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });

  it('gives the reopening time of a maintenance', () => {
    renderWithI18n(<ErrorPanel kind="maintenance" reopensAt="21:30" offlineHref="/me?offline=1" />);
    expect(screen.getByText('Back at 21:30. Files saved on this device still open.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open offline files' }).getAttribute('href')).toBe('/me?offline=1');
  });
});

describe('ErrorScreen', () => {
  it('fills the screen with one panel under the X02 board code', () => {
    renderWithI18n(<ErrorScreen kind="not-found" />);
    expect(document.querySelector('[data-screen="X02"]')).not.toBeNull();
    expect(document.querySelectorAll('.error-panel')).toHaveLength(1);
  });
});
