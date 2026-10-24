import {
  MESSAGE_MAX_LENGTH,
  messageFailure,
  messageText,
  messageViolations,
  newCommandId,
  seenByGuest,
  type ConversationMessage,
  type ConversationSubjectRef,
  type StaffConversation,
  type StaffConversationListItem,
} from '@yalla/api';
import {
  useAskOnMyWay,
  useMarkReadWhenSeen,
  useMarkStaffConversationRead,
  useSendStaffMessage,
  useStaffConversation,
} from '@yalla/api/react';
import { useTranslation } from '@yalla/i18n';
import type { TFunction } from 'i18next';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { askFailureText } from '../OnMyWayAsk';
import { useBranchFormat, type BranchFormat } from '../useBranchFormat';
import {
  firstName,
  messageBody,
  messageFailureText,
  rowTitle,
  shortName,
  templateDraft,
  templatesFor,
} from './messageText';

/**
 * One conversation, the Inbox artboard's right pane: who it is about, Call,
 * "Ask: are you coming?" for a booking, the messages with who wrote each
 * venue one, the ready replies and the composer.
 *
 * Everything is online only and never queued: a text that went out minutes
 * after the tap answers a question the guest has moved on from. A refused
 * send gives its text back to the field and says why.
 */
export interface MessageThreadProps {
  readonly branchId: string;
  readonly subject: ConversationSubjectRef;
  /** The inbox's row, while the list has it: the title before the thread's own read lands. */
  readonly item: StaffConversationListItem | null;
  /** The venue's ready replies; `null` for the app's default four. */
  readonly templates: readonly string[] | null;
  /** The branch lets waiters write: which "read only" sentence to say. */
  readonly waitersCanWrite: boolean;
  /** The signed-in person: signs the message while it is on its way. */
  readonly staffName: string;
  readonly timeZoneId: string;
  readonly online: boolean;
  /** The pane is in front: poll, and mark what arrives as read. */
  readonly active: boolean;
}

