import type { FieldViolation } from '../errors';
import type { StaffRole } from './console';

/**
 * Guest messages (approved 2026-10-23, the "Time to Eat Նամակներ" design): a venue
 * and a guest exchange short text messages inside **one** booking or **one**
 * takeaway order. There is no general chat and no thread without a subject.
 *
 * The venue's "Ask: are you coming?" is a message in that thread, and the
 * guest's answer buttons (on my way, running late, not coming — by app or by
 * link) add an answer and a system line ("Booking updated · held until
 * 19:45"). The guest sees only the venue's name; staff see who wrote each
 * venue message. Plain text only, 1–500 characters after trim; links are never
 * linkified.
 *
 * Every shape here is the wire's (`docs/messages.md` in the backend), renamed
 * the way the rest of the client is: enums as camelCase words.
 * `http/messagesMapping.ts` reads the generated schema into these. The rules
 * the server applies are mirrored only where a screen or the mocks need them;
 * the server's answer always wins (`open`, `pendingAsk`, `canWrite`,
 * `unreadCount`).
 */

// ---------------------------------------------------------------------------
// The product's fixed numbers
// ---------------------------------------------------------------------------

/** A message is 1 to this many characters after trim (422 `validation-failed` on `text`). */
export const MESSAGE_MAX_LENGTH = 500;
/** A thread stays open this long after its booking ends or its subject finishes. */
export const CONVERSATION_OPEN_AFTER_HOURS = 2;
/** The guest can still read a closed thread this long after it closes; then 404. */
export const CONVERSATION_READABLE_DAYS = 30;
/** Guest messages: at most this many a minute… */
export const GUEST_MESSAGES_PER_MINUTE = 5;
/** …and this many in one thread (429 `messages-too-fast` past either). */
export const GUEST_MESSAGES_PER_CONVERSATION = 60;
/** The staff list keeps a closed thread this long after its last message. */
export const STAFF_LIST_RECENT_HOURS = 24;

/** The console's bounds on the branch settings. */
export const MESSAGE_SETTINGS_LIMITS = {
  /** At most this many ready replies… */
  maxTemplates: 8,
  /** …each 1 to this many characters after trim. */
  maxTemplateLength: 120,
  /** "Remind the tablet after N minutes": 1–15, 3 by default. */
  remindMinutesMin: 1,
  remindMinutesMax: 15,
} as const;

// ---------------------------------------------------------------------------
// The subject
// ---------------------------------------------------------------------------

/** What a thread is about: one booking or one takeaway order. */
export type ConversationSubjectKind = 'reservation' | 'takeaway';

/** Which thread: the subject's kind and its id (the booking's or the order's). */
export interface ConversationSubjectRef {
  readonly kind: ConversationSubjectKind;
  readonly id: string;
}

/**
 * How the subject ended, from its status (`subject.outcome` on the staff
 * thread and on a history row, never on the guest's view):
 *
 * - a booking: `came` (seated or completed), `noShow`, `cancelled`,
 *   `declined` (the venue's no, or nobody's answer in time), or `upcoming`
 *   (pending or confirmed);
 * - a takeaway order: `collected`, `noShow`, `declined`, `cancelled`, or
 *   `inProgress` (sent, accepted or ready).
 *
 * `unknown` for a word a newer server adds, and when the server says nothing.
 */
export type ConversationOutcome =
  | 'came'
  | 'noShow'
  | 'cancelled'
  | 'declined'
  | 'upcoming'
  | 'collected'
  | 'inProgress'
  | 'unknown';

/**
 * The subject as a thread's header shows it: "Today 19:30 · 4 guests · table
 * 6" for a booking, "T-485 · ready 19:25" for a takeaway order. The parts come
 * as fields, never as prose; the ones a kind does not have are `null`.
 */
