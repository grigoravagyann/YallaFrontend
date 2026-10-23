import {
  ConversationClosedError,
  GuestsCannotWriteError,
  MessagesTooFastError,
  WaitersCannotWriteError,
} from '../contracts/errors';
import {
  DEFAULT_MESSAGE_SETTINGS,
  GUEST_MESSAGES_PER_CONVERSATION,
  GUEST_MESSAGES_PER_MINUTE,
  STAFF_LIST_RECENT_HOURS,
  compareConversationItems,
  conversationClosesAtUtc,
  hasUnansweredAsk,
  isConversationOpen,
  isConversationReadable,
  messageSettingsViolations,
  messageText,
  messageViolations,
  normalizeMessageTemplates,
  staffMayWrite,
  type BranchConversations,
  type ConversationMessage,
  type ConversationSubject,
  type ConversationSubjectRef,
  type ConversationSummary,
  type DinerConversation,
  type DinerUnreadMessages,
  type FloorMessages,
  type MessageAnswer,
  type MessageSettings,
  type MessageSettingsInput,
  type MessageStatus,
  type MessageWriterRole,
  type SentMessage,
  type StaffConversation,
  type StaffConversationListItem,
} from '../contracts/messages';
import { ForbiddenError, NotFoundError } from '../errors';
import { requireClientCommandId, validationFailed } from './problems';

/**
 * Guest messages, as the server keeps them, for the mocks (`docs/messages.md`,
 * 2026-10-23).
 *
 * One book per mock world — the diner's and the floor tablet's are separate
 * worlds, as every mock here is. The book holds the threads and the branches'
 * settings; the subjects (bookings, takeaway orders) stay in the gateway that
 * owns them and are read through `subject`, so a thread's window follows its
 * booking as the server's does. A thread is created lazily, by the first
 * message or ask.
 *
 * ## The other side, in mock mode
 *
 * With `simulate`, the side that is not on this device answers: in the diner's
 * world the venue replies a few seconds after a guest's text or answer; in the
 * floor's, the guest replies to a venue text and answers an ask with "coming".
 * The reply is **scheduled** — written with its id and time when the send is
 * made, and shown from that time on — rather than fired by a timer, so a world
 * replayed from its journal after a reload holds the same messages under the
 * same ids, and a test drives it with its clock.
 */

/** What the book reads of a subject. */
export interface MockConversationSubjectInfo {
  readonly ref: ConversationSubjectRef;
  readonly branchId: string;
  readonly venueName: string;
  readonly venuePhone: string | null;
  /** The diner account it belongs to; `null` for a guest with no account in this world. */
  readonly owner: string | null;
  readonly guestName: string;
  /** The guest's number: the floor thread's Call (empty for a platform admin). */
  readonly guestPhone: string;
  readonly startUtc: string | null;
  readonly localDate: string | null;
  readonly localTime: string | null;
  readonly partySize: number | null;
  readonly tableLabel: string | null;
  readonly takeawayCode: string | null;
  readonly readyAtLocal: string | null;
  readonly readyAtUtc: string | null;
  /** An order's item count and total, for the inbox row; `null` on a booking. */
  readonly itemCount: number | null;
  readonly totalAmd: number | null;
  /** Pending, confirmed or seated; sent, accepted or ready. */
  readonly active: boolean;
  /** A booking's end. */
  readonly endUtc: string | null;
  /** When it was cancelled, declined, a no-show, completed or collected. */
  readonly endedAtUtc: string | null;
  /** The "on my way" answers are still taken: an unanswered ask shows the answer bar. */
  readonly acceptsAnswer: boolean;
}

/** A message the mock world says in mock mode, and when. */
export interface MockSimulation {
  /** The venue's reply to a guest's text or answer, this long after it. Diner world. */
  readonly venueReplyAfterMs?: number | undefined;
  /** The guest's reply to a venue text, and their "coming" to an ask. Floor world. */
  readonly guestReplyAfterMs?: number | undefined;
  /** The staff name the simulated venue signs with. */
  readonly venueStaffName?: string | undefined;
  /** A simulated guest answered an ask: the gateway records the answer on the booking. */
  readonly onGuestAnswer?:
    ((ref: ConversationSubjectRef, answer: MessageAnswer) => void) | undefined;
}

