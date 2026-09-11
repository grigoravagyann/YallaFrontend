import type { MenuItemDetail, PlaceOrderLine } from '@yalla/api';

/**
 * The order tray: what has been tapped but not yet sent.
 *
 * Adding an item does **not** place an order. Two reasons, and both are about
 * somebody other than the diner:
 *
 * - A five-item order arriving as five separate tickets is a mess in the
 *   kitchen and unreadable on the counter panel.
 * - A diner adding items over two minutes should not generate two minutes of
 *   pings at a waiter who is carrying plates.
 *
 * So this is a basket, and the whole of it goes in one call. It is deliberately
 * a pure reducer with no storage: **the tray survives a screen change but not an
 * app restart.** A basket that comes back three hours later is a document, and a
 * diner who taps send on one is ordering food they decided against at lunchtime.
 */

export interface TrayLine {
  /** Stable within the tray. Not an order line id; nothing has been sent. */
  readonly key: string;
  readonly item: MenuItemDetail;
  readonly quantity: number;
  /** A short free-text modifier. Not a modifier system. */
  readonly note: string;
  /**
   * Split evenly across everyone at the table **when the order is sent**.
   *
   * The snapshot is taken by the server at send time, which is why the copy says
   * "right now": a friend who arrives later is not on this line.
   */
  readonly isShared: boolean;
}

/** What the server said when it accepted an order. Never assembled locally. */
export interface SentOrder {
  readonly orderId: string;
  /** From the server: the longest prep time on the order, not the sum. */
  readonly estimatedReadyAtUtc: string | null;
  /** The device clock at the moment the server answered, for "just now". */
  readonly atMs: number;
}

export interface TrayState {
  readonly lines: readonly TrayLine[];
  /** Bumped per add, so two taps on one item cannot collide on a key. */
  readonly nextKey: number;
  /**
   * True once a shared toggle has been used, so the one-line explanation is
   * shown the first time and not on every line forever after.
   */
  readonly sharedExplained: boolean;
  /**
   * When the tray stopped being empty, so an unsent tray can say how long it
   * has been sitting there. Cleared when the tray empties.
   */
  readonly startedAtMs: number | null;
  /**
   * The last order the **server accepted**, or `null`.
   *
   * Set only from a `PlaceOrderResult`, and never optimistically. It is what
   * lets the bar show a confirmed state that a tray cannot be mistaken for.
   */
  readonly lastSent: SentOrder | null;
  /**
   * The send in flight, or the last one whose outcome is not known.
   *
   * Held here, in the reducer above the tab's screens, so it survives the tray
   * screen remounting — a fresh id after backing out and returning is how an
   * order went to the kitchen twice. And bound to a fingerprint of the tray, so
   * a retry reuses the id only for the same items.
   */
  readonly pendingSend: PendingSend | null;
}

export interface PendingSend {
  readonly commandId: string;
  readonly fingerprint: string;
  /** The last attempt may have reached the kitchen. The tray is locked until it is checked. */
  readonly uncertain: boolean;
}

export const emptyTray: TrayState = {
  lines: [],
  nextKey: 1,
  sharedExplained: false,
  startedAtMs: null,
  lastSent: null,
  pendingSend: null,
};

export type TrayAction =
  | { readonly type: 'add'; readonly item: MenuItemDetail; readonly atMs: number }
  | { readonly type: 'increment'; readonly key: string }
  | { readonly type: 'decrement'; readonly key: string }
  | { readonly type: 'setNote'; readonly key: string; readonly note: string }
  | { readonly type: 'toggleShared'; readonly key: string }
  /** After a send the server has accepted. Never before. */
  | { readonly type: 'sent'; readonly order: SentOrder }
  /** Abandoning a tray without sending it, and dismissing a confirmation. */
  | { readonly type: 'clear' }
  | { readonly type: 'dismissSent' }
  /** A send is leaving, under this command. */
  | { readonly type: 'sending'; readonly commandId: string; readonly fingerprint: string }
  /**
   * It did not come back with an order. `uncertain` when it may still have been
   * placed (timeout, server error); false for a definite refusal (sold out,
   * bill asked for, offline), after which the tray can be edited and a new
   * command is used.
   */
  | { readonly type: 'sendFailed'; readonly uncertain: boolean };

