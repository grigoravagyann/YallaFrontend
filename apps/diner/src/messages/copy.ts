import type {
  ConversationMessage,
  ConversationSubjectRef,
  ConversationSummary,
  MessageFailure,
  UnreadConversation,
} from '@yalla/api';

/**
 * Guest messages (2026-10-23), as the diner app words them.
 *
 * Pure, so it is tested without a phone. The server sends structure, never
 * prose, for everything but a typed text: the venue's "are you coming?", the
 * guest's button answers and the system's "Booking updated" line are built
 * here from their fields, in the diner's language of the moment.
 */

/** A sentence: an i18n key under `diner` and its values. */
export interface CopyLine {
  readonly key: string;
  readonly params?: Readonly<Record<string, string | number>>;
}

/** What a bubble says: the guest's or the venue's own words, or a sentence of the app's. */
export type MessageBody = { readonly text: string } | CopyLine;

export function isOwnText(body: MessageBody): body is { readonly text: string } {
  return 'text' in body;
}

/**
 * The bubble's words.
 *
 * - A text: as written, never linkified.
 * - The venue's ask: "Are you coming at 19:30?" — the booking's start, on the
 *   branch's clock (`clock` formats the `HH:mm`).
 * - The guest's answer: "I'm coming", "Running late 15 min", "Not coming".
 * - The system's line: held until 19:45 after a late answer, cancelled after
 *   "not coming", and "coming" after a coming answer (the line's own
 *   `status.answer`, else the answer just before it).
 *
 * `null` for a message this build cannot say anything about: a kind a newer
 * server added, with no text to fall back on.
 */
export function messageBody(
  message: Pick<ConversationMessage, 'kind' | 'text' | 'answer' | 'status'>,
  context: {
    /** The booking's start as `HH:mm` on the branch's clock, for the ask. */
    readonly localTime: string | null;
    /** The message before this one, for a status line after an answer. */
    readonly previous?: Pick<ConversationMessage, 'kind' | 'answer'> | null | undefined;
    /** `HH:mm` as the locale writes it. */
    readonly clock: (hhmm: string) => string;
  },
): MessageBody | null {
  const text = message.text?.trim() ? message.text : null;
  switch (message.kind) {
    case 'text':
      return text ? { text } : null;
    case 'askComing':
      if (text) return { text };
      return context.localTime
        ? { key: 'messages.ask', params: { time: context.clock(context.localTime) } }
        : { key: 'messages.askPlain' };
    case 'answer': {
      const answer = message.answer;
      if (answer?.kind === 'coming') return { key: 'messages.answer.coming' };
      if (answer?.kind === 'notComing') return { key: 'messages.answer.notComing' };
      if (answer?.kind === 'late') {
        return answer.lateMinutes
          ? { key: 'messages.answer.late', params: { minutes: answer.lateMinutes } }
          : { key: 'messages.answer.latePlain' };
      }
      return text ? { text } : null;
    }
    case 'status': {
      const status = message.status;
      if (status?.cancelled) return { key: 'messages.status.cancelled' };
      if (status?.heldUntilLocal) {
        return {
          key: 'messages.status.held',
          params: { time: context.clock(status.heldUntilLocal) },
        };
      }
      if (
        status?.answer === 'coming' ||
        (context.previous?.kind === 'answer' && context.previous.answer?.kind === 'coming')
      ) {
        return { key: 'messages.status.coming' };
      }
      return { key: 'messages.status.updated' };
    }
    default:
      return text ? { text } : null;
  }
}

/**
 * The id of the venue's latest "are you coming?" in a thread, or `null`. An
 * answer bar dismissed for one ask comes back for the next one.
 */
export function lastAskId(
  messages: readonly Pick<ConversationMessage, 'id' | 'kind'>[],
): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]!.kind === 'askComing') return messages[index]!.id;
  }
  return null;
}

/**
 * The venue's and the system's messages that arrived since `known` (the ids
 * on screen before), each with the message before it — what a screen reader
 * is told as they land. The guest's own never are, nor one still sending.
 */
export function newArrivals<M extends Pick<ConversationMessage, 'id' | 'author' | 'pending'>>(
  messages: readonly M[],
  known: ReadonlySet<string>,
): { readonly message: M; readonly previous: M | null }[] {
  return messages.flatMap((message, index) =>
    known.has(message.id) || message.author === 'guest' || message.pending
      ? []
      : [{ message, previous: messages[index - 1] ?? null }],
  );
}

/** The line a summary or an unread row shows for the last message: its text, or what it was. */
export function lastMessageLine(last: {
  readonly lastKind: ConversationSummary['lastKind'];
  readonly lastText: string | null;
}): MessageBody | null {
  if (last.lastText?.trim()) return { text: last.lastText };
  switch (last.lastKind) {
    case 'askComing':
      return { key: 'messages.askPlain' };
    case 'answer':
      return { key: 'messages.row.answered' };
    case 'status':
      return { key: 'messages.status.updated' };
    default:
      return null;
  }
}

