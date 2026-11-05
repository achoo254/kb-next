/**
 * Talks to the Office editor (ranuts/document, on its own origin, docs/office-editor.md) inside an iframe through
 * `postMessage`. Only messages from that exact origin and from that frame's window are read; anything else on the
 * page's `message` channel is ignored. Requests carry an id and resolve with the editor's reply of the same id
 * (`document:opened`, `document:saved`, `document:error`); events without one (`document:ready`,
 * `document:dirty-changed`) go to `onEvent`.
 */

export interface EditorMessage {
  type: string;
  id?: string;
  payload: { file?: Blob; dirty?: boolean; message?: string };
}

/** The editor's address in the frame: its embed mode, told which origin embeds it. */
export function editorFrameUrl(origin: string, embedder: string): string {
  return `${origin}/editor?${new URLSearchParams({ embed: '1', embedOrigin: embedder }).toString()}`;
}

/** A message of the editor's API, or null for anything else (another frame, an extension, a malformed one). */
export function readEditorMessage(data: unknown): EditorMessage | null {
  if (typeof data !== 'object' || data === null || !('type' in data) || typeof data.type !== 'string' || !data.type.startsWith('document:')) return null;
  const id = 'id' in data && typeof data.id === 'string' ? data.id : undefined;
  const raw = 'payload' in data && typeof data.payload === 'object' && data.payload !== null ? data.payload : {};
  const payload: EditorMessage['payload'] = {};
  if ('file' in raw && raw.file instanceof Blob) payload.file = raw.file;
  if ('dirty' in raw && typeof raw.dirty === 'boolean') payload.dirty = raw.dirty;
  if ('message' in raw && typeof raw.message === 'string') payload.message = raw.message;
  return { type: data.type, id, payload };
}

export class EditorTimeout extends Error {
  constructor(type: string) {
    super(`editor did not answer ${type}`);
    this.name = 'EditorTimeout';
  }
}

export interface EditorBridge {
  /** Sends a request and resolves with the editor's reply to it; rejects with EditorTimeout past `timeoutMs`. */
  request(type: string, payload?: Record<string, unknown>, timeoutMs?: number): Promise<EditorMessage>;
  dispose(): void;
}

const REQUEST_TIMEOUT_MS = 60_000;

export function connectEditor(frame: HTMLIFrameElement, origin: string, onEvent: (message: EditorMessage) => void): EditorBridge {
  const waiting = new Map<string, (message: EditorMessage) => void>();
  const listener = (event: MessageEvent): void => {
    if (event.origin !== origin || event.source === null || event.source !== frame.contentWindow) return;
    const message = readEditorMessage(event.data);
    if (!message) return;
    const resolve = message.id ? waiting.get(message.id) : undefined;
    if (resolve && message.id) {
      waiting.delete(message.id);
      resolve(message);
    } else {
      onEvent(message);
    }
  };
  window.addEventListener('message', listener);
  return {
    request(type, payload = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
      const id = crypto.randomUUID();
      return new Promise<EditorMessage>((resolve, reject) => {
        const timer = setTimeout(() => {
          waiting.delete(id);
          reject(new EditorTimeout(type));
        }, timeoutMs);
        waiting.set(id, (message) => {
          clearTimeout(timer);
          resolve(message);
        });
        frame.contentWindow?.postMessage({ id, type, payload }, origin);
      });
    },
    dispose() {
      window.removeEventListener('message', listener);
      waiting.clear();
    },
  };
}
