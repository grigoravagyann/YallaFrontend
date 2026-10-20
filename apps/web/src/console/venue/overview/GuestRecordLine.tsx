import { guestRecordStanding, type GuestRecord, type GuestRecordStanding } from '@yalla/api';
import { formatDayAndTime, type TimeZone } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import type { ReactNode } from 'react';
import { AlertCircleIcon, CheckIcon, LockIcon, UserIcon } from '../../ui/icons';

/**
 * One count of a record as the line says it, in the order a host reads them:
 * how many, how many came, how many did not. A late cancellation and a booking
 * nobody marked are said only when there is one: a "0 late cancellations" on
 * every card is noise a waiter learns to skip, and then skips the one that
 * matters.
 */
export interface GuestRecordPart {
  readonly kind: 'booked' | 'came' | 'noShows' | 'late' | 'unmarked';
  readonly count: number;
}

export function guestRecordParts(record: GuestRecord): readonly GuestRecordPart[] {
  const parts: GuestRecordPart[] = [
    { kind: 'booked', count: record.booked },
    { kind: 'came', count: record.came },
    { kind: 'noShows', count: record.noShows },
  ];
  if (record.lateCancellations > 0) parts.push({ kind: 'late', count: record.lateCancellations });
  // `unmarked` came with the review round; a server before it does not say.
  if ((record.unmarked ?? 0) > 0) parts.push({ kind: 'unmarked', count: record.unmarked });
  return parts;
}

const ICON: Readonly<Record<GuestRecordStanding, (props: { className: string }) => ReactNode>> = {
  blocked: LockIcon,
  missed: AlertCircleIcon,
  good: CheckIcon,
  new: UserIcon,
  plain: UserIcon,
};

/**
 * How the guest kept their bookings — twelve months, every venue, counts only
 * — beside a booking the venue decides on or watches for: «12 bookings · 11
 * came · 1 no-show», a neutral "New guest", or "Blocked until …" first when
 * three no-shows in three days blocked them.
 *
 * Shared by the floor tablet and the console, each in its own words
 * (`staff:guestRecord.*`, `admin:guestRecord.*`) and its own classes. Never
 * colour alone: the standing has an icon, the no-show count its own words,
 * and a screen reader hears what the line is before the numbers. Nothing at
 * all when no proved account is behind the booking — that is not a new guest,
 * it is a guest nobody can vouch for either way.
 */
export function GuestRecordLine({
  record,
  surface,
  timeZoneId,
  now,
  className = '',
}: {
  readonly record: GuestRecord | null | undefined;
  readonly surface: 'staff' | 'admin';
  /** The branch's zone: a block ends at the branch's time, not the device's. */
  readonly timeZoneId: string;
  readonly now: Date;
  readonly className?: string;
}) {
  const { t } = useTranslation([surface, 'common']);
  const { locale } = useLocale();
  if (!record) return null;

  const standing = guestRecordStanding(record, now);
  const Icon = ICON[standing];
  const say = (key: string, options: Record<string, unknown> = {}) =>
    t(`${surface}:guestRecord.${key}`, options);
  const blockedUntil =
    standing === 'blocked' && record.blockedUntilUtc
      ? formatDayAndTime(record.blockedUntilUtc, timeZoneId as TimeZone, locale)
      : null;

  return (
    <p className={`guest-record is-${standing} ${className}`.trim()}>
      <span className={surface === 'staff' ? 'visually-hidden' : 'yc-sr'}>{say('label')} </span>
      <Icon className="guest-record-i" />
      {blockedUntil ? (
        <>
          <b className="guest-record-blocked">
            {say('blockedUntil', { date: blockedUntil.date, time: blockedUntil.time })}
          </b>
          {' · '}
        </>
      ) : null}
      {record.isNewGuest
        ? say('newGuest')
        : guestRecordParts(record).map((part, index) => (
            <span key={part.kind}>
              {index > 0 ? ' · ' : null}
              {part.kind === 'noShows' && part.count > 0 ? (
                <span className="is-missed">{say(part.kind, { count: part.count })}</span>
              ) : (
                say(part.kind, { count: part.count })
              )}
            </span>
          ))}
    </p>
  );
}
