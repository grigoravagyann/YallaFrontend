import {
  keepPreviousData,
  replaceEqualDeep,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import type { ConsoleGateway } from '../consoleGateway';
import type { Booking } from '../contracts/booking';
import type { MessageHistoryFilters, MessageHistoryPage } from '../contracts/messageHistory';
import {
  messageText,
  newestShownMessageUtc,
  unreadAfterMark,
  type BranchConversations,
  type ConversationMessage,
  type ConversationSubjectRef,
  type DinerConversation,
  type DinerUnreadMessages,
  type MarkConversationReadCommand,
  type MessageSettings,
  type MessageSettingsInput,
  type SendMessageCommand,
  type SentMessage,
  type StaffConversation,
} from '../contracts/messages';
import type { YallaGateway } from '../gateway';
import { staleTime } from '../queryClient';
import type { StaffGateway } from '../staffGateway';
import { useConsoleGateway, useGateway, useStaffGateway } from './gateways';
import { queryKeys } from './queryKeys';

/**
 * Guest messages (2026-10-23): the hooks every surface uses, and what each
 * mutation does to the cache.
 *
 * - **The thread** is read every ten seconds while its screen is in front
 *   (`focused`), never in the background; a send appends the message at once
 *   (`pending: true`, keyed by its `clientCommandId`), pauses the poll while it
 *   is in flight, and swaps in the server's message on success — or takes it
 *   out again on a refusal, so the composer can give the text back.
 * - **The unread summary and the inbox** are read again after every send, read
 *   and answer, with the booking lists (their rows) and the floor (its badges).
 * - Every mutation is online only and never retried: a send carries a
 *   `clientCommandId` that makes a *deliberate* retry safe (`wasReplay`).
 *
 * The cache work is in plain functions (`after…`, `appendPendingMessage`, …)
 * so it is tested on a real `QueryClient` without rendering anything. The
 * diner app's own hooks are the same one line over the same options, through
 * its own `useGateway` (see `react/preOrders.ts` on why); the diner's keys are
 * all under `['messages']`, which the app adds to its per-diner reset list.
 */

// --- Polling -----------------------------------------------------------------

/** A thread on screen: every ten seconds, in the foreground. */
export const CONVERSATION_POLL_MS = 10_000;
/** The guest's unread summary (the nav's dot): every thirty seconds, in the foreground. */
export const UNREAD_MESSAGES_POLL_MS = 30_000;
/** The floor's inbox, as often as the floor: guest messages push nothing to the tablet. */
export const STAFF_CONVERSATIONS_POLL_MS = 10_000;

/** Whether a send from this device is still in flight in a thread. */
export function hasPendingMessages(
  conversation: Pick<DinerConversation, 'messages'> | null | undefined,
): boolean {
  return Boolean(conversation?.messages.some((message) => message.pending));
}

/**
 * When to read a thread again: every ten seconds while its screen is in
 * front, never while a send is in flight (the read would drop the optimistic
 * message for a moment) and never when it is not.
 */
export function conversationPollMs(
  conversation: Pick<DinerConversation, 'messages'> | null | undefined,
  focused: boolean,
): number | false {
  if (!focused || hasPendingMessages(conversation)) return false;
  return CONVERSATION_POLL_MS;
}

// --- The optimistic append ---------------------------------------------------------

/** The message a send shows before the server answers: this side's, pending, now. */
export function pendingMessage(
  command: Pick<SendMessageCommand, 'text' | 'clientCommandId'>,
  author: 'guest' | 'venue',
  now: Date = new Date(),
  staffName: string | null = null,
): ConversationMessage {
  return {
    id: `pending:${command.clientCommandId}`,
    author,
    kind: 'text',
    text: messageText(command.text),
    answer: null,
    status: null,
    createdAtUtc: now.toISOString(),
    staffName: author === 'venue' ? staffName : null,
    pending: true,
    clientCommandId: command.clientCommandId,
  };
}

/** The thread with a pending message at its end; a second append of the same command is ignored. */
export function appendPendingMessage<T extends DinerConversation>(
  conversation: T | null | undefined,
  message: ConversationMessage,
): T | null | undefined {
  if (!conversation) return conversation;
  if (conversation.messages.some((entry) => entry.id === message.id)) return conversation;
  return { ...conversation, messages: [...conversation.messages, message] };
}

/**
 * The server answered a send: its message replaces the pending one (or, when
 * a read already brought it, the pending one simply goes). The settled
 * message keeps the send's `clientCommandId`, so a screen can key it as it
 * keyed the pending bubble.
 */
export function settleSentMessage<T extends DinerConversation>(
  conversation: T | null | undefined,
  clientCommandId: string,
  sent: SentMessage,
): T | null | undefined {
  if (!conversation) return conversation;
  const { wasReplay: _wasReplay, conversationId, ...server } = sent;
  const message: ConversationMessage = { ...server, clientCommandId };
  const already = conversation.messages.some((entry) => entry.id === message.id);
  const messages = conversation.messages.flatMap((entry) => {
    if (entry.id === message.id) return [{ ...entry, clientCommandId }];
    if (entry.clientCommandId !== clientCommandId || !entry.pending) return [entry];
    return already ? [] : [message];
  });
  // The first message makes the thread: it has an id from now on.
  return {
    ...conversation,
    conversationId: conversation.conversationId ?? conversationId,
    messages: messages.some((entry) => entry.id === message.id) ? messages : [...messages, message],
  };
}

/**
 * A read of a thread keeps the `clientCommandId` this device put on the
 * server's message its send settled into (`settleSentMessage`): the server
 * never sends it back, and a screen keys its own message by it, so the bubble
 * is the same element — and a live region says nothing again — from pending
 * through every poll after.
 */
export function carryClientCommandIds<T extends Pick<DinerConversation, 'messages'>>(
  previous: T | null | undefined,
  next: T | null | undefined,
): T | null | undefined {
  if (!previous || !next) return next;
  const ids = new Map<string, string>();
  for (const message of previous.messages) {
    if (message.clientCommandId && !message.pending) ids.set(message.id, message.clientCommandId);
  }
  if (ids.size === 0) return next;
  return {
    ...next,
    messages: next.messages.map((message) => {
      const clientCommandId = ids.get(message.id);
      return clientCommandId && !message.clientCommandId
        ? { ...message, clientCommandId }
        : message;
    }),
  };
}

/** A thread's structural sharing: the usual, over the carried command ids. */
function shareThread(previous: unknown, next: unknown): unknown {
  return replaceEqualDeep(
    previous,
    carryClientCommandIds(
      previous as DinerConversation | null | undefined,
      next as DinerConversation | null | undefined,
    ),
  );
}

/** A refused send: its pending message goes; the composer keeps the text. */
export function dropPendingMessage<T extends DinerConversation>(
  conversation: T | null | undefined,
  clientCommandId: string,
): T | null | undefined {
  if (!conversation) return conversation;
  return {
    ...conversation,
    messages: conversation.messages.filter(
      (entry) => !(entry.pending && entry.clientCommandId === clientCommandId),
    ),
  };
}

// --- What each mutation does to the cache ------------------------------------

function dinerThreadKey(subject: ConversationSubjectRef) {
  return queryKeys.dinerConversation(subject.kind, subject.id);
}

function staffThreadKey(subject: ConversationSubjectRef) {
  return queryKeys.staffConversation(subject.kind, subject.id);
}

/** The rows a thread shows on: the unread summary, and the booking's card and screen. */
function invalidateGuestRows(queryClient: QueryClient, subject: ConversationSubjectRef): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.unreadMessages });
  if (subject.kind === 'reservation') {
    void queryClient.invalidateQueries({ queryKey: queryKeys.booking(subject.id) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.bookings });
  }
}

