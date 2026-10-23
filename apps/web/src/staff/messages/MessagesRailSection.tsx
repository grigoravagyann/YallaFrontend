import {
  messageFailure,
  needsReminder,
  newCommandId,
  type ConversationMessage,
  type ConversationSubjectRef,
  type StaffConversationListItem,
} from '@yalla/api';
import { useSendStaffMessage, useStaffConversation } from '@yalla/api/react';
import { useTranslation } from '@yalla/i18n';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { RailSection } from '../FloorRail';
import { useBranchFormat } from '../useBranchFormat';
import { firstName, heldUntil, messageBody, messageFailureText, railTitle } from './messageText';

/**
 * The Now rail's "Messages" section (2026-10-23, the Rail artboard): the
 * conversations where a guest is waiting for us, each with the guest's last
 * words and — for an answer to "are you coming?" — "OK, we'll wait" in one
 * tap, beside "Reply", which opens the Messages tab on it.
 *
 * Those a guest has waited on past the branch's "remind after" come first,
 * with how long in red; the screen also lifts the whole section to the top of
 * the rail and chimes (`useMessageReminders`). Only there while somebody is
 * waiting, or just answered from here, or the inbox could not be read.
 */
export interface MessagesRailSectionProps {
  readonly branchId: string;
  readonly items: readonly StaffConversationListItem[];
  readonly remindAfterMinutes: number;
  readonly now: Date;
  /** Whether this person may write here (the inbox's `waitersCanWrite` and their role). */
  readonly canWrite: boolean;
  readonly staffName: string;
  readonly timeZoneId: string;
  readonly online: boolean;
  /** The rail is on screen: the cards' threads are read while it is. */
  readonly visible: boolean;
  /** The inbox could not be read and never was. */
  readonly failed: boolean;
  readonly icon: ReactNode;
  readonly onReply: (subject: ConversationSubjectRef) => void;
  readonly onOpenInbox: () => void;
}

/** The cards the rail shows at most; the rest are a tap away. */
export const RAIL_MESSAGE_CARDS = 3;
/** How long a card answered from here stays, saying so. */
const ANSWERED_MS = 8_000;

interface Answered {
  readonly item: StaffConversationListItem;
  readonly text: string;
  readonly atUtc: string;
}

/** Waiting for us: a guest message after the venue's last one. Reminded first, then newest. */
export function railConversations(
  items: readonly StaffConversationListItem[],
  remindAfterMinutes: number,
  now: Date,
): readonly StaffConversationListItem[] {
  const waiting = items.filter((item) => item.oldestUnansweredGuestMessageUtc !== null);
  const lastAt = (item: StaffConversationListItem) =>
    item.lastMessage ? Date.parse(item.lastMessage.createdAtUtc) : 0;
  return [...waiting].sort((a, b) => {
    const dueA = needsReminder(a, remindAfterMinutes, now);
    const dueB = needsReminder(b, remindAfterMinutes, now);
    if (dueA !== dueB) return dueA ? -1 : 1;
    return lastAt(b) - lastAt(a);
  });
}

const keyOf = (item: StaffConversationListItem) => `${item.subject.kind}:${item.subject.id}`;

export function MessagesRailSection(props: MessagesRailSectionProps) {
  const { t } = useTranslation(['staff', 'common']);
  const [answered, setAnswered] = useState<ReadonlyMap<string, Answered>>(new Map());

  // An answered card says so for a moment, then goes.
  useEffect(() => {
    if (answered.size === 0) return;
    const timer = setTimeout(() => setAnswered(new Map()), ANSWERED_MS);
    return () => clearTimeout(timer);
  }, [answered]);

  const waiting = railConversations(props.items, props.remindAfterMinutes, props.now);
  const waitingKeys = new Set(waiting.map(keyOf));
  const cards = [
    ...waiting.slice(0, RAIL_MESSAGE_CARDS),
    ...[...answered.values()]
      .filter((entry) => !waitingKeys.has(keyOf(entry.item)))
      .map((entry) => entry.item),
  ];
  const more = waiting.length - Math.min(waiting.length, RAIL_MESSAGE_CARDS);

  if (cards.length === 0 && !props.failed) return null;

  return (
    <RailSection
      title={t('messages.rail.title')}
      count={waiting.length}
      tone="waiting"
      icon={props.icon}
    >
      {props.failed && cards.length === 0 ? (
        <p className="ft-rail-empty is-failed">{t('messages.rail.unreachable')}</p>
      ) : (
        <ul className="ft-items msg-rail">
          {cards.map((item) => (
            <MessageRailCard
              key={item.conversationId}
              {...props}
              item={item}
              reminded={needsReminder(item, props.remindAfterMinutes, props.now)}
              answered={answered.get(keyOf(item)) ?? null}
              onAnswered={(entry) =>
                setAnswered((current) => new Map(current).set(keyOf(entry.item), entry))
              }
            />
          ))}
        </ul>
      )}
      {more > 0 ? (
        <button type="button" className="msg-more" onClick={props.onOpenInbox}>
          {t('messages.rail.more', { count: more })}
        </button>
      ) : null}
    </RailSection>
  );
}

