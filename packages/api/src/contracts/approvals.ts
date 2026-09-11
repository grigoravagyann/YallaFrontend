import type { ReservationStatusCode } from './push';

/**
 * Bookings that are waiting for a person, and the two decisions.
 *
 * The policy tab lets an owner turn `autoConfirm` off or set a party-size
 * threshold, and a booking the rule stops lands as `PendingApproval` — where,
 * until this contract, it stayed: `POST /api/reservations/{id}/approve` and
 * `/reject` existed on the server and no surface called them.
 *
 * Deliberately not {@link ReservationState}. That is the diner's view from a
 * notification and carries no guest. A manager deciding whether to take a
 * party of ten on a Friday needs the name, the phone to ring, and *why* the
 * booking is waiting — three fields `ReservationView` has and the diner's
 * shape leaves out.
 */
export interface ConsoleBooking {
  readonly id: string;
  /** The short code quoted at the door. */
  readonly code: string;
  readonly branchId: string;
  readonly guestName: string;
  readonly guestPhone: string;
  readonly partySize: number;
  readonly tableLabel: string;
  /** The branch's own day, `YYYY-MM-DD`. */
  readonly localDate: string;
  /** Wall clock at the branch, `HH:mm:ss` as the server writes it. */
  readonly localStartTime: string;
  readonly status: ReservationStatusCode;
  /** Why it is waiting. Null once decided, or when it never waited. */
  readonly awaitingApprovalBecause: ApprovalTrigger | null;
}

/**
 * `Yalla.Application.Reservations.ApprovalTrigger`: 1 BranchApprovesEveryBooking,
 * 2 LargeParty, 3 NoShowHistory. `unknown` for a value a newer server adds.
 */
export type ApprovalTrigger =
  'branchApprovesEveryBooking' | 'largeParty' | 'noShowHistory' | 'unknown';

/**
 * `DecideReservationRequest`: the one body both routes take.
 *
 * No `clientCommandId`. The routes are not behind `ClientCommandIdFilter`, and
 * a repeat is refused by state rather than replayed: the second approve of one
 * booking is a 409 naming it as already confirmed, which a screen shows and
 * then refreshes from.
 */
export interface DecideReservationCommand {
  readonly reservationId: string;
  /** Optional free text, recorded when declining. Never shown to the diner. */
  readonly reason?: string | undefined;
}
