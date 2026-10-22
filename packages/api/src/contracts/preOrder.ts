import { formatTime, type Locale, type TimeZone } from '@yalla/format';
import {
  ConcurrencyConflictError,
  ForbiddenError,
  NetworkError,
  NotFoundError,
  ServerError,
  TimeoutError,
  TooManyRequestsError,
  ValidationError,
  type FieldViolation,
} from '../errors';
import {
  BookingCommandInUseError,
  BookingNotChangeableError,
  OnMyWayNotOpenError,
  PreOrderAlreadySentError,
  PreOrderItemsUnavailableError,
  PreOrderLockedError,
  PreOrderNotSendableError,
  PreOrdersNotAcceptedError,
  RateLimitedError,
  ServiceRequestRateLimitedError,
  TabNotAcceptingOrdersError,
  TableBusyError,
  type UnavailablePreOrderItem,
} from './errors';
import type { FloorChangeSignal } from './admission';
import type { GuestRecord } from './guestRecord';
import type { BranchMenu, MenuItemDetail, OrderStatus } from './ordering';
import type { ReservationStatusCode } from './push';
import type { BookingAnswerFields } from './onMyWay';
import type { CopyLine } from './reservation';

/**
 * Pre-orders on a booking (approved 2026-10-21).
 *
 * A guest with a booking may choose dishes ahead — at booking time or later,
 * in the app or from the manage link — until **two hours** before the start.
 * Forty-five minutes before, a guest with a pre-order is asked "Are you on
 * your way?"; the waiter's card appears on the tablet's rail the branch's
 * `minutesBefore` (default 30) before the start, with "Coming → Send to
 * kitchen" and "Not coming / no answer". Sent, the pre-order is a kitchen
 * ticket at once and becomes the first order on the party's tab when they
 * sit. Prices are locked when a dish first enters it.
 *
 * Every shape here is the wire's (`PO-WIRE.md`), renamed the way the rest of
 * the client is: amounts `Dram`, enums as words. The rules the server applies
 * are mirrored only where a screen or the mocks need them; the server's
 * answer always wins (`state`, `editableUntilUtc`, `availableNow`).
 */

// ---------------------------------------------------------------------------
// The product's fixed numbers
// ---------------------------------------------------------------------------

/** Pre-orders close this many hours before the start (`PreOrderRules.EditableUntilHoursBefore`). */
export const PRE_ORDER_EDITABLE_HOURS_BEFORE = 2;
/**
 * "Are you on your way?" is asked this many minutes before the start of a
 * booking whose pre-order is still waiting: the kitchen needs the answer
 * earlier than the floor does (`PreOrderRules.OnYourWayMinutesBefore`).
 */
export const ON_YOUR_WAY_MINUTES_BEFORE = 45;
/**
 * …and this many before every other confirmed booking (2026-10-21: every
 * booking is asked, so the waiter does not call a guest who said yes;
 * `PreOrderRules.OnYourWayMinutesBeforeWithoutPreOrder`).
 */
export const ON_YOUR_WAY_MINUTES_BEFORE_WITHOUT_PRE_ORDER = 30;
/** The waiter's card appears this long before the start, by default (branch setting). */
export const PRE_ORDER_MINUTES_BEFORE_DEFAULT = 30;
/** The branch setting's bounds; 120 so the card never shows while the guest can still edit. */
export const PRE_ORDER_MINUTES_BEFORE_MIN = 5;
export const PRE_ORDER_MINUTES_BEFORE_MAX = 120;

/** The bounds a save is held to (422 `validation-failed` otherwise). */
export const PRE_ORDER_LIMITS = {
  /** 1 to 30 lines. */
  maxLines: 30,
  /** 1 to 20 of one dish. */
  maxQuantity: 20,
  /** At most 60 dishes in all. */
  maxTotalQuantity: 60,
  /** A line's note for the kitchen (`FieldLengths.OrderNote`). */
  maxLineNote: 200,
  /** The booking-level note. */
  maxNote: 500,
} as const;

// ---------------------------------------------------------------------------
// The pre-order
// ---------------------------------------------------------------------------

