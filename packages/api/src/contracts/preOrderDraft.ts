import { formatDram, type Locale } from '@yalla/format';
import type { FieldViolation } from '../errors';
import type { BranchMenu, MenuItemDetail } from './ordering';
import {
  PRE_ORDER_LIMITS,
  isPreOrderable,
  preOrderNote,
  type PreOrder,
  type PreOrderDraft,
} from './preOrder';
import type { CopyLine } from './reservation';

/**
 * The pre-order editor's draft (2026-10-21): the **whole** pre-order the guest
 * is building, as the next save will send it. One module for the app's editor
 * and the manage link's, so a rule fixed here is fixed on both.
 *
 * One line per dish as the picker adds them, in the order they were added; a
 * pre-order saved elsewhere with a dish twice keeps both lines, and each
 * line's own − n + changes that line (`addOneAt`, `removeOneAt`). Notes are
 * kept as typed and trimmed only when sent (`draftCommand`), so the cursor
 * never jumps while somebody types a space.
 *
 * Pure, so the rules are tested without a screen.
 */

export interface DraftLine {
  readonly menuItemId: string;
  readonly quantity: number;
  /** For the kitchen, as typed; blank is none. */
  readonly note: string;
}

export interface EditorDraft {
  readonly lines: readonly DraftLine[];
  /** The booking-level note, as typed. */
  readonly note: string;
}

export const emptyDraft: EditorDraft = { lines: [], note: '' };

/** The editor's starting point: the pre-order there is, or nothing. */
export function startDraft(preOrder: PreOrder | null | undefined): EditorDraft {
  if (!preOrder) return emptyDraft;
  return {
    lines: preOrder.lines.map((line) => ({
      menuItemId: line.menuItemId,
      quantity: line.quantity,
      note: line.note ?? '',
    })),
    note: preOrder.note ?? '',
  };
}

export function quantityOf(draft: EditorDraft, menuItemId: string): number {
  return draft.lines
    .filter((line) => line.menuItemId === menuItemId)
    .reduce((sum, line) => sum + line.quantity, 0);
}

function totalQuantity(draft: EditorDraft): number {
  return draft.lines.reduce((sum, line) => sum + line.quantity, 0);
}

/** Whether one more of a dish stays inside the server's bounds (20 of one, 60 in all, 30 lines). */
export function canAddMore(draft: EditorDraft, menuItemId: string): boolean {
  if (totalQuantity(draft) >= PRE_ORDER_LIMITS.maxTotalQuantity) return false;
  const line = draft.lines.find((entry) => entry.menuItemId === menuItemId);
  if (line) return line.quantity < PRE_ORDER_LIMITS.maxQuantity;
  return draft.lines.length < PRE_ORDER_LIMITS.maxLines;
}

/** One more: the dish's first line goes up, or a new line is added at the end. */
export function addOne(draft: EditorDraft, menuItemId: string): EditorDraft {
  if (!canAddMore(draft, menuItemId)) return draft;
  const index = draft.lines.findIndex((line) => line.menuItemId === menuItemId);
  if (index < 0) {
    return { ...draft, lines: [...draft.lines, { menuItemId, quantity: 1, note: '' }] };
  }
  return addOneAt(draft, index);
}

/** One fewer: off the dish's last line; a line at nought goes. */
export function removeOne(draft: EditorDraft, menuItemId: string): EditorDraft {
  let index = -1;
  draft.lines.forEach((line, at) => {
    if (line.menuItemId === menuItemId) index = at;
  });
  return index < 0 ? draft : removeOneAt(draft, index);
}

/** Whether one more on the line at `index` stays inside the bounds. */
export function canAddMoreAt(draft: EditorDraft, index: number): boolean {
  const line = draft.lines[index];
  return (
    line !== undefined &&
    line.quantity < PRE_ORDER_LIMITS.maxQuantity &&
    totalQuantity(draft) < PRE_ORDER_LIMITS.maxTotalQuantity
  );
}

/** One more on the line at `index` — that line, even when the dish is listed twice. */
export function addOneAt(draft: EditorDraft, index: number): EditorDraft {
  if (!canAddMoreAt(draft, index)) return draft;
  return {
    ...draft,
    lines: draft.lines.map((line, at) =>
      at === index ? { ...line, quantity: line.quantity + 1 } : line,
    ),
  };
}

/** One fewer on the line at `index`; at nought the line goes. */
export function removeOneAt(draft: EditorDraft, index: number): EditorDraft {
  const line = draft.lines[index];
  if (!line) return draft;
  if (line.quantity <= 1) return removeLine(draft, index);
  return {
    ...draft,
    lines: draft.lines.map((entry, at) =>
      at === index ? { ...entry, quantity: entry.quantity - 1 } : entry,
    ),
  };
}

export function removeLine(draft: EditorDraft, index: number): EditorDraft {
  return { ...draft, lines: draft.lines.filter((_line, at) => at !== index) };
}

export function setLineNote(draft: EditorDraft, index: number, note: string): EditorDraft {
  return {
    ...draft,
    lines: draft.lines.map((line, at) => (at === index ? { ...line, note } : line)),
  };
}

export function setNote(draft: EditorDraft, note: string): EditorDraft {
  return { ...draft, note };
}

