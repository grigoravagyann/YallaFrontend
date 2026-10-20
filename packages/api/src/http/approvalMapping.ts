import type { ApprovalTrigger, DeclineReason } from '../contracts/approvals';
import type { components } from '../generated/schema';

type ReservationView = components['schemas']['Yalla.Application.Reservations.ReservationView'];

/**
 * The booking-approval fields, from the wire, for every surface that reads them.
 *
 * The console, the floor tablet, the diner's phone and the public page all
 * read the same two enums off `ReservationView`, so they are turned into words
 * once, here. Nothing in this file imports another mapper, so every one of
 * them can import it.
 *
 * ## Ahead of the generated schema
 *
 * `approvalExpiresAtUtc`, `declinedBecause` and the awaiting list are the
 * booking-approval wire, written by the backend alongside this. Until
 * `pnpm api:generate` is run against it, `generated/schema.ts` does not have
 * them, so they are declared here as optional additions to the generated
 * shapes — absent from an older server, which every mapper below reads as
 * "nothing to say" rather than as a failure. Once regenerated, the
 * intersections collapse into the generated types and can go.
 */

/** `ReservationView`'s approval fields, ahead of the generated schema. */
export interface WireApprovalFields {
  readonly approvalExpiresAtUtc?: string | null;
  /** `DeclineReason`: 1 StaffDeclined, 2 NoAnswer. */
  readonly declinedBecause?: number | null;
}

export type WireReservationWithApproval = ReservationView & WireApprovalFields;

/**
 * `ApprovalTrigger`: 1 BranchApprovesEveryBooking, 2 LargeParty,
 * 3 NoShowHistory, 4 ShortNotice, 5 EarlierGuestConsent, 6 UnverifiedPhone.
 */
const APPROVAL_TRIGGER: Readonly<Record<number, ApprovalTrigger>> = {
  1: 'branchApprovesEveryBooking',
  2: 'largeParty',
  3: 'noShowHistory',
  4: 'shortNotice',
  5: 'earlierGuestConsent',
  6: 'unverifiedPhone',
};

export function approvalTrigger(value: number | null | undefined): ApprovalTrigger | null {
  if (value === null || value === undefined) return null;
  return APPROVAL_TRIGGER[value] ?? 'unknown';
}

/**
 * `DeclineReason`: 1 StaffDeclined, 2 NoAnswer, 3 EarlierGuestDeclined,
 * 4 EarlierGuestNoAnswer (the last two ahead of the generated schema).
 */
const DECLINE_REASON: Readonly<Record<number, DeclineReason>> = {
  1: 'staffDeclined',
  2: 'noAnswer',
  3: 'earlierGuestDeclined',
  4: 'earlierGuestNoAnswer',
};

export function declineReason(value: number | null | undefined): DeclineReason | null {
  if (value === null || value === undefined) return null;
  return DECLINE_REASON[value] ?? 'unknown';
}

/**
 * Whether a booking waits on the guest before's own answer
 * (`ReservationView.awaitsEarlierGuestAnswer`): only while it waits
 * (`ReservationStatus` 1), and only when the server says so.
 */
export function awaitsEarlierGuestAnswer(
  view: Pick<ReservationView, 'status' | 'awaitsEarlierGuestAnswer'>,
): boolean {
  return view.status === 1 && view.awaitsEarlierGuestAnswer === true;
}

/** A blank or absent instant is no window at all. */
export function approvalExpiry(value: string | null | undefined): string | null {
  return value?.trim() ? value : null;
}
