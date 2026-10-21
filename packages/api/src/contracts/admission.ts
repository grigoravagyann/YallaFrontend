/**
 * Guests with a number nobody proved: the tab a scan opened that a waiter has
 * to let order.
 *
 * Decided on 2026-10-20. A phone number can be typed by anybody and a printed
 * QR code can be photographed and scanned from home, so neither is trusted on
 * its own any more:
 *
 * - **A booking needs a proved number** again: the guest record (2026-10-20)
 *   retired the booking without a phone proof, with its branch settings. The
 *   few bookings made while it was live keep `phoneUnverified` ("number not
 *   verified" beside them) and the approval reason `unverifiedPhone`.
 * - **A tab a scan opened with no proved number** waits for a waiter
 *   (`awaiting`): the phones read the menu and the tab and can call a waiter,
 *   but nothing can be ordered and no bill asked for until somebody on the
 *   floor, who can see who is sitting there, admits it — or rejects it, which
 *   closes the tab and, when the scan itself seated the table, frees it.
 *
 * Admission is a gate on the tab, never on an order: once admitted, ordering
 * is what it always was (a phone's order waits at New for the waiter). A
 * waiter's own order on a waiting tab is taken but does **not** admit it: only
 * Admit does (review round, 2026-10-20). A branch can switch the gate off
 * (`unverifiedScansNeedAdmission`), and such scans are let in at once
 * (`notRequired`).
 */

/**
 * Whether the people on a tab may order yet. `Yalla.Domain.Enums.TabAdmission`:
 * 1 AwaitingAdmission, 2 Admitted, 3 Rejected. `unknown` for a value a newer
 * server adds — read as "not awaiting", because a tab the client cannot place
 * must not be offered an admission the server would refuse.
 */
export type TabAdmissionStatus = 'awaiting' | 'admitted' | 'rejected' | 'unknown';

/**
 * Why a tab was admitted. `Yalla.Domain.Enums.TabAdmissionReason`: 1 Waiter,
 * 2 VerifiedHost, 3 OpenedByStaff, 4 Booker, 5 NotRequired.
 *
 * Only `waiter` is a person tapping Admit. A host whose number is proved, a
 * tab staff opened and a booker at their own table are admitted on the spot;
 * `notRequired` is a scan at a branch that lets unverified scans order at once
 * (5 meant "a waiter's order" before the review round; no client showed it).
 */
export type TabAdmissionReason =
  'waiter' | 'verifiedHost' | 'openedByStaff' | 'booker' | 'notRequired' | 'unknown';

/** `TabAdmissionView`, on the diner's tab and on staff's. */
export interface TabAdmission {
  readonly status: TabAdmissionStatus;
  /** Null while waiting, once rejected, and on a tab from before admission. */
  readonly admittedBecause: TabAdmissionReason | null;
  /** When it was admitted or rejected; null while waiting. */
  readonly decidedAtUtc: string | null;
  /** The waiter who did, when one did. */
  readonly decidedByStaffId: string | null;
  /** On a rejected tab only: whether rejecting it freed the table. Null otherwise. */
  readonly tableFreed: boolean | null;
}

/**
 * What a tab that does not say reads as: admitted, as every tab from before
 * admission was. A missing admission never locks a table out of ordering.
 */
export const ADMITTED: TabAdmission = {
  status: 'admitted',
  admittedBecause: null,
  decidedAtUtc: null,
  decidedByStaffId: null,
  tableFreed: null,
};

export function isAwaitingAdmission(
  tab: { readonly admission?: TabAdmission | null | undefined } | null | undefined,
): boolean {
  return tab?.admission?.status === 'awaiting';
}

/**
 * One tab waiting for a waiter, as the floor tablet's rail draws it —
 * `GET /api/branches/{branchId}/tabs/awaiting-admission`, oldest first.
 */
export interface TabAwaitingAdmission {
  readonly tabId: string;
  readonly tableId: string;
  readonly tableLabel: string;
  /** "Hall", "Terrace"; null for a table in no room. */
  readonly roomName: string | null;
  /** When the scan opened it: the card says how long ago. */
  readonly openedAtUtc: string;
  /** What the host called themselves, or the roster's placeholder; null when neither. */
  readonly hostDisplayName: string | null;
  /** Phones on the tab, the host included. */
  readonly participantCount: number;
  /**
   * True when the scan itself seated the table: rejecting then frees it. False
   * when a waiter or a booking seated the party — rejecting then closes only
   * the tab, and the party really there can scan again.
   */
  readonly sittingSeatedByScan: boolean;
}

/**
 * `POST /api/tabs/{tabId}/admit`. Online only — never one of the commands the
 * tablet queues — and idempotent on the command id: a retry answers the tab as
 * it stands.
 */
export interface AdmitTabCommand {
  readonly tabId: string;
  readonly clientCommandId: string;
}

/**
 * `POST /api/tabs/{tabId}/reject`. Closes the tab, and frees the table when
 * the scan seated it. Online only, like admitting: a reject frees a table, a
 * destructive answer about a room an offline tablet cannot see.
 */
export interface RejectTabCommand {
  readonly tabId: string;
  readonly clientCommandId: string;
  /** At most 500 characters; the audit row's reason when the table is freed. */
  readonly reason?: string | undefined;
}

/**
 * Why an entry on the branch's change stream is about a tab or a booking
 * rather than the table: `Yalla.Domain.Enums.TableChangeSignal`, 1
 * TabAwaitingAdmission, 2 TabAdmitted, 3 TabAdmissionRejected — a tablet reads
 * the awaiting list (and the floor) again on any of them — and 4
 * BookingCancelledByBlock (guest record, 2026-10-20): a booking at this table
 * (`reservationId`) was cancelled because its guest was blocked for no-shows;
 * read the bookings again — and 5 BookingChanged: a booking at this table was
 * made, approved, declined, moved, cancelled, or its no-show marked or
 * withdrawn. Its row's status is not a transition (from = to): re-read the
 * floor, never fold it — and 6 PreOrderChanged (2026-10-21): a booking's
 * pre-order (`reservationId`) was created, edited, cleared, sent, marked not
 * coming, put on the tab, its held ticket moved by the kitchen, "not coming"
 * cleared by a move, or the guest answered "on my way". Same-status row like
 * 4 and 5: do not fold it; read the pre-order rail (`/pre-orders/due`) again.
 */
export type FloorChangeSignal =
  | 'tabAwaitingAdmission'
  | 'tabAdmitted'
  | 'tabAdmissionRejected'
  | 'bookingCancelledByBlock'
  | 'bookingChanged'
  | 'preOrderChanged'
  | 'unknown';

/** At most this many characters in a reject's reason, as the server bounds it. */
export const REJECT_TAB_REASON_MAX = 500;
