/**
 * Guest messages (2026-10-23).
 *
 * Part of `contracts/errors`; import from there (or `@yalla/api`), not from here.
 */
import { ApiError, TooManyRequestsError } from '../../errors';
import { PROBLEM_CODE_STATUS, ProblemCodes } from '../../generated/problemCodes';
import type { RefusalOptions } from './shared';

/** `conversation-closed`: the thread closed (two hours after the booking or order finished). */
export const CONVERSATION_CLOSED_CODE = ProblemCodes.ConversationClosed;
/** `guests-cannot-write`: the venue switched guest messages off; the answer buttons still work. */
export const GUESTS_CANNOT_WRITE_CODE = ProblemCodes.GuestsCannotWrite;
/** `waiters-cannot-write`: the venue lets only managers write from the tablet. */
export const WAITERS_CANNOT_WRITE_CODE = ProblemCodes.WaitersCannotWrite;
/** `messages-too-fast`: more than five guest messages a minute, or sixty in one thread. */
export const MESSAGES_TOO_FAST_CODE = ProblemCodes.MessagesTooFast;

/**
 * Writing to a closed thread — `conversation-closed`, 409 (`context`:
 * `subjectKind`, `subjectId`, `closedAtUtc`). Hide the composer and show the
 * closed note; the thread can still be read. Read it again.
 */
export class ConversationClosedError extends ApiError {
  /**
   * `reservation` or `takeaway`, when the server says. Narrower than the
   * catalogue's `subjectKind: string` on purpose (`subjectKind` in the mapping).
   */
  readonly subjectKind: 'reservation' | 'takeaway' | null;
  readonly subjectId: string | null;
  /** When it closed, when the server says. */
  readonly closedAtUtc: string | null;

  constructor(
    options: RefusalOptions & {
      subjectKind?: 'reservation' | 'takeaway' | null | undefined;
      subjectId?: string | null | undefined;
      closedAtUtc?: string | null | undefined;
    },
  ) {
    super('This conversation is closed.', {
      status: PROBLEM_CODE_STATUS[ProblemCodes.ConversationClosed],
      url: options.url,
      requestId: options.requestId,
    });
    this.name = 'ConversationClosedError';
    this.subjectKind = options.subjectKind ?? null;
    this.subjectId = options.subjectId ?? null;
    this.closedAtUtc = options.closedAtUtc ?? null;
  }
}

export function isConversationClosed(error: unknown): error is ConversationClosedError {
  return error instanceof ConversationClosedError;
}

/**
 * A guest's text while the venue has guest messages off —
 * `guests-cannot-write`, 403. The answer buttons still work: "reply with the
 * buttons or call".
 */
export class GuestsCannotWriteError extends ApiError {
  constructor(options: RefusalOptions) {
    super('This venue does not take messages from guests.', {
      status: PROBLEM_CODE_STATUS[ProblemCodes.GuestsCannotWrite],
      url: options.url,
      requestId: options.requestId,
    });
    this.name = 'GuestsCannotWriteError';
  }
}

export function isGuestsCannotWrite(error: unknown): error is GuestsCannotWriteError {
  return error instanceof GuestsCannotWriteError;
}

/**
 * A waiter writing while the venue lets only managers write —
 * `waiters-cannot-write`, 403. Hide the composer.
 */
export class WaitersCannotWriteError extends ApiError {
  constructor(options: RefusalOptions) {
    super('Only managers can write to guests here.', {
      status: PROBLEM_CODE_STATUS[ProblemCodes.WaitersCannotWrite],
      url: options.url,
      requestId: options.requestId,
    });
    this.name = 'WaitersCannotWriteError';
  }
}

export function isWaitersCannotWrite(error: unknown): error is WaitersCannotWriteError {
  return error instanceof WaitersCannotWriteError;
}

/**
 * Too many guest messages — `messages-too-fast`, 429 (`context`:
 * `conversationId`, `perMinute`, `perConversation`, and `retryAfterUtc` while
 * waiting helps): more than five a minute, or sixty in one thread. A
 * `TooManyRequestsError`, so the generic "wait a moment" handling still
 * applies; `retryAfterSeconds` from `Retry-After` when the server sent it.
 */
export class MessagesTooFastError extends TooManyRequestsError {
  readonly conversationId: string | null;
  /** When the next one will be taken; `null` once the thread's sixty are spent. */
  readonly retryAfterUtc: string | null;
  /** The thread's sixty are used up: waiting will not help — call instead. */
  readonly perConversation: boolean;

  constructor(
    options: RefusalOptions & {
      conversationId?: string | null | undefined;
      retryAfterSeconds?: number | null | undefined;
      retryAfterUtc?: string | null | undefined;
      perConversation?: boolean | undefined;
    },
  ) {
    super({
      url: options.url,
      requestId: options.requestId,
      retryAfterSeconds: options.retryAfterSeconds ?? null,
    });
    this.name = 'MessagesTooFastError';
    this.conversationId = options.conversationId ?? null;
    this.retryAfterUtc = options.retryAfterUtc ?? null;
    this.perConversation = options.perConversation ?? false;
  }
}

export function isMessagesTooFast(error: unknown): error is MessagesTooFastError {
  return error instanceof MessagesTooFastError;
}