/** Why a send failed, as one sentence. */
export function failureLine(failure: MessageFailure): CopyLine {
  switch (failure.kind) {
    case 'closed':
      return { key: 'messages.failure.closed' };
    case 'guestsCannotWrite':
      return { key: 'messages.failure.guestsCannotWrite' };
    case 'forbidden':
    case 'waitersCannotWrite':
      return { key: 'messages.failure.forbidden' };
    case 'tooFast':
      if (failure.perConversation) return { key: 'messages.failure.tooFastThread' };
      return failure.retryAfterSeconds && failure.retryAfterSeconds > 0
        ? { key: 'messages.failure.tooFastWait', params: { seconds: failure.retryAfterSeconds } }
        : { key: 'messages.failure.tooFast' };
    case 'invalid':
      return { key: 'messages.failure.invalid' };
    case 'notFound':
      return { key: 'messages.failure.notFound' };
    case 'offline':
      return { key: 'messages.failure.offline' };
    default:
      return { key: 'messages.failure.generic' };
  }
}

/**
 * A refusal that means "this thread takes no more text": the composer goes
 * and the thread is read again, which then shows the closed note or the
 * guests-cannot-write one. The text stays in the draft either way.
 */
export function failureHidesComposer(failure: MessageFailure): boolean {
  return failure.kind === 'closed' || failure.kind === 'guestsCannotWrite';
}

/** The thread screen of a subject, with the text a push's Reply could not send. */
export type ThreadRoute =
  | {
      readonly pathname: '/messages/reservation/[id]';
      readonly params: { id: string; draft?: string };
    }
  | {
      readonly pathname: '/messages/takeaway/[id]';
      readonly params: { id: string; draft?: string };
    };

export function threadRoute(subject: ConversationSubjectRef, draft?: string | null): ThreadRoute {
  const params = draft ? { id: subject.id, draft } : { id: subject.id };
  return subject.kind === 'takeaway'
    ? { pathname: '/messages/takeaway/[id]', params }
    : { pathname: '/messages/reservation/[id]', params };
}

/**
 * The venue's initial for the thread's header: the first letter of its name,
 * as a person reads it (an Armenian letter is one, whatever its encoding).
 */
export function venueInitial(name: string): string {
  const first = Array.from(name.trim())[0];
  return first ? first.toLocaleUpperCase() : '·';
}

/**
 * What a booking card's message row says, from the booking's own summary and
 * — fresher, read every thirty seconds — the unread summary's row for it.
 *
 * - `unread`: venue messages not read — "New message · 18:31", the last line
 *   and the count.
 * - `last`: read, still open — the last line.
 * - `write`: open, nothing written yet — "Write to the venue · no messages".
 * - `closed`: closed with messages — "Messages · the conversation is closed".
 * - `null`: no thread and none can be opened — no row.
 */
export type MessageRow =
  | {
      readonly kind: 'unread';
      readonly unread: number;
      readonly atUtc: string | null;
      readonly line: MessageBody | null;
    }
  | { readonly kind: 'last'; readonly atUtc: string | null; readonly line: MessageBody | null }
  | { readonly kind: 'write' }
  | { readonly kind: 'closed' };

export function messageRow(
  summary: ConversationSummary | null | undefined,
  unread?: UnreadConversation | null,
): MessageRow | null {
  if (!summary && !unread) return null;
  const count = unread ? unread.unread : (summary?.unread ?? 0);
  // The fresher of the two: the unread summary is polled, the booking list is not.
  const fromUnread =
    unread?.lastAtUtc &&
    (!summary?.lastAtUtc || Date.parse(unread.lastAtUtc) >= Date.parse(summary.lastAtUtc));
  const last = fromUnread
    ? { lastKind: unread.lastKind, lastText: unread.lastText, lastAtUtc: unread.lastAtUtc }
    : {
        lastKind: summary?.lastKind ?? null,
        lastText: summary?.lastText ?? null,
        lastAtUtc: summary?.lastAtUtc ?? null,
      };
  if (count > 0) {
    return { kind: 'unread', unread: count, atUtc: last.lastAtUtc, line: lastMessageLine(last) };
  }
  const open = summary ? summary.open : true;
  if (!last.lastAtUtc) return open ? { kind: 'write' } : null;
  if (!open) return { kind: 'closed' };
  return { kind: 'last', atUtc: last.lastAtUtc, line: lastMessageLine(last) };
}

/** The unread row for a subject in the guest's unread summary, if any. */
export function unreadFor(
  items: readonly UnreadConversation[] | undefined,
  subject: ConversationSubjectRef,
): UnreadConversation | null {
  return (
    items?.find((item) => item.subjectKind === subject.kind && item.subjectId === subject.id) ??
    null
  );
}