/**
 * The guest's text landed: the thread is read again (a reply may be there),
 * and the rows it shows on. `onChanged` is the app's: it reads its own Orders
 * tab again for a takeaway thread.
 */
export function afterGuestMessageSent(
  queryClient: QueryClient,
  subject: ConversationSubjectRef,
): void {
  void queryClient.invalidateQueries({ queryKey: dinerThreadKey(subject) });
  invalidateGuestRows(queryClient, subject);
}

/**
 * The guest answered with a button — on my way, running late, not coming (the
 * cancel), by the app or a push action: the server wrote an answer and a
 * system line into the booking's thread, so it and its rows are read again.
 * The on-my-way and running-late hooks call this themselves; the app's own
 * cancel ("not coming") calls it too.
 */
export function afterGuestAnswered(queryClient: QueryClient, reservationId: string): void {
  void queryClient.invalidateQueries({
    queryKey: queryKeys.dinerConversation('reservation', reservationId),
  });
  void queryClient.invalidateQueries({ queryKey: queryKeys.unreadMessages });
}

/**
 * The guest read the thread up to `upToUtc` (else now): what the venue wrote
 * up to the mark is read at once — on the thread, the summary and the
 * booking's row; a venue message after the mark (in the cache, not yet on the
 * screen) stays unread, as the server keeps it — then the summary and the
 * rows read again.
 */
