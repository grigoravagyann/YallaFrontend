import type { IncomingTableRequest } from '../contracts/booking';

/**
 * The booking-times wire, ahead of the generated schema.
 *
 * Must-free-by times, requestable tables and times, the promise a booking
 * carries and the earlier guest's request are written by the backend alongside
 * this. Until `pnpm api:generate` is run against it, `generated/schema.ts` does
 * not have them, so they are declared here as optional additions to the
 * generated shapes — absent from an older server, which every mapper reads as
 * "nothing cut short, nothing to ask" rather than as a failure. Once
 * regenerated, the intersections collapse into the generated types and go.
 *
 * Like `approvalMapping.ts`, this file imports no other mapper, so every one
 * of them can import it.
 */

/**
 * `TableAvailability`: only to be had once the guest before agrees to leave in
 * time (`requiresApproval` is true with it), and the time a sitting is cut to
 * when a booking follows (`mustFreeByLocal`, "21:25:00", is the same on the
 * branch's clock — read from the instant here).
 */
export interface WireTableTimes {
  readonly isRequestable?: boolean | null;
  readonly mustFreeByUtc?: string | null;
  readonly mustFreeByLocal?: string | null;
}

/**
 * `DaySlot`: the only tables then are requestable (`isAvailable` stays true),
 * how many, and — when no table on offer gives a full sitting — the latest time
 * to free one by. `freeTableCount` counts the tables free outright only.
 */
export interface WireDaySlotTimes {
  readonly isRequestable?: boolean | null;
  readonly requestableTableCount?: number | null;
  readonly mustFreeByUtc?: string | null;
  readonly mustFreeByLocal?: string | null;
}

/** `ReservationView.incomingTableRequest` — on the earlier guest's own views only. */
export interface WireIncomingTableRequest {
  readonly requestId?: string | null;
  readonly requestedStartUtc?: string | null;
  readonly freeByUtc?: string | null;
  readonly expiresAtUtc?: string | null;
  /** "19:45:00" on the branch's clock; the instant above is what is read. */
  readonly requestedLocalTime?: string | null;
  readonly freeByLocalTime?: string | null;
}

/** `ReservationView`: the promise, and a later guest's request. */
export interface WireReservationTimes {
  readonly promisedFreeByUtc?: string | null;
  readonly incomingTableRequest?: WireIncomingTableRequest | null;
}

/**
 * `AwaitingApproval`: the time the floor asks the guest before to have left by
 * — an `EarlierGuestConsent` booking, or a short-notice one within three hours
 * of the booking before it.
 */
export interface WireAwaitingTimes {
  readonly earlierGuestFreeByUtc?: string | null;
}

/** `AwaitingPreviousBooking` / `AwaitingNextBooking`: a promise already made. */
export interface WireAwaitingNeighbourTimes {
  readonly promisedFreeByUtc?: string | null;
}

/**
 * `TableFloorState`: the next booking's guest promised to free the table by
 * ("must free by 21:25" on the next-booking line), and the party sitting now did.
 */
export interface WireFloorTableTimes {
  readonly nextReservationPromisedFreeByUtc?: string | null;
  readonly sittingPromisedFreeByUtc?: string | null;
}

/** `PublicBookingView`: the promise, and why it waits. */
export interface WirePublicBookingTimes {
  readonly promisedFreeByUtc?: string | null;
  /** `ApprovalTrigger`, as on `ReservationView`. */
  readonly awaitingApprovalBecause?: number | null;
}

/** A blank or absent instant is no instant at all. */
export function instantOrNull(value: string | null | undefined): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

/**
 * The request, or `null` — including for one missing any of its four parts:
 * a card that cannot say when, or by when, asks nothing.
 */
export function incomingTableRequestFromWire(
  wire: WireIncomingTableRequest | null | undefined,
): IncomingTableRequest | null {
  if (!wire) return null;
  const requestId = instantOrNull(wire.requestId);
  const requestedStartUtc = instantOrNull(wire.requestedStartUtc);
  const freeByUtc = instantOrNull(wire.freeByUtc);
  const expiresAtUtc = instantOrNull(wire.expiresAtUtc);
  if (!requestId || !requestedStartUtc || !freeByUtc || !expiresAtUtc) return null;
  return { requestId, requestedStartUtc, freeByUtc, expiresAtUtc };
}