/**
 * `PreOrderState`, derived by the server on every read: 1 Editable, 2 Locked,
 * 3 Sent, 4 NotComing, 5 Cancelled — precedence Sent > Cancelled > NotComing >
 * Locked > Editable. `unknown` for a value a newer server adds: offer nothing.
 *
 * - `cancelled`: the booking was cancelled, declined, expired or blocked, or
 *   it ended as a no-show or completed **without** a send. Undoing a no-show
 *   brings an unsent pre-order back.
 * - `sent` stays sent whatever happens to the booking afterwards.
 * - `notComing`: a waiter marked "not coming / no answer"; still sendable
 *   until the booking ends.
 */
export type PreOrderState = 'editable' | 'locked' | 'sent' | 'notComing' | 'cancelled' | 'unknown';

/** One dish on a pre-order, at its locked price. `PreOrderLineView`. */
export interface PreOrderLine {
  readonly id: string;
  readonly menuItemId: string;
  /** The dish's name when it was ordered. */
  readonly name: string;
  /** The **locked** price — show this, never the menu's current one. */
  readonly unitPriceDram: number;
  readonly quantity: number;
  readonly lineTotalDram: number;
  /** For the kitchen; `null` when none. */
  readonly note: string | null;
  /**
   * False when the dish has since sold out, been excluded from pre-orders or
   * left the menu. It stays on the pre-order (it was promised), but a save
   * that keeps it is refused (`PreOrderItemsUnavailableError`): ask the guest
   * to remove or swap it. The waiter's card says "sold out now".
   */
  readonly availableNow: boolean;
}

/** A booking's pre-order, as every read gives it. `PreOrderView`. */
export interface PreOrder {
  /** Also its kitchen ticket's id, and the order's id on the tab once seated. */
  readonly id: string;
  readonly reservationId: string;
  readonly state: PreOrderState;
  /** In the order the guest listed them. Never empty: clearing removes the pre-order. */
  readonly lines: readonly PreOrderLine[];
  /** The booking-level note ("We'd like the salad first"); `null` when none. */
  readonly note: string | null;
  /** The lines at their locked prices. No service charge: that is the tab's. */
  readonly totalDram: number;
  /** The start less two hours: the guest may edit while `state` is `editable` and now is before it. */
  readonly editableUntilUtc: string;
  /** The start less the branch's `minutesBefore`: when the waiter's card appears. */
  readonly dueAtUtc: string;
  /** When a waiter sent it to the kitchen; `null` until then. */
  readonly sentAtUtc: string | null;
  /**
   * Where its ticket is once sent — `inKitchen`, `ready`, `served`, `voided`
   * (the held ticket's until the party sits, then the tab order's). `null`
   * until sent.
   */
  readonly kitchenStatus: OrderStatus | null;
  /** It is an order on the party's tab (and the table's lines, not the diner's "my orders"). */
  readonly onTab: boolean;
  /** When a waiter marked "not coming / no answer"; `null` otherwise. */
  readonly notComingAtUtc: string | null;
  readonly updatedAtUtc: string;
}

/**
 * The pre-order fields a booking read carries — `ReservationView` (the app's
 * `/mine`, every booking answer, the console list and the floor's awaiting
 * list) and the manage link's `PublicBookingView`. Optional so a fixture or a
 * server from before them reads as "no pre-order, none offered". With them,
 * the guest's answers and the venue's ask ({@link BookingAnswerFields}).
 */
export interface BookingPreOrderFields extends BookingAnswerFields {
  /** The booking's pre-order; absent or `null` when it has none. */
  readonly preOrder?: PreOrder | null | undefined;
  /**
   * Present when the branch **accepts pre-orders** and the booking is pending
   * or confirmed and still to start: the start less two hours. Offer "Add /
   * edit pre-order" while now is before it. Absent when the branch does not
   * take them: offer nothing — unless `preOrder` exists, which is then shown
   * read-only and may be cleared.
   */
  readonly preOrderEditableUntilUtc?: string | null | undefined;
}

// ---------------------------------------------------------------------------
// The guest's commands
// ---------------------------------------------------------------------------

/** One dish as the guest sends it. */
export interface PreOrderLineInput {
  readonly menuItemId: string;
  /** 1 to {@link PRE_ORDER_LIMITS.maxQuantity}. */
  readonly quantity: number;
  /** For the kitchen; blank is none; at most {@link PRE_ORDER_LIMITS.maxLineNote}. */
  readonly note?: string | null | undefined;
}

