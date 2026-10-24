import { NotFoundError, type ConversationSubjectRef, type MessageHistoryItem } from '@yalla/api';
import { useHistoryConversation } from '@yalla/api/react';
import { branchDayKey, formatTime, type TimeZone } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { useId, type ReactNode, type Ref } from 'react';
import { QueryFailureNotice } from '../../../components/QueryFailureNotice';
import { firstName, messageBody, shortName } from '../../../messages/messageText';
import { dayOf, localDateLabel, threadSubtitle } from './historyText';

export interface HistoryThreadProps {
  readonly subject: ConversationSubjectRef;
  /** The list's row, while the list has it: the name and the outcome before the thread lands. */
  readonly item: MessageHistoryItem | null;
  readonly timeZoneId: string;
  /** The branch's today, `yyyy-MM-dd`. */
  readonly today: string;
  /** The pane's heading: where the focus lands when a guest is opened on a phone. */
  readonly headingRef?: Ref<HTMLHeadingElement> | undefined;
  /** "Back to the list", shown when the panes are stacked. */
  readonly onBack: () => void;
}

/**
 * The History board's right pane: one conversation, read only — who it is
 * about, every message with who at the venue wrote it, the system lines, and
 * the privacy note. No composer: replies go from the tablet.
 *
 * Read once with the console's own session (`useHistoryConversation`): no
 * poll and no read mark, so the tablet's unread counts are left as they are.
 */
export function HistoryThread({
  subject,
  item,
  timeZoneId,
  today,
  headingRef,
  onBack,
}: HistoryThreadProps) {
  const { t } = useTranslation(['admin', 'common']);
  const { locale } = useLocale();
  const titleId = useId();
  const query = useHistoryConversation(subject);
  const thread = query.data ?? null;
  const zone = timeZoneId as TimeZone;

  const guestName = item?.subject.guestName ?? thread?.guestName ?? '';
  const subtitle = threadSubtitle(
    t,
    item
      ? {
          kind: item.subject.kind,
          localDate: item.subject.localDate,
          localTime: item.subject.localTime,
          label: item.subject.label || null,
          outcome: item.subject.outcome,
        }
      : {
          kind: subject.kind,
          localDate: thread?.subject.localDate ?? null,
          localTime: thread?.subject.readyAtLocal ?? thread?.subject.localTime ?? null,
          label:
            (subject.kind === 'takeaway'
              ? thread?.subject.takeawayCode
              : thread?.subject.tableLabel) ?? null,
          outcome: null,
        },
    today,
    locale,
  );
  const localTime = thread?.subject.localTime ?? item?.subject.localTime ?? null;
  const gone =
    (query.isSuccess && thread === null) || (query.isError && query.error instanceof NotFoundError);

  let body;
  if (gone) {
    body = <p className="yc-mh-note">{t('messageHistory.thread.gone')}</p>;
  } else if (query.isError && !thread) {
    body = (
      <div className="yc-mh-note">
        <QueryFailureNotice error={query.error} onRetry={() => void query.refetch()} />
      </div>
    );
  } else if (!thread) {
    body = (
      <p className="yc-mh-note" role="status">
        {t('messageHistory.thread.loading')}
      </p>
    );
  } else if (thread.messages.length === 0) {
    body = <p className="yc-mh-note">{t('messageHistory.thread.empty')}</p>;
  } else {
    const days = thread.messages.map((message) => branchDayKey(message.createdAtUtc, zone));
    const rows = thread.messages.flatMap((message, index) => {
      const day = days[index]!;
      const out: ReactNode[] = [];
      // A line with the day before the first message of each day.
      if (index === 0 || days[index - 1] !== day) {
        const which = dayOf(day, today);
        out.push(
          <li key={`day-${day}`} className="yc-mh-day">
            {which === 'today'
              ? t('messageHistory.day.today')
              : which === 'yesterday'
                ? t('messageHistory.day.yesterday')
                : localDateLabel(day, today, locale)}
          </li>,
        );
      }
      const text = messageBody(t, message, localTime);
      if (message.author === 'system') {
        out.push(
          <li key={message.id} className="yc-mh-sys">
            {text}
          </li>,
        );
        return out;
      }
      const venue = message.author === 'venue';
      const who = venue
        ? message.staffName
          ? firstName(message.staffName)
          : t('messageHistory.thread.venue')
        : firstName(guestName);
      const meta = [
        t('messageHistory.thread.meta', {
          name: who,
          time: formatTime(message.createdAtUtc, zone, locale),
        }),
        message.kind === 'askComing' ? t('messageHistory.thread.askMeta') : null,
      ]
        .filter(Boolean)
        .join(' · ');
      out.push(
        <li key={message.id} className={`yc-mh-msg ${venue ? 'is-venue' : 'is-guest'}`}>
          <p className="yc-mh-bubble">{text}</p>
          <span className="yc-mh-meta">{meta}</span>
        </li>,
      );
      return out;
    });
    body = (
      // Focusable, so a keyboard can scroll a long conversation.
      <div
        className="yc-mh-logbox"
        role="region"
        aria-label={t('messageHistory.thread.messages')}
        tabIndex={0}
      >
        <ol className="yc-mh-log">{rows}</ol>
      </div>
    );
  }

  return (
    <section className="yc-card yc-mh-thread" aria-labelledby={titleId}>
      <div className="yc-mh-thead">
        <button type="button" className="yc-btn yc-btn-sec yc-btn-sm yc-mh-back" onClick={onBack}>
          {t('messageHistory.thread.back')}
        </button>
        <h2 id={titleId} ref={headingRef} tabIndex={-1} className="yc-mh-who">
          {shortName(guestName) || '—'}
        </h2>
        <p className="yc-mh-sub">{subtitle}</p>
      </div>
      {body}
      <p className="yc-mh-privacy">{t('messageHistory.thread.privacy')}</p>
    </section>
  );
}
