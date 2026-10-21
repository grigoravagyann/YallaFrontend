import {
  BookingCommandInUseError,
  BookingNotChangeableError,
  ON_MY_WAY_NOT_OPEN_CODE,
  OnMyWayNotOpenError,
  PRE_ORDER_ALREADY_SENT_CODE,
  PRE_ORDER_ITEMS_UNAVAILABLE_CODE,
  PRE_ORDER_LOCKED_CODE,
  PRE_ORDER_NOT_SENDABLE_CODE,
  PRE_ORDERS_NOT_ACCEPTED_CODE,
  PreOrderAlreadySentError,
  PreOrderItemsUnavailableError,
  PreOrderLockedError,
  PreOrderNotSendableError,
  PreOrdersNotAcceptedError,
  TABLE_LOCK_TIMEOUT_CODE,
  TabNotAcceptingOrdersError,
  TableBusyError,
  type PreOrderItemUnavailableReason,
  type TabNotAcceptingStatus,
  type UnavailablePreOrderItem,
} from '../contracts/errors';
import type { OrderStatus } from '../contracts/ordering';
import {
  DEFAULT_PRE_ORDER_SETTINGS,
  preOrderNote,
  type BookingPreOrderFields,
  type DuePreOrder,
  type DuePreOrders,
  type KitchenPreOrder,
  type OnMyWayResult,
  type PreOrder,
  type PreOrderDraft,
  type PreOrderLine,
  type PreOrderResult,
  type PreOrderSettings,
  type PreOrderSettingsInput,
  type PreOrderState,
} from '../contracts/preOrder';
import type { ReservationStatusCode } from '../contracts/push';
import { ApiError } from '../errors';
import type { components } from '../generated/schema';
import { guestRecordFromWire } from './guestRecordMapping';

/**
 * The pre-order wire (PO-WIRE.md, 2026-10-21), read once for every surface:
 * the pre-order on each booking read, the guest's answers, the floor's rail,
 * the kitchen's marker, the console's settings, and the refusals.
 *
 * ## Ahead of the generated schema
 *
 * The backend is being built alongside this, so `generated/schema.ts` does
 * not have any of it yet. The shapes are declared here, as the wire says them,
 * and every new member on an existing view is optional — a server from before
 * pre-orders reads as "no pre-order, nothing offered", never as a failure.
 * Once `pnpm api:generate` runs against the backend, the generated shapes
 * carry the same members and these collapse into them.
 *
 * Like `bookingTimesWire.ts`, this file imports no mapper that imports it
 * (only `guestRecordMapping.ts`, a leaf), so every mapper can import it.
 */

// ---------------------------------------------------------------------------
// The wire
// ---------------------------------------------------------------------------

type Schemas = components['schemas'];

/** `PreOrderLineView`. */
export type WirePreOrderLine = Schemas['Yalla.Application.Reservations.PreOrderLineView'];

/** `PreOrderView`: state 1 Editable, 2 Locked, 3 Sent, 4 NotComing, 5 Cancelled. */
export type WirePreOrder = Schemas['Yalla.Application.Reservations.PreOrderView'];

/** The new members of `ReservationView`. */
export interface WireBookingPreOrderFields {
  readonly preOrder?: WirePreOrder | null;
  readonly preOrderEditableUntilUtc?: string | null;
  readonly guestConfirmedOnWayAtUtc?: string | null;
}

/**
 * The new members of `PublicBookingView`. No `branchId`: the link deliberately
 * publishes no id beyond the booking's and its table's.
 */
export interface WirePublicBookingPreOrderFields extends WireBookingPreOrderFields {
  readonly onYourWayAsked?: boolean | null;
}

/** `PreOrderResult`. */
export type WirePreOrderResult = Schemas['Yalla.Application.Reservations.PreOrderResult'];

/** `OnMyWayResult`. */
export type WireOnMyWayResult = Schemas['Yalla.Application.Reservations.OnMyWayResult'];

/** `DuePreOrder`; the phone is "" for a platform admin. */
export type WireDuePreOrder = Schemas['Yalla.Application.Reservations.DuePreOrder'];

/** `DuePreOrders`. */
export type WireDuePreOrders = Schemas['Yalla.Application.Reservations.DuePreOrders'];