/** What the editor holds: the **whole** pre-order, lines in display order. */
export interface PreOrderDraft {
  readonly lines: readonly PreOrderLineInput[];
  /** The booking-level note; blank is none; at most {@link PRE_ORDER_LIMITS.maxNote}. */
  readonly note?: string | null | undefined;
}

/**
 * Save the pre-order of the diner's own booking —
 * `PUT /api/reservations/{reservationId}/pre-order`. Replaces it whole.
 */
export interface ReplacePreOrderCommand extends PreOrderDraft {
  readonly reservationId: string;
  /** One per save attempt, reused on a retry: a replay answers the pre-order as it stands. */
  readonly clientCommandId: string;
}

/** Remove it — `POST /api/reservations/{reservationId}/pre-order/clear`. */
export interface ClearPreOrderCommand {
  readonly reservationId: string;
  readonly clientCommandId: string;
}

/** The same two from a manage link: `PUT /api/public/bookings/{token}/pre-order`. */
export interface ReplaceManagedPreOrderCommand extends PreOrderDraft {
  readonly token: string;
  readonly clientCommandId: string;
}

/** `POST /api/public/bookings/{token}/pre-order/clear`. */
export interface ClearManagedPreOrderCommand {
  readonly token: string;
  readonly clientCommandId: string;
}

/** The answer to a save or a clear. `PreOrderResult`. */
export interface PreOrderResult {
  readonly reservationId: string;
  /** As it stands now; `null` after clearing. */
  readonly preOrder: PreOrder | null;
  /** The same command id arrived before: nothing changed this time. */
  readonly wasReplay: boolean;
}

/** The answer to "Yes, on my way". `OnMyWayResult`. */
export interface OnMyWayResult {
  readonly reservationId: string;
  /** When the guest **first** said so. */
  readonly guestConfirmedOnWayAtUtc: string;
  /** They had said so already. */
  readonly wasReplay: boolean;
}

// ---------------------------------------------------------------------------
// The floor tablet's rail
// ---------------------------------------------------------------------------

/**
 * One card on the "Հիմա" rail — `GET /api/branches/{branchId}/pre-orders/due`
 * — and the answer to the waiter's two actions. `DuePreOrder`.
 */
export interface DuePreOrder {
  readonly reservationId: string;
  readonly code: string;
  readonly tableId: string;
  readonly tableLabel: string;
  /** "Hall", "Terrace"; `null` for a table in no room. */
  readonly roomName: string | null;
  readonly startUtc: string;
  /** "19:30" on the branch's clock (the server's `HH:mm:ss`, cut to minutes). */
  readonly localStartTime: string;
  readonly partySize: number;
  /** The booking's: `confirmed` or `seated` on the rail. */
  readonly status: ReservationStatusCode;
  readonly guestName: string;
  /** The number to call; `null` for a platform admin (the venue's to call). */
  readonly guestPhone: string | null;
  /** Present: "Guest confirmed" — no call needed. */
  readonly guestConfirmedOnWayAtUtc: string | null;
  /**
   * "Running late": 10, 15 or 30 minutes, the guest's latest answer
   * (2026-10-22). Absent or `null` unless they said it, and from older fixtures.
   */
  readonly guestRunningLateMinutes?: number | null | undefined;
  /** When they said it. */
  readonly guestRunningLateAtUtc?: string | null | undefined;
  /** When somebody at the venue last asked "are you coming?" from the tablet. */
  readonly staffAskedOnMyWayAtUtc?: string | null | undefined;
  /** As on the awaiting cards; `null` where not shown. */
  readonly guestRecord: GuestRecord | null;
  readonly dueAtUtc: string;
  readonly preOrder: PreOrder;
  /** The waiter who sent it; `null` until sent. */
  readonly sentByName: string | null;
  /** The waiter who marked "not coming"; `null` unless marked. */
  readonly notComingByName: string | null;
  /** The party's tab, once it is an order on it. */
  readonly tabId: string | null;
  /** On an action's answer: it had been done already (two tablets → one ticket). */
  readonly wasReplay: boolean;
}

/** The rail. `DuePreOrders`. */
export interface DuePreOrders {
  /** Soonest first, then by table. Includes sent and not-coming cards (render their state). */
  readonly items: readonly DuePreOrder[];
  /**
   * When the next card appears: read the rail again then (and on the
   * change-stream signals in `PRE_ORDER_RAIL_SIGNALS`). `null` when no confirmed
   * booking with a pre-order is still to come.
   */
  readonly nextDueAtUtc: string | null;
}