/** Editing is refused while the last send's outcome is unknown. */
const EDITS: ReadonlySet<TrayAction['type']> = new Set<TrayAction['type']>([
  'add',
  'increment',
  'decrement',
  'setNote',
  'toggleShared',
  'clear',
]);

export function trayReducer(state: TrayState, action: TrayAction): TrayState {
  if (state.pendingSend?.uncertain && EDITS.has(action.type)) return state;

  switch (action.type) {
    case 'sending':
      return {
        ...state,
        pendingSend: {
          commandId: action.commandId,
          fingerprint: action.fingerprint,
          uncertain: false,
        },
      };

    case 'sendFailed':
      return {
        ...state,
        pendingSend:
          action.uncertain && state.pendingSend ? { ...state.pendingSend, uncertain: true } : null,
      };

    case 'add': {
      // A second tap on the same item bumps the quantity rather than adding a
      // second line — that is what a diner means, and it keeps a round of four
      // coffees at four taps rather than four taps and a stepper. A line with a
      // note or a shared flag is left alone: it is a different thing now.
      const existing = state.lines.find(
        (line) => line.item.id === action.item.id && line.note === '' && !line.isShared,
      );
      if (existing) {
        return {
          ...state,
          startedAtMs: state.startedAtMs ?? action.atMs,
          lastSent: null,
          lines: state.lines.map((line) =>
            line.key === existing.key ? { ...line, quantity: line.quantity + 1 } : line,
          ),
        };
      }
      return {
        ...state,
        // The moment the tray stopped being empty, so it can say how long it has
        // been sitting unsent.
        startedAtMs: state.startedAtMs ?? action.atMs,
        // Adding to a tray after a send ends the confirmation. Showing "order
        // sent" above a tray with new items in it is the exact confusion this
        // bar exists to prevent.
        lastSent: null,
        lines: [
          ...state.lines,
          {
            key: `t${state.nextKey}`,
            item: action.item,
            quantity: 1,
            note: '',
            isShared: false,
          },
        ],
        nextKey: state.nextKey + 1,
      };
    }

    case 'increment':
      return {
        ...state,
        lines: state.lines.map((line) =>
          line.key === action.key ? { ...line, quantity: line.quantity + 1 } : line,
        ),
      };

    case 'decrement': {
      // Down to zero removes the line. A stepper that stops at one leaves a
      // diner hunting for a delete control that does not exist.
      const lines = state.lines
        .map((line) => (line.key === action.key ? { ...line, quantity: line.quantity - 1 } : line))
        .filter((line) => line.quantity > 0);
      // An emptied tray is not an old tray: the clock restarts with the next add.
      return { ...state, lines, startedAtMs: lines.length === 0 ? null : state.startedAtMs };
    }

    case 'setNote':
      return {
        ...state,
        lines: state.lines.map((line) =>
          line.key === action.key ? { ...line, note: action.note } : line,
        ),
      };

    case 'toggleShared':
      return {
        ...state,
        sharedExplained: true,
        lines: state.lines.map((line) =>
          line.key === action.key ? { ...line, isShared: !line.isShared } : line,
        ),
      };

    case 'sent':
      // The lines go, the confirmation arrives. `sharedExplained` survives: the
      // explanation is per session, not per order.
      return { ...emptyTray, sharedExplained: state.sharedExplained, lastSent: action.order };

    case 'clear':
      return { ...emptyTray, sharedExplained: state.sharedExplained };

    case 'dismissSent':
      return { ...state, lastSent: null };

    default:
      return state;
  }
}

export function trayItemCount(state: TrayState): number {
  return state.lines.reduce((sum, line) => sum + line.quantity, 0);
}

/**
 * What the tray comes to, for the bar at the bottom of the menu.
 *
 * **This is the one place the diner app multiplies money, and it is not a
 * bill.** These items have not been ordered: there is no tab line, no service
 * charge and no share to read from the server, so there is nothing to display
 * except the client's own arithmetic. It is labelled as a tray subtotal
 * everywhere it appears, and it is never shown next to the tab's totals.
 *
 * It still has to agree with what the server will charge for the same items,
 * which is what the test pins: unit price times quantity, summed, with no
 * rounding of its own — every price is already whole dram.
 */
export function traySubtotalDram(state: TrayState): number {
  return state.lines.reduce((sum, line) => sum + line.item.priceDram * line.quantity, 0);
}

