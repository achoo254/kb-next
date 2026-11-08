/**
 * Keeps the slides window and its speaker view (C21, `?view=speaker`) on the same slide: each window posts the slide
 * it moves to on a BroadcastChannel named after the text; the other window only follows (it never posts back what it
 * received, so the two never echo). Works between windows of the same browser only.
 */
import { useCallback, useEffect, useRef } from 'react';

interface GotoMessage {
  type: 'goto';
  slide: number;
}

function isGoto(data: unknown): data is GotoMessage {
  return typeof data === 'object' && data !== null && (data as { type?: unknown }).type === 'goto' && Number.isInteger((data as { slide?: unknown }).slide);
}

export function presentChannelName(documentId: string): string {
  return `kb-present:${documentId}`;
}

export function canSync(): boolean {
  return typeof BroadcastChannel !== 'undefined';
}

/**
 * Follows the other window's slide (`onGoto`) and posts this window's moves: call the returned `post` after a move
 * made here. A slide set from a received message is not posted again.
 */
export function useSlideSync(documentId: string | null, onGoto: (slide: number) => void): (slide: number) => void {
  const channelRef = useRef<BroadcastChannel | null>(null);
  const onGotoRef = useRef(onGoto);
  useEffect(() => {
    onGotoRef.current = onGoto;
  }, [onGoto]);
  useEffect(() => {
    if (!documentId || !canSync()) return undefined;
    const channel = new BroadcastChannel(presentChannelName(documentId));
    channel.onmessage = (event: MessageEvent<unknown>) => {
      if (isGoto(event.data)) onGotoRef.current(event.data.slide);
    };
    channelRef.current = channel;
    return () => {
      channel.close();
      channelRef.current = null;
    };
  }, [documentId]);
  return useCallback((slide: number) => {
    channelRef.current?.postMessage({ type: 'goto', slide } satisfies GotoMessage);
  }, []);
}
