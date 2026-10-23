import type { ConversationSubject } from '@yalla/api';
import { YEREVAN, branchDayKey, formatDayAndTime, formatTime, type TimeZone } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { useCallback, useMemo } from 'react';
import { usePlace } from '../places/hooks';
import { formatClock } from '../places/model';
import { isOwnText, type MessageBody } from './copy';

/**
 * The clock a thread is read on: the branch's, never the phone's — a guest in
 * Moscow reading about a table in Yerevan reads Yerevan's 19:30. Every time
 * here goes through `@yalla/format` (the polyfilled `Intl` on Hermes).
 */
export function useThreadFormat(branchId: string | null | undefined) {
  const { t } = useTranslation('diner');
  const { locale } = useLocale();
  const { data: place } = usePlace(branchId ?? undefined);
  const zone: TimeZone = place?.timeZoneId ?? YEREVAN;

  /** An instant's `19:30`, on the branch's clock. */
  const time = useCallback((utc: string) => formatTime(utc, zone, locale), [zone, locale]);
  /** A wall-clock `HH:mm` the server wrote, as the locale writes it. */
  const clock = useCallback(
    (hhmm: string) => {
      try {
        return formatClock(hhmm, locale);
      } catch {
        return hhmm;
      }
    },
    [locale],
  );
  /** A bubble's words, in this language. */
  const say = useCallback(
    (body: MessageBody | null): string =>
      body === null
        ? ''
        : isOwnText(body)
          ? body.text
          : body.params
            ? t(body.key, body.params)
            : t(body.key),
    [t],
  );
  /** "Today", "Yesterday" or "Sun 18 Oct": a thread's day chip, on the branch's calendar. */
  const day = useCallback(
    (utc: string, now: Date) => {
      const key = branchDayKey(utc, zone);
      if (key === branchDayKey(now, zone)) return t('messages.day.today');
      if (key === branchDayKey(new Date(now.getTime() - 24 * 3_600_000), zone)) {
        return t('messages.day.yesterday');
      }
      return formatDayAndTime(utc, zone, locale, now).date;
    },
    [zone, locale, t],
  );

  return useMemo(
    () => ({ zone, locale, time, clock, say, day }),
    [zone, locale, time, clock, say, day],
  );
}

/**
 * The subject under the venue's name: "Booking · today 19:30 · 4 guests ·
 * table 6", "Takeaway · T-482 · ready 19:10", and "finished" once the thread
 * has closed.
 */
export function useSubjectLine(
  subject: ConversationSubject | null | undefined,
  open: boolean,
  now: Date,
): string {
  const { t } = useTranslation('diner');
  const format = useThreadFormat(subject?.branchId);
  if (!subject) return '';
  const parts: string[] = [];
  if (subject.kind === 'takeaway') {
    parts.push(t('messages.subject.takeaway'));
    if (subject.takeawayCode) parts.push(subject.takeawayCode);
    if (subject.readyAtLocal && open) {
      parts.push(t('messages.subject.ready', { time: format.clock(subject.readyAtLocal) }));
    }
  } else {
    parts.push(t('messages.subject.booking'));
    if (subject.startUtc) {
      const moment = formatDayAndTime(subject.startUtc, format.zone, format.locale, now);
      const day =
        moment.day === 'today'
          ? t('messages.subject.today')
          : moment.day === 'tomorrow'
            ? t('messages.subject.tomorrow')
            : moment.date;
      parts.push(`${day} ${moment.time}`);
    } else if (subject.localTime) {
      parts.push(format.clock(subject.localTime));
    }
    if (open && subject.partySize) {
      parts.push(t('messages.subject.guests', { count: subject.partySize }));
    }
    if (open && subject.tableLabel) {
      parts.push(t('messages.subject.table', { label: subject.tableLabel }));
    }
  }
  if (!open) parts.push(t('messages.subject.ended'));
  return parts.join(' · ');
}