/** What a save sends: the whole list, notes trimmed and blank as none. */
export function draftCommand(draft: EditorDraft): PreOrderDraft {
  return {
    lines: draft.lines.map((line) => ({
      menuItemId: line.menuItemId,
      quantity: line.quantity,
      note: preOrderNote(line.note),
    })),
    note: preOrderNote(draft.note),
  };
}

/** Whether saving would change anything: the same dishes, counts and notes as saved are not a change. */
export function isDirty(draft: EditorDraft, preOrder: PreOrder | null | undefined): boolean {
  return JSON.stringify(draftCommand(draft)) !== JSON.stringify(draftCommand(startDraft(preOrder)));
}

export interface PricedLine {
  /** The line's place in the draft, for editing it. */
  readonly index: number;
  readonly menuItemId: string;
  readonly name: string;
  readonly unitPriceDram: number;
  readonly quantity: number;
  readonly lineTotalDram: number;
  readonly note: string;
  /** Sold out, excluded or gone since: remove or swap it before saving. */
  readonly unavailable: boolean;
}

export interface PricedDraft {
  readonly lines: readonly PricedLine[];
  readonly totalDram: number;
  /** The dishes to remove or swap before a save can succeed. */
  readonly unavailable: readonly string[];
}

/** The dishes an editor has seen on the picker's menu, by id: kept as the menu is read again. */
export type SeenDishes = ReadonlyMap<string, Pick<MenuItemDetail, 'name' | 'priceDram'>>;

/**
 * `seen` with every dish on `menu` added: what a dish was called and cost
 * when the guest chose it, for a line whose dish has left the menu since —
 * sold out between the guest's tap and the save, and the menu read again.
 */
export function rememberDishes(seen: SeenDishes, menu: BranchMenu | null | undefined): SeenDishes {
  if (!menu) return seen;
  const next = new Map(seen);
  for (const category of menu.categories) {
    for (const item of category.items)
      next.set(item.id, { name: item.name, priceDram: item.priceDram });
  }
  return next;
}

/**
 * The draft priced as the server will price it: a dish already on the
 * pre-order keeps the price it was locked at; a new one costs what the menu
 * says now (or said, from `seen`, once it has left the menu). A dish is
 * flagged when the server said it is not available now, when the loaded menu
 * no longer offers it for pre-ordering, or when the last save was refused for
 * it (`refused`).
 */
export function priceDraft(
  draft: EditorDraft,
  context: {
    readonly preOrder: PreOrder | null | undefined;
    readonly menu: BranchMenu | null | undefined;
    readonly refused?: readonly string[] | undefined;
    readonly seen?: SeenDishes | undefined;
  },
): PricedDraft {
  const saved = new Map(context.preOrder?.lines.map((line) => [line.menuItemId, line]) ?? []);
  const offered = new Map<string, MenuItemDetail>();
  for (const category of context.menu?.categories ?? []) {
    for (const item of category.items) offered.set(item.id, item);
  }
  const refused = new Set(context.refused ?? []);

  const lines = draft.lines.map((line, index): PricedLine => {
    const kept = saved.get(line.menuItemId);
    const item = offered.get(line.menuItemId);
    const known = item ?? context.seen?.get(line.menuItemId);
    const unitPriceDram = kept?.unitPriceDram ?? known?.priceDram ?? 0;
    const unavailable =
      refused.has(line.menuItemId) ||
      kept?.availableNow === false ||
      (context.menu != null && (!item || !isPreOrderable(item)));
    return {
      index,
      menuItemId: line.menuItemId,
      name: kept?.name ?? known?.name ?? '',
      unitPriceDram,
      quantity: line.quantity,
      lineTotalDram: unitPriceDram * line.quantity,
      note: line.note,
      unavailable,
    };
  });

  return {
    lines,
    totalDram: lines.reduce((sum, line) => sum + line.lineTotalDram, 0),
    unavailable: [...new Set(lines.filter((line) => line.unavailable).map((l) => l.menuItemId))],
  };
}

/** "700 ֏", or "1,200 ֏ × 2 · 2,400 ֏" for more than one: the locked price and the line's total. */
export function pricedLineText(
  line: Pick<PricedLine, 'unitPriceDram' | 'quantity' | 'lineTotalDram'>,
  locale: Locale,
): string {
  return line.quantity > 1
    ? `${formatDram(line.unitPriceDram, locale)} × ${line.quantity} · ${formatDram(line.lineTotalDram, locale)}`
    : formatDram(line.lineTotalDram, locale);
}

/**
 * A bound the draft is past (`preOrderDraftViolations`), in the guest's
 * words: keys in the **`diner`** namespace (`preOrder.limit.*`).
 */
export function preOrderLimitLine(violation: FieldViolation): CopyLine {
  const max = violation.max ?? 0;
  if (violation.field === 'note') return { key: 'preOrder.limit.note', params: { max } };
  if (violation.field.endsWith('.note')) return { key: 'preOrder.limit.lineNote', params: { max } };
  if (violation.field.endsWith('.quantity')) {
    return { key: 'preOrder.limit.quantity', params: { max } };
  }
  return max === PRE_ORDER_LIMITS.maxTotalQuantity
    ? { key: 'preOrder.limit.total', params: { max } }
    : { key: 'preOrder.limit.lines', params: { max: PRE_ORDER_LIMITS.maxLines } };
}
