import type { AwaitingApproval, PreviousBookingContext } from '../contracts/approvals';
import {
  approvalExpiry,
  approvalTrigger,
  type WireReservationWithApproval,
} from './approvalMapping';
import { reservationStatus } from './dinerMapping';

/**
 * The floor tablet's awaiting list, from the wire.
 *
 * Its own file because it reads the diner mapper's reservation status, and the
 * diner mapper reads the approval enums: one file holding both would import
 * itself in a circle. The route is ahead of `generated/schema.ts` — see
 * `approvalMapping.ts` — so its row is declared here.
 */

/**
 * One row of `GET /api/branches/{branchId}/reservations/awaiting` —
 * `Yalla.Application.Reservations.AwaitingApproval`: the booking, why and until
 * when it waits, and the table around it. Every context field is absent when
 * there is none, like every null in this API.
 */
export interface WireAwaitingApproval {
  readonly reservation: WireReservationWithApproval;
  readonly approvalExpiresAtUtc?: string | null;
  /** `ApprovalTrigger`, as on the reservation. */
  readonly trigger?: number | null;
  /** `AwaitingPreviousBooking`. */
  readonly previousBooking?: {
    readonly reservationId?: string;
    readonly startUtc: string;
    readonly localStartTime?: string;
    readonly partySize: number;
    readonly guestName: string;
    /** Absent for a platform admin reading the list. */
    readonly guestPhone?: string | null;
    /** `ReservationStatus`. */
    readonly status: number;
  } | null;
  /** `AwaitingNextBooking`. */
  readonly nextBooking?: {
    readonly reservationId?: string;
    readonly startUtc: string;
    readonly localStartTime?: string;
    readonly partySize: number;
  } | null;
  /** `AwaitingCurrentSitting`. */
  readonly currentSitting?: {
    readonly seatedAtUtc: string;
    /** Absent when a diner's scan opened the table, which only guesses. */
    readonly partySize?: number | null;
  } | null;
}

function blank(value: string | null | undefined): string | null {
  return value?.trim() ? value.trim() : null;
}

export function awaitingApprovalFromWire(wire: WireAwaitingApproval): AwaitingApproval {
  const view = wire.reservation;
  const previous = wire.previousBooking;
  const previousBooking: PreviousBookingContext | null = previous
    ? {
        startUtc: previous.startUtc,
        partySize: previous.partySize,
        guestName: previous.guestName,
        guestPhone: blank(previous.guestPhone),
        status: reservationStatus(previous.status),
      }
    : null;

  return {
    id: view.id,
    code: view.code,
    branchId: view.branchId,
    guestName: view.guestName,
    guestPhone: view.guestPhone,
    partySize: view.partySize,
    tableId: view.tableId,
    tableLabel: view.tableLabel,
    roomName: blank(view.roomName),
    startUtc: view.startUtc,
    localDate: view.localDate,
    localStartTime: view.localStartTime,
    timeZoneId: view.timeZoneId,
    note: view.note ?? null,
    // The row's own fields first; the reservation's when a server sends only those.
    approvalExpiresAtUtc: approvalExpiry(wire.approvalExpiresAtUtc ?? view.approvalExpiresAtUtc),
    because: approvalTrigger(wire.trigger ?? view.awaitingApprovalBecause),
    previousBooking,
    nextBooking: wire.nextBooking
      ? { startUtc: wire.nextBooking.startUtc, partySize: wire.nextBooking.partySize }
      : null,
    currentSitting: wire.currentSitting
      ? {
          sinceUtc: wire.currentSitting.seatedAtUtc,
          partySize: wire.currentSitting.partySize ?? null,
        }
      : null,
  };
}
