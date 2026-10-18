import { ApiError, describeFailure, isApprovalExpired } from '@yalla/api';

/** The server's code for a decision on a booking that is no longer pending. */
const ANSWERED_ELSEWHERE_CODE = 'conflicting-state';

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
  if (
    copy.answeredElsewhere &&
    error instanceof ApiError &&
    error.status === 409 &&
    error.code === ANSWERED_ELSEWHERE_CODE
  ) {
    return copy.answeredElsewhere;
  }
  const kind = describeFailure(error);
  if (kind === 'offline') return copy.offline;
  const spoken =
    kind === 'forbidden' || kind === 'conflict' || kind === 'notFound' || kind === 'invalid';
  if (spoken && error instanceof ApiError && error.message) return error.message;
  return copy.generic;
}