export function afterGuestConversationRead(
  queryClient: QueryClient,
  subject: ConversationSubjectRef,
  upToUtc?: string | null,
): void {
  let cleared = 0;
  let left = 0;
  queryClient.setQueryData<DinerConversation | null>(dinerThreadKey(subject), (thread) => {
    if (!thread) return thread;
    left = unreadAfterMark(thread.messages, 'venue', upToUtc, thread.unreadCount);
    cleared = thread.unreadCount - left;
    return thread.unreadCount === left ? thread : { ...thread, unreadCount: left };
  });
  queryClient.setQueryData<DinerUnreadMessages>(queryKeys.unreadMessages, (summary) => {
    if (!summary) return summary;
    const row = summary.items.find(
      (item) => item.subjectKind === subject.kind && item.subjectId === subject.id,
    );
    const rowLeft = row ? Math.min(row.unread, left) : 0;
    const unread = row ? row.unread - rowLeft : cleared;
    if (unread === 0) return summary;
    return {
      total: Math.max(0, summary.total - unread),
      items: summary.items.map((item) => (item === row ? { ...item, unread: rowLeft } : item)),
    };
  });
  if (subject.kind === 'reservation') {
    queryClient.setQueryData<Booking | null>(queryKeys.booking(subject.id), (booking) =>
      booking?.messages && booking.messages.unread > left
        ? { ...booking, messages: { ...booking.messages, unread: left } }
        : booking,
    );
  }
  invalidateGuestRows(queryClient, subject);
}

/**
 * Somebody at the venue wrote: the thread, the inbox and the floor (its
 * badges) are read again.
 */
export function afterStaffMessageSent(
  queryClient: QueryClient,
  branchId: string,
  subject: ConversationSubjectRef,
): void {
  void queryClient.invalidateQueries({ queryKey: staffThreadKey(subject) });
  void queryClient.invalidateQueries({ queryKey: queryKeys.staffConversations(branchId) });
  void queryClient.invalidateQueries({ queryKey: queryKeys.staffFloor(branchId) });
}

/**
 * Somebody at the venue read the thread up to `upToUtc` (else now): its row
 * and the badge lose what the guest wrote up to the mark at once — a guest
 * message after it stays unread, as the server keeps it — then the inbox and
 * the floor read again.
 */
export function afterStaffConversationRead(
  queryClient: QueryClient,
  branchId: string,
  subject: ConversationSubjectRef,
  upToUtc?: string | null,
): void {
  let left = 0;
  queryClient.setQueryData<StaffConversation | null>(staffThreadKey(subject), (thread) => {
    if (!thread) return thread;
    left = unreadAfterMark(thread.messages, 'guest', upToUtc, thread.unreadCount);
    return thread.unreadCount === left ? thread : { ...thread, unreadCount: left };
  });
  queryClient.setQueryData<BranchConversations>(queryKeys.staffConversations(branchId), (inbox) => {
    if (!inbox) return inbox;
    const items = inbox.items.map((item) =>
      item.subject.kind === subject.kind &&
      item.subject.id === subject.id &&
      item.unreadFromGuest > left
        ? { ...item, unreadFromGuest: left }
        : item,
    );
    return {
      ...inbox,
      items,
      unreadTotal: items.reduce((sum, item) => sum + item.unreadFromGuest, 0),
    };
  });
  void queryClient.invalidateQueries({ queryKey: queryKeys.staffConversations(branchId) });
  void queryClient.invalidateQueries({ queryKey: queryKeys.staffFloor(branchId) });
}

