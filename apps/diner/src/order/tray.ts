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

export interface TrayState {
  readonly lines: readonly TrayLine[];
  /** Bumped per add, so two taps on one item cannot collide on a key. */
  readonly nextKey: number;
  /**
   * True once a shared toggle has been used, so the one-line explanation is
   * shown the first time and not on every line forever after.
   */
  readonly sharedExplained: boolean;
}

export const emptyTray: TrayState = { lines: [], nextKey: 1, sharedExplained: false };

export type TrayAction =
  | { readonly type: 'add'; readonly item: MenuItemDetail }
  | { readonly type: 'increment'; readonly key: string }
  | { readonly type: 'decrement'; readonly key: string }
  | { readonly type: 'setNote'; readonly key: string; readonly note: string }
  | { readonly type: 'toggleShared'; readonly key: string }
  /** After a send the server has accepted. Never before. */
  | { readonly type: 'clear' };

export function trayReducer(state: TrayState, action: TrayAction): TrayState {
  switch (action.type) {
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
          lines: state.lines.map((line) =>
            line.key === existing.key ? { ...line, quantity: line.quantity + 1 } : line,
          ),
        };
      }
      return {
        ...state,
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

    case 'decrement':
      // Down to zero removes the line. A stepper that stops at one leaves a
      // diner hunting for a delete control that does not exist.
      return {
        ...state,
        lines: state.lines
          .map((line) =>
            line.key === action.key ? { ...line, quantity: line.quantity - 1 } : line,
          )
          .filter((line) => line.quantity > 0),
      };

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

    case 'clear':
      // `sharedExplained` survives: the explanation is per session, not per
      // order, and showing it again after every send is noise.
      return { ...emptyTray, sharedExplained: state.sharedExplained };

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