/** `KitchenPreOrder`, on `KitchenOrderView.preOrder`. */
export type WireKitchenPreOrder = Schemas['Yalla.Application.Ordering.KitchenPreOrder'];

/** The new members of `KitchenOrderView`: the held ticket has no tab yet. */
export interface WireKitchenOrderPreOrderFields {
  readonly tabId?: string | null;
  readonly preOrder?: WireKitchenPreOrder | null;
}

/** `PreOrderSettingsView`. */
export type WirePreOrderSettings = Schemas['Yalla.Application.Reservations.PreOrderSettingsView'];

/** `MenuItemView.availableForPreOrder`, on the diner's menu and the console's. */
export interface WireMenuItemPreOrderFields {
  readonly availableForPreOrder?: boolean | null;
}

/** `PublicReservationPolicy.acceptsPreOrders`. */
export interface WirePolicyPreOrderFields {
  readonly acceptsPreOrders?: boolean | null;
}

/** `ReplacePreOrderRequest`: the whole pre-order, lines in display order. */
export type WireReplacePreOrderRequest = Schemas['Yalla.Api.Endpoints.ReplacePreOrderRequest'];

// ---------------------------------------------------------------------------
// Reading it
// ---------------------------------------------------------------------------

const STATE: Readonly<Record<number, PreOrderState>> = {
  1: 'editable',
  2: 'locked',
  3: 'sent',
  4: 'notComing',
  5: 'cancelled',
};

/** `TabOrderStatus`, as `staffMapping.ts` reads it — repeated so this file stays a leaf. */
const KITCHEN_STATUS: Readonly<Record<number, OrderStatus>> = {
  1: 'new',
  2: 'inKitchen',
  3: 'ready',
  4: 'served',
  5: 'voided',
};

/** `ReservationStatus`, as `dinerMapping.ts` reads it — repeated for the same reason. */
const RESERVATION_STATUS: Readonly<Record<number, ReservationStatusCode>> = {
  1: 'pendingApproval',
  2: 'confirmed',
  4: 'seated',
  5: 'completed',
  6: 'cancelledByDiner',
  7: 'cancelledByVenue',
  8: 'noShow',
};

const UNAVAILABLE_REASON: Readonly<Record<number, PreOrderItemUnavailableReason>> = {
  1: 'notOnMenu',
  2: 'soldOut',
  3: 'notForPreOrder',
};

const TAB_NOT_ACCEPTING: Readonly<Record<number, TabNotAcceptingStatus>> = {
  2: 'closing',
  3: 'closed',
  4: 'abandoned',
};

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function reservationStatusOf(value: unknown): ReservationStatusCode | undefined {
  return typeof value === 'number' ? (RESERVATION_STATUS[value] ?? 'unknown') : undefined;
}

/** "19:30:00" as the server writes a branch wall clock, said as "19:30". */
function wallClock(value: string): string {
  return /^\d{2}:\d{2}/u.test(value) ? value.slice(0, 5) : value;
}

export function preOrderState(value: number): PreOrderState {
  return STATE[value] ?? 'unknown';
}

function preOrderLine(wire: WirePreOrderLine): PreOrderLine {
  return {
    id: wire.id,
    menuItemId: wire.menuItemId,
    name: wire.name,
    unitPriceDram: wire.unitPriceAmd,
    quantity: wire.quantity,
    lineTotalDram: wire.lineTotalAmd,
    note: text(wire.note),
    // Absent reads as available: only the server's `false` marks a dish gone.
    availableNow: wire.availableNow !== false,
  };
}

export function preOrderFromWire(wire: WirePreOrder): PreOrder {
  return {
    id: wire.id,
    reservationId: wire.reservationId,
    state: preOrderState(wire.state),
    lines: (wire.lines ?? []).map(preOrderLine),
    note: text(wire.note),
    totalDram: wire.totalAmd,
    editableUntilUtc: wire.editableUntilUtc,
    dueAtUtc: wire.dueAtUtc,
    sentAtUtc: text(wire.sentAtUtc),
    kitchenStatus:
      typeof wire.kitchenStatus === 'number' ? (KITCHEN_STATUS[wire.kitchenStatus] ?? null) : null,
    onTab: wire.onTab === true,
    notComingAtUtc: text(wire.notComingAtUtc),
    updatedAtUtc: wire.updatedAtUtc,
  };
}

