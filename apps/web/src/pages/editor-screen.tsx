/**
 * The editor (board C02) at /d/:id/edit: the save chip with undo and redo, words and reading time, preview and
 * "Xuất bản" (opens C04); the planet colour of the text; the title and the text on TipTap (editor-schema.ts) with the `/`
 * block menu and the `[[` document list; the writing assistant (editor-assistant.tsx). Autosave and the browser copy:
 * editor-autosave.ts. The author edits their text whatever its status, published included. States: loading, the
 * editor, not found, no access, not editable (an Office file), offline without a copy on this device, and a failed
 * load.
 */
import type { Editor, Range } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import { type CSSProperties, type ReactNode, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ApiError, NETWORK_ERROR } from '../api/api-client';
import { type EditableDocument, type LinkSuggestion, PLANETS, type Planet, suggestLinks } from '../api/authoring-api';
import { readErrorOf } from '../api/content-api';
import { journeyEditPath, publishPath } from '../layout/shell-paths';
import { AppShell, type BreadcrumbItem, SHELL_PATHS } from '../layout/app-shell';
import { toBoardPx } from '../layout/board-zoom';
import { currentDevice, useDevice } from '../layout/device';
import { PhoneShell } from '../layout/phone-shell';
import { RimPanel, SheetHandle } from '../ui/rim-panel';
import { EmptyState } from '../ui/empty-state';
import { Icon, type IconName } from '../ui/icon';
import { Modal } from '../ui/modal';
import { Button } from '../ui/button';
import { Skeleton } from '../ui/skeleton';
import { type AssistantTab, EditorAssistant, useAiWriting } from './editor-assistant';
import { type AutosaveState, type DocumentAutosave, type OpenedDocument, type Snapshot, openForEditing, useDocumentAutosave } from './editor-autosave';
import { countWords, readMarkdown, readingMinutes, writeMarkdown } from './editor-markdown';
import { type EditorMessageKey, savedTime, useEditorText } from './editor-messages';
import { type Step, editorExtensions, isStepList } from './editor-schema';
import { type MenuState, MenuStore, suggestionMenu } from './editor-suggestions';
import { stepMark } from './step-mark';
import { ErrorPanel } from './error-screen';
import { usePhoneText } from './phone-messages';
import { spaceName } from './space-panels';
import './editor-screen.css';
import { navigate } from '../router/navigation';

type EditorFailure = 'not-found' | 'no-access' | 'hidden' | 'not-editable' | 'offline' | 'server';
type EditorLoad = { status: 'loading' } | { status: 'ready'; opened: OpenedDocument } | { status: 'failed'; error: EditorFailure };

export function editorLoadError(error: unknown): EditorFailure {
  const read = readErrorOf(error);
  if (read) return read;
  if (error instanceof ApiError && error.code === 'not-editable') return 'not-editable';
  if (error instanceof ApiError && error.code === NETWORK_ERROR) return 'offline';
  return 'server';
}

function useOpened(id: string): { load: EditorLoad; reload(): void } {
  const [result, setResult] = useState<{ key: string; load: EditorLoad } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const key = `${id}|${attempt}`;
  useEffect(() => {
    let current = true;
    openForEditing(id).then(
      (opened) => current && setResult({ key, load: { status: 'ready', opened } }),
      (error: unknown) => {
        if (!current) return;
        // A journey is built in its own builder (C07), not written as Markdown.
        if (error instanceof ApiError && error.code === 'journey') {
          navigate(journeyEditPath(id), { replace: true });
          return;
        }
        if (!(error instanceof ApiError)) console.error('editor load failed', error);
        setResult({ key, load: { status: 'failed', error: editorLoadError(error) } });
      },
    );
    return () => {
      current = false;
    };
  }, [id, key]);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  return { load: result?.key === key ? result.load : { status: 'loading' }, reload };
}

export function EditorScreen({ id }: { id: string }): ReactNode {
  const { load, reload } = useOpened(id);
  if (load.status === 'ready') return <EditorWorkspace key={`${load.opened.doc.id}|${load.opened.baseRev}`} opened={load.opened} onReload={reload} />;
  return (
    <EditorFrame breadcrumb={[{ label: 'Universe', href: SHELL_PATHS.universe }]}>
      <div className="editor-screen" data-id="editor-screen" data-state={load.status === 'failed' ? load.error : 'loading'}>
        {load.status === 'loading' ? <EditorLoading /> : <EditorFailed id={id} error={load.error} onRetry={reload} />}
      </div>
    </EditorFrame>
  );
}

