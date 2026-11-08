import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { presentChannelName, useSlideSync } from './present-sync';

const open: BroadcastChannel[] = [];

afterEach(() => {
  for (const channel of open.splice(0)) channel.close();
});

describe('useSlideSync', () => {
  it('follows the other window and posts only its own moves', async () => {
    const onGoto = vi.fn();
    const { result, unmount } = renderHook(() => useSlideSync('doc-1', onGoto));
    const other = new BroadcastChannel(presentChannelName('doc-1'));
    open.push(other);
    const heard: unknown[] = [];
    other.onmessage = (event: MessageEvent<unknown>) => heard.push(event.data);

    other.postMessage({ type: 'goto', slide: 4 });
    await waitFor(() => expect(onGoto).toHaveBeenCalledWith(4));
    // What it received is not posted back.
    expect(heard).toEqual([]);

    result.current(7);
    await waitFor(() => expect(heard).toEqual([{ type: 'goto', slide: 7 }]));
    unmount();
  });

  it('ignores other messages and other texts', async () => {
    const onGoto = vi.fn();
    const { unmount } = renderHook(() => useSlideSync('doc-1', onGoto));
    const elsewhere = new BroadcastChannel(presentChannelName('doc-2'));
    const same = new BroadcastChannel(presentChannelName('doc-1'));
    open.push(elsewhere, same);
    elsewhere.postMessage({ type: 'goto', slide: 2 });
    same.postMessage({ type: 'hello' });
    same.postMessage({ type: 'goto', slide: 'x' });
    same.postMessage({ type: 'goto', slide: 3 });
    await waitFor(() => expect(onGoto).toHaveBeenCalledWith(3));
    expect(onGoto).toHaveBeenCalledTimes(1);
    unmount();
  });
});