/**
 * The tray as the server's command.
 *
 * `participantId` is the sender: a diner ordering on their own phone is
 * ordering for themselves, so lines are attributed rather than left to the
 * table. A shared line is still attributed — the server splits it across the
 * snapshot, and knowing who tapped it is what lets the tab say "added by Ani".
 */
export function trayToOrderLines(
  state: TrayState,
  participantId: string,
): readonly PlaceOrderLine[] {
  return state.lines.map((line) => ({
    menuItemId: line.item.id,
    quantity: line.quantity,
    isShared: line.isShared,
    participantId,
    ...(line.note.trim() ? { note: line.note.trim() } : {}),
  }));
}

// ---------------------------------------------------------------------------
// The bar
// ---------------------------------------------------------------------------

/**
 * How long a tray may sit before the bar says so, in milliseconds.
 *
 * Long enough not to nag somebody still reading the menu; short enough to catch
 * the person who thinks they have ordered. Three minutes is roughly the point at
 * which a diner starts glancing towards the kitchen.
 */
export const UNSENT_NUDGE_MS = 3 * 60_000;

/**
 * What the bar at the bottom of the menu is showing.
 *
 * A discriminated union, and that is the whole fix. The bar used to be one
 * Pressable whose call to action read **"Review"** — a word that describes
 * looking at something that already exists, next to a count and a total, on a
 * screen where the only other totals are the bill's. A diner reading it as
 * "review your order" rather than "you have not ordered" waits twenty minutes
 * for food nobody is cooking, which is the worst failure this screen has.
 *
 * So the three states are separate values with separate copy, and the sent one
 * cannot be reached by rendering the holding one differently:
 *
 * - `empty` — no bar at all.
 * - `holding` — items in the tray, **nothing sent**, said in words rather than
 *   implied by a button. Its action reads "Send to kitchen".
 * - `sent` — the server has accepted an order. Visually distinct, carries the
 *   server's own estimate, and never a count or a tray subtotal.
 */
export type TrayBarState =
  | { readonly kind: 'empty' }
  | {
      readonly kind: 'holding';
      readonly count: number;
      readonly subtotalDram: number;
      /** True once the tray has sat unsent long enough to be worth saying. */
      readonly nudge: boolean;
    }
  | {
      readonly kind: 'sent';
      readonly orderId: string;
      /** The server's estimate. `null` when it did not give one. */
      readonly estimatedReadyAtUtc: string | null;
    };

/**
 * `nowMs` is passed in rather than read, so the nudge is testable and so the
 * bar re-renders on a clock the screen subscribes to rather than on whatever
 * happened to cause the last render.
 */
export function trayBarState(state: TrayState, nowMs: number): TrayBarState {
  if (state.lines.length > 0) {
    return {
      kind: 'holding',
      count: trayItemCount(state),
      subtotalDram: traySubtotalDram(state),
      nudge: state.startedAtMs !== null && nowMs - state.startedAtMs >= UNSENT_NUDGE_MS,
    };
  }

  if (state.lastSent) {
    return {
      kind: 'sent',
      orderId: state.lastSent.orderId,
      estimatedReadyAtUtc: state.lastSent.estimatedReadyAtUtc,
    };
  }

  return { kind: 'empty' };
}

/**
 * What identifies the tray's contents, for binding a command id to them.
 *
 * The server answers a known command id with the original order whatever the
 * items are, so an id reused for different items silently drops the change.
 */
export function trayFingerprint(state: TrayState): string {
  return JSON.stringify(
    state.lines.map((line) => [line.item.id, line.quantity, line.isShared, line.note.trim()]),
  );
}

/**
 * The command id for sending the tray as it is now: the pending one for the
 * same contents, a fresh one otherwise.
 */
export function commandFor(
  state: TrayState,
  fresh: () => string,
): { readonly commandId: string; readonly fingerprint: string } {
  const fingerprint = trayFingerprint(state);
  if (state.pendingSend && state.pendingSend.fingerprint === fingerprint) {
    return { commandId: state.pendingSend.commandId, fingerprint };
  }
  return { commandId: fresh(), fingerprint };
}

/** True while the last send's outcome is unknown: check it before changing anything. */
export function trayLocked(state: TrayState): boolean {
  return state.pendingSend?.uncertain === true;
}
