import {
  filterConversations,
  needsReminder,
  sameSubject,
  type BranchConversations,
  type ConversationFilter,
  type ConversationSubjectRef,
  type StaffConversationListItem,
} from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import { useState } from 'react';
import { QueryFailureNotice } from '../../components/QueryFailureNotice';
import { useBranchFormat } from '../useBranchFormat';
import { MessageThread } from './MessageThread';
import { lastLine, rowTitle } from './messageText';

/**
 * The floor tablet's Messages tab (2026-10-23, the Inbox artboard): the
 * branch's conversations on the left — All, Unanswered, Takeaway — and the one
 * chosen on the right.
 *
 * The list is the server's order (unanswered first, the longest waiting
 * first, then the newest). A row a guest has waited on past the branch's
 * "remind after" says how long, in the urgent colour, as the rail does.
 */
export interface MessagesInboxProps {
  readonly branchId: string;
  readonly inbox: BranchConversations | null;
  readonly loading: boolean;
  readonly failed: boolean;
  readonly error: unknown;
  readonly onRetry: () => void;
  /** The conversation chosen, here or from the rail's "Reply"; `null` for the first in the list. */
  readonly selected: ConversationSubjectRef | null;
  readonly onSelect: (subject: ConversationSubjectRef) => void;
  readonly staffName: string;
  readonly timeZoneId: string;
  readonly online: boolean;
  /** The tab is in front. */
  readonly active: boolean;
  /** The clock the reminders are judged by. */
  readonly now: Date;
}

const FILTERS: readonly ConversationFilter[] = ['all', 'unanswered', 'takeaway'];

export function MessagesInbox(props: MessagesInboxProps) {
  const { t } = useTranslation(['staff', 'admin', 'common']);
  const format = useBranchFormat(props.timeZoneId);
  const [filter, setFilter] = useState<ConversationFilter>('all');

  const items = props.inbox?.items ?? [];
  const shown = filterConversations(items, filter);
  const remindAfter = props.inbox?.remindAfterMinutes ?? 3;
  const current =
    props.selected ?? (shown[0] ? { kind: shown[0].subject.kind, id: shown[0].subject.id } : null);
  const currentItem = current
    ? (items.find((item) => sameSubject(item.subject, current)) ?? null)
    : null;

  const filterLabel = (key: ConversationFilter) =>
    key === 'all'
      ? t('messages.inbox.filters.all', { count: items.length })
      : key === 'unanswered'
        ? t('messages.inbox.filters.unanswered', {
            count: filterConversations(items, 'unanswered').length,
          })
        : t('messages.inbox.filters.takeaway');

  return (
    <div className="msg-inbox">
      <section className="msg-list" aria-label={t('messages.inbox.label')}>
        <div className="msg-filters" role="group" aria-label={t('messages.inbox.filters.label')}>
          {FILTERS.map((key) => (
            <button
              key={key}
              type="button"
              className="msg-chip"
              aria-pressed={filter === key}
              onClick={() => setFilter(key)}
            >
              {filterLabel(key)}
            </button>
          ))}
        </div>
        <div className="msg-rows">
          {props.failed && !props.inbox ? (
            <div className="msg-empty">
              <p className="ft-rail-empty is-failed">{t('messages.inbox.unreachable')}</p>
              <QueryFailureNotice error={props.error} onRetry={props.onRetry} />
            </div>
          ) : props.loading && !props.inbox ? (
            <p className="ft-rail-empty">{t('floor.loading')}</p>
          ) : items.length === 0 ? (
            <p className="ft-rail-empty">{t('messages.inbox.empty')}</p>
          ) : shown.length === 0 ? (
            <p className="ft-rail-empty">{t('messages.inbox.emptyFilter')}</p>
          ) : (
            <ul className="ft-items">
              {shown.map((item) => (
                <InboxRow
                  key={item.conversationId}
                  item={item}
                  current={Boolean(current && sameSubject(item.subject, current))}
                  reminded={needsReminder(item, remindAfter, props.now)}
                  waitingMinutes={
                    item.oldestUnansweredGuestMessageUtc
                      ? Math.max(0, format.minutesSince(item.oldestUnansweredGuestMessageUtc))
                      : 0
                  }
                  time={item.lastMessage ? format.time(item.lastMessage.createdAtUtc) : ''}
                  onPick={() => props.onSelect({ kind: item.subject.kind, id: item.subject.id })}
                />
              ))}
            </ul>
          )}
        </div>
      </section>

      {current ? (
        <MessageThread
          // A fresh pane per conversation: a half-typed reply never carries over.
          key={`${current.kind}:${current.id}`}
          branchId={props.branchId}
          subject={current}
          item={currentItem}
          templates={props.inbox?.templates ?? null}
          waitersCanWrite={props.inbox?.waitersCanWrite ?? true}
          staffName={props.staffName}
          timeZoneId={props.timeZoneId}
          online={props.online}
          active={props.active}
        />
      ) : (
        <div className="msg-thread is-empty">
          <p className="ft-rail-empty">
            {items.length > 0 ? t('messages.inbox.choose') : t('messages.inbox.empty')}
          </p>
        </div>
      )}
    </div>
  );
}

function InboxRow({
  item,
  current,
  reminded,
  waitingMinutes,
  time,
  onPick,
}: {
  readonly item: StaffConversationListItem;
  readonly current: boolean;
  readonly reminded: boolean;
  readonly waitingMinutes: number;
  readonly time: string;
  readonly onPick: () => void;
}) {
  const { t } = useTranslation(['staff', 'common']);
  const unanswered = item.oldestUnansweredGuestMessageUtc !== null;
  const tag = unanswered
    ? reminded
      ? { text: t('messages.inbox.tag.late', { count: waitingMinutes }), tone: 'urgent' }
      : { text: t('messages.inbox.tag.new'), tone: 'new' }
    : item.awaitingGuestAnswer
      ? { text: t('messages.inbox.tag.waiting'), tone: 'waiting' }
      : !item.open
        ? { text: t('messages.inbox.tag.closed'), tone: 'quiet' }
        : { text: t('messages.inbox.tag.answered'), tone: 'quiet' };
  const title = rowTitle(t, item);
  const last = lastLine(t, item);
  // Said in the order it is read, with the pauses the layout gives the eye.
  const name = [
    item.subject.kind === 'reservation'
      ? `${t('table.title', { label: item.subject.label })}, ${title}`
      : title,
    time,
    last,
    tag.text,
  ]
    .filter(Boolean)
    .join(', ');
  return (
    <li>
      <button
        type="button"
        className="msg-row-btn"
        aria-label={name}
        aria-current={current ? 'true' : undefined}
        data-unread={item.unreadFromGuest > 0 ? 'true' : undefined}
        onClick={onPick}
      >
        <span className="msg-badge" data-kind={item.subject.kind} aria-hidden="true">
          {item.subject.kind === 'takeaway' ? 'T' : item.subject.label}
        </span>
        <span className="msg-row-text">
          <span className="msg-row-top">
            <b>{title}</b>
            <span>{time}</span>
          </span>
          <span className="msg-row-last">{last}</span>
          <span className="msg-tag" data-tone={tag.tone}>
            {tag.text}
          </span>
        </span>
      </button>
    </li>
  );
}
