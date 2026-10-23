import {
  CONVERSATION_CLOSED_CODE,
  ConversationClosedError,
  GUESTS_CANNOT_WRITE_CODE,
  GuestsCannotWriteError,
  MESSAGES_TOO_FAST_CODE,
  MessagesTooFastError,
  WAITERS_CANNOT_WRITE_CODE,
  WaitersCannotWriteError,
} from '../contracts/errors';
import {
  DEFAULT_MESSAGE_SETTINGS,
  messageText,
  normalizeMessageTemplates,
  type BranchConversations,
  type ConversationMessage,
  type ConversationSubject,
  type ConversationSubjectKind,
  type ConversationSubjectRef,
  type ConversationSummary,
  type DinerConversation,
  type DinerUnreadMessages,
  type FloorMessages,
  type MessageAnswer,
  type MessageAnswerKind,
  type MessageAuthor,
  type MessageKind,
  type MessageSettings,
  type MessageSettingsInput,
  type MessageStatus,
  type SentMessage,
  type StaffConversation,
  type StaffConversationLastMessage,
  type StaffConversationListItem,
} from '../contracts/messages';
import { ApiError, TooManyRequestsError } from '../errors';

/**
 * The guest-messages wire (`docs/messages.md`, 2026-10-23), read once for
 * every surface: the guest's thread, unread summary and booking/order rows,
 * the floor's inbox, thread and floor badges, the console's settings, and the
 * four refusals.
 *
 * ## Hand-written, on purpose, for now
 *
 * The backend was built in parallel to the same spec, so `generated/schema.ts`
 * does not have these shapes yet. The `Wire…` interfaces below are the spec's
 * JSON, every field optional and read tolerantly — an enum as its word
 * ("ask-coming") **or** its number (2), a missing list as empty. When the
 * schema is regenerated, each becomes `Schemas['Yalla.Application.Messages.…']`
 * here and nothing outside this file changes; any drift shows up as a compile
 * error in the mappers.
 *
 * Like `takeawayMapping.ts`, this file imports no mapper, so every mapper can
 * import it.
 */

// ---------------------------------------------------------------------------
// The wire (hand-written to the build spec)
// ---------------------------------------------------------------------------

type WireEnum = string | number | null | undefined;

/** `ConversationSubjectView` on a thread. */
export interface WireConversationSubject {
  readonly kind?: WireEnum;
  readonly id?: string | null;
  readonly venueName?: string | null;
  readonly branchId?: string | null;
  readonly startUtc?: string | null;
  readonly localDate?: string | null;
  readonly localTime?: string | null;
  readonly partySize?: number | null;
  readonly tableLabel?: string | null;
  readonly takeawayCode?: string | null;
  readonly readyAtLocal?: string | null;
}

/** `ConversationMessageView`. `staffName` on the staff views only. */
export interface WireConversationMessage {
  readonly id?: string | null;
  readonly author?: WireEnum;
  readonly kind?: WireEnum;
  readonly text?: string | null;
  readonly answer?: { readonly kind?: WireEnum; readonly lateMinutes?: number | null } | null;
  readonly status?: {
    readonly heldUntilLocal?: string | null;
    readonly cancelled?: boolean | null;
  } | null;
  readonly createdAtUtc?: string | null;
  readonly staffName?: string | null;
  /** On a send's answer. */
  readonly wasReplay?: boolean | null;
}

/** `DinerConversationView`; the staff view adds the last four. */
export interface WireConversation {
  readonly conversationId?: string | null;
  readonly subject?: WireConversationSubject | null;
  readonly open?: boolean | null;
  readonly closesAtUtc?: string | null;
  readonly guestsCanWrite?: boolean | null;
  readonly venuePhone?: string | null;
  readonly pendingAsk?: boolean | null;
  readonly venueLastReadUtc?: string | null;
  readonly unreadCount?: number | null;
  readonly messages?: readonly WireConversationMessage[] | null;
  readonly guestName?: string | null;
  readonly guestLastReadUtc?: string | null;
  readonly canWrite?: boolean | null;
}

