import type { ConversationOutcome, MessageHistoryItem } from '@yalla/api';
import { addLocalDays } from '@yalla/api';
import { formatDram, intlTag, type Locale } from '@yalla/format';
import type { TFunction } from 'i18next';

/**
 * The words of the console's message history (2026-10-24, the History
 * board): the "when" of a row, what it is about, and the thread's subtitle.
 * Every day here is a branch-calendar `yyyy-MM-dd` — the server's `lastLocal`
 * and the subject's `localDate` — so nothing is moved through the reader's
 * own time zone.
 */

const dateFormatters = new Map<string, Intl.DateTimeFormat>();

/** "20 Oct", or "20 Oct 2025" for a day in another year than `today`. */
export function localDateLabel(date: string, today: string, locale: Locale): string {
  const [year, month, day] = date.split('-').map(Number);
  if (!year || !month || !day) return date;
  const withYear = date.slice(0, 4) !== today.slice(0, 4);
  const key = `${locale}|${withYear ? 'y' : ''}`;
  let formatter = dateFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(intlTag(locale), {
      day: 'numeric',
      month: 'short',
      ...(withYear ? { year: 'numeric' } : {}),
      timeZone: 'UTC',
    });
    dateFormatters.set(key, formatter);
  }
  return formatter.format(new Date(Date.UTC(year, month - 1, day)));
}

/** Which of "today", "yesterday" or a date a branch day is. */
export function dayOf(date: string, today: string): 'today' | 'yesterday' | 'other' {
  if (date === today) return 'today';
  if (date === addLocalDays(today, -1)) return 'yesterday';
  return 'other';
}

/** A row's "when": "Today 18:31", "Yesterday 17:10", "20 Oct 13:02" — the last message. */
export function whenLabel(t: TFunction, lastLocal: string, today: string, locale: Locale): string {
  const date = lastLocal.slice(0, 10);
  const time = lastLocal.slice(11, 16);
  switch (dayOf(date, today)) {
    case 'today':
      return t('messageHistory.table.today', { time });
    case 'yesterday':
      return t('messageHistory.table.yesterday', { time });
    default:
      return t('messageHistory.table.dated', { date: localDateLabel(date, today, locale), time });
  }
}

/**
 * A row's "about", in parts: ["Table 6", "19:30", "4 guests"], ["Takeaway
 * T-485", "5 400 ֏"]. The table keeps each part on one line, so a narrow
 * column breaks between parts and never inside "T-485".
 */
export function subjectParts(
  t: TFunction,
  item: MessageHistoryItem,
  locale: Locale,
): readonly string[] {
  const subject = item.subject;
  const parts =
    subject.kind === 'takeaway'
      ? [
          t('messageHistory.table.takeaway', { code: subject.label }),
          subject.totalAmd !== null && Number.isInteger(subject.totalAmd)
            ? formatDram(subject.totalAmd, locale)
            : null,
        ]
      : [
          subject.label ? t('messageHistory.table.table', { label: subject.label }) : null,
          subject.localTime,
          subject.partySize ? t('messageHistory.table.party', { count: subject.partySize }) : null,
        ];
  return parts.filter((part): part is string => Boolean(part));
}

/** The same, as one line: "Table 6 · 19:30 · 4 guests". */
export function subjectLabel(t: TFunction, item: MessageHistoryItem, locale: Locale): string {
  return subjectParts(t, item, locale).join(' · ');
}

/** How the subject ended, in words; `null` when the server did not say. */
export function outcomeLabel(t: TFunction, outcome: ConversationOutcome | null): string | null {
  switch (outcome) {
    case 'came':
    case 'noShow':
    case 'cancelled':
    case 'declined':
    case 'upcoming':
    case 'collected':
    case 'inProgress':
      return t(`messageHistory.outcome.${outcome}`);
    default:
      return null;
  }
}

/** The thread's subtitle, from what is known of its subject. */
export interface ThreadSubjectParts {
  readonly kind: 'reservation' | 'takeaway';
  readonly localDate: string | null;
  readonly localTime: string | null;
  /** The table's label, or the order's code. */
  readonly label: string | null;
  readonly outcome: ConversationOutcome | null;
}

/**
 * "Booking · today 19:30 · table 6 · came", "Takeaway · T-485 · collected" —
 * the design's line under the guest's name.
 */
export function threadSubtitle(
  t: TFunction,
  parts: ThreadSubjectParts,
  today: string,
  locale: Locale,
): string {
  if (parts.kind === 'takeaway') {
    return [t('messageHistory.thread.takeaway'), parts.label, outcomeLabel(t, parts.outcome)]
      .filter(Boolean)
      .join(' · ');
  }
  let when: string | null = null;
  if (parts.localDate && parts.localTime) {
    const time = parts.localTime.slice(0, 5);
    const day = dayOf(parts.localDate, today);
    when =
      day === 'today'
        ? t('messageHistory.thread.today', { time })
        : day === 'yesterday'
          ? t('messageHistory.thread.yesterday', { time })
          : t('messageHistory.thread.dated', {
              date: localDateLabel(parts.localDate, today, locale),
              time,
            });
  } else if (parts.localTime) {
    when = parts.localTime.slice(0, 5);
  }
  return [
    t('messageHistory.thread.booking'),
    when,
    parts.label ? t('messageHistory.thread.table', { label: parts.label }) : null,
    outcomeLabel(t, parts.outcome),
  ]
    .filter(Boolean)
    .join(' · ');
}