export interface ConversationSubject extends ConversationSubjectRef {
  readonly venueName: string;
  readonly branchId: string;
  /** A booking's start (UTC). `null` on a takeaway order. */
  readonly startUtc: string | null;
  /** "2026-10-23" on the branch's calendar — a booking's day. */
  readonly localDate: string | null;
  /** "19:30" on the branch's clock — a booking's start. */
  readonly localTime: string | null;
  readonly partySize: number | null;
  /** "6". `null` on a takeaway order. */
  readonly tableLabel: string | null;
  /** "T-485". `null` on a booking. */
  readonly takeawayCode: string | null;
  /** "19:25" — when the order is promised; `null` until accepted, and on a booking. */
  readonly readyAtLocal: string | null;
  /** The same moment in UTC; `null` until accepted, and on a booking. */
  readonly readyAtUtc: string | null;
}

/** The subject on the floor's (and the console's) read of a thread: the guest's parts and the outcome. */
export interface StaffConversationThreadSubject extends ConversationSubject {
  readonly outcome: ConversationOutcome;
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

/** `Author`: 1 Guest, 2 Venue, 3 System. `unknown` for a value a newer server adds. */
export type MessageAuthor = 'guest' | 'venue' | 'system' | 'unknown';

/**
 * `Kind`: 1 Text, 2 AskComing (the venue's "are you coming?"), 3 Answer (the
 * guest's button), 4 Status (the system's "Booking updated · held until
 * 19:45"). Only `text` carries a free body; the others are rendered from
 * their structured fields in the reader's language.
 */
export type MessageKind = 'text' | 'askComing' | 'answer' | 'status' | 'unknown';

/** The guest's answer: 1 Coming, 2 Late (10/15/30), 3 NotComing (the booking was cancelled). */
export type MessageAnswerKind = 'coming' | 'late' | 'notComing' | 'unknown';

export interface MessageAnswer {
  readonly kind: MessageAnswerKind;
  /** 10, 15 or 30 on `late`; `null` otherwise. */
  readonly lateMinutes: number | null;
}

/** What the system line says changed. */
export interface MessageStatus {
  /** The answer the line follows: "Booking updated · coming". */
  readonly answer: MessageAnswerKind;
  /** "19:45" on the branch's clock: the table is held until then (a late answer). */
  readonly heldUntilLocal: string | null;
  /** The booking was cancelled (the "not coming" answer). */
  readonly cancelled: boolean;
}

/** One message in a thread. */
export interface ConversationMessage {
  readonly id: string;
  readonly author: MessageAuthor;
  readonly kind: MessageKind;
  /** The text of a `text` message; `null` for the structured kinds. Never linkified. */
  readonly text: string | null;
  /** On `answer`. */
  readonly answer: MessageAnswer | null;
  /** On `status`. */
  readonly status: MessageStatus | null;
  readonly createdAtUtc: string;
  /**
   * Who at the venue wrote it — the staff member's name when it was sent.
   * Staff views only: always `null` on the guest's, which shows the venue's name.
   */
  readonly staffName: string | null;
  /**
   * Client only: a message this device has sent and the server has not
   * answered yet (the optimistic append). Absent on everything the server sent.
   */
  readonly pending?: boolean | undefined;
  /**
   * Client only: the send's command id — on a pending message, and on the
   * server's message it settled into, which later reads of the same cache keep
   * (`carryClientCommandIds`).
   */
  readonly clientCommandId?: string | undefined;
}

/** The answer to a send: the message as stored, and whether this was a replay of the command. */
export interface SentMessage extends ConversationMessage {
  /** The thread it went into — made by this send when the subject had none yet. */
  readonly conversationId: string | null;
  /** The same `clientCommandId` again: the first send's message, nothing new written. */
  readonly wasReplay: boolean;
}

// ---------------------------------------------------------------------------
// Threads
// ---------------------------------------------------------------------------

/**
 * One thread as the guest reads it —
 * `GET /api/diner/reservations/{id}/conversation` or
 * `/api/diner/takeaway-orders/{id}/conversation`, `DinerConversationView`.
 *
 * A subject with no thread yet answers `conversationId: null` and no messages.
 */
export interface DinerConversation {
  readonly conversationId: string | null;
  readonly subject: ConversationSubject;
  /** Writing is allowed: the booking is live or ended less than two hours ago. */
  readonly open: boolean;
  /** When it closes (or closed); `null` while the subject is still moving (an active takeaway order). */
  readonly closesAtUtc: string | null;
  /** The venue lets guests write. False: the answer buttons still work — "reply with the buttons or call". */
  readonly guestsCanWrite: boolean;
  /** The venue's number, for the header's call button; `null` when it has none on file. */
  readonly venuePhone: string | null;
  /**
   * The venue asked "are you coming?", the guest has not answered, and the
   * answer is still accepted: show the answer bar.
   */
  readonly pendingAsk: boolean;
  /** When somebody at the venue last read the thread: "seen" under the guest's messages up to it. */
  readonly venueLastReadUtc: string | null;
  /** Venue messages the guest has not read. */
  readonly unreadCount: number;
  /** Oldest first. */
  readonly messages: readonly ConversationMessage[];
}

/**
 * One thread as the floor reads it — `GET /api/reservations/{id}/conversation`
 * or `/api/takeaway-orders/{id}/conversation`: the guest's view plus who wrote
 * each venue message, the guest's name, when the guest last read, and whether
 * the caller may write.
 */
export interface StaffConversation extends DinerConversation {
  /** The guest's subject, plus what became of it — the staff view's own `subject.outcome`. */
  readonly subject: StaffConversationThreadSubject;
  /** On the floor's view: guest messages nobody at the venue has read. */
  readonly unreadCount: number;
  /** "Անի Մ." — a name, never a number. */
  readonly guestName: string;
  /**
   * The guest's number, for the Call button only — never printed in the
   * thread. Empty for a platform admin, as on the takeaway counter.
   */
  readonly guestPhone: string;
  /** When the guest last read the thread: "seen" under the venue's messages. */
  readonly guestLastReadUtc: string | null;
  /**
   * The caller may write now: open, and their role allows it (managers, the GM
   * and the owner always; waiters while `waitersCanWrite`; kitchen and a
   * platform admin never).
   */
  readonly canWrite: boolean;
}

/** "Send" — `POST …/conversation/messages`, the guest's or the floor's. */
export interface SendMessageCommand {
  readonly subject: ConversationSubjectRef;
  /** 1–{@link MESSAGE_MAX_LENGTH} after trim. */
  readonly text: string;
  /** One per send attempt, reused on a retry: a replay answers the first send's message. */
  readonly clientCommandId: string;
}

/**
 * "Read" — `POST …/conversation/read`, the guest's or the floor's: the subject,
 * and `upToUtc`, the `createdAtUtc` of the newest message the screen has
 * shown (see {@link newestShownMessageUtc}). The server moves the read mark to
 * `min(now, upToUtc)` and never back, so a message that arrived between the
 * last poll and this call stays unread. Absent or `null`: now.
 */
export interface MarkConversationReadCommand extends ConversationSubjectRef {
  readonly upToUtc?: string | null | undefined;
}

/**
 * The `createdAtUtc` of the newest message the server sent that a thread
 * shows — the read mark's `upToUtc`. A pending (optimistic) message is never
 * it: its time is this device's clock, not the server's. `null` with none.
 */
export function newestShownMessageUtc(
  messages: readonly Pick<ConversationMessage, 'createdAtUtc' | 'pending'>[],
): string | null {
  let newest: string | null = null;
  let newestMs = Number.NEGATIVE_INFINITY;
  for (const message of messages) {
    if (message.pending) continue;
    const ms = Date.parse(message.createdAtUtc);
    if (Number.isNaN(ms) || ms < newestMs) continue;
    newest = message.createdAtUtc;
    newestMs = ms;
  }
  return newest;
}

/**
 * How many of `author`'s messages a read up to `upToUtc` leaves unread — the
 * ones after the mark — never more than the server's own count. With no
 * `upToUtc` (a read up to now) nothing is left.
 */
export function unreadAfterMark(
  messages: readonly Pick<ConversationMessage, 'author' | 'createdAtUtc' | 'pending'>[],
  author: MessageAuthor,
  upToUtc: string | null | undefined,
  serverUnread: number,
): number {
  if (!upToUtc) return 0;
  const mark = Date.parse(upToUtc);
  if (Number.isNaN(mark)) return 0;
  const after = messages.filter(
    (message) =>
      !message.pending && message.author === author && Date.parse(message.createdAtUtc) > mark,
  ).length;
  return Math.min(Math.max(0, serverUnread), after);
}

// ---------------------------------------------------------------------------
// Summaries
// ---------------------------------------------------------------------------

/**
 * A thread's line on the guest's booking card, booking screen and Orders-tab
 * takeaway card — `messages` on each. Absent or `null` when the subject has no
 * thread and none can be opened.
 */
export interface ConversationSummary {
  /** Venue messages the guest has not read: "1 new". */
  readonly unread: number;
  readonly lastAuthor: MessageAuthor | null;
  readonly lastKind: MessageKind | null;
  /** The last message's text, for a `text`; `null` otherwise (render from the kind). */
  readonly lastText: string | null;
  readonly lastAtUtc: string | null;
  /** Writing is allowed now; false: "3 messages · the conversation is closed". */
  readonly open: boolean;
}

/** One row of the guest's unread summary. */
export interface UnreadConversation {
  readonly conversationId: string;
  readonly subjectKind: ConversationSubjectKind;
  readonly subjectId: string;
  readonly venueName: string;
  readonly unread: number;
  readonly lastText: string | null;
  readonly lastKind: MessageKind | null;
  readonly lastAuthor: MessageAuthor | null;
  readonly lastAtUtc: string | null;
  /** Writing is allowed now. A closed thread is listed only while it has unread messages. */
  readonly open: boolean;
}

/**
 * The guest's threads that are open or have unread messages —
 * `GET /api/diner/messages/unread`: the bottom nav's dot (`total > 0`) and
 * the Bookings cards' rows.
 */
export interface DinerUnreadMessages {
  readonly total: number;
  readonly items: readonly UnreadConversation[];
}

// ---------------------------------------------------------------------------
// The floor's inbox
// ---------------------------------------------------------------------------

/** The subject as the inbox row shows it. */
export interface StaffConversationSubject extends ConversationSubjectRef {
  /** The table's label ("6") for a booking, the code ("T-485") for a takeaway order. */
  readonly label: string;
  readonly guestName: string;
  /** "19:30": the booking's start, or the order's ready (else requested) time. */
  readonly localTime: string | null;
  /** A booking's day on the branch's calendar; `null` on an order. */
  readonly localDate: string | null;
  /** A booking's party; `null` on an order. */
  readonly partySize: number | null;
  /** An order's item count; `null` on a booking. */
  readonly itemCount: number | null;
  /** An order's total in dram; `null` on a booking. */
  readonly totalAmd: number | null;
}

/** The last message that is not a system line, as the row shows it. */
export interface StaffConversationLastMessage {
  readonly author: MessageAuthor;
  readonly kind: MessageKind;
  readonly text: string | null;
  readonly createdAtUtc: string;
  /** Who wrote a venue message. */
  readonly staffName: string | null;
  /** On an `answer`, when the server says it; `null` otherwise. */
  readonly answer: MessageAnswer | null;
}

/** One row of the floor's inbox. */
export interface StaffConversationListItem {
  readonly conversationId: string;
  readonly subject: StaffConversationSubject;
  readonly lastMessage: StaffConversationLastMessage | null;
  /**
   * The newest system line: what the guest's answer did to the booking
   * ("held until 19:45", cancelled). `null` when there is none.
   */
  readonly latestStatus: MessageStatus | null;
  /** Guest messages nobody at the venue has read — typed ones and answers. */
  readonly unreadFromGuest: number;
  /** The last message is the venue's ask, and the guest has not answered. */
  readonly awaitingGuestAnswer: boolean;
  /**
   * The oldest typed guest message after the venue's last one (a text or an
   * ask), in a thread still open: the clock the reminder runs on, and what
   * puts the row first and under "Unanswered". A guest's answer to "are you
   * coming?" asks nothing back and never sets it — it is only unread.
   */
  readonly oldestUnansweredGuestMessageUtc: string | null;
  readonly open: boolean;
}

/**
 * The branch's threads — `GET /api/branches/{branchId}/conversations`, waiter
 * or above: open ones and ones with a message in the last 24 hours,
 * unanswered first, then newest.
 */
export interface BranchConversations {
  readonly items: readonly StaffConversationListItem[];
  /** The Messages tab's badge. */
  readonly unreadTotal: number;
  /** The branch setting: remind after this many minutes unanswered. */
  readonly remindAfterMinutes: number;
  /** The branch's ready replies; `null`: the app's localized default four. */
  readonly templates: readonly string[] | null;
  /** Waiters may write. False: a waiter's composer is hidden. */
  readonly waitersCanWrite: boolean;
  /** When the server read it. */
  readonly asOfUtc: string | null;
}

/** The floor state's message line: the rail's section and the header's badge, without a second call. */
export interface FloorMessages {
  /** Guest messages nobody at the venue has read — typed ones and answers. */
  readonly unreadTotal: number;
  /** The oldest typed guest message waiting for an answer in an open thread; answers never wait. */
  readonly oldestUnansweredUtc: string | null;
}

// ---------------------------------------------------------------------------
// The console's settings
// ---------------------------------------------------------------------------

/** `PUT /api/branches/{branchId}/message-settings` — all four, every time. */
export interface MessageSettingsInput {
  /** Guests may write text. False: they read and answer with the buttons only. */
  readonly guestsCanWrite: boolean;
  /** Waiters may write from the tablet. Managers, the GM and the owner always may. */
  readonly waitersCanWrite: boolean;
  /** At most 8, each 1–120 after trim; `null` for the app's localized default four. */
  readonly templates: readonly string[] | null;
  /** 1–15. */
  readonly remindAfterMinutes: number;
}

/** `GET /api/branches/{branchId}/message-settings`, and the PUT's answer. */
export type MessageSettings = MessageSettingsInput;

export const DEFAULT_MESSAGE_SETTINGS: MessageSettings = {
  guestsCanWrite: true,
  waitersCanWrite: true,
  templates: null,
  remindAfterMinutes: 3,
};

/**
 * Every bad field in the server's names (`templates`, `templates[2]`,
 * `remindAfterMinutes`), so the card marks the same fields before saving as
 * after a 422. Empty when the settings may be saved.
 */
export function messageSettingsViolations(input: MessageSettingsInput): readonly FieldViolation[] {
  const violations: FieldViolation[] = [];
  const limits = MESSAGE_SETTINGS_LIMITS;
  const remind = input.remindAfterMinutes;
  if (
    !Number.isInteger(remind) ||
    remind < limits.remindMinutesMin ||
    remind > limits.remindMinutesMax
  ) {
    violations.push({
      field: 'remindAfterMinutes',
      message: `remindAfterMinutes must be between ${limits.remindMinutesMin} and ${limits.remindMinutesMax}.`,
      bound: 'range',
      min: limits.remindMinutesMin,
      max: limits.remindMinutesMax,
    });
  }
  if (input.templates !== null) {
    if (input.templates.length > limits.maxTemplates) {
      violations.push({
        field: 'templates',
        message: `At most ${limits.maxTemplates} templates.`,
        bound: 'max',
        max: limits.maxTemplates,
      });
    }
    input.templates.forEach((template, index) => {
      const length = template.trim().length;
      if (length < 1 || length > limits.maxTemplateLength) {
        violations.push({
          field: `templates[${index}]`,
          message: `Between 1 and ${limits.maxTemplateLength} characters.`,
          bound: 'range',
          min: 1,
          max: limits.maxTemplateLength,
        });
      }
    });
  }
  return violations;
}

/** The templates as the server keeps them: trimmed. `null` stays `null`. */
export function normalizeMessageTemplates(
  templates: readonly string[] | null,
): readonly string[] | null {
  return templates === null ? null : templates.map((template) => template.trim());
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

/**
 * The feed entry for a venue message — a text or the venue's "are you
 * coming?": `reservationId` or `orderId` set (the takeaway order's id), params
 * `venueName`, `branchName`, `conversationId`, `subjectKind` (`reservation` /
 * `takeaway`), `ask` ("true" for the ask), `text` (≤140, an ellipsis; absent
 * for the ask), and the booking's `date` / `time` or the order's `code`.
 *
 * Since 2026-10-23 the venue's ask sends this entry (and the `venue-ask`
 * push) only — no `booking-on-your-way` row with `askedByVenue` beside it.
 */
export const VENUE_MESSAGE_FEED_KIND = 'venue-message';
/** The push's `data.kind`: the same word. */
export const VENUE_MESSAGE_PUSH_KIND = VENUE_MESSAGE_FEED_KIND;
/** The push category of the venue's ask: actions "I'm coming", "Late 15 min", "Reply" (text). */
export const VENUE_ASK_PUSH_CATEGORY = 'venue-ask';
/**
 * The venue's ask while the venue has `guestsCanWrite` off: the two answers
 * ("I'm coming", "Late 15 min") and no Reply.
 */
export const VENUE_ASK_BUTTONS_PUSH_CATEGORY = 'venue-ask-buttons';
/** The push category of any other venue message: "Reply" (text). */
export const VENUE_MESSAGE_PUSH_CATEGORY = 'venue-message';
/**
 * Any other venue message while the venue has `guestsCanWrite` off: no
 * actions at all — a tap opens the thread.
 */
export const VENUE_MESSAGE_READONLY_PUSH_CATEGORY = 'venue-message-readonly';
/** Every category a venue-message push may carry; the app registers all four. */
export const VENUE_MESSAGE_PUSH_CATEGORIES = [
  VENUE_ASK_PUSH_CATEGORY,
  VENUE_ASK_BUTTONS_PUSH_CATEGORY,
  VENUE_MESSAGE_PUSH_CATEGORY,
  VENUE_MESSAGE_READONLY_PUSH_CATEGORY,
] as const;

/** Whether a feed entry or a push is a venue message: a tap opens the thread. */
export function isVenueMessageNotificationKind(kind: string | null | undefined): boolean {
  return kind === VENUE_MESSAGE_FEED_KIND;
}

/**
 * The thread a venue-message push is about, from its `data` (`conversationId`,
 * `reservationId` or `takeawayOrderId`, `ask`), or `null` when it is no such
 * push.
 */
export function venueMessagePushTarget(
  data: Readonly<Record<string, unknown>> | null | undefined,
): {
  readonly subject: ConversationSubjectRef;
  readonly conversationId: string | null;
  readonly ask: boolean;
} | null {
  if (!data || data['kind'] !== VENUE_MESSAGE_PUSH_KIND) return null;
  const said = (key: string) => {
    const value = data[key];
    return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
  };
  const reservationId = said('reservationId');
  const takeawayOrderId = said('takeawayOrderId') ?? said('orderId');
  const subject: ConversationSubjectRef | null = reservationId
    ? { kind: 'reservation', id: reservationId }
    : takeawayOrderId
      ? { kind: 'takeaway', id: takeawayOrderId }
      : null;
  if (!subject) return null;
  return {
    subject,
    conversationId: said('conversationId'),
    ask: data['ask'] === 'true' || data['ask'] === true,
  };
}

/**
 * The thread a `venue-message` feed entry is about, from its ids (and its
 * `subjectKind` param, when both ids are somehow set); `null` for any other
 * entry.
 */
export function venueMessageFeedSubject(notification: {
  readonly kind: string;
  readonly reservationId: string | null;
  readonly orderId: string | null;
  readonly params?: Readonly<Record<string, unknown>> | undefined;
}): ConversationSubjectRef | null {
  if (!isVenueMessageNotificationKind(notification.kind)) return null;
  const takeawayFirst = notification.params?.['subjectKind'] === 'takeaway';
  if (takeawayFirst && notification.orderId) return { kind: 'takeaway', id: notification.orderId };
  if (notification.reservationId) return { kind: 'reservation', id: notification.reservationId };
  if (notification.orderId) return { kind: 'takeaway', id: notification.orderId };
  return null;
}

// ---------------------------------------------------------------------------
// The rules, as the screens and the mocks read them
// ---------------------------------------------------------------------------

/** Trimmed: what the server keeps of a message. */
export function messageText(value: string | null | undefined): string {
  return (value ?? '').trim();
}

/**
 * The bound the server checks on a message, in its field name (`text`): empty
 * when it may be sent. The composer disables Send on a violation.
 */
export function messageViolations(text: string | null | undefined): readonly FieldViolation[] {
  const length = messageText(text).length;
  if (length >= 1 && length <= MESSAGE_MAX_LENGTH) return [];
  return [
    {
      field: 'text',
      message: `Between 1 and ${MESSAGE_MAX_LENGTH} characters.`,
      bound: 'range',
      min: 1,
      max: MESSAGE_MAX_LENGTH,
    },
  ];
}

/** Two subject references name the same thread. */
export function sameSubject(
  a: ConversationSubjectRef | null | undefined,
  b: ConversationSubjectRef | null | undefined,
): boolean {
  return Boolean(a && b && a.kind === b.kind && a.id === b.id);
}

function shift(instant: string, minutes: number): string {
  return new Date(Date.parse(instant) + minutes * 60_000).toISOString();
}

/**
 * When a thread closes, by the server's rule:
 *
 * - a booking still pending, confirmed or seated: two hours after it ends;
 * - a booking cancelled, declined, a no-show or completed: two hours after
 *   that happened (`endedAtUtc`), and never later than two hours after its end;
 * - a takeaway order: `null` while it is moving, then two hours after it
 *   reached a terminal state.
 */
export function conversationClosesAtUtc(subject: {
  readonly kind: ConversationSubjectKind;
  /** Pending, confirmed or seated; sent, accepted or ready. */
  readonly active: boolean;
  /** A booking's end. */
  readonly endUtc?: string | null | undefined;
  /** When it was cancelled, declined, marked a no-show, completed or collected. */
  readonly endedAtUtc?: string | null | undefined;
}): string | null {
  const hours = CONVERSATION_OPEN_AFTER_HOURS * 60;
  if (subject.kind === 'takeaway') {
    if (subject.active) return null;
    return subject.endedAtUtc ? shift(subject.endedAtUtc, hours) : null;
  }
  const afterEnd = subject.endUtc ? shift(subject.endUtc, hours) : null;
  if (subject.active) return afterEnd;
  const afterEnded = subject.endedAtUtc ? shift(subject.endedAtUtc, hours) : null;
  if (afterEnd && afterEnded) {
    return Date.parse(afterEnded) < Date.parse(afterEnd) ? afterEnded : afterEnd;
  }
  return afterEnded ?? afterEnd;
}

/** Writing is allowed at `now`, given {@link conversationClosesAtUtc}'s answer. */
export function isConversationOpen(closesAtUtc: string | null, now: Date): boolean {
  return closesAtUtc === null || now.getTime() < Date.parse(closesAtUtc);
}

/** The guest may still read it: closed less than thirty days ago. */
export function isConversationReadable(closesAtUtc: string | null, now: Date): boolean {
  return (
    closesAtUtc === null ||
    now.getTime() < Date.parse(closesAtUtc) + CONVERSATION_READABLE_DAYS * 24 * 3_600_000
  );
}

/**
 * The guest's message has been seen by the venue: "seen" under it. Read off
 * the thread's `venueLastReadUtc`; a pending message is never seen.
 */
export function seenByVenue(
  message: Pick<ConversationMessage, 'author' | 'createdAtUtc' | 'pending'>,
  venueLastReadUtc: string | null,
): boolean {
  if (message.pending || message.author !== 'guest' || !venueLastReadUtc) return false;
  return Date.parse(message.createdAtUtc) <= Date.parse(venueLastReadUtc);
}

/** The venue's message has been seen by the guest (staff views). */
export function seenByGuest(
  message: Pick<ConversationMessage, 'author' | 'createdAtUtc' | 'pending'>,
  guestLastReadUtc: string | null,
): boolean {
  if (message.pending || message.author !== 'venue' || !guestLastReadUtc) return false;
  return Date.parse(message.createdAtUtc) <= Date.parse(guestLastReadUtc);
}

/**
 * The guest's answer bar ("I'm coming / Late / Not coming") as the thread's own
 * messages read it: the last ask has no answer after it. The server's
 * `pendingAsk` is what the screen shows; this is for the mocks and for a
 * thread just appended to.
 */
export function hasUnansweredAsk(messages: readonly Pick<ConversationMessage, 'kind'>[]): boolean {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const kind = messages[index]!.kind;
    if (kind === 'answer') return false;
    if (kind === 'askComing') return true;
  }
  return false;
}

/**
 * The floor's reminder: a thread whose oldest unanswered typed guest message
 * has waited `remindAfterMinutes` or more. The tablet chimes and lifts these;
 * an answer to "are you coming?" never rings.
 */
export function needsReminder(
  item: Pick<StaffConversationListItem, 'oldestUnansweredGuestMessageUtc'>,
  remindAfterMinutes: number,
  now: Date,
): boolean {
  const since = item.oldestUnansweredGuestMessageUtc;
  if (!since) return false;
  return now.getTime() - Date.parse(since) >= remindAfterMinutes * 60_000;
}

/** The inbox's three filters. */
export type ConversationFilter = 'all' | 'unanswered' | 'takeaway';

/** The rows a filter keeps, in the server's order. */
export function filterConversations(
  items: readonly StaffConversationListItem[],
  filter: ConversationFilter,
): readonly StaffConversationListItem[] {
  if (filter === 'unanswered') {
    return items.filter((item) => item.oldestUnansweredGuestMessageUtc !== null);
  }
  if (filter === 'takeaway') return items.filter((item) => item.subject.kind === 'takeaway');
  return items;
}

/**
 * The server's list order: unanswered first (oldest waiting first), then the
 * newest last message. For the mocks and for a list the tablet just appended to.
 */
export function compareConversationItems(
  a: StaffConversationListItem,
  b: StaffConversationListItem,
): number {
  const waitingA = a.oldestUnansweredGuestMessageUtc;
  const waitingB = b.oldestUnansweredGuestMessageUtc;
  if (waitingA && !waitingB) return -1;
  if (!waitingA && waitingB) return 1;
  if (waitingA && waitingB && waitingA !== waitingB) {
    return Date.parse(waitingA) - Date.parse(waitingB);
  }
  const lastA = a.lastMessage ? Date.parse(a.lastMessage.createdAtUtc) : 0;
  const lastB = b.lastMessage ? Date.parse(b.lastMessage.createdAtUtc) : 0;
  return lastB - lastA;
}

/** Who is writing from the venue's side: a staff role, or a platform admin (who only reads). */
export type MessageWriterRole = StaffRole | 'platformAdmin';

/**
 * Whether a role may write to guests at a branch, by the server's rule:
 * managers, the general manager and the owner always; waiters while the
 * branch lets them; kitchen and a platform admin never. The server's
 * `canWrite` on the thread is what the screen shows; this is for the mocks.
 */
export function staffMayWrite(
  role: MessageWriterRole,
  settings: Pick<MessageSettingsInput, 'waitersCanWrite'>,
): boolean {
  if (role === 'owner' || role === 'generalManager' || role === 'manager') return true;
  if (role === 'waiter') return settings.waitersCanWrite;
  return false;
}