/** `messages` on a diner booking, booking detail and Orders-tab takeaway item. */
export interface WireConversationSummary {
  readonly unread?: number | null;
  readonly lastAuthor?: WireEnum;
  readonly lastKind?: WireEnum;
  readonly lastText?: string | null;
  readonly lastAtUtc?: string | null;
  readonly open?: boolean | null;
}

/** The fields a booking or an order read carries for it. */
export interface WireMessagesSummaryField {
  readonly messages?: WireConversationSummary | null;
}

/** `GET /api/diner/messages/unread`. */
export interface WireUnreadMessages {
  readonly total?: number | null;
  readonly items?:
    | readonly {
        readonly conversationId?: string | null;
        readonly subjectKind?: WireEnum;
        readonly subjectId?: string | null;
        readonly venueName?: string | null;
        readonly unread?: number | null;
        readonly lastText?: string | null;
        readonly lastKind?: WireEnum;
        readonly lastAtUtc?: string | null;
      }[]
    | null;
}

/** One inbox row. */
export interface WireConversationListItem {
  readonly conversationId?: string | null;
  readonly subject?: {
    readonly kind?: WireEnum;
    readonly id?: string | null;
    readonly label?: string | null;
    readonly guestName?: string | null;
    readonly localTime?: string | null;
  } | null;
  readonly lastMessage?: WireConversationMessage | null;
  readonly unreadFromGuest?: number | null;
  readonly awaitingGuestAnswer?: boolean | null;
  readonly oldestUnansweredGuestMessageUtc?: string | null;
  readonly open?: boolean | null;
}

/** `GET /api/branches/{branchId}/conversations`. */
export interface WireBranchConversations {
  readonly items?: readonly WireConversationListItem[] | null;
  readonly unreadTotal?: number | null;
  readonly remindAfterMinutes?: number | null;
  readonly templates?: readonly string[] | null;
  readonly waitersCanWrite?: boolean | null;
}

/** `messages` on `BranchFloorState`. */
export interface WireFloorMessages {
  readonly unreadTotal?: number | null;
  readonly oldestUnansweredUtc?: string | null;
}

/** What `BranchFloorState` and each `TableFloorState` gain. */
export interface WireFloorStateMessages {
  readonly messages?: WireFloorMessages | null;
}
export interface WireFloorTableMessages {
  /** The next booking's unread guest messages. */
  readonly nextReservationUnreadMessages?: number | null;
  /** The spec's shorter name, read when the longer one is absent. */
  readonly unreadMessages?: number | null;
}

/** `MessageSettingsView` and the PUT's body. */
export interface WireMessageSettings {
  readonly guestsCanWrite?: boolean | null;
  readonly waitersCanWrite?: boolean | null;
  readonly templates?: readonly string[] | null;
  readonly remindAfterMinutes?: number | null;
}

