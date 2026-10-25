import {
  BOOKING_BLOCKED_NO_SHOWS_CODE,
  BookingBlockedNoShowsError,
  BookingCommandInUseError,
  PhoneNotVerifiedError,
  TAKEAWAY_BUSY_CODE,
  TAKEAWAY_CLOSED_CODE,
  TAKEAWAY_ITEMS_UNAVAILABLE_CODE,
  TAKEAWAY_NOT_ACCEPTED_CODE,
  TAKEAWAY_NO_SHOW_TOO_EARLY_CODE,
  TAKEAWAY_SLOT_UNAVAILABLE_CODE,
  TAKEAWAY_STATUS_CONFLICT_CODE,
  TakeawayBusyError,
  TakeawayClosedError,
  TakeawayItemsUnavailableError,
  TakeawayNoShowTooEarlyError,
  TakeawayNotAcceptedError,
  TakeawaySlotUnavailableError,
  TakeawayStatusConflictError,
  type TakeawayItemUnavailableReason,
  type UnavailableTakeawayItem,
} from '../contracts/errors';
import {
  DEFAULT_TAKEAWAY_SETTINGS,
  NO_TAKEAWAY,
  takeawayNote,
  type BranchTakeawayOrders,
  type DinerTakeawaySummary,
  type KitchenTakeaway,
  type PlaceTakeawayOrderCommand,
  type PublicTakeawayInfo,
  type StaffTakeawayOrder,
  type TakeawayAvailability,
  type TakeawayDeclineCause,
  type TakeawayLine,
  type TakeawayOrder,
  type TakeawayPaymentMethod,
  type TakeawaySettings,
  type TakeawaySettingsInput,
  type TakeawayStatus,
} from '../contracts/takeaway';
import { ApiError } from '../errors';
import { problemContext } from '../problem';
import type { components } from '../generated/schema';
import { ProblemCodes } from '../generated/problemCodes';

/**
 * The takeaway wire (`docs/takeaway.md`, 2026-10-22), read once for every
 * surface: the guest's availability, order and Orders-tab card, the counter,
 * the kitchen's band, the place page's info, the console's settings, and the
 * refusals.
 *
 * Like `preOrderMapping.ts`, this file imports no mapper, so every mapper can
 * import it.
 */

// ---------------------------------------------------------------------------
// The wire
// ---------------------------------------------------------------------------

type Schemas = components['schemas'];

/** `TakeawayLineView`. */
export type WireTakeawayLine = Schemas['Yalla.Application.Takeaway.TakeawayLineView'];
/** `TakeawayOrderView`: the guest's status screen. */
export type WireTakeawayOrder = Schemas['Yalla.Application.Takeaway.TakeawayOrderView'];
/** `StaffTakeawayOrderView`: the counter's card, and each staff action's answer. */
export type WireStaffTakeawayOrder = Schemas['Yalla.Application.Takeaway.StaffTakeawayOrderView'];
/** `BranchTakeawayOrders`. */
export type WireBranchTakeawayOrders = Schemas['Yalla.Application.Takeaway.BranchTakeawayOrders'];
/** `TakeawayAvailability`. */
export type WireTakeawayAvailability = Schemas['Yalla.Application.Takeaway.TakeawayAvailability'];
/** `TakeawaySettingsView`. */
export type WireTakeawaySettings = Schemas['Yalla.Application.Takeaway.TakeawaySettingsView'];
/** `TakeawaySettingsRequest`. */
export type WireTakeawaySettingsRequest = Schemas['Yalla.Api.Endpoints.TakeawaySettingsRequest'];
/** `PlaceTakeawayOrderRequest`. */
export type WirePlaceTakeawayOrderRequest =
  Schemas['Yalla.Api.Endpoints.PlaceTakeawayOrderRequest'];
/** `KitchenTakeaway`, on `KitchenOrderView.takeaway`. */
export type WireKitchenTakeaway = Schemas['Yalla.Application.Ordering.KitchenTakeaway'];
/** `DinerTakeawaySummary`, on `DinerOrderView.takeaway`. */
export type WireDinerTakeawaySummary = Schemas['Yalla.Application.Diners.DinerTakeawaySummary'];
/** `PublicTakeawayInfo`, on `PublicBranchDetail.takeaway`. */
export type WirePublicTakeawayInfo = Schemas['Yalla.Application.Public.PublicTakeawayInfo'];

// ---------------------------------------------------------------------------
// Reading it
// ---------------------------------------------------------------------------

