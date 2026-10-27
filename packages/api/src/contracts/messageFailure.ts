import {
  ForbiddenError,
  NetworkError,
  NotFoundError,
  ServerError,
  TimeoutError,
  TooManyRequestsError,
  ValidationError,
  type FieldViolation,
} from '../errors';
import {
  ConversationClosedError,
  GuestsCannotWriteError,
  MessagesTooFastError,
  WaitersCannotWriteError,
  isFeatureNotEnabled,
} from './errors';

/**
 * What a failed send or read was (guest messages, 2026-10-23), for both the
 * guest's thread and the floor's — one kind per sentence the screens say. The
 * copy is the app's: each surface maps `kind` to its own i18n key, so the
 * three languages live with the screens that render them.
 *
 * - `closed`: the thread closed — hide the composer, show the closed note
 *   ("Messages stay here for 30 days. Questions? Call the venue.").
 * - `guestsCannotWrite`: the venue takes no guest texts — "reply with the
 *   buttons or call"; hide the composer.
 * - `waitersCannotWrite`: only managers write here — hide the tablet's composer.
 * - `forbidden`: kitchen or a platform admin — reads only.
 * - `tooFast`: wait `retryAfterSeconds` (when the server said), or — with
 *   `perConversation` — the thread's sixty are spent: call instead.
 * - `invalid`: `violations` in the server's field names (`text`).
 * - `notFound`: the booking or order is gone, or not this diner's.
 * - `offline`: it never arrived, or the answer did not: the same
 *   `clientCommandId` is safe to send again.
 * - `featureOff`: the platform has not enabled guest messages at the branch
 *   (`feature-not-enabled`, 2026-10-27): no composer, and nothing to retry.
 * - `generic`: anything else.
 */
export type MessageFailure =
  | { readonly kind: 'closed'; readonly closedAtUtc: string | null }
  | { readonly kind: 'guestsCannotWrite' }
  | { readonly kind: 'waitersCannotWrite' }
  | { readonly kind: 'forbidden' }
  | {
      readonly kind: 'tooFast';
      readonly retryAfterSeconds: number | null;
      readonly perConversation: boolean;
    }
  | { readonly kind: 'invalid'; readonly violations: readonly FieldViolation[] }
  | { readonly kind: 'notFound' }
  | { readonly kind: 'offline' }
  | { readonly kind: 'featureOff' }
  | { readonly kind: 'generic' };

/** A messages failure, as the kind of sentence to show. */
export function messageFailure(error: unknown): MessageFailure {
  if (error instanceof ConversationClosedError) {
    return { kind: 'closed', closedAtUtc: error.closedAtUtc };
  }
  if (error instanceof GuestsCannotWriteError) return { kind: 'guestsCannotWrite' };
  if (error instanceof WaitersCannotWriteError) return { kind: 'waitersCannotWrite' };
  if (error instanceof MessagesTooFastError) {
    return {
      kind: 'tooFast',
      retryAfterSeconds: error.retryAfterSeconds,
      perConversation: error.perConversation,
    };
  }
  if (error instanceof TooManyRequestsError) {
    return { kind: 'tooFast', retryAfterSeconds: error.retryAfterSeconds, perConversation: false };
  }
  if (error instanceof ValidationError) {
    return {
      kind: 'invalid',
      violations:
        error.violations.length > 0
          ? error.violations
          : error.field
            ? [{ field: error.field, message: error.message }]
            : [],
    };
  }
  if (isFeatureNotEnabled(error)) return { kind: 'featureOff' };
  if (error instanceof ForbiddenError) return { kind: 'forbidden' };
  if (error instanceof NotFoundError) return { kind: 'notFound' };
  if (
    error instanceof NetworkError ||
    error instanceof TimeoutError ||
    error instanceof ServerError
  ) {
    return { kind: 'offline' };
  }
  return { kind: 'generic' };
}