/**
 * The floor did something that writes into a booking's thread — the existing
 * "Ask: are you coming?", a pre-order marked not coming — so the thread and
 * the inbox are read again. With no booking to go on (a refusal), every
 * thread the floor has open is.
 */
export function afterVenueAsked(
  queryClient: QueryClient,
  branchId: string,
  reservationId: string | null,
): void {
  void queryClient.invalidateQueries({
    queryKey: reservationId
      ? queryKeys.staffConversation('reservation', reservationId)
      : queryKeys.staffConversationsAll,
  });
  void queryClient.invalidateQueries({ queryKey: queryKeys.staffConversations(branchId) });
}

// --- The diner app -------------------------------------------------------------

export interface ConversationQueryOptions {
  /**
   * The thread's screen is in front: poll every ten seconds. False stops the
   * poll and keeps what was read (a thread behind another screen).
   */
  readonly focused?: boolean | undefined;
  /** False reads nothing at all. */
  readonly enabled?: boolean | undefined;
}

/**
 * One thread — the thread screen, and the booking's "Messages with the venue"
 * card. `null` for somebody else's subject or one closed over thirty days ago.
 */
export function dinerConversationOptions(
  gateway: YallaGateway,
  subject: ConversationSubjectRef | null | undefined,
  options: ConversationQueryOptions = {},
) {
  const focused = options.focused ?? true;
  return {
    queryKey: queryKeys.dinerConversation(subject?.kind ?? 'reservation', subject?.id ?? ''),
    queryFn: () => gateway.getConversation(subject!),
    enabled: Boolean(subject?.id) && (options.enabled ?? true),
    staleTime: staleTime.live,
    structuralSharing: shareThread,
    refetchInterval: (query: {
      readonly state: { readonly data: DinerConversation | null | undefined };
    }) => conversationPollMs(query.state.data, focused),
    refetchIntervalInBackground: false,
  };
}

export function useDinerConversation(
  subject: ConversationSubjectRef | null | undefined,
  options?: ConversationQueryOptions,
) {
  return useQuery(dinerConversationOptions(useGateway(), subject, options));
}

/**
 * Send a text. The message shows at once (`pending`); on success the server's
 * replaces it, on a refusal it goes and the error says why — read it with
 * `isConversationClosed`, `isGuestsCannotWrite`, `isMessagesTooFast`,
 * `ValidationError` (`field: 'text'`). Never retried: a deliberate retry
 * reuses the `clientCommandId`. `onSent` is the app's (its Orders tab).
 */
export function sendGuestMessageOptions(
  queryClient: QueryClient,
  gateway: YallaGateway,
  onSent?: (message: SentMessage, command: SendMessageCommand) => void,
) {
  return {
    mutationFn: (command: SendMessageCommand) => gateway.sendGuestMessage(command),
    retry: false,
    // Online only: a text that went out minutes after the tap would answer a
    // question the venue has moved on from. It fails here instead.
    networkMode: 'always' as const,
    onMutate: async (command: SendMessageCommand) => {
      const key = dinerThreadKey(command.subject);
      await queryClient.cancelQueries({ queryKey: key });
      queryClient.setQueryData<DinerConversation | null>(key, (thread) =>
        appendPendingMessage(thread, pendingMessage(command, 'guest')),
      );
    },
    onSuccess: (message: SentMessage, command: SendMessageCommand) => {
      queryClient.setQueryData<DinerConversation | null>(
        dinerThreadKey(command.subject),
        (thread) => settleSentMessage(thread, command.clientCommandId, message),
      );
      afterGuestMessageSent(queryClient, command.subject);
      onSent?.(message, command);
    },
    onError: (_error: unknown, command: SendMessageCommand) => {
      queryClient.setQueryData<DinerConversation | null>(
        dinerThreadKey(command.subject),
        (thread) => dropPendingMessage(thread, command.clientCommandId),
      );
      void queryClient.invalidateQueries({ queryKey: dinerThreadKey(command.subject) });
    },
  };
}

