import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/api-client';
import type { KeysResponse } from '../api/keys-api';
import { renderWithI18n } from '../test/render';
import { checkedTime, modelOption } from './keys-messages';
import { KeysScreen, defaultFormProvider, saveErrorMessage } from './keys-screen';

const MODELS: KeysResponse['models'] = {
  openai: [
    { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini' },
    { id: 'gpt-4.1-nano', label: 'GPT-4.1 nano (rẻ hơn)' },
  ],
  gemini: [
    { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash' },
    { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite (rẻ hơn)' },
  ],
  anthropic: [
    { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5' },
    { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5' },
  ],
};

/** The board's default: OpenAI valid ••••a1b2 (in use), no Gemini key, Claude out of credit. */
function keys(overrides: Partial<KeysResponse> = {}): KeysResponse {
  return {
    available: true,
    keys: [
      { provider: 'openai', last4: 'a1b2', status: 'ok', updatedAt: '2026-11-04T14:10:00.000Z', lastCheckedAt: '2026-11-04T14:10:00.000Z' },
      { provider: 'anthropic', last4: 'zz99', status: 'quota', updatedAt: '2026-11-04T13:40:00.000Z', lastCheckedAt: '2026-11-04T13:40:00.000Z' },
    ],
    prefs: { provider: 'openai', model: 'gpt-4.1-mini' },
    active: { provider: 'openai', model: 'gpt-4.1-mini', last4: 'a1b2' },
    models: MODELS,
    ...overrides,
  };
}

function answer(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

let fetchMock: ReturnType<typeof vi.fn>;
type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;

function serve(handler: Handler): void {
  fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => handler(String(input), init));
}

function calls(method: string, path: string): Array<RequestInit | undefined> {
  return fetchMock.mock.calls.filter(([url, init]) => String(url) === path && ((init as RequestInit | undefined)?.method ?? 'GET') === method).map(([, init]) => init as RequestInit | undefined);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-04T15:00:00.000Z'));
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  serve(() => answer(200, keys()));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('KeysScreen', () => {
  it('shows each provider’s key state, the add form for the first provider without a working key, and the choice in use', async () => {
    renderWithI18n(<KeysScreen />);
    const cards = await screen.findByRole('list', { name: 'Your keys' });
    const [openai, gemini, claude] = within(cards).getAllByRole('listitem');
    expect(openai?.textContent).toContain('Valid ••••a1b2');
    expect(openai?.textContent).toContain('checked 21:10');
    expect(openai?.dataset.active).toBe('true');
    expect(gemini?.textContent).toContain('None yet');
    expect(gemini?.textContent).toContain('Add a key below');
    expect(claude?.textContent).toContain('Out of credit');
    expect(claude?.textContent).toContain('checked 20:40');
    // A key can be deleted wherever there is one.
    expect(within(cards).getAllByRole('button', { name: 'Delete key' })).toHaveLength(2);
    expect(within(cards).getByRole('button', { name: 'Choose Gemini' }).getAttribute('aria-pressed')).toBe('true');

    const form = screen.getByRole('region', { name: 'Add a Gemini key' });
    expect(within(form).getByLabelText('API key').getAttribute('type')).toBe('password');
    expect(within(form).getByRole('status').textContent).toBe('Checked with one free call to Google.');
    const where = within(form).getByRole('link', { name: 'Where do I get a Gemini key?' });
    expect(where.getAttribute('href')).toBe('https://aistudio.google.com/apikey');
    expect(where.getAttribute('rel')).toBe('noopener noreferrer');

    expect(screen.getByText('Questions and source passages are sent to the provider you pick above.')).toBeTruthy();
    const use = screen.getByRole('region', { name: 'Which key to use' });
    const radios = within(use).getAllByRole('radio');
    expect(radios.map((radio) => [(radio as HTMLInputElement).checked, (radio as HTMLInputElement).disabled])).toEqual([
      [true, false],
      [false, true],
      [false, true],
    ]);
    expect(use.textContent).toContain('no key yet');
    expect(use.textContent).toContain('out of credit');
    const model = within(use).getByLabelText('Model') as HTMLSelectElement;
    expect(model.value).toBe('gpt-4.1-mini');
    expect([...model.options].map((option) => option.textContent)).toEqual(['gpt-4.1-mini · cheap, fast', 'gpt-4.1-nano · cheapest']);
  });

  it('saves a key after the free check, clears the field and shows the new state', async () => {
    const saved = { provider: 'gemini', last4: '9f3c', status: 'ok', updatedAt: '2026-11-04T15:00:00.000Z', lastCheckedAt: '2026-11-04T15:00:00.000Z' } as const;
    let stored = false;
    serve((url, init) => {
      if (url === '/api/me/keys/gemini' && init?.method === 'PUT') {
        stored = true;
        return answer(200, saved);
      }
      return answer(200, stored ? keys({ keys: [...keys().keys, saved] }) : keys());
    });
    renderWithI18n(<KeysScreen />);
    const form = await screen.findByRole('region', { name: 'Add a Gemini key' });
    const input = within(form).getByLabelText('API key') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '  AIzaSyD-demo-key-9f3c  ' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save and check' }));

    await waitFor(() => expect(within(form).getByRole('status').textContent).toBe('The key works. Encrypted and saved; only its last 4 characters show.'));
    expect(JSON.parse(String(calls('PUT', '/api/me/keys/gemini')[0]?.body))).toEqual({ key: 'AIzaSyD-demo-key-9f3c' });
    expect(input.value).toBe('');
    expect(within(form).getByRole('button', { name: 'Saved' })).toBeTruthy();
    const gemini = screen.getByRole('list', { name: 'Your keys' }).querySelector('[data-provider="gemini"]');
    expect(gemini?.textContent).toContain('Valid ••••9f3c');
    // The form stays on Gemini (now "Replace") instead of moving on to the next provider without a key.
    expect(screen.getByRole('region', { name: 'Replace the Gemini key' })).toBeTruthy();
  });

  it('says why the provider refused a key and keeps the field for another try', async () => {
    serve((_url, init) => (init?.method === 'PUT' ? answer(400, { error: 'KEY_REJECTED' }) : answer(200, keys())));
    renderWithI18n(<KeysScreen />);
    const form = await screen.findByRole('region', { name: 'Add a Gemini key' });
    const input = within(form).getByLabelText('API key') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'AIza-wrong' } });
    fireEvent.submit(input.closest('form') as HTMLFormElement);
    await waitFor(() => expect(within(form).getByRole('status').textContent).toBe('Google refused this key. Check it, then save again.'));
    expect(within(form).getByRole('button', { name: 'Try again' })).toBeTruthy();
    expect(input.value).toBe('AIza-wrong');
  });

  it('asks for a key before sending an empty one', async () => {
    renderWithI18n(<KeysScreen />);
    const form = await screen.findByRole('region', { name: 'Add a Gemini key' });
    fireEvent.click(within(form).getByRole('button', { name: 'Save and check' }));
    expect(within(form).getByRole('status').textContent).toBe('Paste a key in the field above, then save.');
    expect(calls('PUT', '/api/me/keys/gemini')).toHaveLength(0);
  });

  it('switches the form to the provider whose orb is picked, with its own key page', async () => {
    renderWithI18n(<KeysScreen />);
    fireEvent.click(await screen.findByRole('button', { name: 'Choose Claude' }));
    const form = screen.getByRole('region', { name: 'Replace the Claude key' });
    expect(within(form).getByRole('link').getAttribute('href')).toBe('https://console.anthropic.com/settings/keys');
    expect(within(form).getByRole('status').textContent).toBe('Checked with one free call to Anthropic.');
  });

  it('deletes a key after confirming', async () => {
    let deleted = false;
    serve((_url, init) => {
      if (init?.method === 'DELETE') {
        deleted = true;
        return answer(200, { deleted: true });
      }
      return answer(200, deleted ? keys({ keys: keys().keys.filter((k) => k.provider !== 'openai'), active: null }) : keys());
    });
    renderWithI18n(<KeysScreen />);
    const openai = await screen.findByRole('button', { name: 'Choose OpenAI' });
    fireEvent.click(within(openai.closest('li') as HTMLElement).getByRole('button', { name: 'Delete key' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete the OpenAI key ••••a1b2?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete key' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(calls('DELETE', '/api/me/keys/openai')).toHaveLength(1);
    expect(screen.getByRole('list', { name: 'Your keys' }).querySelector('[data-provider="openai"]')?.textContent).toContain('None yet');
  });

  it('keeps the key when the dialog is cancelled', async () => {
    renderWithI18n(<KeysScreen />);
    const openai = await screen.findByRole('button', { name: 'Choose OpenAI' });
    fireEvent.click(within(openai.closest('li') as HTMLElement).getByRole('button', { name: 'Delete key' }));
    fireEvent.click(screen.getByRole('button', { name: 'Keep it' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(calls('DELETE', '/api/me/keys/openai')).toHaveLength(0);
  });

  it('saves the model picked for the provider in use', async () => {
    serve((url, init) => {
      if (url === '/api/me/key-prefs') {
        const body = JSON.parse(String(init?.body)) as { provider: 'openai'; model: string };
        return answer(200, keys({ prefs: body, active: { ...body, last4: 'a1b2' } }));
      }
      return answer(200, keys());
    });
    renderWithI18n(<KeysScreen />);
    const model = (await screen.findByLabelText('Model')) as HTMLSelectElement;
    fireEvent.change(model, { target: { value: 'gpt-4.1-nano' } });
    await waitFor(() => expect(model.value).toBe('gpt-4.1-nano'));
    expect(JSON.parse(String(calls('PUT', '/api/me/key-prefs')[0]?.body))).toEqual({ provider: 'openai', model: 'gpt-4.1-nano' });
  });

  it('shows the switched-off state when the server has no own keys', async () => {
    serve(() => answer(200, keys({ available: false, keys: [], prefs: null, active: null })));
    renderWithI18n(<KeysScreen />);
    expect(await screen.findByText('Own keys are off on this server')).toBeTruthy();
    expect(screen.queryByLabelText('API key')).toBeNull();
    expect(screen.getAllByRole('radio').every((radio) => (radio as HTMLInputElement).disabled)).toBe(true);
    expect((screen.getByLabelText('Model') as HTMLSelectElement).disabled).toBe(true);
    expect(document.querySelector('[data-id="keys-screen"]')?.getAttribute('data-state')).toBe('off');
  });

  it('offers a retry when the keys cannot be loaded', async () => {
    serve(() => answer(500, { error: 'internal' }));
    renderWithI18n(<KeysScreen />);
    await waitFor(() => expect(document.querySelector('[data-id="keys-screen"]')?.getAttribute('data-state')).toBe('failed'));
    expect(document.querySelector('[data-id="error-server"]')).toBeTruthy();
  });
});

describe('key helpers', () => {
  it('maps refused saves to their sentence', () => {
    expect(saveErrorMessage(new ApiError(400, 'KEY_FORMAT'))).toBe('keys.msg.format');
    expect(saveErrorMessage(new ApiError(400, 'KEY_NO_CREDIT'))).toBe('keys.msg.noCredit');
    expect(saveErrorMessage(new ApiError(503, 'KEY_CHECK_FAILED'))).toBe('keys.msg.checkFailed');
    expect(saveErrorMessage(new ApiError(429, 'rate-limited'))).toBe('keys.msg.rateLimited');
    expect(saveErrorMessage(new ApiError(0, 'network'))).toBe('keys.msg.network');
    expect(saveErrorMessage(new Error('boom'))).toBe('keys.msg.other');
  });

  it('opens the form on the first provider without a working key', () => {
    expect(defaultFormProvider(keys())).toBe('gemini');
    expect(defaultFormProvider(keys({ keys: [] }))).toBe('openai');
    const allOk = keys({ keys: (['openai', 'gemini', 'anthropic'] as const).map((provider) => ({ ...keys().keys[0], provider, status: 'ok' as const, last4: 'aaaa', updatedAt: '2026-11-04T14:10:00.000Z', lastCheckedAt: null })), active: { provider: 'gemini', model: 'gemini-3.8-flash', last4: 'aaaa' } });
    expect(defaultFormProvider(allOk)).toBe('gemini');
  });

  it('writes check times in Saigon time, with the date when not today', () => {
    const now = new Date('2026-11-04T15:00:00.000Z');
    expect(checkedTime('2026-11-04T14:10:00.000Z', now)).toBe('21:10');
    expect(checkedTime('2026-11-03T14:10:00.000Z', now)).toBe('03/11 21:10');
  });

  it('labels known models with a note and keeps the server label for others', () => {
    const t = (key: string): string => (key === 'keys.model.gpt-4.1-mini' ? 'rẻ, nhanh' : key);
    expect(modelOption(t, { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini' })).toBe('gpt-4.1-mini · rẻ, nhanh');
    expect(modelOption(t, { id: 'gpt-9', label: 'GPT-9' })).toBe('GPT-9');
  });
});