/**
 * The change-stream signals on which the tablet reads the rail again:
 * `preOrderChanged` (6), `bookingChanged` (5) and `bookingCancelledByBlock`
 * (4) — a booking a no-show block cancelled gets only its signal-4 row, and
 * its card must leave the rail then, not at the next poll. Never folded into
 * the floor.
 */
export const PRE_ORDER_RAIL_SIGNALS: readonly FloorChangeSignal[] = [
  'preOrderChanged',
  'bookingChanged',
  'bookingCancelledByBlock',
];

/** Whether a change-stream entry's signal asks for the rail to be read again. */
export function readsPreOrderRail(signal: FloorChangeSignal | null | undefined): boolean {
  return signal != null && PRE_ORDER_RAIL_SIGNALS.includes(signal);
}

/**
 * "Coming → Send to kitchen" — `POST /api/reservations/{id}/pre-order/send`;
 * "Not coming / no answer" — `…/pre-order/not-coming`. Waiter or above, online
 * only. Idempotent by state: a second tap (or tablet) answers `wasReplay`.
 */
export interface PreOrderStaffCommand {
  readonly reservationId: string;
  readonly clientCommandId: string;
}

/**
 * The marker on a kitchen ticket that came from a pre-order — on a held ticket
 * (sent before the party sat, `tabId` absent) **and** on the tab order it
 * became. "Pre-order · 19:30 · 4 · Anna": time the cooking to `startUtc`.
 */
export interface KitchenPreOrder {
  readonly reservationId: string;
  readonly startUtc: string;
  /** "19:30" on the branch's clock. */
  readonly localStartTime: string;
  readonly partySize: number;
  readonly guestName: string;
}

// ---------------------------------------------------------------------------
// The console's settings
// ---------------------------------------------------------------------------

/** `PUT /api/branches/{branchId}/pre-order-settings` — all three, every time. */
export interface PreOrderSettingsInput {
  /** Off by default: a venue that has not looked at the feature gets no tickets. */
  readonly acceptsPreOrders: boolean;
  /** When the waiter's card appears, {@link PRE_ORDER_MINUTES_BEFORE_MIN}–{@link PRE_ORDER_MINUTES_BEFORE_MAX}. */
  readonly minutesBefore: number;
  /** The **whole** list: every other dish becomes pre-orderable. */
  readonly excludedMenuItemIds: readonly string[];
}

/** `GET /api/branches/{branchId}/pre-order-settings`, and the PUT's answer. */
export interface PreOrderSettings extends PreOrderSettingsInput {
  readonly bounds: { readonly minutesBeforeMin: number; readonly minutesBeforeMax: number };
  /** 2: the product's lock, shown in the form's help. */
  readonly editableUntilHoursBefore: number;
  /** 45: when the guest is asked. */
  readonly onYourWayMinutesBefore: number;
}

export const DEFAULT_PRE_ORDER_SETTINGS: PreOrderSettings = {
  acceptsPreOrders: false,
  minutesBefore: PRE_ORDER_MINUTES_BEFORE_DEFAULT,
  excludedMenuItemIds: [],
  bounds: {
    minutesBeforeMin: PRE_ORDER_MINUTES_BEFORE_MIN,
    minutesBeforeMax: PRE_ORDER_MINUTES_BEFORE_MAX,
  },
  editableUntilHoursBefore: PRE_ORDER_EDITABLE_HOURS_BEFORE,
  onYourWayMinutesBefore: ON_YOUR_WAY_MINUTES_BEFORE,
};

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

/** The feed entry, appearing when the question is asked (30 or 45 minutes before). Params as every booking entry. */
export const ON_YOUR_WAY_FEED_KIND = 'booking-on-your-way';
/** The push's `data.kind`. Outbox type `reservation.on-your-way`. */
export const ON_YOUR_WAY_PUSH_KIND = 'reservation-on-your-way';
/** The push's notification category: two action buttons. */
export const ON_YOUR_WAY_PUSH_CATEGORY = 'on-your-way';
/** The push's `data.actions`, comma-separated: "Yes, on my way" and the ordinary cancel. */
export const ON_YOUR_WAY_PUSH_ACTIONS = ['on-my-way', 'cancel'] as const;