const STATUS: Readonly<Record<number, TakeawayStatus>> = {
  1: 'sent',
  2: 'accepted',
  3: 'ready',
  4: 'collected',
  5: 'declined',
  6: 'cancelled',
  7: 'noShow',
};

const PAYMENT: Readonly<Record<number, TakeawayPaymentMethod>> = { 1: 'cash', 2: 'card' };

const DECLINE: Readonly<Record<number, TakeawayDeclineCause>> = { 1: 'venue', 2: 'noAnswer' };

const UNAVAILABLE_REASON: Readonly<Record<number, TakeawayItemUnavailableReason>> = {
  1: 'notOnMenu',
  2: 'soldOut',
  3: 'notForTakeaway',
};

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** "19:30:00" as the server writes a branch wall clock, said as "19:30". */
function wallClock(value: string): string {
  return /^\d{2}:\d{2}/u.test(value) ? value.slice(0, 5) : value;
}

function wallClockOrNull(value: unknown): string | null {
  const said = text(value);
  return said === null ? null : wallClock(said);
}

export function takeawayStatus(value: number | null | undefined): TakeawayStatus {
  return typeof value === 'number' ? (STATUS[value] ?? 'unknown') : 'unknown';
}

/** The method's code for `collect`: 1 Cash, 2 Card. */
export function takeawayPaymentMethodCode(method: TakeawayPaymentMethod): 1 | 2 {
  return method === 'cash' ? 1 : 2;
}

function paymentMethod(value: number | null | undefined): TakeawayPaymentMethod | null {
  return typeof value === 'number' ? (PAYMENT[value] ?? null) : null;
}

function declineCause(value: number | null | undefined): TakeawayDeclineCause | null {
  return typeof value === 'number' ? (DECLINE[value] ?? 'unknown') : null;
}

export function takeawayLineFromWire(wire: WireTakeawayLine): TakeawayLine {
  return {
    id: wire.id,
    menuItemId: wire.menuItemId,
    name: wire.name,
    unitPriceDram: wire.unitPriceAmd,
    quantity: wire.quantity,
    lineTotalDram: wire.lineTotalAmd,
  };
}

/** What the guest's view and the counter's share. */
function core(wire: WireTakeawayOrder | WireStaffTakeawayOrder) {
  return {
    id: wire.id,
    code: wire.code,
    status: takeawayStatus(wire.status),
    lines: (wire.lines ?? []).map(takeawayLineFromWire),
    totalDram: wire.totalAmd,
    note: text(wire.note),
    pickupAsap: wire.pickupAsap === true,
    requestedPickupUtc: wire.requestedPickupUtc,
    requestedPickupAt: wallClock(wire.requestedPickupAt),
    readyAtUtc: text(wire.readyAtUtc),
    readyAt: wallClockOrNull(wire.readyAt),
    sentAtUtc: wire.sentAtUtc,
    acceptDeadlineUtc: text(wire.acceptDeadlineUtc),
    acceptedAtUtc: text(wire.acceptedAtUtc),
    readyMarkedAtUtc: text(wire.readyMarkedAtUtc),
    collectedAtUtc: text(wire.collectedAtUtc),
    declinedAtUtc: text(wire.declinedAtUtc),
    cancelledAtUtc: text(wire.cancelledAtUtc),
    noShowAtUtc: text(wire.noShowAtUtc),
    declinedBecause: declineCause(wire.declinedBecause),
    declineReason: text(wire.declineReason),
    paymentMethod: paymentMethod(wire.paymentMethod),
    paidAmountDram: finite(wire.paidAmountAmd),
    wasReplay: wire.wasReplay === true,
  };
}

export function takeawayOrderFromWire(wire: WireTakeawayOrder): TakeawayOrder {
  return {
    ...core(wire),
    branchId: wire.branchId,
    venueName: wire.venueName,
    branchName: wire.branchName,
    branchAddress: wire.branchAddress,
    branchPhoneE164: text(wire.branchPhoneE164),
    latitude: wire.latitude,
    longitude: wire.longitude,
    // The server's answer: true while sent, never guessed from the status here.
    canCancel: wire.canCancel === true,
  };
}

export function staffTakeawayOrderFromWire(wire: WireStaffTakeawayOrder): StaffTakeawayOrder {
  return {
    ...core(wire),
    guestName: wire.guestName,
    // "" for a platform admin: the venue's to call, never a blank `tel:`.
    guestPhone: text(wire.guestPhone),
    acceptedByName: text(wire.acceptedByName),
    noShowFromUtc: text(wire.noShowFromUtc),
  };
}