export function useSendGuestMessage() {
  return useMutation(sendGuestMessageOptions(useQueryClient(), useGateway()));
}

/**
 * "Read": on opening the thread and on new venue messages. Takes the subject
 * and `upToUtc`, the newest message the screen showed (`useMarkReadWhenSeen`
 * passes it); without one, up to now.
 */
export function markConversationReadOptions(queryClient: QueryClient, gateway: YallaGateway) {
  return {
    mutationFn: (command: MarkConversationReadCommand) => gateway.markConversationRead(command),
    retry: false,
    onMutate: (command: MarkConversationReadCommand) =>
      afterGuestConversationRead(queryClient, subjectOf(command), command.upToUtc),
    onError: (_error: unknown, command: MarkConversationReadCommand) =>
      invalidateGuestRows(queryClient, subjectOf(command)),
  };
}

function subjectOf(command: ConversationSubjectRef): ConversationSubjectRef {
  return { kind: command.kind, id: command.id };
}

export function useMarkConversationRead() {
  return useMutation(markConversationReadOptions(useQueryClient(), useGateway()));
}

/** The nav's dot (`total > 0`) and the Bookings cards' rows. Read every thirty seconds in front. */
export function unreadMessagesOptions(gateway: YallaGateway, enabled = true) {
  return {
    queryKey: queryKeys.unreadMessages,
    queryFn: () => gateway.getUnreadMessages(),
    enabled,
    staleTime: staleTime.live,
    refetchInterval: UNREAD_MESSAGES_POLL_MS,
    refetchIntervalInBackground: false,
  };
}

/** Pass `enabled: false` while nobody is signed in: the summary is the diner's own. */
export function useUnreadMessages(enabled = true) {
  return useQuery(unreadMessagesOptions(useGateway(), enabled));
}

/**
 * Mark a thread read when it is seen: on opening it and whenever a message
 * nobody has read arrives while it is in front. `unread` is the thread's
 * `unreadCount`; `messages` what it shows. The read goes up to the newest
 * message the server sent that is on screen (`upToUtc`, never a pending
 * one's), so one that arrives between the poll and the call stays unread.
 * Fires `markRead` at most once per newest message. The same for the guest's
 * thread and the floor's.
 */
export function useMarkReadWhenSeen(input: {
  readonly subject: ConversationSubjectRef | null | undefined;
  readonly unread: number;
  readonly messages: readonly Pick<ConversationMessage, 'createdAtUtc' | 'pending'>[];
  /** The thread is in front, and its read has landed. */
  readonly active: boolean;
  readonly markRead: (command: MarkConversationReadCommand) => void;
}): void {
  const marked = useRef<string | null>(null);
  const { subject, unread, messages, active, markRead } = input;
  const kind = subject?.kind;
  const id = subject?.id;
  const upToUtc = newestShownMessageUtc(messages);
  useEffect(() => {
    if (!active || !kind || !id || unread <= 0) return;
    const key = `${kind}:${id}:${upToUtc ?? ''}`;
    if (marked.current === key) return;
    marked.current = key;
    markRead(upToUtc ? { kind, id, upToUtc } : { kind, id });
  }, [active, kind, id, unread, upToUtc, markRead]);
}

// --- The floor tablet --------------------------------------------------------------

/**
 * The inbox — the Messages tab, its badge (`unreadTotal`), the Now rail's
 * section and the reminder (`remindAfterMinutes`, see `needsReminder`). Polled
 * every ten seconds, **in the background too**: a guest's message pushes
 * nothing to the tablet, and the reminder is the point.
 */
export function branchConversationsOptions(
  gateway: StaffGateway,
  branchId: string | undefined,
  enabled = true,
) {
  return {
    queryKey: queryKeys.staffConversations(branchId ?? ''),
    queryFn: () => gateway.listConversations(branchId!),
    enabled: Boolean(branchId) && enabled,
    staleTime: staleTime.live,
    refetchInterval: STAFF_CONVERSATIONS_POLL_MS,
    refetchIntervalInBackground: true,
  };
}