export function MessageThread({
  branchId,
  subject,
  item,
  templates,
  waitersCanWrite,
  staffName,
  timeZoneId,
  online,
  active,
}: MessageThreadProps) {
  const { t } = useTranslation(['staff', 'common']);
  const format = useBranchFormat(timeZoneId);
  const query = useStaffConversation(subject, { focused: active });
  const thread = query.data ?? null;
  const send = useSendStaffMessage(branchId, staffName);
  const read = useMarkStaffConversationRead(branchId);
  const ask = useAskOnMyWay(branchId);
  const draftId = useId();
  const titleId = useId();
  const field = useRef<HTMLInputElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState('');
  const [failure, setFailure] = useState<string | null>(null);
  const [askNote, setAskNote] = useState<string | null>(null);
  /** The last send that never got an answer: the same text again reuses its id (`wasReplay`). */
  const lost = useRef<{ readonly text: string; readonly id: string } | null>(null);
  /**
   * The reader is at the newest message (or has just sent): what arrives is
   * scrolled to. Scrolled up to read back, they stay there and "New message
   * ↓" says something came.
   */
  const atBottom = useRef(true);
  const [newBelow, setNewBelow] = useState(false);

  const messages = thread?.messages ?? [];
  const lastId = messages.at(-1)?.id ?? null;

  useMarkReadWhenSeen({
    subject,
    unread: thread?.unreadCount ?? 0,
    messages,
    active: active && thread !== null,
    markRead: read.mutate,
  });

  // The newest message in view, as a chat opens and as messages arrive —
  // unless the reader has scrolled up: then the pill, and they stay put.
  const seenLast = useRef<string | null>(null);
  useEffect(() => {
    const element = log.current;
    if (!element) return;
    const arrived = seenLast.current !== null && lastId !== seenLast.current;
    seenLast.current = lastId;
    if (atBottom.current) element.scrollTop = element.scrollHeight;
    else if (arrived) setNewBelow(true);
  }, [lastId, messages.length]);

  function onLogScroll() {
    const element = log.current;
    if (!element) return;
    const near = isNearBottom(element.scrollTop, element.clientHeight, element.scrollHeight);
    atBottom.current = near;
    if (near) setNewBelow(false);
  }

  function toNewest() {
    const element = log.current;
    atBottom.current = true;
    setNewBelow(false);
    if (element) element.scrollTop = element.scrollHeight;
  }

  const guestName = thread?.guestName ?? item?.subject.guestName ?? '';
  // The thread's own `guestPhone`, for Call only and never printed; empty for
  // a platform admin, who gets no Call.
  const phone = thread?.guestPhone.trim() || null;
  const title = item ? rowTitle(t, item) : shortName(guestName);
  const sub = thread ? subjectLine(t, thread, format) : null;
  const badge =
    subject.kind === 'takeaway' ? 'T' : (thread?.subject.tableLabel ?? item?.subject.label ?? '');
  const localTime = thread?.subject.localTime ?? item?.subject.localTime ?? null;

  const open = thread?.open ?? item?.open ?? true;
  const canWrite = Boolean(thread?.canWrite) && open;
  const text = messageText(draft);
  const tooLong = draft.trim().length > MESSAGE_MAX_LENGTH;
  const sendable = canWrite && online && !send.isPending && messageViolations(text).length === 0;

  function onSend(event: FormEvent) {
    event.preventDefault();
    if (!sendable) return;
    const clientCommandId = lost.current?.text === text ? lost.current.id : newCommandId();
    setFailure(null);
    setDraft('');
    // Their own words are always brought into view.
    atBottom.current = true;
    setNewBelow(false);
    send.mutate(
      { subject, text, clientCommandId },
      {
        onSuccess: () => {
          lost.current = null;
        },
        onError: (error) => {
          const kind = messageFailure(error);
          lost.current = kind.kind === 'offline' ? { text, id: clientCommandId } : null;
          // The text comes back to the field, unless something new was typed.
          setDraft((current) => (current === '' ? text : current));
          setFailure(messageFailureText(t, kind));
        },
      },
    );
  }

  function onAsk() {
    if (subject.kind !== 'reservation' || ask.isPending || !online) return;
    setAskNote(null);
    ask.mutate(subject.id, {
      onSuccess: (result) => {
        setAskNote(result.notified ? null : t('onMyWay.notNotified'));
      },
      onError: (error) => setAskNote(askFailureText(t, error, (iso) => format.time(iso))),
    });
  }

  // The latest venue message the guest has read: "seen" under it alone.
  const lastSeenId =
    thread && thread.guestLastReadUtc
      ? ([...messages].reverse().find((message) => seenByGuest(message, thread.guestLastReadUtc))
          ?.id ?? null)
      : null;

  const chips = templatesFor(t, templates, subject.kind);

  return (
    <section className="msg-thread" aria-labelledby={titleId}>
      <div className="msg-thread-head">
        <span className="msg-badge is-big" data-kind={subject.kind} aria-hidden="true">
          {badge}
        </span>
        <div className="msg-thread-who">
          <b id={titleId}>{title}</b>
          {sub ? <span>{sub}</span> : null}
        </div>
        {phone ? (
          <a
            className="ft-btn ft-btn-secondary msg-call"
            href={`tel:${phone.replace(/\s+/gu, '')}`}
            aria-label={t('messages.thread.callLabel', { name: shortName(guestName) })}
          >
            <PhoneIcon />
            {t('messages.thread.call')}
          </a>
        ) : null}
        {subject.kind === 'reservation' && open ? (
          <button
            type="button"
            className="ft-btn ft-btn-primary"
            disabled={!online || ask.isPending || Boolean(thread?.pendingAsk)}
            onClick={onAsk}
          >
            {ask.isPending ? t('onMyWay.asking') : t('onMyWay.ask')}
          </button>
        ) : null}
      </div>
      {thread?.pendingAsk ? (
        <p className="msg-thread-note" role="status">
          {t('messages.thread.askWaiting')}
        </p>
      ) : null}
      {askNote ? (
        <p className="table-warn msg-thread-note" role="alert">
          {askNote}
        </p>
      ) : null}

      <div className="msg-log-wrap">
        <div
          ref={log}
          className="msg-log"
          role="log"
          aria-live="polite"
          aria-label={t('messages.thread.log')}
          onScroll={onLogScroll}
        >
          {query.isError && !thread ? (
            <p className="ft-rail-empty is-failed">{t('messages.thread.unreachable')}</p>
          ) : query.isSuccess && thread === null ? (
            <p className="ft-rail-empty">{t('messages.thread.gone')}</p>
          ) : !thread ? (
            <p className="ft-rail-empty">{t('floor.loading')}</p>
          ) : (
            messages.map((message) => {
              const body = messageBody(t, message, localTime);
              const key = messageKey(message);
              if (message.author === 'system') {
                return (
                  <p key={key} className="msg-system">
                    {body}
                  </p>
                );
              }
              const venue = message.author === 'venue';
              const who = venue
                ? message.staffName
                  ? firstName(message.staffName)
                  : t('messages.thread.venue')
                : firstName(guestName);
              const meta = [
                t('messages.thread.meta', { name: who, time: format.time(message.createdAtUtc) }),
                message.kind === 'askComing' ? t('messages.thread.askMeta') : null,
                message.pending ? t('messages.thread.sending') : null,
                message.id === lastSeenId ? t('messages.thread.seen') : null,
              ]
                .filter(Boolean)
                .join(' · ');
              return (
                <div
                  key={key}
                  className={`msg-row ${venue ? 'is-venue' : 'is-guest'}`}
                  data-pending={message.pending ? 'true' : undefined}
                >
                  <div className={`msg-bubble${message.kind === 'askComing' ? ' is-ask' : ''}`}>
                    {body}
                  </div>
                  <span className="msg-meta">{meta}</span>
                </div>
              );
            })
          )}
        </div>
        {newBelow ? (
          <button
            type="button"
            className="ft-btn ft-btn-primary msg-new-below"
            aria-label={t('messages.thread.newMessageLabel')}
            onClick={toNewest}
          >
            {t('messages.thread.newMessage')}
          </button>
        ) : null}
      </div>

      <div className="msg-compose">
        {!thread ? null : !open ? (
          <p className="msg-closed">{t('messages.thread.closed')}</p>
        ) : !thread.canWrite ? (
          <p className="msg-closed">
            {waitersCanWrite ? t('messages.thread.readOnly') : t('messages.thread.readOnlyWaiters')}
          </p>
        ) : (
          <>
            {chips.length > 0 ? (
              <div className="msg-chips" role="group" aria-label={t('messages.thread.templates')}>
                {chips.map((chip, index) => (
                  <button
                    key={`${index}-${chip}`}
                    type="button"
                    className="msg-chip"
                    onClick={() => {
                      setDraft(templateDraft(chip));
                      setFailure(null);
                      field.current?.focus();
                    }}
                  >
                    {chip}
                  </button>
                ))}
              </div>
            ) : null}
            <form className="msg-form" onSubmit={onSend}>
              <label htmlFor={draftId} className="visually-hidden">
                {t('messages.thread.draftLabel')}
              </label>
              <input
                ref={field}
                id={draftId}
                type="text"
                className="msg-input"
                maxLength={MESSAGE_MAX_LENGTH}
                autoComplete="off"
                value={draft}
                aria-invalid={tooLong || undefined}
                placeholder={t('messages.thread.placeholder', { name: firstName(guestName) })}
                onChange={(event) => {
                  setDraft(event.target.value);
                  if (failure) setFailure(null);
                }}
              />
              <button type="submit" className="ft-btn ft-btn-primary msg-send" disabled={!sendable}>
                {t('messages.thread.send')}
              </button>
            </form>
            {failure ? (
              <p className="table-warn" role="alert">
                {failure}
              </p>
            ) : !online ? (
              <p className="table-note">{t('messages.thread.needsOnline')}</p>
            ) : null}
            <p className="msg-hint">{t('messages.thread.hint')}</p>
          </>
        )}
      </div>
    </section>
  );
}