export function branchTakeawayOrdersFromWire(
  wire: Partial<WireBranchTakeawayOrders>,
): BranchTakeawayOrders {
  return {
    active: (wire.active ?? []).map(staffTakeawayOrderFromWire),
    finishedToday: (wire.finishedToday ?? []).map(staffTakeawayOrderFromWire),
    sentCount: wire.sentCount ?? 0,
    readyCount: wire.readyCount ?? 0,
    asOfUtc: wire.asOfUtc ?? new Date().toISOString(),
  };
}

export function takeawayAvailabilityFromWire(wire: WireTakeawayAvailability): TakeawayAvailability {
  return {
    branchId: wire.branchId,
    enabled: wire.enabled === true,
    open: wire.open === true,
    prepMinutes: wire.prepMinutes,
    asapReadyAtUtc: text(wire.asapReadyAtUtc),
    asapReadyAt: wallClockOrNull(wire.asapReadyAt),
    slots: (wire.slots ?? []).map(wallClock),
    lastPickupAt: wallClockOrNull(wire.lastPickupAt),
    busy: wire.busy === true,
    opensAt: wallClockOrNull(wire.opensAt),
    opensAtUtc: text(wire.opensAtUtc),
  };
}

export function kitchenTakeawayFromWire(
  wire: WireKitchenTakeaway | null | undefined,
): KitchenTakeaway | null {
  if (!wire) return null;
  return {
    code: wire.code,
    readyAtUtc: wire.readyAtUtc,
    readyAtLocalTime: wallClock(wire.readyAtLocalTime),
    guestName: wire.guestName,
    note: text(wire.note),
  };
}

export function dinerTakeawaySummaryFromWire(
  wire: WireDinerTakeawaySummary | null | undefined,
): DinerTakeawaySummary | null {
  if (!wire) return null;
  return {
    code: wire.code,
    status: takeawayStatus(wire.status),
    pickupAsap: wire.pickupAsap === true,
    requestedPickupUtc: wire.requestedPickupUtc,
    readyAtUtc: text(wire.readyAtUtc),
    itemCount: wire.itemCount,
  };
}

/** Absent — a server from before takeaway — is "no takeaway here". */
export function publicTakeawayInfoFromWire(
  wire: WirePublicTakeawayInfo | null | undefined,
): PublicTakeawayInfo {
  if (!wire) return NO_TAKEAWAY;
  return { enabled: wire.enabled === true, prepMinutes: wire.prepMinutes };
}

export function takeawaySettingsFromWire(wire: WireTakeawaySettings): TakeawaySettings {
  return {
    enabled: wire.enabled,
    autoAccept: wire.autoAccept,
    prepMinutes: wire.prepMinutes,
    lastOrderMinutes: wire.lastOrderMinutes,
    maxInProgress: wire.maxInProgress,
    // The product's numbers, from the server when it says them.
    bounds: wire.bounds ? { ...wire.bounds } : DEFAULT_TAKEAWAY_SETTINGS.bounds,
    acceptWindowMinutes: wire.acceptWindowMinutes ?? DEFAULT_TAKEAWAY_SETTINGS.acceptWindowMinutes,
    noShowAfterMinutes: wire.noShowAfterMinutes ?? DEFAULT_TAKEAWAY_SETTINGS.noShowAfterMinutes,
  };
}

// ---------------------------------------------------------------------------
// Writing it
// ---------------------------------------------------------------------------

/** The settings PUT: all five, every time — a missing bool would switch takeaway off. */
export function takeawaySettingsBody(input: TakeawaySettingsInput): WireTakeawaySettingsRequest {
  return {
    enabled: input.enabled,
    autoAccept: input.autoAccept,
    prepMinutes: input.prepMinutes,
    lastOrderMinutes: input.lastOrderMinutes,
    maxInProgress: input.maxInProgress,
  };
}

/** The order's POST: exactly one of `asap` and `at`, the note trimmed and blank as none. */
export function placeTakeawayOrderBody(
  command: PlaceTakeawayOrderCommand,
): WirePlaceTakeawayOrderRequest {
  return {
    branchId: command.branchId,
    pickup: 'at' in command.pickup ? { at: command.pickup.at } : { asap: true },
    note: takeawayNote(command.note),
    lines: command.lines.map((entry) => ({
      menuItemId: entry.menuItemId,
      quantity: entry.quantity,
    })),
    clientCommandId: command.clientCommandId,
  };
}