// ---------------------------------------------------------------------------
// The rules, as the screens and the mocks read them
// ---------------------------------------------------------------------------

function shift(instant: string, minutes: number): string {
  return new Date(Date.parse(instant) + minutes * 60_000).toISOString();
}

/** When pre-orders close for a booking starting at `startUtc`. */
export function preOrderLockedAtUtc(startUtc: string): string {
  return shift(startUtc, -PRE_ORDER_EDITABLE_HOURS_BEFORE * 60);
}

/** When the waiter's card appears, for the branch's `minutesBefore`. */
export function preOrderDueAtUtc(startUtc: string, minutesBefore: number): string {
  return shift(startUtc, -minutesBefore);
}

/**
 * A pre-order still waiting for the kitchen — editable or locked, not sent and
 * not marked not coming. Its booking is asked "on your way?" at 45 minutes
 * rather than 30.
 */
export function preOrderWaiting(preOrder: { readonly state: string } | null | undefined): boolean {
  return preOrder?.state === 'editable' || preOrder?.state === 'locked';
}

/**
 * The booking is asked on the pre-order's clock (45 minutes): it has a
 * pre-order that is not cancelled. One marked not coming is still asked in
 * the app and on the link — a guest who is coming after all says so.
 */
function onPreOrderClock(preOrder: { readonly state: string } | null | undefined): boolean {
  return preOrder != null && preOrder.state !== 'cancelled';
}

/**
 * When the booking is asked "on your way?", or `null` when it is not: never
 * once its pre-order went to the kitchen.
 */
export function onYourWayAskedFromUtc(booking: {
  readonly startUtc: string;
  readonly preOrder?: { readonly state: string } | null | undefined;
}): string | null {
  if (booking.preOrder?.state === 'sent') return null;
  return onYourWayFromUtc(booking.startUtc, onPreOrderClock(booking.preOrder));
}

/**
 * When "Are you on your way?" is asked: 45 minutes before while a pre-order
 * waits for the kitchen, 30 otherwise.
 */
export function onYourWayFromUtc(startUtc: string, waiting = true): string {
  return shift(
    startUtc,
    -(waiting ? ON_YOUR_WAY_MINUTES_BEFORE : ON_YOUR_WAY_MINUTES_BEFORE_WITHOUT_PRE_ORDER),
  );
}

/** What the server derives a pre-order's state from. */
export interface PreOrderStateInput {
  readonly bookingStatus: ReservationStatusCode;
  readonly startUtc: string;
  readonly sentAtUtc: string | null;
  readonly notComingAtUtc: string | null;
}

/**
 * The server's derivation, for the mocks: Sent > Cancelled > NotComing >
 * Locked > Editable. A no-show or a finished booking without a send is
 * cancelled; a seated party's unsent pre-order is locked (still sendable).
 */
export function derivePreOrderState(input: PreOrderStateInput, now: Date): PreOrderState {
  if (input.sentAtUtc) return 'sent';
  switch (input.bookingStatus) {
    case 'cancelledByDiner':
    case 'cancelledByVenue':
    case 'noShow':
    case 'completed':
      return 'cancelled';
    default:
      break;
  }
  if (input.notComingAtUtc) return 'notComing';
  if (now.getTime() >= Date.parse(preOrderLockedAtUtc(input.startUtc))) return 'locked';
  if (input.bookingStatus !== 'pendingApproval' && input.bookingStatus !== 'confirmed') {
    return 'locked';
  }
  return 'editable';
}

/**
 * Whether "Add / edit pre-order" may be offered on a booking: the server sent
 * `preOrderEditableUntilUtc` (the branch takes them, the booking is pending or
 * confirmed and to come), now is before it, and any pre-order there is still
 * `editable`.
 */
export function canEditPreOrder(booking: BookingPreOrderFields, now: Date): boolean {
  const until = booking.preOrderEditableUntilUtc;
  if (!until || now.getTime() >= Date.parse(until)) return false;
  return !booking.preOrder || booking.preOrder.state === 'editable';
}

/**
 * Whether "Remove pre-order" may be offered: there is one, it is `editable`,
 * and its window is open — whether or not the branch still takes pre-orders.
 */