/**
 * The three members every booking read carries, always all three: `null`
 * for each the server left out.
 */
export function bookingPreOrderFields(wire: WireBookingPreOrderFields): Required<{
  readonly [K in keyof BookingPreOrderFields]: NonNullable<BookingPreOrderFields[K]> | null;
}> {
  return {
    preOrder: wire.preOrder ? preOrderFromWire(wire.preOrder) : null,
    preOrderEditableUntilUtc: text(wire.preOrderEditableUntilUtc),
    guestConfirmedOnWayAtUtc: text(wire.guestConfirmedOnWayAtUtc),
  };
}

export function preOrderResultFromWire(wire: WirePreOrderResult): PreOrderResult {
  return {
    reservationId: wire.reservationId,
    preOrder: wire.preOrder ? preOrderFromWire(wire.preOrder) : null,
    wasReplay: wire.wasReplay === true,
  };
}

export function onMyWayResultFromWire(wire: WireOnMyWayResult): OnMyWayResult {
  return {
    reservationId: wire.reservationId,
    guestConfirmedOnWayAtUtc: wire.guestConfirmedOnWayAtUtc,
    wasReplay: wire.wasReplay === true,
  };
}

export function duePreOrderFromWire(wire: WireDuePreOrder): DuePreOrder {
  return {
    reservationId: wire.reservationId,
    code: wire.code,
    tableId: wire.tableId,
    tableLabel: wire.tableLabel,
    roomName: text(wire.roomName),
    startUtc: wire.startUtc,
    localStartTime: wallClock(wire.localStartTime),
    partySize: wire.partySize,
    status: reservationStatusOf(wire.status) ?? 'unknown',
    guestName: wire.guestName,
    // "" for a platform admin: the venue's to call, never a blank `tel:`.
    guestPhone: text(wire.guestPhone),
    guestConfirmedOnWayAtUtc: text(wire.guestConfirmedOnWayAtUtc),
    guestRecord: guestRecordFromWire(wire.guestRecord),
    dueAtUtc: wire.dueAtUtc,
    preOrder: preOrderFromWire(wire.preOrder),
    sentByName: text(wire.sentByName),
    notComingByName: text(wire.notComingByName),
    tabId: text(wire.tabId),
    wasReplay: wire.wasReplay === true,
  };
}

export function duePreOrdersFromWire(wire: WireDuePreOrders): DuePreOrders {
  return {
    items: (wire.items ?? []).map(duePreOrderFromWire),
    nextDueAtUtc: text(wire.nextDueAtUtc),
  };
}

export function kitchenPreOrderFromWire(
  wire: WireKitchenPreOrder | null | undefined,
): KitchenPreOrder | null {
  if (!wire) return null;
  return {
    reservationId: wire.reservationId,
    startUtc: wire.startUtc,
    localStartTime: wallClock(wire.localStartTime),
    partySize: wire.partySize,
    guestName: wire.guestName,
  };
}

export function preOrderSettingsFromWire(wire: WirePreOrderSettings): PreOrderSettings {
  return {
    acceptsPreOrders: wire.acceptsPreOrders,
    minutesBefore: wire.minutesBefore,
    excludedMenuItemIds: [...(wire.excludedMenuItemIds ?? [])],
    // The product's numbers, from the server when it says them.
    bounds: wire.bounds
      ? {
          minutesBeforeMin: wire.bounds.minutesBeforeMin,
          minutesBeforeMax: wire.bounds.minutesBeforeMax,
        }
      : DEFAULT_PRE_ORDER_SETTINGS.bounds,
    editableUntilHoursBefore:
      wire.editableUntilHoursBefore ?? DEFAULT_PRE_ORDER_SETTINGS.editableUntilHoursBefore,
    onYourWayMinutesBefore:
      wire.onYourWayMinutesBefore ?? DEFAULT_PRE_ORDER_SETTINGS.onYourWayMinutesBefore,
  };
}