/**
 * The frame of the editor's states (loading, failed, creating a note): C02's shell on a desktop or tablet, the phone
 * frame of M02's editor stage (no tab bar) on a phone.
 */
export function EditorFrame({ breadcrumb, children }: { breadcrumb: BreadcrumbItem[]; children: ReactNode }): ReactNode {
  if (useDevice() === 'phone') {
    return (
      <PhoneShell screen="M02" tabBar={false} stars={false} className="editor-phone-frame">
        {children}
      </PhoneShell>
    );
  }
  return (
    <AppShell screen="C02" rail="create" view="docs" veil="strong" breadcrumb={breadcrumb} className="editor-shell">
      {children}
    </AppShell>
  );
}

function EditorLoading(): ReactNode {
  const { t } = useEditorText();
  return (
    <div className="editor-panel editor-main editor-loading" aria-busy="true" aria-label={t('editor.loading')} data-id="editor-loading">
      <Skeleton width="60%" height={42} radius={8} tone="glow" />
      <Skeleton width="92%" height={16} radius={8} tone="glow" />
      <Skeleton width="80%" height={16} radius={8} tone="glow" />
      <Skeleton height={92} radius={18} tone="glow" />
      <Skeleton width="86%" height={16} radius={8} tone="glow" />
    </div>
  );
}

function EditorFailed({ id, error, onRetry }: { id: string; error: EditorFailure; onRetry(): void }): ReactNode {
  const { t } = useEditorText();
  const readHref = `/d/${encodeURIComponent(id)}`;
  if (error === 'not-editable') {
    return (
      <EmptyState
        art="doc-planet"
        title={t('editor.notEditable.title')}
        description={t('editor.notEditable.text')}
        action={{ label: t('editor.read'), href: readHref }}
        className="editor-state"
        dataId={`editor-${error}`}
      />
    );
  }
  if (error === 'offline') {
    return (
      <EmptyState
        art="planet-offline"
        title={t('editor.offline.title')}
        description={t('editor.offline.text')}
        action={{ label: t('editor.offline.retry'), onClick: onRetry }}
        tone="accent"
        className="editor-state"
        dataId="editor-offline"
      />
    );
  }
  return <ErrorPanel kind={error === 'server' ? 'server' : error === 'not-found' ? 'not-found' : 'forbidden'} onRetry={onRetry} backHref={SHELL_PATHS.mine} className="editor-state" />;
}

// ── the `/` and `[[` menus ──

type BlockId = 'paragraph' | 'heading' | 'list' | 'image' | 'diagram' | 'table' | 'office' | 'ai';
interface BlockItem {
  id: BlockId;
  label: EditorMessageKey;
  icon: IconName;
  /** Not available yet (Office files come with phase 10). */
  soon?: boolean;
}

const BLOCKS: readonly BlockItem[] = [
  { id: 'paragraph', label: 'editor.block.paragraph', icon: 'block-paragraph' },
  { id: 'heading', label: 'editor.block.heading', icon: 'block-heading' },
  { id: 'list', label: 'editor.block.list', icon: 'block-list' },
  { id: 'image', label: 'editor.block.image', icon: 'block-image' },
  { id: 'diagram', label: 'editor.block.diagram', icon: 'block-diagram' },
  { id: 'table', label: 'editor.block.table', icon: 'block-table' },
  { id: 'office', label: 'editor.block.office', icon: 'block-office', soon: true },
  { id: 'ai', label: 'editor.block.ai', icon: 'sparkle' },
];

function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase();
}

function useMenu<T>(store: MenuStore<T>): MenuState<T> {
  return useSyncExternalStore(store.subscribe, store.snapshot);
}

/** Where a pop-up list sits: under the caret, in board px (the frame is zoomed). */
/** Under the caret; on a phone the list spans the screen's width (12px from each side) under the caret's line. */
function caretStyle(caret: MenuState<unknown>['caret']): { left: number; top: number } | undefined {
  if (!caret) return undefined;
  if (currentDevice() === 'phone') return { left: 12, top: caret.bottom + 8 };
  return { left: toBoardPx(caret.left), top: toBoardPx(caret.bottom) + 8 };
}