export function canClearPreOrder(booking: BookingPreOrderFields, now: Date): boolean {
  const preOrder = booking.preOrder;
  if (!preOrder || preOrder.state !== 'editable') return false;
  return now.getTime() < Date.parse(preOrder.editableUntilUtc);
}

/** The slice of a booking the "on your way" question is decided from. */
export interface OnYourWayInput extends BookingPreOrderFields {
  readonly status: ReservationStatusCode;
  readonly startUtc: string;
}

/**
 * Whether to ask "Are you on your way? [Yes, on my way] [Can't come]": of
 * every confirmed booking (2026-10-21), from 30 minutes before the start — 45
 * with a pre-order — until it starts, unless the guest has answered or the
 * pre-order already went to the kitchen. The manage link is told by the
 * server (`onYourWayAsked`); this is the same rule for the app's booking
 * screen and the mocks.
 */
export function asksOnYourWay(booking: OnYourWayInput, now: Date): boolean {
  if (booking.status !== 'confirmed') return false;
  if (booking.guestConfirmedOnWayAtUtc) return false;
  const from = onYourWayAskedFromUtc(booking);
  if (!from) return false;
  const t = now.getTime();
  return t >= Date.parse(from) && t < Date.parse(booking.startUtc);
}

/** A dish the pre-order picker offers: not sold out, and not excluded by the venue. */
export function isPreOrderable(item: MenuItemDetail): boolean {
  return item.isAvailable && item.availableForPreOrder !== false;
}

/**
 * The menu the pre-order picker shows: the diner menu (complete dishes only)
 * narrowed to {@link isPreOrderable} dishes, with no empty category left.
 */
export function preOrderMenu(menu: BranchMenu): BranchMenu {
  return {
    ...menu,
    categories: menu.categories
      .map((category) => ({ ...category, items: category.items.filter(isPreOrderable) }))
      .filter((category) => category.items.length > 0),
  };
}

/** The editor's starting point from a pre-order there is: its lines and note, as sent. */
export function draftFromPreOrder(preOrder: PreOrder | null | undefined): PreOrderDraft {
  if (!preOrder) return { lines: [], note: null };
  return {
    lines: preOrder.lines.map((entry) => ({
      menuItemId: entry.menuItemId,
      quantity: entry.quantity,
      note: entry.note,
    })),
    note: preOrder.note,
  };
}

/** How many dishes a draft holds in all. */
export function draftQuantity(draft: PreOrderDraft): number {
  return draft.lines.reduce((sum, entry) => sum + entry.quantity, 0);
}

function trimmed(value: string | null | undefined): string {
  return (value ?? '').trim();
}

/**
 * The bounds the server checks, said in its field names (`lines`,
 * `lines[2].quantity`, `lines[0].note`, `note`) so a form marks the same
 * fields before sending as after a 422. Empty when the draft may be sent.
 * An empty draft is not a pre-order: clear instead.
 */
export function preOrderDraftViolations(draft: PreOrderDraft): readonly FieldViolation[] {
  const violations: FieldViolation[] = [];
  const { lines } = draft;
  if (lines.length < 1 || lines.length > PRE_ORDER_LIMITS.maxLines) {
    violations.push({
      field: 'lines',
      message: `Between 1 and ${PRE_ORDER_LIMITS.maxLines} dishes.`,
      bound: 'range',
      min: 1,
      max: PRE_ORDER_LIMITS.maxLines,
    });
  } else if (draftQuantity(draft) > PRE_ORDER_LIMITS.maxTotalQuantity) {
    violations.push({
      field: 'lines',
      message: `At most ${PRE_ORDER_LIMITS.maxTotalQuantity} dishes in all.`,
      bound: 'max',
      max: PRE_ORDER_LIMITS.maxTotalQuantity,
    });
  }
  lines.forEach((entry, index) => {
    if (
      !Number.isInteger(entry.quantity) ||
      entry.quantity < 1 ||
      entry.quantity > PRE_ORDER_LIMITS.maxQuantity
    ) {
      violations.push({
        field: `lines[${index}].quantity`,
        message: `Between 1 and ${PRE_ORDER_LIMITS.maxQuantity}.`,
        bound: 'range',
        min: 1,
        max: PRE_ORDER_LIMITS.maxQuantity,
      });
    }
    if (trimmed(entry.note).length > PRE_ORDER_LIMITS.maxLineNote) {
      violations.push({
        field: `lines[${index}].note`,
        message: `At most ${PRE_ORDER_LIMITS.maxLineNote} characters.`,
        bound: 'max',
        max: PRE_ORDER_LIMITS.maxLineNote,
      });
    }
  });
  if (trimmed(draft.note).length > PRE_ORDER_LIMITS.maxNote) {
    violations.push({
      field: 'note',
      message: `At most ${PRE_ORDER_LIMITS.maxNote} characters.`,
      bound: 'max',
      max: PRE_ORDER_LIMITS.maxNote,
    });
  }
  return violations;
}