export function useBranchConversations(branchId: string | undefined, enabled = true) {
  return useQuery(branchConversationsOptions(useStaffGateway(), branchId, enabled));
}

/**
 * One thread with who wrote each venue message. Polled while in front. Any
 * gateway that reads the floor's view will do: the tablet's, or the
 * console's for its history.
 */
export function staffConversationOptions(
  gateway: Pick<StaffGateway, 'getStaffConversation'>,
  subject: ConversationSubjectRef | null | undefined,
  options: ConversationQueryOptions = {},
) {
  const focused = options.focused ?? true;
  return {
    queryKey: queryKeys.staffConversation(subject?.kind ?? 'reservation', subject?.id ?? ''),
    queryFn: () => gateway.getStaffConversation(subject!),
    enabled: Boolean(subject?.id) && (options.enabled ?? true),
    staleTime: staleTime.live,
    structuralSharing: shareThread,
    refetchInterval: (query: {
      readonly state: { readonly data: StaffConversation | null | undefined };
    }) => conversationPollMs(query.state.data, focused),
    refetchIntervalInBackground: false,
  };
}

export function useStaffConversation(
  subject: ConversationSubjectRef | null | undefined,
  options?: ConversationQueryOptions,
) {
  return useQuery(staffConversationOptions(useStaffGateway(), subject, options));
}

/**
 * The floor's send, apart from the hook so the cache rule is tested.
 * Optimistic like the guest's; `staffName` signs the pending message.
 * Errors: `isConversationClosed`, `isWaitersCannotWrite`, `ForbiddenError`,
 * `ValidationError`.
 */
export function sendStaffMessageOptions(
  queryClient: QueryClient,
  branchId: string,
  send: (command: SendMessageCommand) => Promise<SentMessage>,
  staffName: string | null = null,
) {
  return {
    mutationFn: send,
    retry: false,
    // Online only, never queued, as every rail action.
    networkMode: 'always' as const,
    onMutate: async (command: SendMessageCommand) => {
      const key = staffThreadKey(command.subject);
      await queryClient.cancelQueries({ queryKey: key });
      queryClient.setQueryData<StaffConversation | null>(key, (thread) =>
        appendPendingMessage(thread, pendingMessage(command, 'venue', new Date(), staffName)),
      );
    },
    onSuccess: (message: SentMessage, command: SendMessageCommand) => {
      queryClient.setQueryData<StaffConversation | null>(
        staffThreadKey(command.subject),
        (thread) => settleSentMessage(thread, command.clientCommandId, message),
      );
      afterStaffMessageSent(queryClient, branchId, command.subject);
    },
    onError: (_error: unknown, command: SendMessageCommand) => {
      queryClient.setQueryData<StaffConversation | null>(
        staffThreadKey(command.subject),
        (thread) => dropPendingMessage(thread, command.clientCommandId),
      );
      afterStaffMessageSent(queryClient, branchId, command.subject);
    },
  };
}

/** Write to the guest. `staffName` (the signed-in person's) signs the pending message. */
export function useSendStaffMessage(branchId: string | undefined, staffName?: string | null) {
  const gateway = useStaffGateway();
  const queryClient = useQueryClient();
  return useMutation(
    sendStaffMessageOptions(
      queryClient,
      branchId ?? '',
      (command) => gateway.sendStaffMessage(command),
      staffName ?? null,
    ),
  );
}

/**
 * The floor's "read": the row and the badge clear at once, up to `upToUtc`
 * (the newest message the screen showed; else now). Takes the subject and it.
 */
export function markStaffConversationReadOptions(
  queryClient: QueryClient,
  branchId: string,
  read: (command: MarkConversationReadCommand) => Promise<void>,
) {
  return {
    mutationFn: read,
    retry: false,
    onMutate: (command: MarkConversationReadCommand) =>
      afterStaffConversationRead(queryClient, branchId, subjectOf(command), command.upToUtc),
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.staffConversations(branchId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.staffFloor(branchId) });
    },
  };
}

