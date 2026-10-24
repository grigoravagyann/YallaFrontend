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
import type { components } from '../generated/schema';

/**
 * The guest-messages wire (`docs/messages.md`, 2026-10-23), read once for
 * every surface: the guest's thread, unread summary and booking/order rows,
 * the floor's inbox, thread and floor badges, the console's settings, and the
 * four refusals.
 *
 * The shapes are the generated schema's. Enums arrive as words ("ask-coming",
 * "not-coming") and are read tolerantly — any spelling of the word, or the
 * domain's number — so a value a newer server adds reads as `unknown` rather
 * than as a wrong one. A field the server leaves out (it omits nulls) reads as
 * `null`.
 *
 * Like `takeawayMapping.ts`, this file imports no mapper, so every mapper can
 * import it.
 */

// ---------------------------------------------------------------------------
// The wire
// ---------------------------------------------------------------------------

type Schemas = components['schemas'];

/** `ConversationSubjectView`: a thread's subject. */
export type WireConversationSubject = Schemas['Yalla.Application.Messages.ConversationSubjectView'];
/** `DinerConversationMessage`: one message as the guest reads it. */
export type WireDinerConversationMessage =
  Schemas['Yalla.Application.Messages.DinerConversationMessage'];
/** `StaffConversationMessage`: the same, with `staffName` on a venue message. */
export type WireStaffConversationMessage =
  Schemas['Yalla.Application.Messages.StaffConversationMessage'];
/** Either message: the staff one is the guest's plus `staffName`. */
export type WireConversationMessage = WireDinerConversationMessage &
  Partial<Pick<WireStaffConversationMessage, 'staffName'>>;
/** `MessageAnswerView`. */
export type WireMessageAnswer = Schemas['Yalla.Application.Messages.MessageAnswerView'];
/** `MessageStatusView`. */
export type WireMessageStatus = Schemas['Yalla.Application.Messages.MessageStatusView'];
/** `DinerConversationView`. */
export type WireDinerConversation = Schemas['Yalla.Application.Messages.DinerConversationView'];
/** `StaffConversationView`: the guest's view plus the guest, the number and `canWrite`. */
export type WireStaffConversation = Schemas['Yalla.Application.Messages.StaffConversationView'];
/** `DinerMessageResult`: the guest's send. */
export type WireDinerMessageResult = Schemas['Yalla.Application.Messages.DinerMessageResult'];
/** `StaffMessageResult`: the floor's send, signed. */
export type WireStaffMessageResult = Schemas['Yalla.Application.Messages.StaffMessageResult'];
/** `MessagesSummary`: `messages` on a diner booking and an Orders-tab takeaway order. */
export type WireMessagesSummary = Schemas['Yalla.Application.Messages.MessagesSummary'];
/** `DinerUnreadMessages`: `GET /api/diner/messages/unread`. */
export type WireUnreadMessages = Schemas['Yalla.Application.Messages.DinerUnreadMessages'];
/** `InboxItem`: one row of the floor's inbox. */
export type WireInboxItem = Schemas['Yalla.Application.Messages.InboxItem'];
/** `BranchConversations`: `GET /api/branches/{branchId}/conversations`. */
export type WireBranchConversations = Schemas['Yalla.Application.Messages.BranchConversations'];
/** `FloorMessages`: `messages` on `BranchFloorState`. */
export type WireFloorMessages = Schemas['Yalla.Application.Floor.FloorMessages'];
/** `TableFloorState`'s two badges. */
export type WireFloorTableMessages = Pick<
  Schemas['Yalla.Application.Floor.TableFloorState'],
  'nextReservationUnreadMessages' | 'sittingUnreadMessages'
>;
/** `MessageSettingsView`: the console's read, and the PUT's answer. */
export type WireMessageSettings = Schemas['Yalla.Application.Messages.MessageSettingsView'];
/** `MessageSettingsRequest`: the PUT's body. */
export type WireMessageSettingsRequest = Schemas['Yalla.Api.Endpoints.MessageSettingsRequest'];
/** `SendMessageRequest`: the send's body, the guest's and the floor's. */
export type WireSendMessageRequest = Schemas['Yalla.Api.Endpoints.SendMessageRequest'];
export type WireMarkConversationReadRequest =
  Schemas['Yalla.Api.Endpoints.MarkConversationReadRequest'];

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