/** Within this many pixels of the end counts as at the newest message. */
const NEAR_BOTTOM_PX = 80;

/** The log is scrolled to (about) its end. */
export function isNearBottom(
  scrollTop: number,
  viewHeight: number,
  contentHeight: number,
): boolean {
  return contentHeight - (scrollTop + viewHeight) <= NEAR_BOTTOM_PX;
}

/**
 * A message's React key, the same from its pending bubble to the server's
 * message and every read after: the send's `clientCommandId`, which the cache
 * keeps on the settled message (`settleSentMessage`, `carryClientCommandIds`),
 * else the message's id. A changed key would remount the bubble, and the log's
 * live region would say the person's own words again.
 */
export function messageKey(message: Pick<ConversationMessage, 'id' | 'clientCommandId'>): string {
  return message.clientCommandId ? `cmd:${message.clientCommandId}` : message.id;
}

/** "Table 6 · today 19:30 · 4 guests", "Takeaway · ready 19:25". */
function subjectLine(t: TFunction, thread: StaffConversation, format: BranchFormat): string {
  const subject = thread.subject;
  if (subject.kind === 'takeaway') {
    return [
      t('messages.thread.takeaway'),
      subject.readyAtLocal
        ? t('messages.thread.readyAt', { time: subject.readyAtLocal.slice(0, 5) })
        : null,
    ]
      .filter(Boolean)
      .join(' · ');
  }
  let when: string | null = null;
  if (subject.startUtc) {
    const at = format.dayAndTime(subject.startUtc);
    when =
      at.day === 'today'
        ? t('messages.thread.today', { time: at.time })
        : at.day === 'tomorrow'
          ? t('messages.thread.tomorrow', { time: at.time })
          : t('messages.thread.dated', { date: at.date, time: at.time });
  } else if (subject.localTime) {
    when = subject.localTime.slice(0, 5);
  }
  return [
    subject.tableLabel ? t('table.title', { label: subject.tableLabel }) : null,
    when,
    subject.partySize ? t('messages.thread.party', { count: subject.partySize }) : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

function PhoneIcon() {
  return (
    <svg
      className="ft-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 4h4l2 5-3 2a11 11 0 0 0 5 5l2-3 5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />
    </svg>
  );
}