function BlockMenu({ store }: { store: MenuStore<BlockItem> }): ReactNode {
  const { t } = useEditorText();
  const menu = useMenu(store);
  if (!menu.open || menu.items.length === 0) return null;
  return (
    <div className="editor-pop editor-pop-blocks" role="menu" aria-label={t('editor.blocks')} style={caretStyle(menu.caret)} data-id="editor-block-menu">
      <span className="editor-pop-title">{t('editor.blocks')}</span>
      {menu.items.map((item, index) => (
        <button
          key={item.id}
          type="button"
          role="menuitem"
          className="editor-block"
          aria-current={index === menu.index || undefined}
          aria-disabled={item.soon || undefined}
          title={item.soon ? t('editor.soon') : undefined}
          data-block={item.id}
          // The editor keeps its focus and caret while the list is clicked.
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => store.choose(index)}
        >
          <Icon name={item.icon} size={18} />
          {t(item.label)}
        </button>
      ))}
    </div>
  );
}

function LinkMenu({ store }: { store: MenuStore<LinkSuggestion> }): ReactNode {
  const { t } = useEditorText();
  const menu = useMenu(store);
  if (!menu.open) return null;
  return (
    <div className="editor-pop editor-pop-links" role="listbox" aria-label={t('editor.links')} style={caretStyle(menu.caret)} data-id="editor-link-menu">
      <span className="editor-pop-title">{t('editor.links')}</span>
      {menu.items.map((item, index) => (
        <button
          key={item.id}
          type="button"
          role="option"
          aria-selected={index === menu.index}
          className="editor-link-option"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => store.choose(index)}
        >
          <span className="editor-link-orb" style={{ '--orb': item.space.glow } as CSSProperties} aria-hidden="true" />
          <span className="editor-link-option-title">{item.title}</span>
          <span className="editor-link-option-kind">
            {t(item.status !== 'approved' || item.origin === 'own' ? (item.type === 'office' ? 'editor.origin.ownFile' : 'editor.origin.own') : item.origin === 'official' ? 'editor.origin.official' : 'editor.origin.community')}
          </span>
        </button>
      ))}
      {menu.items.length === 0 && (
        <span className="editor-pop-empty" role="status">
          {menu.loading ? t('editor.links.searching') : menu.query.trim() ? t('editor.links.none', { query: menu.query.trim() }) : t('editor.links.type')}
        </span>
      )}
    </div>
  );
}

// ── dialogs: the steps of a diagram, an image ──

function stepsToText(steps: readonly Step[]): string {
  return steps.map((s) => (s.text ? `${s.term} — ${s.text}` : s.term)).join('\n');
}

export function textToSteps(text: string): Step[] | null {
  const steps = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [term = '', ...rest] = line.split(/\s+[—–-]\s+/);
      return { term: term.replace(/\*/g, '').trim(), text: rest.join(' — ').trim() };
    });
  return steps.length >= 2 && steps.length <= 6 && steps.every((s) => s.term) ? steps : null;
}

function StepsDialog({ steps, onSave, onClose }: { steps: readonly Step[]; onSave(steps: Step[]): void; onClose(): void }): ReactNode {
  const { t } = useEditorText();
  const [text, setText] = useState(stepsToText(steps));
  const [invalid, setInvalid] = useState(false);
  const save = (): void => {
    const parsed = textToSteps(text);
    if (!parsed) {
      setInvalid(true);
      return;
    }
    onSave(parsed);
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={t('editor.steps.edit')}
      description={t('editor.steps.help')}
      dataId="editor-steps-dialog"
      actions={
        <>
          <Button variant="glass" onClick={onClose}>
            {t('editor.dialog.cancel')}
          </Button>
          <Button variant="rim" onClick={save}>
            {t('editor.dialog.save')}
          </Button>
        </>
      }
    >
      <label className="editor-field">
        <span>{t('editor.steps.field')}</span>
        <textarea rows={6} value={text} onChange={(event) => setText(event.target.value)} aria-invalid={invalid || undefined} />
      </label>
      {invalid && (
        <span className="editor-field-error" role="alert">
          {t('editor.steps.invalid')}
        </span>
      )}
    </Modal>
  );
}

