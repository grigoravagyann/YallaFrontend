import type { AwaitingApproval, PreviousBookingContext } from '../contracts/approvals';
import type { components } from '../generated/schema';
import { approvalExpiry, approvalTrigger, awaitsEarlierGuestAnswer } from './approvalMapping';
import {
  instantOrNull,
  type WireAwaitingNeighbourTimes,
  type WireAwaitingTimes,
  type WireReservationTimes,
} from './bookingTimesWire';
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
 * One row of `GET /api/branches/{branchId}/reservations/awaiting`: the
 * booking, why and until when it waits, and the table around it. Every
 * context field is absent when there is none, like every null in this API.
 */
export type WireAwaitingApproval =
  components['schemas']['Yalla.Application.Reservations.AwaitingApproval'] & WireAwaitingTimes;

/** The booking before, and after, with their promises — booking times, ahead of the schema. */
type WirePreviousBooking = NonNullable<WireAwaitingApproval['previousBooking']> &
  WireAwaitingNeighbourTimes;
type WireNextBooking = NonNullable<WireAwaitingApproval['nextBooking']> &
  WireAwaitingNeighbourTimes;

function blank(value: string | null | undefined): string | null {
  return value?.trim() ? value.trim() : null;
}

export function awaitingApprovalFromWire(wire: WireAwaitingApproval): AwaitingApproval {
  const view = wire.reservation;
  const previous = wire.previousBooking as WirePreviousBooking | null | undefined;
  const previousBooking: PreviousBookingContext | null = previous
    ? {
        startUtc: previous.startUtc,
        partySize: previous.partySize,
        guestName: previous.guestName,
        guestPhone: blank(previous.guestPhone),
        status: reservationStatus(previous.status),
        promisedFreeByUtc: instantOrNull(previous.promisedFreeByUtc),
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
    phoneUnverified: view.phoneUnverified === true,
    // The row's own fields first; the reservation's when a server sends only those.
    approvalExpiresAtUtc: approvalExpiry(wire.approvalExpiresAtUtc ?? view.approvalExpiresAtUtc),
    because: approvalTrigger(wire.trigger ?? view.awaitingApprovalBecause),
    // The server lists only the floor's own; read anyway, so a row that is the
    // guest before's to answer is never offered a decision.
    awaitsEarlierGuestAnswer: awaitsEarlierGuestAnswer(view),
    // This booking's own promise, from its view; and the time to ask the
    // guest before for, when there is one.
    promisedFreeByUtc: instantOrNull((view as WireReservationTimes).promisedFreeByUtc),
    earlierGuestFreeByUtc: instantOrNull(wire.earlierGuestFreeByUtc),
    previousBooking,
    nextBooking: wire.nextBooking
      ? {
          startUtc: wire.nextBooking.startUtc,
          partySize: wire.nextBooking.partySize,
          promisedFreeByUtc: instantOrNull((wire.nextBooking as WireNextBooking).promisedFreeByUtc),
        }
      : null,
    currentSitting: wire.currentSitting
      ? {
          sinceUtc: wire.currentSitting.seatedAtUtc,
          partySize: wire.currentSitting.partySize ?? null,
        }
      : null,
  };
}
