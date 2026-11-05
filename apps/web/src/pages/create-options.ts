/** What the create ring (board C01) offers, where each sits on the ring, and what it does. */
import type { CreateMessageKey } from './create-messages';
import type { SpaceKind } from '../ui/art';
import type { IconName } from '../ui/icon';

export type GroupId = 'content' | 'organise' | 'import' | 'journey';
export type OptionId = 'note' | 'template' | 'space' | 'collection' | 'office' | 'bulk' | 'url' | 'journey' | 'canvas';
/** What the panel on the right shows: the description of the option under the pointer, or a form. */
export type PaneId = 'hint' | 'space' | 'collection';
/** Why an option waits: the phase that brings it. */
export type LaterReason = 'import' | 'journey' | 'template';

export type OptionAction = { kind: 'link'; href: string } | { kind: 'pane'; pane: Exclude<PaneId, 'hint'> } | { kind: 'later'; when: LaterReason };

export interface CreateOption {
  id: OptionId;
  group: GroupId;
  icon: IconName;
  action: OptionAction;
}

/** Clockwise from the top, as on the board. */
export const CREATE_OPTIONS: readonly [CreateOption, ...CreateOption[]] = [
  { id: 'note', group: 'content', icon: 'create-note', action: { kind: 'link', href: '/new' } },
  { id: 'template', group: 'content', icon: 'create-template', action: { kind: 'later', when: 'template' } },
  { id: 'space', group: 'organise', icon: 'create-space', action: { kind: 'pane', pane: 'space' } },
  { id: 'collection', group: 'organise', icon: 'create-collection', action: { kind: 'pane', pane: 'collection' } },
  { id: 'office', group: 'import', icon: 'create-office', action: { kind: 'later', when: 'import' } },
  { id: 'bulk', group: 'import', icon: 'create-bulk', action: { kind: 'later', when: 'import' } },
  { id: 'url', group: 'import', icon: 'create-url', action: { kind: 'later', when: 'import' } },
  { id: 'journey', group: 'journey', icon: 'create-journey', action: { kind: 'later', when: 'journey' } },
  { id: 'canvas', group: 'journey', icon: 'create-canvas', action: { kind: 'link', href: '/canvas' } },
];

/** The crystal of each group (the board's art for Nội dung, Tổ chức, Nhập, Hành trình). */
export const GROUP_CRYSTAL: Record<GroupId, SpaceKind> = { content: 'networking', organise: 'personal', import: 'linux', journey: 'observability' };

/** The panel's title for each pane. */
export const CREATE_PANES: Record<PaneId, CreateMessageKey> = { hint: 'create.pane.hint', space: 'create.pane.space', collection: 'create.pane.collection' };

/** The ring's centre and radius in board px. */
const CENTRE = { x: 580, y: 470 };
const RADIUS = 262;
const STEP_DEG = 40;

/** Where the `index`th option sits: its centre on the ring and its angle (0° = right, clockwise; the first at the top). */
export function ringPlace(index: number): { x: number; y: number; angle: number } {
  const angle = -90 + index * STEP_DEG;
  const rad = (angle * Math.PI) / 180;
  return { x: Math.round(CENTRE.x + RADIUS * Math.cos(rad)), y: Math.round(CENTRE.y + RADIUS * Math.sin(rad)), angle };
}