export interface MockConversationBookOptions {
  readonly now: () => Date;
  /** The subject as it stands now, or `null` when there is no such subject in this world. */
  readonly subject: (ref: ConversationSubjectRef) => MockConversationSubjectInfo | null;
  /** Settings per branch. A branch not named takes the server's default. */
  readonly settings?: Readonly<Record<string, Partial<MessageSettingsInput>>> | undefined;
  /** Mock mode's other side; off in tests unless asked. */
  readonly simulate?: MockSimulation | undefined;
}

/** A message as stored: the view, less the client's flags, plus the command that wrote it. */
interface StoredMessage {
  readonly id: string;
  readonly author: 'guest' | 'venue' | 'system';
  readonly kind: 'text' | 'askComing' | 'answer' | 'status';
  readonly text: string | null;
  readonly answer: MessageAnswer | null;
  readonly status: MessageStatus | null;
  readonly createdAtUtc: string;
  readonly staffName: string | null;
  readonly clientCommandId: string | null;
}

/** A thread as the server stores one. */
export interface MockConversationRecord {
  readonly id: string;
  readonly ref: ConversationSubjectRef;
  readonly createdUtc: string;
  guestLastReadUtc: string | null;
  venueLastReadUtc: string | null;
  /** Oldest first; only those whose time has come are shown. */
  readonly messages: StoredMessage[];
}

/** One message in a seeded thread, `minutesAgo` relative to the book's clock when seeded. */
export interface MockSeedMessage {
  readonly author: 'guest' | 'venue' | 'system';
  readonly kind?: 'text' | 'askComing' | 'answer' | 'status' | undefined;
  readonly text?: string | undefined;
  readonly answer?: MessageAnswer | undefined;
  readonly status?: Partial<MessageStatus> | undefined;
  readonly minutesAgo: number;
  readonly staffName?: string | undefined;
}

const MINUTE = 60_000;

/** The venue's replies in mock mode, by what the guest said. */
const VENUE_REPLIES = {
  coming: 'Սպասում ենք։ Նախապատվերը սկսում ենք հիմա։',
  late: 'Լավ, սեղանը պահում ենք։',
  text: ['Լավ, հասկացանք։ Շնորհակալություն։', 'Իհարկե, կանենք։', 'Լավ, սպասում ենք։'],
} as const;

/** The guest's replies in mock mode. */
const GUEST_REPLIES = ['Լավ, շնորհակալություն։', 'Շատ լավ, կգամ։', 'Հասկացա, շնորհակալ եմ։'];

