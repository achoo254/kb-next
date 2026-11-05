/**
 * The editor's two pop-up lists (C02), on TipTap's suggestion plugin: `/` opens "Chèn khối" (blocks to insert) and
 * `[[` opens "Nối tới tài liệu" (documents to link, from the API). Each list keeps its state in a small store the
 * React menu reads; arrow keys move, Enter or Tab picks, Escape closes, as in any list box.
 */
import { Extension, type Editor, type Range } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
import { Suggestion, type SuggestionProps } from '@tiptap/suggestion';

export interface MenuState<T> {
  open: boolean;
  query: string;
  items: readonly T[];
  index: number;
  /** Where the caret is, in screen px (null before it is known). */
  caret: { left: number; bottom: number } | null;
  /** Items are being fetched (the `[[` list). */
  loading: boolean;
}

/** A store of one list's state for useSyncExternalStore. */
export class MenuStore<T> {
  private state: MenuState<T> = { open: false, query: '', items: [], index: 0, caret: null, loading: false };
  private readonly listeners = new Set<() => void>();
  private pick: ((item: T) => void) | null = null;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  snapshot = (): MenuState<T> => this.state;

  set(patch: Partial<MenuState<T>>, pick?: (item: T) => void): void {
    this.state = { ...this.state, ...patch };
    if (pick) this.pick = pick;
    for (const listener of this.listeners) listener();
  }

  close(): void {
    this.pick = null;
    this.set({ open: false, items: [], index: 0, loading: false });
  }

  /** Picks item `index` (a click, or Enter). */
  choose(index: number): boolean {
    const item = this.state.items[index];
    if (!item || !this.pick) return false;
    this.pick(item);
    return true;
  }

  move(step: number): void {
    const count = this.state.items.length;
    if (count === 0) return;
    this.set({ index: (this.state.index + step + count) % count });
  }
}

interface MenuOptions<T> {
  name: string;
  char: string;
  /** `/` only opens on an empty line start; `[[` anywhere. */
  startOfLine: boolean;
  allowSpaces: boolean;
  store: MenuStore<T>;
  items(query: string): readonly T[] | Promise<readonly T[]>;
  /** Replaces the typed `range` (the trigger and query) with what `item` inserts. */
  apply(editor: Editor, range: Range, item: T): void;
}

function caretOf(props: SuggestionProps<unknown>): MenuState<unknown>['caret'] {
  const rect = props.clientRect?.();
  return rect ? { left: rect.left, bottom: rect.bottom } : null;
}

/** An editor extension that opens `store`'s list on `char`. */
export function suggestionMenu<T>({ name, char, startOfLine, allowSpaces, store, items, apply }: MenuOptions<T>): Extension {
  const pluginKey = new PluginKey(name);
  let request = 0;
  return Extension.create({
    name,
    addProseMirrorPlugins() {
      return [
        Suggestion<T, T>({
          editor: this.editor,
          char,
          pluginKey,
          startOfLine,
          allowSpaces,
          items: () => [],
          command: ({ editor, range, props }) => apply(editor, range, props),
          render: () => {
            const update = (props: SuggestionProps<T, T>): void => {
              const ticket = ++request;
              const pick = (item: T): void => props.command(item);
              store.set({ open: true, query: props.query, caret: caretOf(props as SuggestionProps<unknown>), loading: true }, pick);
              void Promise.resolve(items(props.query)).then(
                (found) => {
                  if (ticket === request) store.set({ items: found, index: 0, loading: false });
                },
                (error: unknown) => {
                  console.warn(`${name}: suggestions failed`, error);
                  if (ticket === request) store.set({ items: [], loading: false });
                },
              );
            };
            return {
              onStart: update,
              onUpdate: update,
              onKeyDown: ({ event }) => {
                if (!store.snapshot().open) return false;
                if (event.key === 'ArrowDown') store.move(1);
                else if (event.key === 'ArrowUp') store.move(-1);
                else if (event.key === 'Enter' || event.key === 'Tab') return store.choose(store.snapshot().index);
                else if (event.key === 'Escape') store.close();
                else return false;
                return true;
              },
              onExit: () => {
                request += 1;
                store.close();
              },
            };
          },
        }),
      ];
    },
  });
}
