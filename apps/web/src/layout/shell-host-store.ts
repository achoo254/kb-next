/**
 * The store behind the persistent app shell (app-shell.tsx `ShellHost`, docs/navigation.md): the screens' AppShells
 * publish their props here, the one shell frame draws the latest, and the frame's `<main>` is where the screens put
 * their content. When one screen gives way to the next, the old one withdraws and the new one publishes in the same
 * commit, so the frame only ever sees the new props and stays mounted.
 */
export interface ShellHostStore<Props> {
  publish(id: string, props: Props): void;
  withdraw(id: string): void;
  /** The props of the shell on view (the screen mounted last among those still mounted), or null. */
  shell(): Props | null;
  subscribeShell(listener: () => void): () => void;
  /** The frame's `<main>`, where the screen's content goes. */
  main(): HTMLElement | null;
  setMain(element: HTMLElement | null): void;
  subscribeMain(listener: () => void): () => void;
}

export function createShellHostStore<Props>(): ShellHostStore<Props> {
  const entries = new Map<string, Props>();
  let shown: Props | null = null;
  let mainElement: HTMLElement | null = null;
  const shellListeners = new Set<() => void>();
  const mainListeners = new Set<() => void>();
  const listen = (set: Set<() => void>, listener: () => void): (() => void) => {
    set.add(listener);
    return () => {
      set.delete(listener);
    };
  };
  const update = (): void => {
    let last: Props | null = null;
    for (const props of entries.values()) last = props;
    if (last === shown) return;
    shown = last;
    for (const listener of shellListeners) listener();
  };
  return {
    publish(id, props) {
      entries.set(id, props);
      update();
    },
    withdraw(id) {
      if (entries.delete(id)) update();
    },
    shell: () => shown,
    subscribeShell: (listener) => listen(shellListeners, listener),
    main: () => mainElement,
    setMain(element) {
      if (element === mainElement) return;
      mainElement = element;
      for (const listener of mainListeners) listener();
    },
    subscribeMain: (listener) => listen(mainListeners, listener),
  };
}