/** The send's body. */
export interface WireSendMessageRequest {
  readonly text: string;
  readonly clientCommandId: string;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/** The guest's segment for a subject: `reservations` or `takeaway-orders`. */
export function subjectSegment(kind: ConversationSubjectKind): string {
  return kind === 'takeaway' ? 'takeaway-orders' : 'reservations';
}

// ---------------------------------------------------------------------------
// Reading it
// ---------------------------------------------------------------------------

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** "19:30:00" as the server may write a branch wall clock, said as "19:30". */
function wallClock(value: unknown): string | null {
  const said = text(value);
  if (said === null) return null;
  return /^\d{2}:\d{2}/u.test(said) ? said.slice(0, 5) : said;
}

/** "ask-coming", "askComing", "AskComing" and "ask_coming" all read as `askcoming`. */
function word(value: unknown): string | null {
  return typeof value === 'string' ? value.replace(/[-_\s]/gu, '').toLowerCase() : null;
}

const AUTHORS: Readonly<Record<string, MessageAuthor>> = {
  '1': 'guest',
  '2': 'venue',
  '3': 'system',
  guest: 'guest',
  venue: 'venue',
  system: 'system',
};

const KINDS: Readonly<Record<string, MessageKind>> = {
  '1': 'text',
  '2': 'askComing',
  '3': 'answer',
  '4': 'status',
  text: 'text',
  askcoming: 'askComing',
  answer: 'answer',
  status: 'status',
};

const ANSWERS: Readonly<Record<string, MessageAnswerKind>> = {
  '1': 'coming',
  '2': 'late',
  '3': 'notComing',
  coming: 'coming',
  late: 'late',
  notcoming: 'notComing',
};

function enumOf<T extends string>(
  table: Readonly<Record<string, T>>,
  value: unknown,
  unknownValue: T,
): T {
  if (typeof value === 'number') return table[String(value)] ?? unknownValue;
  const said = word(value);
  return said === null ? unknownValue : (table[said] ?? unknownValue);
}

export function messageAuthor(value: unknown): MessageAuthor {
  return enumOf(AUTHORS, value, 'unknown');
}

export function messageKind(value: unknown): MessageKind {
  return enumOf(KINDS, value, 'unknown');
}

/** `null` when the wire said nothing — a summary of a thread with no messages. */
function authorOrNull(value: unknown): MessageAuthor | null {
  return value === null || value === undefined ? null : messageAuthor(value);
}

function kindOrNull(value: unknown): MessageKind | null {
  return value === null || value === undefined ? null : messageKind(value);
}

export function subjectKind(value: unknown): ConversationSubjectKind {
  const said = typeof value === 'number' ? String(value) : word(value);
  // "takeaway", "takeaway-order", 2: the order; anything else is a booking.
  return said === '2' || said === 'takeaway' || said === 'takeawayorder'
    ? 'takeaway'
    : 'reservation';
}

function answerFromWire(wire: WireConversationMessage['answer']): MessageAnswer | null {
  if (!wire) return null;
  return {
    kind: enumOf(ANSWERS, wire.kind, 'unknown'),
    lateMinutes: finite(wire.lateMinutes),
  };
}

function statusFromWire(wire: WireConversationMessage['status']): MessageStatus | null {
  if (!wire) return null;
  return {
    heldUntilLocal: wallClock(wire.heldUntilLocal),
    cancelled: wire.cancelled === true,
  };
}

export function conversationMessageFromWire(wire: WireConversationMessage): ConversationMessage {
  return {
    id: wire.id ?? '',
    author: messageAuthor(wire.author),
    kind: messageKind(wire.kind),
    // Only a text message has a body; kept as written, never linkified.
    text: typeof wire.text === 'string' && wire.text.trim() !== '' ? wire.text : null,
    answer: answerFromWire(wire.answer),
    status: statusFromWire(wire.status),
    createdAtUtc: wire.createdAtUtc ?? '',
    staffName: text(wire.staffName),
  };
}

export function sentMessageFromWire(wire: WireConversationMessage): SentMessage {
  return { ...conversationMessageFromWire(wire), wasReplay: wire.wasReplay === true };
}

function subjectFromWire(
  wire: WireConversationSubject | null | undefined,
  fallback: ConversationSubjectRef,
): ConversationSubject {
  return {
    kind: wire?.kind !== undefined && wire.kind !== null ? subjectKind(wire.kind) : fallback.kind,
    id: wire?.id ?? fallback.id,
    venueName: wire?.venueName ?? '',
    branchId: wire?.branchId ?? '',
    startUtc: text(wire?.startUtc),
    localDate: text(wire?.localDate),
    localTime: wallClock(wire?.localTime),
    partySize: finite(wire?.partySize),
    tableLabel: text(wire?.tableLabel),
    takeawayCode: text(wire?.takeawayCode),
    readyAtLocal: wallClock(wire?.readyAtLocal),
  };
}

/**
 * The guest's thread. `fallback` is the subject asked for, so a thin answer
 * still names it.
 */
export function dinerConversationFromWire(
  wire: WireConversation,
  fallback: ConversationSubjectRef,
): DinerConversation {
  return {
    conversationId: text(wire.conversationId),
    subject: subjectFromWire(wire.subject, fallback),
    open: wire.open === true,
    closesAtUtc: text(wire.closesAtUtc),
    // The server's default is "may write": only an explicit false hides the composer.
    guestsCanWrite: wire.guestsCanWrite !== false,
    venuePhone: text(wire.venuePhone),
    pendingAsk: wire.pendingAsk === true,
    venueLastReadUtc: text(wire.venueLastReadUtc),
    unreadCount: count(wire.unreadCount),
    messages: (wire.messages ?? []).map((message) => ({
      ...conversationMessageFromWire(message),
      // No staff names reach the guest, whatever a server sends.
      staffName: null,
    })),
  };
}

export function staffConversationFromWire(
  wire: WireConversation,
  fallback: ConversationSubjectRef,
): StaffConversation {
  const base = dinerConversationFromWire(wire, fallback);
  return {
    ...base,
    messages: (wire.messages ?? []).map(conversationMessageFromWire),
    guestName: wire.guestName ?? '',
    guestLastReadUtc: text(wire.guestLastReadUtc),
    // Never assumed: a server that does not say lets nobody write.
    canWrite: wire.canWrite === true,
  };
}

/** Absent — no thread, or a server from before messages — is `null`. */
export function conversationSummaryFromWire(
  wire: WireConversationSummary | null | undefined,
): ConversationSummary | null {
  if (!wire) return null;
  return {
    unread: count(wire.unread),
    lastAuthor: authorOrNull(wire.lastAuthor),
    lastKind: kindOrNull(wire.lastKind),
    lastText:
      typeof wire.lastText === 'string' && wire.lastText.trim() !== '' ? wire.lastText : null,
    lastAtUtc: text(wire.lastAtUtc),
    open: wire.open === true,
  };
}

export function unreadMessagesFromWire(
  wire: WireUnreadMessages | null | undefined,
): DinerUnreadMessages {
  const items = (wire?.items ?? []).flatMap((item) => {
    const conversationId = text(item.conversationId);
    const subjectId = text(item.subjectId);
    if (!conversationId || !subjectId) return [];
    return [
      {
        conversationId,
        subjectKind: subjectKind(item.subjectKind),
        subjectId,
        venueName: item.venueName ?? '',
        unread: count(item.unread),
        lastText:
          typeof item.lastText === 'string' && item.lastText.trim() !== '' ? item.lastText : null,
        lastKind: kindOrNull(item.lastKind),
        lastAtUtc: text(item.lastAtUtc),
      },
    ];
  });
  return {
    // The server's total when it says it, else the rows' sum.
    total:
      typeof wire?.total === 'number'
        ? count(wire.total)
        : items.reduce((sum, item) => sum + item.unread, 0),
    items,
  };
}

function lastMessageFromWire(
  wire: WireConversationMessage | null | undefined,
): StaffConversationLastMessage | null {
  if (!wire) return null;
  const message = conversationMessageFromWire(wire);
  return {
    author: message.author,
    kind: message.kind,
    text: message.text,
    createdAtUtc: message.createdAtUtc,
    staffName: message.staffName,
    answer: message.answer,
  };
}

export function conversationListItemFromWire(
  wire: WireConversationListItem,
): StaffConversationListItem {
  return {
    conversationId: wire.conversationId ?? '',
    subject: {
      kind: subjectKind(wire.subject?.kind),
      id: wire.subject?.id ?? '',
      label: wire.subject?.label ?? '',
      guestName: wire.subject?.guestName ?? '',
      localTime: wallClock(wire.subject?.localTime),
    },
    lastMessage: lastMessageFromWire(wire.lastMessage),
    unreadFromGuest: count(wire.unreadFromGuest),
    awaitingGuestAnswer: wire.awaitingGuestAnswer === true,
    oldestUnansweredGuestMessageUtc: text(wire.oldestUnansweredGuestMessageUtc),
    open: wire.open === true,
  };
}

export function branchConversationsFromWire(
  wire: WireBranchConversations | null | undefined,
): BranchConversations {
  const items = (wire?.items ?? []).map(conversationListItemFromWire);
  return {
    items,
    unreadTotal:
      typeof wire?.unreadTotal === 'number'
        ? count(wire.unreadTotal)
        : items.reduce((sum, item) => sum + item.unreadFromGuest, 0),
    remindAfterMinutes:
      finite(wire?.remindAfterMinutes) ?? DEFAULT_MESSAGE_SETTINGS.remindAfterMinutes,
    templates: Array.isArray(wire?.templates) ? [...wire.templates] : null,
    waitersCanWrite: wire?.waitersCanWrite !== false,
  };
}

/** Absent — a server from before messages — is `undefined`: the field stays off the floor. */
export function floorMessagesFromWire(
  wire: WireFloorMessages | null | undefined,
): FloorMessages | undefined {
  if (!wire) return undefined;
  return {
    unreadTotal: count(wire.unreadTotal),
    oldestUnansweredUtc: text(wire.oldestUnansweredUtc),
  };
}

/** A table's next booking's unread guest messages; 0 when the wire says nothing. */
export function tableUnreadMessagesFromWire(wire: WireFloorTableMessages): number {
  return count(wire.nextReservationUnreadMessages ?? wire.unreadMessages);
}

export function messageSettingsFromWire(
  wire: WireMessageSettings | null | undefined,
): MessageSettings {
  return {
    guestsCanWrite: wire?.guestsCanWrite !== false,
    waitersCanWrite: wire?.waitersCanWrite !== false,
    templates: Array.isArray(wire?.templates) ? [...wire.templates] : null,
    remindAfterMinutes:
      finite(wire?.remindAfterMinutes) ?? DEFAULT_MESSAGE_SETTINGS.remindAfterMinutes,
  };
}

// ---------------------------------------------------------------------------
// Writing it
// ---------------------------------------------------------------------------

/** The settings PUT: all four, every time, the templates trimmed. */
export function messageSettingsBody(input: MessageSettingsInput): WireMessageSettings {
  return {
    guestsCanWrite: input.guestsCanWrite,
    waitersCanWrite: input.waitersCanWrite,
    templates: normalizeMessageTemplates(input.templates),
    remindAfterMinutes: input.remindAfterMinutes,
  };
}

/** The send's body: the text trimmed, as the server keeps it. */
export function sendMessageBody(command: {
  readonly text: string;
  readonly clientCommandId: string;
}): WireSendMessageRequest {
  return { text: messageText(command.text), clientCommandId: command.clientCommandId };
}

// ---------------------------------------------------------------------------
// The refusals
// ---------------------------------------------------------------------------

/**
 * Every messages refusal as its typed error, or `null` for anything else —
 * which keeps the client's own mapping (`validation-failed` →
 * `ValidationError`, a 404 → `NotFoundError`, a plain 403 → `ForbiddenError`).
 */
export function messageRefusal(error: unknown): ApiError | null {
  if (!(error instanceof ApiError) || !error.problem) return null;
  const context = error.problem.context ?? {};
  const base = { url: error.url, requestId: error.requestId };

  switch (error.problem.code) {
    case CONVERSATION_CLOSED_CODE:
      return new ConversationClosedError({
        ...base,
        conversationId: text(context['conversationId']),
        closesAtUtc: text(context['closesAtUtc']) ?? text(context['closedAtUtc']),
      });
    case GUESTS_CANNOT_WRITE_CODE:
      return new GuestsCannotWriteError(base);
    case WAITERS_CANNOT_WRITE_CODE:
      return new WaitersCannotWriteError(base);
    case MESSAGES_TOO_FAST_CODE:
      return new MessagesTooFastError({
        ...base,
        retryAfterSeconds:
          error instanceof TooManyRequestsError
            ? error.retryAfterSeconds
            : finite(context['retryAfterSeconds']),
        perConversation: context['perConversation'] === true || context['limit'] === 'conversation',
      });
    default:
      return null;
  }
}

/** Rethrow a messages refusal as its typed error; anything else unchanged. */
export function rethrowMessageRefusal(error: unknown): never {
  throw messageRefusal(error) ?? error;
}