// ---------------------------------------------------------------------------
// The refusals
// ---------------------------------------------------------------------------

function unavailableItems(value: unknown): readonly UnavailableTakeawayItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): UnavailableTakeawayItem[] => {
    const item = entry as { readonly menuItemId?: unknown; readonly reason?: unknown } | null;
    const menuItemId = text(item?.menuItemId);
    if (!menuItemId) return [];
    const reason =
      typeof item?.reason === 'number' ? (UNAVAILABLE_REASON[item.reason] ?? 'unknown') : 'unknown';
    return [{ menuItemId, reason }];
  });
}

function slotList(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const said = text(entry);
    return said ? [wallClock(said)] : [];
  });
}

/**
 * Every takeaway refusal as its typed error — the guest's and the counter's —
 * or `null` for anything else, which keeps the client's own mapping
 * (`validation-failed` → `ValidationError`, a 404 → `NotFoundError`).
 *
 * Each context is read as its code's (`problemContext`), so the member names
 * are the ones the backend declares in its catalogue: one it renames or drops
 * is a compile error here. The values are still checked as they are read.
 */
export function takeawayRefusal(error: unknown): ApiError | null {
  if (!(error instanceof ApiError) || !error.problem) return null;
  const { problem } = error;
  const base = { url: error.url, requestId: error.requestId };

  switch (problem.code) {
    case TAKEAWAY_NOT_ACCEPTED_CODE: {
      const context = problemContext(problem, TAKEAWAY_NOT_ACCEPTED_CODE);
      return new TakeawayNotAcceptedError({ ...base, branchId: text(context.branchId) });
    }
    case TAKEAWAY_CLOSED_CODE: {
      const context = problemContext(problem, TAKEAWAY_CLOSED_CODE);
      return new TakeawayClosedError({
        ...base,
        branchId: text(context.branchId),
        opensAtUtc: text(context.opensAtUtc),
        opensAt: wallClockOrNull(context.opensAt),
      });
    }
    case TAKEAWAY_BUSY_CODE: {
      const context = problemContext(problem, TAKEAWAY_BUSY_CODE);
      return new TakeawayBusyError({
        ...base,
        branchId: text(context.branchId),
        maxInProgress: finite(context.maxInProgress),
      });
    }
    case TAKEAWAY_SLOT_UNAVAILABLE_CODE: {
      const context = problemContext(problem, TAKEAWAY_SLOT_UNAVAILABLE_CODE);
      return new TakeawaySlotUnavailableError({
        ...base,
        branchId: text(context.branchId),
        at: wallClockOrNull(context.at),
        slots: slotList(context.slots),
      });
    }
    case TAKEAWAY_ITEMS_UNAVAILABLE_CODE: {
      const context = problemContext(problem, TAKEAWAY_ITEMS_UNAVAILABLE_CODE);
      return new TakeawayItemsUnavailableError({ ...base, items: unavailableItems(context.items) });
    }
    case TAKEAWAY_STATUS_CONFLICT_CODE: {
      const context = problemContext(problem, TAKEAWAY_STATUS_CONFLICT_CODE);
      return new TakeawayStatusConflictError({
        ...base,
        orderId: text(context.orderId),
        orderStatus:
          typeof context.status === 'number' ? takeawayStatus(context.status) : undefined,
      });
    }
    case TAKEAWAY_NO_SHOW_TOO_EARLY_CODE: {
      const context = problemContext(problem, TAKEAWAY_NO_SHOW_TOO_EARLY_CODE);
      return new TakeawayNoShowTooEarlyError({
        ...base,
        orderId: text(context.orderId),
        noShowFromUtc: text(context.noShowFromUtc),
      });
    }
    case ProblemCodes.PhoneNotVerified:
      return new PhoneNotVerifiedError(base);
    // Blocked for no-shows (a takeaway order not collected counts too): the
    // booking's own refusal, so both checkouts say the same (2026-10-23).
    case BOOKING_BLOCKED_NO_SHOWS_CODE: {
      const context = problemContext(problem, BOOKING_BLOCKED_NO_SHOWS_CODE);
      return new BookingBlockedNoShowsError({
        ...base,
        blockedUntilUtc: text(context.blockedUntilUtc),
      });
    }
    case ProblemCodes.ClientCommandIdInUse:
      return new BookingCommandInUseError(base);
    default:
      return null;
  }
}

/** Rethrow a takeaway refusal as its typed error; anything else unchanged. */
export function rethrowTakeawayRefusal(error: unknown): never {
  throw takeawayRefusal(error) ?? error;
}