function answerKind(value: unknown): MessageAnswerKind {
  return enumOf(ANSWERS, value, 'unknown');
}

function answerFromWire(wire: WireMessageAnswer | null | undefined): MessageAnswer | null {
  if (!wire) return null;
  return { kind: answerKind(wire.kind), lateMinutes: finite(wire.lateMinutes) };
}

export function messageStatusFromWire(
  wire: WireMessageStatus | null | undefined,
): MessageStatus | null {
  if (!wire) return null;
  return {
    answer: answerKind(wire.answer),
    heldUntilLocal: wallClock(wire.heldUntilLocal),
    cancelled: wire.cancelled === true,
  };
}

/** Only a text message has a body; kept as written, never linkified. */
function body(value: string | null | undefined): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

export function conversationMessageFromWire(wire: WireConversationMessage): ConversationMessage {
  return {
    id: wire.id,
    author: messageAuthor(wire.author),
    kind: messageKind(wire.kind),
    text: body(wire.text),
    answer: answerFromWire(wire.answer),
    status: messageStatusFromWire(wire.status),
    createdAtUtc: wire.createdAtUtc,
    staffName: text(wire.staffName),
  };
}

/**
 * A send's answer: the message as stored. Only a text is ever sent, so it
 * carries no answer or status; `staffName` on the floor's.
 */
export function sentMessageFromWire(
  wire: WireDinerMessageResult | WireStaffMessageResult,
): SentMessage {
  return {
    id: wire.id,
    author: messageAuthor(wire.author),
    kind: messageKind(wire.kind),
    text: body(wire.text),
    answer: null,
    status: null,
    createdAtUtc: wire.createdAtUtc,
    staffName: 'staffName' in wire ? text(wire.staffName) : null,
    conversationId: text(wire.conversationId),
    wasReplay: wire.wasReplay === true,
  };
}

function subjectFromWire(
  wire: WireConversationSubject | null | undefined,
  fallback: ConversationSubjectRef,
): ConversationSubject {
  return {
    kind: wire?.kind ? subjectKind(wire.kind) : fallback.kind,
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
    readyAtUtc: text(wire?.readyAtUtc),
  };
}

/**
 * The guest's thread. `fallback` is the subject asked for, so a thin answer
 * still names it.
 */
export function dinerConversationFromWire(
  wire: WireDinerConversation,
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
  wire: WireStaffConversation,
  fallback: ConversationSubjectRef,
): StaffConversation {
  const base = dinerConversationFromWire(wire, fallback);
  return {
    ...base,
    messages: (wire.messages ?? []).map(conversationMessageFromWire),
    guestName: wire.guestName ?? '',
    // Empty for a platform admin: no Call button.
    guestPhone: wire.guestPhone?.trim() ?? '',
    guestLastReadUtc: text(wire.guestLastReadUtc),
    // Never assumed: a server that does not say lets nobody write.
    canWrite: wire.canWrite === true,
  };
}

