import {
  ApiError,
  StaffPermissionError,
  TooManyRequestsError,
  ValidationError,
  describeFailure,
} from '@yalla/api';

/** The console's own sentences, for the refusals the server's are not written for. */
export interface IssueFailureCopy {
  readonly offline: string;
  readonly generic: string;
  /** A 422 naming `email`: the server's sentence there is .NET's, for a developer. */
  readonly badEmail: string;
  /** A 429: the route's ten-a-minute sign-in budget, which is a wait and not a fault. */
  readonly tooManyRequests: string;
}

/**
 * What to show when issuing a sign-in fails.
 *
 * The staff routes answer with a sentence written to be shown: "a waiter signs
 * in by tapping a PIN", "that address already has an account", "reactivate them
 * first". Those are the 409, 403 and 404 — the refusals that are about this
 * person and this address, and the next action is in the sentence. The 403 on
 * this route arrives as a {@link StaffPermissionError}, which is not a
 * `ForbiddenError` and so is not what `describeFailure` calls `forbidden`; it
 * is named on its own here, or its sentence was dropped for the generic copy.
 *
 * Two refusals get the console's copy instead. A 422 naming `email` carries
 * DataAnnotations' own words ("The field email must be a string with a maximum
 * length of 320."), which are for a developer and in English whatever the
 * locale; and a 429 is the rate limiter, which is nobody's fault. A server
 * fault or a dropped connection has no sentence at all, and the generic copy
 * is the honest thing.
 */
export function issueFailureText(error: unknown, copy: IssueFailureCopy): string {
  const kind = describeFailure(error);
  if (kind === 'offline') return copy.offline;
  if (error instanceof TooManyRequestsError) return copy.tooManyRequests;
  if (error instanceof ValidationError && error.field === 'email') return copy.badEmail;
  const spoken =
    kind === 'conflict' ||
    kind === 'invalid' ||
    kind === 'forbidden' ||
    kind === 'notFound' ||
    error instanceof StaffPermissionError;
  if (spoken && error instanceof ApiError && error.message) return error.message;
  return copy.generic;
}
