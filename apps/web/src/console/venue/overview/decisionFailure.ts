import { ApiError, describeFailure, isApprovalExpired } from '@yalla/api';

/** The server's code for a decision on a booking that is no longer pending. */
const ANSWERED_ELSEWHERE_CODE = 'conflicting-state';

/**
 * The server's code for a decision on a booking that waits on the guest before
 * it to answer in the app (booking times): theirs to answer, not the floor's.
 */
const AWAITING_EARLIER_GUEST_CODE = 'reservation-awaiting-earlier-guest';

/**
 * The decision was refused because the guest before answers it in the app: the
 * screen stops offering one for that booking.
 */
export function isAwaitingEarlierGuest(error: unknown): boolean {
  return (
    error instanceof ApiError && error.status === 409 && error.code === AWAITING_EARLIER_GUEST_CODE
  );
}

/** The decision was refused because somebody else answered it first. */
export function isAnsweredElsewhere(error: unknown): boolean {
  return (
    error instanceof ApiError && error.status === 409 && error.code === ANSWERED_ELSEWHERE_CODE
  );
}

/** The console's own sentences, for the failures the server's are not written for. */
export interface DecisionFailureCopy {
  readonly offline: string;
  readonly generic: string;
  /**
   * The answer came too late: the window closed, and the guest has already
   * been told sorry. Said in the screen's words rather than the server's,
   * because what to do next — nothing, it is handled — is the screen's to say.
   */
  readonly tooLate?: string | undefined;
  /**
   * Somebody else answered first — another waiter, or a manager in the
   * console. The server's sentence for it ("Only a pending reservation can be
   * confirmed; LM7Q is Confirmed.") is English and names an enum; a screen that
   * is read in Armenian says it in its own words when it has them.
   */
  readonly answeredElsewhere?: string | undefined;
  /**
   * The booking waits on the guest before it to answer in the app whether they
   * will have left in time: it is decided when they do, or declined if not.
   */
  readonly awaitingEarlierGuest?: string | undefined;
}

/**
 * What to show when a decision on a booking fails.
 *
 * The two refusals the routes are written for arrive with a sentence meant to
 * be shown: the 403 ("Approve a booking requires the Manager role; the caller
 * is a Manager.") is the branch rule, and the 409 ("Only a pending reservation
 * can be confirmed; LM7Q is Confirmed.") is somebody else deciding first. Both
 * are about *this* booking and this person, and the next action is in the
 * sentence — so the sentence is what is shown. A 404 is the same kind of
 * thing: the booking is gone. A dropped connection or a server fault has no
 * sentence, and the generic copy is the honest one.
 */
export function decisionFailureText(error: unknown, copy: DecisionFailureCopy): string {
  if (copy.tooLate && isApprovalExpired(error)) return copy.tooLate;
  if (copy.awaitingEarlierGuest && isAwaitingEarlierGuest(error)) return copy.awaitingEarlierGuest;
  if (copy.answeredElsewhere && isAnsweredElsewhere(error)) return copy.answeredElsewhere;
  const kind = describeFailure(error);
  if (kind === 'offline') return copy.offline;
  const spoken =
    kind === 'forbidden' || kind === 'conflict' || kind === 'notFound' || kind === 'invalid';
  if (spoken && error instanceof ApiError && error.message) return error.message;
  return copy.generic;
}