/** Absent — no thread, or one closed over thirty days ago — is `null`. */
export function conversationSummaryFromWire(
  wire: WireMessagesSummary | null | undefined,
): ConversationSummary | null {
  if (!wire) return null;
  return {
    unread: count(wire.unread),
    lastAuthor: authorOrNull(wire.lastAuthor),
    lastKind: kindOrNull(wire.lastKind),
    lastText: body(wire.lastText),
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
        lastText: body(item.lastText),
        lastKind: kindOrNull(item.lastKind),
        lastAuthor: authorOrNull(item.lastAuthor),
        lastAtUtc: text(item.lastAtUtc),
        open: item.open === true,
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
  wire: WireStaffConversationMessage | null | undefined,
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

export function conversationListItemFromWire(wire: WireInboxItem): StaffConversationListItem {
  return {
    conversationId: wire.conversationId,
    subject: {
      kind: subjectKind(wire.subject?.kind),
      id: wire.subject?.id ?? '',
      label: wire.subject?.label ?? '',
      guestName: wire.subject?.guestName ?? '',
      localTime: wallClock(wire.subject?.localTime),
      localDate: text(wire.subject?.localDate),
      partySize: finite(wire.subject?.partySize),
      itemCount: finite(wire.subject?.itemCount),
      totalAmd: finite(wire.subject?.totalAmd),
    },
    // The last message that is not a system line; what it did is `latestStatus`.
    lastMessage: lastMessageFromWire(wire.lastMessage),
    latestStatus: messageStatusFromWire(wire.latestStatus),
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
    // Absent: the app's localized default four.
    templates: Array.isArray(wire?.templates) ? [...wire.templates] : null,
    waitersCanWrite: wire?.waitersCanWrite !== false,
    asOfUtc: text(wire?.asOfUtc),
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

/**
 * A table's two badges: the next booking's unread guest messages, and those
 * of the party sitting there. Each only when there are some.
 */
export function tableUnreadMessagesFromWire(wire: Partial<WireFloorTableMessages>): {
  readonly nextReservationUnreadMessages?: number;
  readonly sittingUnreadMessages?: number;
} {
  const next = count(wire.nextReservationUnreadMessages);
  const sitting = count(wire.sittingUnreadMessages);
  return {
    ...(next > 0 ? { nextReservationUnreadMessages: next } : {}),
    ...(sitting > 0 ? { sittingUnreadMessages: sitting } : {}),
  };
}

export function messageSettingsFromWire(
  wire: Partial<WireMessageSettings> | null | undefined,
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

/** The settings PUT: all four, every time, the templates trimmed (`null` for the defaults). */
export function messageSettingsBody(input: MessageSettingsInput): WireMessageSettingsRequest {
  const templates = normalizeMessageTemplates(input.templates);
  return {
    guestsCanWrite: input.guestsCanWrite,
    waitersCanWrite: input.waitersCanWrite,
    templates: templates === null ? null : [...templates],
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

/**
 * The optional body of a `…/conversation/read`: `{ upToUtc }` when the screen
 * says which message it showed last, else none — the server reads that as now.
 */
export function markReadBody(command: {
  readonly upToUtc?: string | null | undefined;
}): WireMarkConversationReadRequest | undefined {
  return command.upToUtc ? { upToUtc: command.upToUtc } : undefined;
}

// ---------------------------------------------------------------------------
// The refusals
// ---------------------------------------------------------------------------

/**
 * Every messages refusal as its typed error, or `null` for anything else —
 * which keeps the client's own mapping (`validation-failed` →
 * `ValidationError`, a 404 → `NotFoundError`, a plain 403 → `ForbiddenError`,
 * which is also what kitchen and a platform admin get for writing).
 */
export function messageRefusal(error: unknown): ApiError | null {
  if (!(error instanceof ApiError) || !error.problem) return null;
  const context = error.problem.context ?? {};
  const base = { url: error.url, requestId: error.requestId };

  switch (error.problem.code) {
    case CONVERSATION_CLOSED_CODE: {
      const kind = text(context['subjectKind']);
      return new ConversationClosedError({
        ...base,
        subjectKind: kind ? subjectKind(kind) : null,
        subjectId: text(context['subjectId']),
        closedAtUtc: text(context['closedAtUtc']),
      });
    }
    case GUESTS_CANNOT_WRITE_CODE:
      return new GuestsCannotWriteError(base);
    case WAITERS_CANNOT_WRITE_CODE:
      return new WaitersCannotWriteError(base);
    case MESSAGES_TOO_FAST_CODE: {
      const retryAfterUtc = text(context['retryAfterUtc']);
      const headerSeconds = error instanceof TooManyRequestsError ? error.retryAfterSeconds : null;
      return new MessagesTooFastError({
        ...base,
        conversationId: text(context['conversationId']),
        retryAfterUtc,
        retryAfterSeconds: headerSeconds ?? secondsUntil(retryAfterUtc),
        // `Retry-After` is the same moment as `retryAfterUtc`. The server
        // leaves both out once the thread's own sixty are spent: waiting will
        // not help.
        perConversation: retryAfterUtc === null && headerSeconds === null,
      });
    }
    default:
      return null;
  }
}

/** Whole seconds from now to an instant, at least one; `null` without one. */
function secondsUntil(instant: string | null): number | null {
  if (instant === null) return null;
  const ms = Date.parse(instant);
  if (Number.isNaN(ms)) return null;
  return Math.max(1, Math.ceil((ms - Date.now()) / 1000));
}

/** Rethrow a messages refusal as its typed error; anything else unchanged. */
export function rethrowMessageRefusal(error: unknown): never {
  throw messageRefusal(error) ?? error;
}
