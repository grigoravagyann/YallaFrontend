import { ApiError, describeFailure } from '@yalla/api';

/** The console's own sentences, for the failures the server's are not written for. */
export interface DecisionFailureCopy {
  readonly offline: string;
  readonly generic: string;
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
  const kind = describeFailure(error);
  if (kind === 'offline') return copy.offline;
  const spoken =
    kind === 'forbidden' || kind === 'conflict' || kind === 'notFound' || kind === 'invalid';
  if (spoken && error instanceof ApiError && error.message) return error.message;
  return copy.generic;
}