function MessageRailCard({
  branchId,
  item,
  reminded,
  answered,
  onAnswered,
  canWrite,
  staffName,
  timeZoneId,
  online,
  visible,
  now,
  onReply,
}: MessagesRailSectionProps & {
  readonly item: StaffConversationListItem;
  readonly reminded: boolean;
  readonly answered: Answered | null;
  readonly onAnswered: (entry: Answered) => void;
}) {
  const { t } = useTranslation(['staff', 'common']);
  const format = useBranchFormat(timeZoneId);
  const titleId = useId();
  const subject: ConversationSubjectRef = { kind: item.subject.kind, id: item.subject.id };
  // The guest's own words and the line the system added: the list carries only the last message.
  const thread = useStaffConversation(subject, { focused: visible }).data ?? null;
  const send = useSendStaffMessage(branchId, staffName);
  const sending = useRef(false);
  const [failure, setFailure] = useState<string | null>(null);

  const messages = thread?.messages ?? [];
  const lastGuest: ConversationMessage | null =
    [...messages].reverse().find((message) => message.author === 'guest') ??
    (item.lastMessage?.author === 'guest'
      ? {
          id: 'last',
          author: 'guest',
          kind: item.lastMessage.kind,
          text: item.lastMessage.text,
          answer: item.lastMessage.answer,
          status: null,
          createdAtUtc: item.lastMessage.createdAtUtc,
          staffName: null,
        }
      : null);
  const after = lastGuest ? messages.slice(messages.findIndex((m) => m.id === lastGuest.id)) : [];
  const status = after.find((message) => message.kind === 'status')?.status ?? null;
  const held =
    status?.heldUntilLocal?.slice(0, 5) ??
    (lastGuest?.kind === 'answer' && lastGuest.answer?.kind === 'late'
      ? heldUntil(item.subject.localTime, lastGuest.answer.lateMinutes)
      : null);
  const quickOk =
    lastGuest?.kind === 'answer' &&
    (lastGuest.answer?.kind === 'late' || lastGuest.answer?.kind === 'coming');
  const okText = t('common:messages.defaultTemplates.reservation1');

  const minutes = item.oldestUnansweredGuestMessageUtc
    ? Math.max(
        0,
        Math.floor((now.getTime() - Date.parse(item.oldestUnansweredGuestMessageUtc)) / 60_000),
      )
    : 0;

  function sayOk() {
    if (sending.current || !online || !canWrite) return;
    sending.current = true;
    setFailure(null);
    send.mutate(
      { subject, text: okText, clientCommandId: newCommandId() },
      {
        onSuccess: (message) => {
          sending.current = false;
          onAnswered({ item, text: okText, atUtc: message.createdAtUtc });
        },
        onError: (error) => {
          sending.current = false;
          setFailure(messageFailureText(t, messageFailure(error)));
        },
      },
    );
  }

  return (
    <li
      className={`ft-item msg-card${answered ? ' is-done' : reminded ? ' is-urgent' : ''}`}
      aria-labelledby={titleId}
    >
      <div className="ft-item-top">
        <b id={titleId}>{railTitle(t, item)}</b>
        {answered ? null : reminded ? (
          <span className="ft-item-age age-late">{t('messages.rail.ago', { count: minutes })}</span>
        ) : lastGuest ? (
          <span className="ft-item-age">{format.time(lastGuest.createdAtUtc)}</span>
        ) : null}
      </div>
      {lastGuest ? (
        <p className="msg-quote">
          {t('messages.rail.quote', {
            text: messageBody(t, lastGuest, item.subject.localTime),
          })}
        </p>
      ) : null}
      {held && !answered ? (
        <span className="msg-held">{t('messages.rail.heldUntil', { time: held })}</span>
      ) : null}
      {answered ? (
        <p className="msg-answered" role="status">
          {t('messages.rail.answered', {
            text: answered.text,
            name: firstName(staffName),
            time: format.time(answered.atUtc),
          })}
        </p>
      ) : (
        <div className="ft-item-actions">
          {quickOk && canWrite ? (
            <button
              type="button"
              className="ft-btn ft-btn-primary"
              disabled={!online || send.isPending}
              onClick={sayOk}
            >
              {t('messages.rail.okWait')}
            </button>
          ) : null}
          <button
            type="button"
            className="ft-btn ft-btn-secondary"
            onClick={() => onReply(subject)}
          >
            {canWrite ? t('messages.rail.reply') : t('messages.rail.open')}
          </button>
        </div>
      )}
      {failure ? (
        <p className="table-warn" role="alert">
          {failure}
        </p>
      ) : null}
    </li>
  );
}