/** Trimmed, blank as none: what the server keeps of a note. */
export function preOrderNote(value: string | null | undefined): string | null {
  const text = trimmed(value);
  return text === '' ? null : text;
}

// ---------------------------------------------------------------------------
// Failures, as copy
// ---------------------------------------------------------------------------

function copy(key: string, params: Readonly<Record<string, string | number>> = {}): CopyLine {
  return { key, params };
}

/**
 * What a failed save, clear or "on my way" was — for the app and the manage
 * link alike. Keys in the **`diner`** namespace (the public page loads it).
 *
 * - `locked`: two hours before; "Call the venue to change it."
 * - `itemsUnavailable`: `items` names every dish to remove or swap; mark them.
 * - `invalid`: `violations` in the server's field names.
 * - `conflict`: two saves at once — read the booking again and retry.
 * - `unknown`: the connection dropped; the same command id is safe to resend.
 */
export type PreOrderFailure =
  | { readonly kind: 'locked'; readonly line: CopyLine; readonly lockedAtUtc: string | null }
  | { readonly kind: 'alreadySent'; readonly line: CopyLine }
  | { readonly kind: 'notAccepted'; readonly line: CopyLine }
  | {
      readonly kind: 'itemsUnavailable';
      readonly line: CopyLine;
      readonly items: readonly UnavailablePreOrderItem[];
    }
  | { readonly kind: 'notChangeable'; readonly line: CopyLine }
  | { readonly kind: 'onMyWayNotOpen'; readonly line: CopyLine }
  | {
      readonly kind: 'invalid';
      readonly line: CopyLine;
      readonly violations: readonly FieldViolation[];
    }
  | { readonly kind: 'conflict'; readonly line: CopyLine }
  | { readonly kind: 'commandInUse'; readonly line: CopyLine }
  | { readonly kind: 'notFound'; readonly line: CopyLine }
  | { readonly kind: 'rateLimited'; readonly line: CopyLine }
  | { readonly kind: 'unknown'; readonly line: CopyLine }
  | { readonly kind: 'generic'; readonly line: CopyLine };

/**
 * A guest's pre-order failure, as the sentence to show. `timeZoneId` is the
 * branch's; `dishName` names a dish for `itemsUnavailable` when the caller
 * knows exactly one (the editor knows its lines' names, the error does not).
 */
export function preOrderFailure(
  error: unknown,
  timeZoneId: TimeZone,
  locale: Locale,
  options: { readonly dishName?: string | undefined } = {},
): PreOrderFailure {
  if (error instanceof PreOrderLockedError) {
    return {
      kind: 'locked',
      lockedAtUtc: error.lockedAtUtc,
      line: error.lockedAtUtc
        ? copy('preOrder.error.lockedAt', {
            time: formatTime(error.lockedAtUtc, timeZoneId, locale),
          })
        : copy('preOrder.error.locked'),
    };
  }
  if (error instanceof PreOrderAlreadySentError) {
    return { kind: 'alreadySent', line: copy('preOrder.error.alreadySent') };
  }
  if (error instanceof PreOrdersNotAcceptedError) {
    return { kind: 'notAccepted', line: copy('preOrder.error.notAccepted') };
  }
  if (error instanceof PreOrderItemsUnavailableError) {
    const name = options.dishName?.trim();
    return {
      kind: 'itemsUnavailable',
      items: error.items,
      line:
        name && error.items.length === 1
          ? copy('preOrder.error.itemUnavailable', { name })
          : copy('preOrder.error.itemsUnavailable', { count: error.items.length }),
    };
  }
  if (error instanceof BookingNotChangeableError) {
    return { kind: 'notChangeable', line: copy('preOrder.error.notChangeable') };
  }
  if (error instanceof OnMyWayNotOpenError) {
    return { kind: 'onMyWayNotOpen', line: copy('preOrder.error.onMyWayNotOpen') };
  }
  if (error instanceof ValidationError) {
    return {
      kind: 'invalid',
      violations: error.violations,
      line: copy('preOrder.error.invalid'),
    };
  }
  if (error instanceof BookingCommandInUseError) {
    return { kind: 'commandInUse', line: copy('preOrder.error.commandInUse') };
  }
  if (error instanceof ConcurrencyConflictError) {
    return { kind: 'conflict', line: copy('preOrder.error.conflict') };
  }
  if (error instanceof NotFoundError) {
    return { kind: 'notFound', line: copy('preOrder.error.notFound') };
  }
  if (error instanceof TooManyRequestsError) {
    return { kind: 'rateLimited', line: copy('preOrder.error.rateLimited') };
  }
  if (
    error instanceof NetworkError ||
    error instanceof TimeoutError ||
    error instanceof ServerError
  ) {
    return { kind: 'unknown', line: copy('preOrder.error.unknownOutcome') };
  }
  return { kind: 'generic', line: copy('preOrder.error.generic') };
}

