import { ApiError, describeFailure } from '@yalla/api';

/**
 * What to show when issuing a sign-in fails.
 *
 * The staff routes answer with a sentence written to be shown: "a waiter signs
 * in by tapping a PIN", "that address already has an account", "reactivate them
 * first". Those are the 409, 422, 403 and 404 — the refusals that are about
 * this person and this address, and the next action is in the sentence. A
 * server fault or a dropped connection has no such sentence, and the generic
 * copy is the honest thing.
 */
export function issueFailureText(
  error: unknown,
  fallback: { readonly offline: string; readonly generic: string },
): string {
  const kind = describeFailure(error);
  if (kind === 'offline') return fallback.offline;
  const spoken =
    kind === 'conflict' || kind === 'invalid' || kind === 'forbidden' || kind === 'notFound';
  if (spoken && error instanceof ApiError && error.message) return error.message;
  return fallback.generic;
}