export function useMarkStaffConversationRead(branchId: string | undefined) {
  const gateway = useStaffGateway();
  const queryClient = useQueryClient();
  return useMutation(
    markStaffConversationReadOptions(queryClient, branchId ?? '', (command) =>
      gateway.markStaffConversationRead(command),
    ),
  );
}

// --- The console ------------------------------------------------------------------

/** The branch's message settings. Reference data; read once per visit. */
export function messageSettingsOptions(gateway: ConsoleGateway, branchId: string | undefined) {
  return {
    queryKey: queryKeys.messageSettings(branchId ?? ''),
    queryFn: () => gateway.getMessageSettings(branchId!),
    enabled: Boolean(branchId),
    staleTime: staleTime.reference,
    refetchOnWindowFocus: false,
  };
}

export function useMessageSettings(branchId: string | undefined) {
  return useQuery(messageSettingsOptions(useConsoleGateway(), branchId));
}

/** The console's save: the answer cached. */
export function afterMessageSettingsSaved(
  queryClient: QueryClient,
  branchId: string,
  settings: MessageSettings,
): void {
  queryClient.setQueryData(queryKeys.messageSettings(branchId), settings);
}

/**
 * Save all four. A 422 names every bad field (`ValidationError`; check first
 * with `messageSettingsViolations`); on any failure the settings are read
 * again, so the card shows the server's.
 */
export function saveMessageSettingsOptions(
  queryClient: QueryClient,
  gateway: ConsoleGateway,
  branchId: string | undefined,
) {
  return {
    mutationFn: (settings: MessageSettingsInput) =>
      gateway.saveMessageSettings({ branchId: branchId!, settings }),
    retry: false,
    onSuccess: (settings: MessageSettings) =>
      afterMessageSettingsSaved(queryClient, branchId ?? '', settings),
    onError: () =>
      void queryClient.invalidateQueries({ queryKey: queryKeys.messageSettings(branchId ?? '') }),
  };
}

export function useSaveMessageSettings(branchId: string | undefined) {
  return useMutation(saveMessageSettingsOptions(useQueryClient(), useConsoleGateway(), branchId));
}

// --- The console's message history (2026-10-24) ------------------------------------

/**
 * The branch's guest threads for one set of filters, newest last message
 * first, a page at a time by the server's cursor ("More"). The previous list
 * stays on screen while new filters load (`isPlaceholderData`). Read only.
 */
export function messageHistoryOptions(
  gateway: Pick<ConsoleGateway, 'listMessageHistory'>,
  branchId: string | undefined,
  filters: MessageHistoryFilters,
  enabled = true,
) {
  return {
    queryKey: queryKeys.messageHistory(branchId ?? '', filters),
    queryFn: ({ pageParam }: { readonly pageParam: string | null }) =>
      gateway.listMessageHistory(branchId!, { ...filters, cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (last: MessageHistoryPage) => last.nextCursor ?? undefined,
    enabled: Boolean(branchId) && enabled,
    staleTime: staleTime.frequent,
    placeholderData: keepPreviousData,
  };
}

/** Pass `enabled: false` while the filters on screen cannot be sent (a 422 would answer). */
export function useMessageHistory(
  branchId: string | undefined,
  filters: MessageHistoryFilters,
  enabled = true,
) {
  return useInfiniteQuery(messageHistoryOptions(useConsoleGateway(), branchId, filters, enabled));
}

/**
 * One thread for the history's right pane: the floor's own read
 * (`staffConversationOptions`), with the console's session, **never polled**
 * and never followed by a read mark — reading history must leave the tablet's
 * unread counts as they are. Under its own key, apart from the tablet's.
 */
export function historyConversationOptions(
  gateway: Pick<ConsoleGateway, 'getStaffConversation'>,
  subject: ConversationSubjectRef | null | undefined,
) {
  return {
    ...staffConversationOptions(gateway, subject, { focused: false }),
    queryKey: queryKeys.historyConversation(subject?.kind ?? 'reservation', subject?.id ?? ''),
    refetchInterval: false as const,
    staleTime: staleTime.frequent,
  };
}

export function useHistoryConversation(subject: ConversationSubjectRef | null | undefined) {
  return useQuery(historyConversationOptions(useConsoleGateway(), subject));
}