function mapKey(ref: ConversationSubjectRef): string {
  return `${ref.kind}:${ref.id}`;
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

export function createMockConversationBook(options: MockConversationBookOptions) {
  const now = options.now;
  const records = new Map<string, MockConversationRecord>();
  const settingsByBranch = new Map<string, MessageSettings>();
  for (const [branchId, partial] of Object.entries(options.settings ?? {})) {
    settingsByBranch.set(branchId, { ...DEFAULT_MESSAGE_SETTINGS, ...partial });
  }
  let conversationCounter = 0;
  let messageCounter = 0;
  let replyCounter = 0;

  const nextMessageId = () => `msg-${(messageCounter += 1)}`;

  function settingsOf(branchId: string): MessageSettings {
    return settingsByBranch.get(branchId) ?? DEFAULT_MESSAGE_SETTINGS;
  }

  function closesAtOf(info: MockConversationSubjectInfo): string | null {
    return conversationClosesAtUtc({
      kind: info.ref.kind,
      active: info.active,
      endUtc: info.endUtc,
      endedAtUtc: info.endedAtUtc,
    });
  }

  function isOpen(info: MockConversationSubjectInfo): boolean {
    return isConversationOpen(closesAtOf(info), now());
  }

  /** The messages whose time has come: a scheduled reply shows from its moment on. */
  function shown(record: MockConversationRecord): StoredMessage[] {
    const t = now().getTime();
    return record.messages.filter((message) => Date.parse(message.createdAtUtc) <= t);
  }

  const answered = new Set<string>();

  /** A simulated guest's answer that has come due: the gateway records it on the booking. */
  function settleSimulatedAnswers(record: MockConversationRecord): void {
    const hook = options.simulate?.onGuestAnswer;
    if (!hook) return;
    for (const message of shown(record)) {
      if (message.kind !== 'answer' || !message.answer || answered.has(message.id)) continue;
      if (!message.clientCommandId?.startsWith('sim-')) continue;
      answered.add(message.id);
      hook(record.ref, message.answer);
      // The system line the server writes beside every answer.
      push(record, {
        author: 'system',
        kind: 'status',
        text: null,
        answer: null,
        status: {
          answer: message.answer.kind,
          heldUntilLocal: null,
          cancelled: message.answer.kind === 'notComing',
        },
        createdAtUtc: message.createdAtUtc,
        staffName: null,
        clientCommandId: null,
      });
    }
  }

  function ensure(ref: ConversationSubjectRef): MockConversationRecord {
    const existing = records.get(mapKey(ref));
    if (existing) return existing;
    const record: MockConversationRecord = {
      id: `conv-${(conversationCounter += 1)}`,
      ref: { kind: ref.kind, id: ref.id },
      createdUtc: now().toISOString(),
      guestLastReadUtc: null,
      venueLastReadUtc: null,
      messages: [],
    };
    records.set(mapKey(ref), record);
    return record;
  }

  function push(record: MockConversationRecord, message: Omit<StoredMessage, 'id'>): StoredMessage {
    const stored: StoredMessage = { id: nextMessageId(), ...message };
    // Kept in time order: a scheduled reply may sit before a later write.
    const at = Date.parse(stored.createdAtUtc);
    let index = record.messages.length;
    while (index > 0 && Date.parse(record.messages[index - 1]!.createdAtUtc) > at) index -= 1;
    record.messages.splice(index, 0, stored);
    return stored;
  }

  function messageView(message: StoredMessage, staff: boolean): ConversationMessage {
    return {
      id: message.id,
      author: message.author,
      kind: message.kind,
      text: message.text,
      answer: message.answer,
      status: message.status,
      createdAtUtc: message.createdAtUtc,
      staffName: staff ? message.staffName : null,
    };
  }

  function subjectView(info: MockConversationSubjectInfo): ConversationSubject {
    return {
      kind: info.ref.kind,
      id: info.ref.id,
      venueName: info.venueName,
      branchId: info.branchId,
      startUtc: info.startUtc,
      localDate: info.localDate,
      localTime: info.localTime,
      partySize: info.partySize,
      tableLabel: info.tableLabel,
      takeawayCode: info.takeawayCode,
      readyAtLocal: info.readyAtLocal,
      readyAtUtc: info.readyAtUtc,
    };
  }

  function after(messages: readonly StoredMessage[], since: string | null) {
    return since === null
      ? messages
      : messages.filter((message) => Date.parse(message.createdAtUtc) > Date.parse(since));
  }

  /** Venue messages the guest has not read. */
  function unreadForGuest(record: MockConversationRecord): number {
    return after(shown(record), record.guestLastReadUtc).filter((m) => m.author === 'venue').length;
  }

  /** Guest messages nobody at the venue has read. */
  function unreadForVenue(record: MockConversationRecord): number {
    return after(shown(record), record.venueLastReadUtc).filter((m) => m.author === 'guest').length;
  }

  /** The oldest guest message after the venue's last one. */
  function oldestUnanswered(record: MockConversationRecord): string | null {
    const messages = shown(record);
    let oldest: string | null = null;
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index]!;
      if (message.author === 'venue') break;
      if (message.author === 'guest') oldest = message.createdAtUtc;
    }
    return oldest;
  }

  function guestOwns(info: MockConversationSubjectInfo, actor: string | null): boolean {
    return info.owner === null || info.owner === actor;
  }

  /** The thread as its guest may see it, or a 404's `null`. */
  function guestSide(ref: ConversationSubjectRef, actor: string | null) {
    const info = options.subject(ref);
    if (!info || !guestOwns(info, actor)) return null;
    if (!isConversationReadable(closesAtOf(info), now())) return null;
    const record = records.get(mapKey(ref)) ?? null;
    if (record) settleSimulatedAnswers(record);
    return { info, record };
  }

  function dinerView(
    info: MockConversationSubjectInfo,
    record: MockConversationRecord | null,
  ): DinerConversation {
    const messages = record ? shown(record) : [];
    const closesAtUtc = closesAtOf(info);
    return {
      conversationId: record?.id ?? null,
      subject: subjectView(info),
      open: isConversationOpen(closesAtUtc, now()),
      closesAtUtc,
      guestsCanWrite: settingsOf(info.branchId).guestsCanWrite,
      venuePhone: info.venuePhone,
      pendingAsk: info.acceptsAnswer && hasUnansweredAsk(messages),
      venueLastReadUtc: record?.venueLastReadUtc ?? null,
      unreadCount: record ? unreadForGuest(record) : 0,
      messages: messages.map((message) => messageView(message, false)),
    };
  }

  function staffView(
    info: MockConversationSubjectInfo,
    record: MockConversationRecord | null,
    role: MessageWriterRole,
  ): StaffConversation {
    const base = dinerView(info, record);
    return {
      ...base,
      messages: (record ? shown(record) : []).map((message) => messageView(message, true)),
      // The floor's own unread: guest messages nobody at the venue has read.
      unreadCount: record ? unreadForVenue(record) : 0,
      guestName: info.guestName,
      // A platform admin reads only, and gets no number to call.
      guestPhone: role === 'platformAdmin' ? '' : info.guestPhone,
      guestLastReadUtc: record?.guestLastReadUtc ?? null,
      canWrite: base.open && staffMayWrite(role, settingsOf(info.branchId)),
    };
  }

  function sent(
    record: MockConversationRecord,
    message: StoredMessage,
    staff: boolean,
    wasReplay: boolean,
  ): SentMessage {
    return { ...messageView(message, staff), conversationId: record.id, wasReplay };
  }

  /** A send made with the same command id by the same side: the first send's message. */
  function replayOf(
    record: MockConversationRecord | undefined,
    author: 'guest' | 'venue',
    clientCommandId: string,
  ): StoredMessage | null {
    return (
      record?.messages.find(
        (message) => message.author === author && message.clientCommandId === clientCommandId,
      ) ?? null
    );
  }

  function requireText(url: string, value: string): string {
    const violations = messageViolations(value);
    if (violations.length > 0) {
      throw validationFailed(
        url,
        violations.map((violation) => ({
          field: violation.field,
          message: violation.message,
          bound: violation.bound ?? 'range',
          ...(violation.min !== undefined ? { min: violation.min } : {}),
          ...(violation.max !== undefined ? { max: violation.max } : {}),
        })),
      );
    }
    return messageText(value);
  }

  function requireOpen(url: string, info: MockConversationSubjectInfo): void {
    if (isOpen(info)) return;
    throw new ConversationClosedError({
      url,
      subjectKind: info.ref.kind,
      subjectId: info.ref.id,
      closedAtUtc: closesAtOf(info),
    });
  }

  /** At most five guest texts a minute and sixty in a thread. */
  function requireNotTooFast(url: string, record: MockConversationRecord | undefined): void {
    if (!record) return;
    const texts = record.messages.filter((m) => m.author === 'guest' && m.kind === 'text');
    if (texts.length >= GUEST_MESSAGES_PER_CONVERSATION) {
      // No `retryAfterUtc`: waiting will not help.
      throw new MessagesTooFastError({ url, conversationId: record.id, perConversation: true });
    }
    const t = now().getTime();
    const lastMinute = texts.filter((m) => t - Date.parse(m.createdAtUtc) < MINUTE);
    if (lastMinute.length >= GUEST_MESSAGES_PER_MINUTE) {
      const retryAt = Date.parse(lastMinute[0]!.createdAtUtc) + MINUTE;
      throw new MessagesTooFastError({
        url,
        conversationId: record.id,
        retryAfterUtc: iso(retryAt),
        retryAfterSeconds: Math.max(1, Math.ceil((retryAt - t) / 1000)),
      });
    }
  }

  /** Mock mode: the venue answers the guest a few seconds on, once per burst. */
  function scheduleVenueReply(record: MockConversationRecord, said: StoredMessage): void {
    const delay = options.simulate?.venueReplyAfterMs;
    if (delay === undefined) return;
    const at = Date.parse(said.createdAtUtc) + delay;
    // One reply waiting is enough: a burst of three texts gets one answer.
    if (
      record.messages.some(
        (m) => m.author === 'venue' && Date.parse(m.createdAtUtc) > now().getTime(),
      )
    ) {
      return;
    }
    const text =
      said.kind === 'answer'
        ? said.answer?.kind === 'coming'
          ? VENUE_REPLIES.coming
          : said.answer?.kind === 'late'
            ? VENUE_REPLIES.late
            : null
        : VENUE_REPLIES.text[replyCounter++ % VENUE_REPLIES.text.length]!;
    if (text === null) return;
    push(record, {
      author: 'venue',
      kind: 'text',
      text,
      answer: null,
      status: null,
      createdAtUtc: iso(at),
      staffName: options.simulate?.venueStaffName ?? null,
      clientCommandId: `sim-venue-${said.id}`,
    });
  }

  /** Mock mode: the guest answers the venue a few seconds on — a reply to a text, "coming" to an ask. */
  function scheduleGuestReply(record: MockConversationRecord, said: StoredMessage): void {
    const delay = options.simulate?.guestReplyAfterMs;
    if (delay === undefined) return;
    const at = Date.parse(said.createdAtUtc) + delay;
    if (
      record.messages.some(
        (m) => m.author === 'guest' && Date.parse(m.createdAtUtc) > now().getTime(),
      )
    ) {
      return;
    }
    if (said.kind === 'askComing') {
      const info = options.subject(record.ref);
      if (!info?.acceptsAnswer) return;
      push(record, {
        author: 'guest',
        kind: 'answer',
        text: null,
        answer: { kind: 'coming', lateMinutes: null },
        status: null,
        createdAtUtc: iso(at),
        staffName: null,
        clientCommandId: `sim-guest-${said.id}`,
      });
      return;
    }
    push(record, {
      author: 'guest',
      kind: 'text',
      text: GUEST_REPLIES[replyCounter++ % GUEST_REPLIES.length]!,
      answer: null,
      status: null,
      createdAtUtc: iso(at),
      staffName: null,
      clientCommandId: `sim-guest-${said.id}`,
    });
  }

  function summaryOf(
    info: MockConversationSubjectInfo,
    record: MockConversationRecord | null,
  ): ConversationSummary | null {
    const open = isOpen(info);
    const messages = record ? shown(record) : [];
    const last = messages.at(-1) ?? null;
    // No thread and none can be opened: nothing to show.
    if (!last && !open) return null;
    return {
      unread: record ? unreadForGuest(record) : 0,
      lastAuthor: last?.author ?? null,
      lastKind: last?.kind ?? null,
      // A text's first 140 characters, as the server cuts it.
      lastText: last?.text ? last.text.slice(0, 140) : null,
      lastAtUtc: last?.createdAtUtc ?? null,
      open,
    };
  }

  function listItem(
    info: MockConversationSubjectInfo,
    record: MockConversationRecord,
  ): StaffConversationListItem | null {
    const messages = shown(record);
    const newest = messages.at(-1);
    // The row's message is the last that is not a system line; the line itself
    // is `latestStatus`.
    const last = [...messages].reverse().find((message) => message.author !== 'system');
    if (!newest || !last) return null;
    const open = isOpen(info);
    const recent =
      now().getTime() - Date.parse(newest.createdAtUtc) <= STAFF_LIST_RECENT_HOURS * 3_600_000;
    if (!open && !recent) return null;
    const takeaway = info.ref.kind === 'takeaway';
    return {
      conversationId: record.id,
      subject: {
        kind: info.ref.kind,
        id: info.ref.id,
        label: (takeaway ? info.takeawayCode : info.tableLabel) ?? '',
        guestName: info.guestName,
        localTime: takeaway ? info.readyAtLocal : info.localTime,
        localDate: takeaway ? null : info.localDate,
        partySize: takeaway ? null : info.partySize,
        itemCount: takeaway ? info.itemCount : null,
        totalAmd: takeaway ? info.totalAmd : null,
      },
      lastMessage: {
        author: last.author,
        kind: last.kind,
        text: last.text,
        createdAtUtc: last.createdAtUtc,
        staffName: last.staffName,
        answer: last.answer,
      },
      latestStatus:
        [...messages].reverse().find((message) => message.kind === 'status')?.status ?? null,
      unreadFromGuest: unreadForVenue(record),
      awaitingGuestAnswer: last.kind === 'askComing',
      // A closed thread cannot be answered: nothing in it waits or rings.
      oldestUnansweredGuestMessageUtc: open ? oldestUnanswered(record) : null,
      open,
    };
  }

  return {
    settings(branchId: string): MessageSettings {
      return settingsOf(branchId);
    },

    /** The console's save: every bad field named, nothing saved. */
    setSettings(url: string, branchId: string, input: MessageSettingsInput): MessageSettings {
      const violations = messageSettingsViolations(input);
      if (violations.length > 0) {
        throw validationFailed(
          url,
          violations.map((violation) => ({
            field: violation.field,
            message: violation.message,
            ...(violation.bound !== undefined ? { bound: violation.bound } : {}),
            ...(violation.min !== undefined ? { min: violation.min } : {}),
            ...(violation.max !== undefined ? { max: violation.max } : {}),
          })),
        );
      }
      const saved: MessageSettings = {
        guestsCanWrite: input.guestsCanWrite,
        waitersCanWrite: input.waitersCanWrite,
        templates: normalizeMessageTemplates(input.templates),
        remindAfterMinutes: input.remindAfterMinutes,
      };
      settingsByBranch.set(branchId, saved);
      return saved;
    },

    // --- The guest ---------------------------------------------------------------

    /** `GET /api/diner/…/conversation`: `null` for a 404. */
    guestConversation(ref: ConversationSubjectRef, actor: string | null): DinerConversation | null {
      const side = guestSide(ref, actor);
      return side ? dinerView(side.info, side.record) : null;
    },

    sendAsGuest(input: {
      readonly url: string;
      readonly ref: ConversationSubjectRef;
      readonly actor: string | null;
      readonly text: string;
      readonly clientCommandId: string;
    }): SentMessage {
      const { url, ref } = input;
      requireClientCommandId(url, input.clientCommandId);
      const info = options.subject(ref);
      if (!info || !guestOwns(info, input.actor)) throw new NotFoundError({ url });
      const existing = records.get(mapKey(ref));
      const replay = replayOf(existing, 'guest', input.clientCommandId);
      if (replay && existing) return sent(existing, replay, false, true);
      const text = requireText(url, input.text);
      requireOpen(url, info);
      if (!settingsOf(info.branchId).guestsCanWrite) throw new GuestsCannotWriteError({ url });
      requireNotTooFast(url, existing);
      const record = ensure(ref);
      const message = push(record, {
        author: 'guest',
        kind: 'text',
        text,
        answer: null,
        status: null,
        createdAtUtc: now().toISOString(),
        staffName: null,
        clientCommandId: input.clientCommandId,
      });
      // Writing is reading: the guest has seen everything up to their own message.
      record.guestLastReadUtc = message.createdAtUtc;
      scheduleVenueReply(record, message);
      return sent(record, message, false, false);
    },

    /** `POST …/conversation/read`: nothing to read is a success. */
    readAsGuest(url: string, ref: ConversationSubjectRef, actor: string | null): void {
      const info = options.subject(ref);
      if (!info || !guestOwns(info, actor)) throw new NotFoundError({ url });
      const record = records.get(mapKey(ref));
      if (record) record.guestLastReadUtc = now().toISOString();
    },

    /** `GET /api/diner/messages/unread`: open threads, and closed ones with unread messages. */
    unread(actor: string | null): DinerUnreadMessages {
      const items = [...records.values()].flatMap((record) => {
        const info = options.subject(record.ref);
        if (!info || info.owner === null || info.owner !== actor) return [];
        if (!isConversationReadable(closesAtOf(info), now())) return [];
        settleSimulatedAnswers(record);
        const unread = unreadForGuest(record);
        const last = shown(record).at(-1);
        if (!last || (!isOpen(info) && unread === 0)) return [];
        return [
          {
            conversationId: record.id,
            subjectKind: record.ref.kind,
            subjectId: record.ref.id,
            venueName: info.venueName,
            unread,
            lastText: last.text ? last.text.slice(0, 140) : null,
            lastKind: last.kind,
            lastAuthor: last.author,
            lastAtUtc: last.createdAtUtc,
            open: isOpen(info),
          },
        ];
      });
      items.sort((a, b) => Date.parse(b.lastAtUtc ?? '') - Date.parse(a.lastAtUtc ?? ''));
      return { total: items.reduce((sum, item) => sum + item.unread, 0), items };
    },

    /** `messages` on a booking or order read. */
    summary(ref: ConversationSubjectRef): ConversationSummary | null {
      const info = options.subject(ref);
      if (!info) return null;
      return summaryOf(info, records.get(mapKey(ref)) ?? null);
    },

    // --- The floor -----------------------------------------------------------------

    /** `GET /api/branches/{branchId}/conversations`. */
    branchConversations(branchId: string): BranchConversations {
      const items = [...records.values()].flatMap((record) => {
        const info = options.subject(record.ref);
        if (!info || info.branchId !== branchId) return [];
        settleSimulatedAnswers(record);
        const item = listItem(info, record);
        return item ? [item] : [];
      });
      items.sort(compareConversationItems);
      const settings = settingsOf(branchId);
      return {
        items,
        unreadTotal: items.reduce((sum, item) => sum + item.unreadFromGuest, 0),
        remindAfterMinutes: settings.remindAfterMinutes,
        templates: settings.templates,
        waitersCanWrite: settings.waitersCanWrite,
        asOfUtc: now().toISOString(),
      };
    },

    /** The floor state's line: every open thread's unread guest messages, and the oldest waiting. */
    floor(branchId: string): FloorMessages {
      let unreadTotal = 0;
      let oldest: string | null = null;
      for (const record of records.values()) {
        const info = options.subject(record.ref);
        if (!info || info.branchId !== branchId || !isOpen(info)) continue;
        settleSimulatedAnswers(record);
        unreadTotal += unreadForVenue(record);
        const waiting = oldestUnanswered(record);
        if (waiting && (oldest === null || Date.parse(waiting) < Date.parse(oldest))) {
          oldest = waiting;
        }
      }
      return { unreadTotal, oldestUnansweredUtc: oldest };
    },

    /** One subject's guest messages the venue has not read: a table tile's badge. */
    unreadFromGuest(ref: ConversationSubjectRef): number {
      const record = records.get(mapKey(ref));
      return record ? unreadForVenue(record) : 0;
    },

    /** `GET /api/{reservations|takeaway-orders}/{id}/conversation`: `null` for a 404. */
    staffConversation(
      ref: ConversationSubjectRef,
      role: MessageWriterRole,
    ): StaffConversation | null {
      const info = options.subject(ref);
      if (!info) return null;
      const record = records.get(mapKey(ref)) ?? null;
      if (record) settleSimulatedAnswers(record);
      return staffView(info, record, role);
    },

    sendAsVenue(input: {
      readonly url: string;
      readonly ref: ConversationSubjectRef;
      readonly role: MessageWriterRole;
      readonly staffName: string | null;
      readonly text: string;
      readonly clientCommandId: string;
    }): SentMessage {
      const { url, ref } = input;
      requireClientCommandId(url, input.clientCommandId);
      const info = options.subject(ref);
      if (!info) throw new NotFoundError({ url });
      const existing = records.get(mapKey(ref));
      const replay = replayOf(existing, 'venue', input.clientCommandId);
      if (replay && existing) return sent(existing, replay, true, true);
      if (input.role === 'kitchen' || input.role === 'platformAdmin') {
        throw new ForbiddenError({ url });
      }
      const text = requireText(url, input.text);
      requireOpen(url, info);
      if (!staffMayWrite(input.role, settingsOf(info.branchId))) {
        throw new WaitersCannotWriteError({ url });
      }
      const record = ensure(ref);
      const message = push(record, {
        author: 'venue',
        kind: 'text',
        text,
        answer: null,
        status: null,
        createdAtUtc: now().toISOString(),
        staffName: input.staffName,
        clientCommandId: input.clientCommandId,
      });
      // Writing is reading: the venue has seen the guest's messages before its own.
      record.venueLastReadUtc = message.createdAtUtc;
      scheduleGuestReply(record, message);
      return sent(record, message, true, false);
    },

    /** `POST …/conversation/read` from the floor: anybody's read counts for the venue. */
    readAsVenue(url: string, ref: ConversationSubjectRef): void {
      if (!options.subject(ref)) throw new NotFoundError({ url });
      const record = records.get(mapKey(ref));
      if (record) record.venueLastReadUtc = now().toISOString();
    },

    // --- What the other endpoints add to a thread ---------------------------------

    /** `ask-on-my-way` succeeded: the venue's "are you coming?", with the asker's name. */
    appendAsk(ref: ConversationSubjectRef, staffName: string | null): void {
      const record = ensure(ref);
      const message = push(record, {
        author: 'venue',
        kind: 'askComing',
        text: null,
        answer: null,
        status: null,
        createdAtUtc: now().toISOString(),
        staffName,
        clientCommandId: null,
      });
      scheduleGuestReply(record, message);
    },

    /**
     * The guest answered with a button (on my way, running late, not coming;
     * in the app or by link): the answer, and the system line saying what
     * changed on the booking, naming the answer it follows.
     */
    appendAnswer(
      ref: ConversationSubjectRef,
      answer: MessageAnswer,
      change: Omit<MessageStatus, 'answer'>,
    ): void {
      const status: MessageStatus = { answer: answer.kind, ...change };
      const record = ensure(ref);
      const at = now().toISOString();
      const message = push(record, {
        author: 'guest',
        kind: 'answer',
        text: null,
        answer,
        status: null,
        createdAtUtc: at,
        staffName: null,
        clientCommandId: null,
      });
      push(record, {
        author: 'system',
        kind: 'status',
        text: null,
        answer: null,
        status,
        createdAtUtc: at,
        staffName: null,
        clientCommandId: null,
      });
      record.guestLastReadUtc = at;
      scheduleVenueReply(record, message);
    },

    // --- Seeds and tests ------------------------------------------------------------

    /** A thread as mock mode or a test starts with it. */
    seed(
      ref: ConversationSubjectRef,
      messages: readonly MockSeedMessage[],
      read?: {
        readonly guestLastReadMinutesAgo?: number | undefined;
        readonly venueLastReadMinutesAgo?: number | undefined;
      },
    ): MockConversationRecord {
      const record = ensure(ref);
      const t = now().getTime();
      for (const seed of messages) {
        const kind = seed.kind ?? 'text';
        push(record, {
          author: seed.author,
          kind,
          text: kind === 'text' ? (seed.text ?? '') : null,
          answer: kind === 'answer' ? (seed.answer ?? { kind: 'coming', lateMinutes: null }) : null,
          status:
            kind === 'status'
              ? {
                  answer:
                    seed.status?.answer ??
                    (seed.status?.cancelled
                      ? 'notComing'
                      : seed.status?.heldUntilLocal
                        ? 'late'
                        : 'coming'),
                  heldUntilLocal: seed.status?.heldUntilLocal ?? null,
                  cancelled: seed.status?.cancelled ?? false,
                }
              : null,
          createdAtUtc: iso(t - seed.minutesAgo * MINUTE),
          staffName: seed.author === 'venue' ? (seed.staffName ?? null) : null,
          clientCommandId: null,
        });
      }
      if (read?.guestLastReadMinutesAgo !== undefined) {
        record.guestLastReadUtc = iso(t - read.guestLastReadMinutesAgo * MINUTE);
      }
      if (read?.venueLastReadMinutesAgo !== undefined) {
        record.venueLastReadUtc = iso(t - read.venueLastReadMinutesAgo * MINUTE);
      }
      return record;
    },

    record(ref: ConversationSubjectRef): MockConversationRecord | undefined {
      return records.get(mapKey(ref));
    },

    records(): readonly MockConversationRecord[] {
      return [...records.values()];
    },
  };
}

export type MockConversationBook = ReturnType<typeof createMockConversationBook>;