function ImageDialog({ onInsert, onClose }: { onInsert(src: string, alt: string): void; onClose(): void }): ReactNode {
  const { t } = useEditorText();
  const [src, setSrc] = useState('');
  const [alt, setAlt] = useState('');
  const [invalid, setInvalid] = useState(false);
  const insert = (): void => {
    if (!/^https:\/\/\S+$/i.test(src.trim())) {
      setInvalid(true);
      return;
    }
    onInsert(src.trim(), alt.trim());
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={t('editor.image.title')}
      dataId="editor-image-dialog"
      actions={
        <>
          <Button variant="glass" onClick={onClose}>
            {t('editor.dialog.cancel')}
          </Button>
          <Button variant="rim" onClick={insert}>
            {t('editor.dialog.insert')}
          </Button>
        </>
      }
    >
      <label className="editor-field">
        <span>{t('editor.image.url')}</span>
        <input type="url" value={src} placeholder="https://" onChange={(event) => setSrc(event.target.value)} aria-invalid={invalid || undefined} />
      </label>
      {invalid && (
        <span className="editor-field-error" role="alert">
          {t('editor.image.invalid')}
        </span>
      )}
      <label className="editor-field">
        <span>{t('editor.image.alt')}</span>
        <input type="text" value={alt} onChange={(event) => setAlt(event.target.value)} />
      </label>
    </Modal>
  );
}

// ── the workspace ──

type Dialog = { kind: 'steps'; pos: number; steps: readonly Step[] } | { kind: 'image' } | null;

function SaveChip({ state, autosave, onLoadServer }: { state: AutosaveState; autosave: DocumentAutosave; onLoadServer(): void }): ReactNode {
  const { t, locale } = useEditorText();
  const label: Record<AutosaveState['status'], string> = {
    typing: t('editor.save.typing'),
    saving: t('editor.save.saving'),
    saved: t('editor.save.saved', { time: savedTime(locale, state.savedAt) }),
    offline: t('editor.save.offline'),
    failed: t('editor.save.failed'),
    conflict: t('editor.save.conflict'),
  };
  return (
    <span className="editor-save" role="status" data-id="editor-save" data-state={state.status}>
      {state.status === 'saving' ? <span className="editor-spinner" aria-hidden="true" /> : <span className="editor-save-dot" aria-hidden="true" />}
      {label[state.status]}
      {state.status === 'failed' && (
        <button type="button" className="editor-save-action" onClick={() => void autosave.save()} data-id="editor-save-retry">
          {t('editor.save.retry')}
        </button>
      )}
      {state.status === 'conflict' && (
        <>
          <button type="button" className="editor-save-action" onClick={() => void autosave.overwrite()} data-id="editor-save-keep">
            {t('editor.save.keepMine')}
          </button>
          <button type="button" className="editor-save-action editor-save-action-soft" onClick={onLoadServer} data-id="editor-save-load">
            {t('editor.save.loadServer')}
          </button>
        </>
      )}
    </span>
  );
}

/** Its origin tag; a text left from the review gate (`pending`, `changes_requested`, `rejected`) is the author's own. */
function tagOf(doc: EditableDocument): EditorMessageKey {
  if (doc.origin === 'official') return 'editor.tag.official';
  if (doc.origin === 'community' && doc.status === 'approved') return 'editor.tag.community';
  return 'editor.tag.own';
}