/**
 * What a failed Send or Not coming was, on the tablet. Keys in the **`staff`**
 * namespace.
 *
 * - `notSendable`: outside the booking's window, or the booking is not
 *   confirmed or seated — re-read the rail.
 * - `alreadySent`: "Not coming" on a sent one; the card shows it sent.
 * - `tabClosing`: the party's bill is being settled; nothing more goes on it.
 * - `busy`: the table was locked a moment — tap again (same command id).
 * - `changed`: the booking's table kept changing under the send (409
 *   `concurrent-update`) — the rail is re-read; look, then tap again.
 * - `rateLimited`: too many taps (429) — wait a moment.
 * - `unknown`: offline or the connection dropped: online only, nothing queued.
 */
export type PreOrderActionFailure =
  | { readonly kind: 'notSendable'; readonly line: CopyLine }
  | { readonly kind: 'alreadySent'; readonly line: CopyLine }
  | { readonly kind: 'tabClosing'; readonly line: CopyLine }
  | { readonly kind: 'busy'; readonly line: CopyLine }
  | { readonly kind: 'changed'; readonly line: CopyLine }
  | { readonly kind: 'rateLimited'; readonly line: CopyLine }
  | { readonly kind: 'notFound'; readonly line: CopyLine }
  | { readonly kind: 'forbidden'; readonly line: CopyLine }
  | { readonly kind: 'unknown'; readonly line: CopyLine }
  | { readonly kind: 'generic'; readonly line: CopyLine };

export function preOrderActionFailure(error: unknown): PreOrderActionFailure {
  if (error instanceof PreOrderNotSendableError) {
    return { kind: 'notSendable', line: copy('preOrders.error.notSendable') };
  }
  if (error instanceof PreOrderAlreadySentError) {
    return { kind: 'alreadySent', line: copy('preOrders.error.alreadySent') };
  }
  if (error instanceof TabNotAcceptingOrdersError) {
    return { kind: 'tabClosing', line: copy('preOrders.error.tabClosing') };
  }
  if (error instanceof TableBusyError) {
    return { kind: 'busy', line: copy('preOrders.error.busy') };
  }
  if (error instanceof ConcurrencyConflictError) {
    return { kind: 'changed', line: copy('preOrders.error.changed') };
  }
  if (
    error instanceof TooManyRequestsError ||
    error instanceof RateLimitedError ||
    error instanceof ServiceRequestRateLimitedError
  ) {
    return { kind: 'rateLimited', line: copy('preOrders.error.rateLimited') };
  }
  if (error instanceof NotFoundError) {
    return { kind: 'notFound', line: copy('preOrders.error.notFound') };
  }
  if (error instanceof ForbiddenError) {
    return { kind: 'forbidden', line: copy('preOrders.error.forbidden') };
  }
  if (
    error instanceof NetworkError ||
    error instanceof TimeoutError ||
    error instanceof ServerError
  ) {
    return { kind: 'unknown', line: copy('preOrders.error.unknownOutcome') };
  }
  return { kind: 'generic', line: copy('preOrders.error.generic') };
}
