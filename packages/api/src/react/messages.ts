import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import type { ConsoleGateway } from '../consoleGateway';
import type { Booking } from '../contracts/booking';
import {
  messageText,
  type BranchConversations,
  type ConversationMessage,
  type ConversationSubjectRef,
  type DinerConversation,
  type DinerUnreadMessages,
  type MessageSettings,
  type MessageSettingsInput,
  type SendMessageCommand,
  type SentMessage,
  type StaffConversation,
} from '../contracts/messages';
import type { YallaGateway } from '../gateway';
import { staleTime } from '../queryClient';
import type { StaffGateway } from '../staffGateway';
import { queryKeys, useConsoleGateway, useGateway, useStaffGateway } from './index';

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
 * a read already brought it, the pending one simply goes).
 */
export function settleSentMessage<T extends DinerConversation>(
  conversation: T | null | undefined,
  clientCommandId: string,
  sent: SentMessage,
): T | null | undefined {
  if (!conversation) return conversation;
  const { wasReplay: _wasReplay, conversationId, ...message } = sent;
  const already = conversation.messages.some((entry) => entry.id === message.id);
  const messages = conversation.messages.flatMap((entry) => {
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
 * The guest read the thread: nothing unread on it at once — the thread, the
 * summary and the booking's row — then the summary and the rows read again.
 */
export function afterGuestConversationRead(
  queryClient: QueryClient,
  subject: ConversationSubjectRef,
): void {
  let cleared = 0;
  queryClient.setQueryData<DinerConversation | null>(dinerThreadKey(subject), (thread) => {
    if (!thread) return thread;
    cleared = thread.unreadCount;
    return thread.unreadCount === 0 ? thread : { ...thread, unreadCount: 0 };
  });
  queryClient.setQueryData<DinerUnreadMessages>(queryKeys.unreadMessages, (summary) => {
    if (!summary) return summary;
    const row = summary.items.find(
      (item) => item.subjectKind === subject.kind && item.subjectId === subject.id,
    );
    const unread = row?.unread ?? cleared;
    if (!row && unread === 0) return summary;
    return {
      total: Math.max(0, summary.total - unread),
      items: summary.items.map((item) => (item === row ? { ...item, unread: 0 } : item)),
    };
  });
  if (subject.kind === 'reservation') {
    queryClient.setQueryData<Booking | null>(queryKeys.booking(subject.id), (booking) =>
      booking?.messages ? { ...booking, messages: { ...booking.messages, unread: 0 } } : booking,
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
 * Somebody at the venue read the thread: its row and the badge lose its
 * unread at once, then the inbox and the floor read again.
 */
export function afterStaffConversationRead(
  queryClient: QueryClient,
  branchId: string,
  subject: ConversationSubjectRef,
): void {
  queryClient.setQueryData<StaffConversation | null>(staffThreadKey(subject), (thread) =>
    thread && thread.unreadCount > 0 ? { ...thread, unreadCount: 0 } : thread,
  );
  queryClient.setQueryData<BranchConversations>(queryKeys.staffConversations(branchId), (inbox) => {
    if (!inbox) return inbox;
    const items = inbox.items.map((item) =>
      item.subject.kind === subject.kind && item.subject.id === subject.id && item.unreadFromGuest
        ? { ...item, unreadFromGuest: 0 }
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

/** "Read up to now": on opening the thread and on new venue messages. Takes the subject. */
export function markConversationReadOptions(queryClient: QueryClient, gateway: YallaGateway) {
  return {
    mutationFn: (subject: ConversationSubjectRef) => gateway.markConversationRead(subject),
    retry: false,
    onMutate: (subject: ConversationSubjectRef) => afterGuestConversationRead(queryClient, subject),
    onError: (_error: unknown, subject: ConversationSubjectRef) =>
      invalidateGuestRows(queryClient, subject),
  };
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
 * `unreadCount`; `lastMessageId` its newest message's id. Fires `markRead`
 * at most once per newest message. The same for the guest's thread and the
 * floor's.
 */
export function useMarkReadWhenSeen(input: {
  readonly subject: ConversationSubjectRef | null | undefined;
  readonly unread: number;
  readonly lastMessageId: string | null;
  /** The thread is in front, and its read has landed. */
  readonly active: boolean;
  readonly markRead: (subject: ConversationSubjectRef) => void;
}): void {
  const marked = useRef<string | null>(null);
  const { subject, unread, lastMessageId, active, markRead } = input;
  const kind = subject?.kind;
  const id = subject?.id;
  useEffect(() => {
    if (!active || !kind || !id || unread <= 0) return;
    const key = `${kind}:${id}:${lastMessageId ?? ''}`;
    if (marked.current === key) return;
    marked.current = key;
    markRead({ kind, id });
  }, [active, kind, id, unread, lastMessageId, markRead]);
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

/** One thread with who wrote each venue message. Polled while in front. */
export function staffConversationOptions(
  gateway: StaffGateway,
  subject: ConversationSubjectRef | null | undefined,
  options: ConversationQueryOptions = {},
) {
  const focused = options.focused ?? true;
  return {
    queryKey: queryKeys.staffConversation(subject?.kind ?? 'reservation', subject?.id ?? ''),
    queryFn: () => gateway.getStaffConversation(subject!),
    enabled: Boolean(subject?.id) && (options.enabled ?? true),
    staleTime: staleTime.live,
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

/** The floor's "read": the row and the badge clear at once. Takes the subject. */
export function markStaffConversationReadOptions(
  queryClient: QueryClient,
  branchId: string,
  read: (subject: ConversationSubjectRef) => Promise<void>,
) {
  return {
    mutationFn: read,
    retry: false,
    onMutate: (subject: ConversationSubjectRef) =>
      afterStaffConversationRead(queryClient, branchId, subject),
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
    markStaffConversationReadOptions(queryClient, branchId ?? '', (subject) =>
      gateway.markStaffConversationRead(subject),
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