// ---------------------------------------------------------------------------
// Writing it
// ---------------------------------------------------------------------------

/** The PUT body: the whole draft, notes trimmed and blank as none. */
export function replacePreOrderBody(
  draft: PreOrderDraft,
  clientCommandId: string,
): WireReplacePreOrderRequest {
  return {
    lines: draft.lines.map((entry) => ({
      menuItemId: entry.menuItemId,
      quantity: entry.quantity,
      note: preOrderNote(entry.note),
    })),
    note: preOrderNote(draft.note),
    clientCommandId,
  };
}

/** The settings PUT: all three, the exclusions as the whole list. */
export function preOrderSettingsBody(input: PreOrderSettingsInput): PreOrderSettingsInput {
  return {
    acceptsPreOrders: input.acceptsPreOrders,
    minutesBefore: input.minutesBefore,
    excludedMenuItemIds: [...input.excludedMenuItemIds],
  };
}

// ---------------------------------------------------------------------------
// The refusals
// ---------------------------------------------------------------------------

function unavailableItems(value: unknown): readonly UnavailablePreOrderItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): UnavailablePreOrderItem[] => {
    const item = entry as { readonly menuItemId?: unknown; readonly reason?: unknown } | null;
    const menuItemId = text(item?.menuItemId);
    if (!menuItemId) return [];
    const reason =
      typeof item?.reason === 'number' ? (UNAVAILABLE_REASON[item.reason] ?? 'unknown') : 'unknown';
    return [{ menuItemId, reason }];
  });
}

/**
 * Every pre-order refusal as its typed error — the guest's (both doors) and
 * the floor's — or `null` for anything else, which keeps the client's own
 * mapping (`validation-failed` → `ValidationError`, `concurrent-update` →
 * `ConcurrencyConflictError`, a 404 → `NotFoundError`).
 */
export function preOrderRefusal(error: unknown): ApiError | null {
  if (!(error instanceof ApiError) || !error.problem) return null;
  const context = error.problem.context ?? {};
  const base = { url: error.url, requestId: error.requestId };
  const reservationId = text(context['reservationId']);

  switch (error.problem.code) {
    case PRE_ORDER_LOCKED_CODE:
      return new PreOrderLockedError({
        ...base,
        reservationId,
        lockedAtUtc: text(context['lockedAtUtc']),
      });
    case PRE_ORDER_ALREADY_SENT_CODE:
      return new PreOrderAlreadySentError({
        ...base,
        reservationId,
        sentAtUtc: text(context['sentAtUtc']),
      });
    case PRE_ORDERS_NOT_ACCEPTED_CODE:
      return new PreOrdersNotAcceptedError({ ...base, branchId: text(context['branchId']) });
    case PRE_ORDER_ITEMS_UNAVAILABLE_CODE:
      return new PreOrderItemsUnavailableError({
        ...base,
        items: unavailableItems(context['items']),
      });
    case ON_MY_WAY_NOT_OPEN_CODE:
      return new OnMyWayNotOpenError({
        ...base,
        reservationId,
        bookingStatus: reservationStatusOf(context['status']),
      });
    case PRE_ORDER_NOT_SENDABLE_CODE:
      return new PreOrderNotSendableError({
        ...base,
        reservationId,
        bookingStatus: reservationStatusOf(context['status']),
        sendableFromUtc: text(context['sendableFromUtc']),
        endUtc: text(context['endUtc']),
      });
    case 'reservation-not-changeable':
      return new BookingNotChangeableError({ ...base, reservationId: reservationId ?? undefined });
    case 'client-command-id-in-use':
      return new BookingCommandInUseError(base);
    case 'tab-not-accepting-orders':
      return new TabNotAcceptingOrdersError({
        ...base,
        tabId: text(context['tabId']) ?? '',
        tabStatus: TAB_NOT_ACCEPTING[Number(context['status'])] ?? null,
      });
    case TABLE_LOCK_TIMEOUT_CODE:
      return new TableBusyError(base);
    default:
      return null;
  }
}

/** Rethrow a pre-order refusal as its typed error; anything else unchanged. */
export function rethrowPreOrderRefusal(error: unknown): never {
  throw preOrderRefusal(error) ?? error;
}