function EditorWorkspace({ opened, onReload }: { opened: OpenedDocument; onReload(): void }): ReactNode {
  const { t, locale } = useEditorText();
  const phone = usePhoneText();
  const device = useDevice();
  const [aiSheet, setAiSheet] = useState(false);
  const { doc } = opened;
  const { state, autosave } = useDocumentAutosave(opened);
  const [title, setTitle] = useState(opened.start.title);
  const [planet, setPlanet] = useState<Planet | null>(opened.start.planet);
  const [titleError, setTitleError] = useState(false);
  const [words, setWords] = useState(0);
  const [dialog, setDialog] = useState<Dialog>(null);
  const titleRef = useRef(title);
  const planetRef = useRef(planet);
  const titleInput = useRef<HTMLInputElement>(null);
  const loading = useRef(true);
  const blockStore = useMemo(() => new MenuStore<BlockItem>(), []);
  const linkStore = useMemo(() => new MenuStore<LinkSuggestion>(), []);
  /** Bumped by the `/` menu's "AI viết": the assistant opens its AI tab and focuses its first action. */
  const [aiFocus, setAiFocus] = useState(0);
  const [assistantTab, setAssistantTab] = useState<AssistantTab>('ai');

  const applyBlock = useCallback((editor: Editor, range: Range, item: BlockItem): void => {
    if (item.soon) return;
    const chain = editor.chain().focus().deleteRange(range);
    switch (item.id) {
      case 'paragraph':
        chain.setParagraph().run();
        return;
      case 'heading':
        chain.setHeading({ level: 2 }).run();
        return;
      case 'list':
        chain.toggleBulletList().run();
        return;
      case 'table':
        chain.insertTable({ rows: 3, cols: 2, withHeaderRow: true }).run();
        return;
      case 'diagram': {
        chain.run();
        const steps: Step[] = [
          { term: 'Bước 1', text: '' },
          { term: 'Bước 2', text: '' },
        ];
        const pos = editor.state.selection.from;
        editor.chain().insertContent({ type: 'steps', attrs: { steps } }).run();
        setDialog({ kind: 'steps', pos: Math.max(0, pos - 1), steps });
        return;
      }
      case 'image':
        chain.run();
        setDialog({ kind: 'image' });
        return;
      case 'ai':
        chain.run();
        setAssistantTab('ai');
        setAiFocus((n) => n + 1);
        // on a phone the assistant is a sheet, opened here
        setAiSheet(true);
        return;
      case 'office':
        return;
    }
  }, []);

  const extensions = useMemo(
    () =>
      editorExtensions(t('editor.placeholder'), [
        suggestionMenu<BlockItem>({
          name: 'editor-blocks',
          char: '/',
          startOfLine: true,
          allowSpaces: false,
          store: blockStore,
          items: (query) => BLOCKS.filter((b) => fold(t(b.label)).includes(fold(query))),
          apply: applyBlock,
        }),
        suggestionMenu<LinkSuggestion>({
          name: 'editor-links',
          char: '[[',
          startOfLine: false,
          allowSpaces: true,
          store: linkStore,
          items: (query) => suggestLinks(query.replace(/\]+$/, ''), doc.id),
          apply: (editor, range, item) => {
            editor.chain().focus().deleteRange(range).insertContent([{ type: 'wikilink', attrs: { title: item.title } }, { type: 'text', text: ' ' }]).run();
          },
        }),
      ]),
    // The menus read the language once: the editor is rebuilt when it changes.
    [t, blockStore, linkStore, applyBlock, doc.id],
  );

  const snapshot = useCallback((editor: Editor): (() => Snapshot) => () => ({ title: titleRef.current, body: writeMarkdown(editor), planet: planetRef.current }), []);

  const editor = useEditor(
    {
      extensions,
      content: '',
      editorProps: {
        attributes: { class: 'editor-content', 'aria-label': t('editor.body'), 'aria-multiline': 'true', role: 'textbox' },
        handleDoubleClickOn: (_view, pos, node) => {
          if (node.type.name !== 'steps' || !isStepList(node.attrs.steps)) return false;
          setDialog({ kind: 'steps', pos, steps: node.attrs.steps });
          return true;
        },
        handleKeyDown: (view, event) => {
          const { selection } = view.state;
          if (event.key !== 'Enter' || !(selection instanceof NodeSelection) || selection.node.type.name !== 'steps' || !isStepList(selection.node.attrs.steps)) return false;
          setDialog({ kind: 'steps', pos: selection.from, steps: selection.node.attrs.steps });
          return true;
        },
      },
      onCreate: ({ editor: created }) => {
        created
          .chain()
          .command(({ tr }) => {
            tr.setMeta('addToHistory', false);
            return true;
          })
          .setContent(readMarkdown(created, opened.start.body), { emitUpdate: false })
          .run();
        loading.current = false;
        setWords(countWords(`${titleRef.current} ${created.getText()}`));
      },
      onUpdate: ({ editor: changed }) => {
        if (loading.current) return;
        setWords(countWords(`${titleRef.current} ${changed.getText()}`));
        autosave.edited(snapshot(changed));
      },
    },
    [extensions],
  );

  const history = useEditorState({ editor, selector: ({ editor: e }) => ({ undo: e?.can().undo() ?? false, redo: e?.can().redo() ?? false }) }) ?? { undo: false, redo: false };

  const changed = useCallback(() => {
    if (editor) autosave.edited(snapshot(editor));
  }, [editor, autosave, snapshot]);

  // ⌘S / Ctrl+S saves at once (board Interaction).
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void autosave.save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [autosave]);

  const aiAccepted = useCallback(() => autosave.aiAccepted(), [autosave]);
  const writing = useAiWriting(editor, () => titleRef.current, aiAccepted);

  const space = doc.space;
  const crumbs: BreadcrumbItem[] = [
    { label: 'Universe', href: SHELL_PATHS.universe },
    { label: spaceName(locale, space), href: `/s/${encodeURIComponent(space.slug)}` },
    ...(space.kind === 'personal' ? [{ label: t('editor.crumbDrafts'), href: SHELL_PATHS.mine }] : doc.collection ? [{ label: spaceName(locale, doc.collection) }] : []),
    { label: title.trim() || t('editor.untitled') },
  ];

  const loadServer = (): void => {
    void autosave.discard().then(onReload);
  };

  // "Xuất bản" (desktop) and "Tiếp" (phone): where it goes and who sees it are chosen on C04 / M03, which publishes it
  // (the text saves on leaving).
  const next = (): void => {
    if (title.trim()) {
      navigate(publishPath(doc.id));
      return;
    }
    setTitleError(true);
    titleInput.current?.focus();
  };

  const pickPlanet = (colour: Planet): void => {
    planetRef.current = colour;
    setPlanet(colour);
    changed();
  };

  const editTitle = (value: string): void => {
    titleRef.current = value;
    setTitle(value);
    if (value.trim()) setTitleError(false);
    if (editor) setWords(countWords(`${value} ${editor.getText()}`));
    changed();
  };

  const menus = (
    <>
      <BlockMenu store={blockStore} />
      <LinkMenu store={linkStore} />
      {dialog?.kind === 'steps' && editor && (
        <StepsDialog
          steps={dialog.steps}
          onClose={() => setDialog(null)}
          onSave={(steps) => {
            editor.chain().focus().command(({ tr }) => {
              const node = tr.doc.nodeAt(dialog.pos);
              if (!node || node.type.name !== 'steps') return false;
              tr.setNodeMarkup(dialog.pos, undefined, { ...node.attrs, steps });
              return true;
            }).run();
            setDialog(null);
          }}
        />
      )}
      {dialog?.kind === 'image' && editor && (
        <ImageDialog
          onClose={() => setDialog(null)}
          onInsert={(src, alt) => {
            editor.chain().focus().setImage({ src, alt }).run();
            setDialog(null);
          }}
        />
      )}
    </>
  );

  if (device === 'phone') {
    // M02's editor stage: back, what is written and where, the save state and "Tiếp" (M03); the title with its planet,
    // the planet colours, the text, and the writing tools over the keyboard
    const typeText = (text: string): void => {
      editor?.chain().focus().insertContent(text).run();
    };
    const tools: Array<{ id: string; label: string; icon?: IconName; text?: string; run(): void }> = [
      { id: 'slash', label: phone.t('editor.slash'), text: '/', run: () => typeText('/') },
      { id: 'link', label: phone.t('editor.link'), text: '[[', run: () => typeText('[[') },
      { id: 'image', label: phone.t('editor.image'), icon: 'block-image', run: () => setDialog({ kind: 'image' }) },
      {
        id: 'diagram',
        label: phone.t('editor.diagram'),
        icon: 'block-diagram',
        run: () => {
          if (!editor) return;
          const steps: Step[] = [
            { term: 'Bước 1', text: '' },
            { term: 'Bước 2', text: '' },
          ];
          const pos = editor.state.selection.from;
          editor.chain().focus().insertContent({ type: 'steps', attrs: { steps } }).run();
          setDialog({ kind: 'steps', pos: Math.max(0, pos - 1), steps });
        },
      },
    ];
    return (
      <PhoneShell screen="M02" tabBar={false} stars={false} className="editor-phone-frame">
        <div className="editor-phone" data-id="editor-screen" data-state="ready">
          <div className="editor-phone-top">
            <a className="phone-round" href={`/d/${encodeURIComponent(doc.id)}`} aria-label={phone.t('editor.back')} data-id="editor-back">
              <Icon name="chevron-left" size={20} />
            </a>
            <span className="editor-phone-kind">{phone.t('editor.kind', { kind: t(tagOf(doc)), space: spaceName(locale, space) })}</span>
            <SaveChip state={state} autosave={autosave} onLoadServer={loadServer} />
            <button type="button" className="editor-phone-next" onClick={next} data-id="editor-submit">
              {phone.t('editor.next')}
            </button>
          </div>
          <div className="editor-phone-scroll">
            <div className="editor-phone-head">
              <span className="editor-phone-planet" data-planet={planet ?? 'violet'} aria-hidden="true" />
              <label className="editor-phone-title">
                <span>{phone.t('editor.title')}</span>
                <input
                  ref={titleInput}
                  type="text"
                  value={title}
                  maxLength={200}
                  placeholder={t('editor.titlePlaceholder')}
                  aria-invalid={titleError && !title.trim() ? true : undefined}
                  data-id="editor-title"
                  onChange={(event) => editTitle(event.target.value)}
                />
              </label>
            </div>
            {titleError && !title.trim() && (
              <span className="editor-title-error" role="alert">
                {t('editor.titleRequired')}
              </span>
            )}
            <div className="editor-phone-swatches" role="group" aria-label={t('editor.planetColours')}>
              <span aria-hidden="true">{phone.t('editor.colour')}</span>
              {PLANETS.map((colour) => (
                <button key={colour} type="button" className="editor-phone-swatch" aria-label={t(`editor.planet.${colour}`)} aria-pressed={(planet ?? 'violet') === colour} onClick={() => pickPlanet(colour)}>
                  <span data-planet={colour} />
                </button>
              ))}
            </div>
            {opened.openedAs !== 'clean' && (
              <p className="editor-restored" role="status">
                {t('editor.save.restored')}
              </p>
            )}
            <span className="editor-phone-label" aria-hidden="true">
              {phone.t('editor.body')}
            </span>
            <EditorContent editor={editor} className="editor-phone-body" data-id="editor-body" />
            <StepCaptions editor={editor} />
          </div>
          <div className="editor-phone-tools" role="toolbar" aria-label={phone.t('editor.tools')}>
            {tools.map((tool) => (
              <button key={tool.id} type="button" className="editor-phone-tool" aria-label={tool.label} onClick={tool.run} data-id={`editor-tool-${tool.id}`}>
                {tool.icon ? <Icon name={tool.icon} size={20} /> : tool.text}
              </button>
            ))}
            <button
              type="button"
              className="editor-phone-tool editor-phone-ai"
              aria-label={phone.t('editor.ai')}
              aria-expanded={aiSheet}
              onClick={() => {
                setAssistantTab('ai');
                setAiSheet(true);
                setAiFocus((n) => n + 1);
              }}
              data-id="editor-tool-ai"
            >
              <Icon name="sparkles" size={16} />
              AI
            </button>
          </div>
          <p className="editor-phone-hint">{phone.t('editor.hint')}</p>
          {aiSheet && (
            <>
              <button type="button" className="phone-scrim" aria-label={phone.t('editor.aiClose')} tabIndex={-1} onClick={() => setAiSheet(false)} />
              <RimPanel variant="sheet" as="div" className="editor-phone-ai-sheet" dataId="editor-ai-sheet">
                <SheetHandle label={phone.t('editor.aiClose')} onPress={() => setAiSheet(false)} />
                <EditorAssistant id={doc.id} writing={writing} tab={assistantTab} onTab={setAssistantTab} focusRequest={aiFocus} />
              </RimPanel>
            </>
          )}
        </div>
        {menus}
      </PhoneShell>
    );
  }

  return (
    <AppShell
      screen="C02"
      rail="create"
      view="docs"
      veil="strong"
      breadcrumb={crumbs}
      crumbAction={<span className="editor-crumb-tag" data-tag={tagOf(doc)}>{t(tagOf(doc))}</span>}
      spaceHref={`/s/${encodeURIComponent(space.slug)}`}
      docHref={`/d/${encodeURIComponent(doc.id)}`}
      className="editor-shell"
    >
      <div className="editor-screen" data-id="editor-screen" data-state="ready">
        <div className="editor-panel editor-toolbar" role="toolbar" aria-label={t('editor.toolbar')}>
          <SaveChip state={state} autosave={autosave} onLoadServer={loadServer} />
          <span className="editor-toolbar-rule" aria-hidden="true" />
          <button type="button" className="editor-history-button" aria-label={t('editor.undo')} title={t('editor.undoTitle')} disabled={!history.undo} onClick={() => editor?.chain().focus().undo().run()} data-id="editor-undo">
            <Icon name="undo-arrow" size={16} />⌘Z
          </button>
          <button type="button" className="editor-history-button" aria-label={t('editor.redo')} title={t('editor.redoTitle')} disabled={!history.redo} onClick={() => editor?.chain().focus().redo().run()} data-id="editor-redo">
            <Icon name="redo-arrow" size={16} />⇧⌘Z
          </button>
          <span className="editor-toolbar-gap" />
          <span className="editor-words" data-id="editor-words">
            {t('editor.words', { words, minutes: readingMinutes(words) })}
          </span>
          <a className="editor-glass-link" href={`/d/${encodeURIComponent(doc.id)}`} data-id="editor-preview">
            <Icon name="eye" size={16} />
            {t('editor.preview')}
          </a>
          <button
            type="button"
            className="editor-submit"
            data-id="editor-submit"
            onClick={next}
          >
            {t('editor.submit')}
          </button>
        </div>

        <aside className="editor-panel editor-settings" aria-label={t('editor.settings')}>
          <span className="editor-section">{t('editor.planet')}</span>
          <div className="editor-planet-stage">
            <span className="editor-planet" data-planet={planet ?? 'violet'} aria-hidden="true" />
          </div>
          <div className="editor-swatches" role="group" aria-label={t('editor.planetColours')}>
            {PLANETS.map((colour) => {
              const on = (planet ?? 'violet') === colour;
              return (
                <button
                  key={colour}
                  type="button"
                  className="editor-swatch"
                  data-planet={colour}
                  aria-label={t(`editor.planet.${colour}`)}
                  aria-pressed={on}
                  onClick={() => pickPlanet(colour)}
                />
              );
            })}
          </div>
        </aside>

        <main className="editor-panel editor-main" aria-label={t('editor.body')}>
          <label className="editor-title-field">
            <span className="kf-visually-hidden">{t('editor.titleLabel')}</span>
            <input
              ref={titleInput}
              className="editor-title"
              type="text"
              value={title}
              maxLength={200}
              placeholder={t('editor.titlePlaceholder')}
              aria-invalid={titleError && !title.trim() ? true : undefined}
              data-id="editor-title"
              onChange={(event) => editTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === 'ArrowDown') {
                  event.preventDefault();
                  editor?.commands.focus('start');
                }
              }}
            />
            {titleError && !title.trim() && (
              <span className="editor-title-error" role="alert">
                {t('editor.titleRequired')}
              </span>
            )}
          </label>
          <div className="editor-meta">
            <a className="editor-pill" href={`/d/${encodeURIComponent(doc.id)}/history`} data-id="editor-history">
              {t('editor.history', { version: state.version })}
            </a>
          </div>
          {opened.openedAs !== 'clean' && (
            <p className="editor-restored" role="status">
              {t('editor.save.restored')}
            </p>
          )}
          <EditorContent editor={editor} className="editor-body" data-id="editor-body" />
          <StepCaptions editor={editor} />
        </main>

        <EditorAssistant id={doc.id} writing={writing} tab={assistantTab} onTab={setAssistantTab} focusRequest={aiFocus} />
      </div>
      {menus}
    </AppShell>
  );
}

/** Screen-reader names of the step cards: the diagram is drawn with letters only. */
function StepCaptions({ editor }: { editor: Editor | null }): ReactNode {
  const { t } = useEditorText();
  const captions =
    useEditorState({
      editor,
      selector: ({ editor: e }) => {
        const found: string[] = [];
        e?.state.doc.descendants((node) => {
          if (node.type.name === 'steps' && isStepList(node.attrs.steps)) found.push(node.attrs.steps.map((s) => `${stepMark(s.term)}: ${s.term}${s.text ? ` ${s.text}` : ''}`).join('; '));
          return node.type.name !== 'steps';
        });
        return found.join('|');
      },
    }) ?? '';
  if (!captions) return null;
  return (
    <span className="kf-visually-hidden">
      {captions.split('|').map((steps) => t('editor.steps', { count: steps.split('; ').length, steps })).join(' ')}
    </span>
  );
}
