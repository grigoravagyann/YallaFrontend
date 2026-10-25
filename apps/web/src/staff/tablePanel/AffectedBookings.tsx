import type { AffectedReservation, ReleaseOutcome } from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import { useBranchFormat } from '../useBranchFormat';
import { Warn } from './panelParts';

/**
 * Bookings stranded by this table going out of service. Time, party size,
 * name, code and a number to call — everything needed to make the call,
 * because nobody is going to look them up on another screen.
 */
export function AffectedBookings({
  bookings,
  timeZoneId,
  online,
  releasing,
  onRelease,
}: {
  readonly bookings: readonly AffectedReservation[];
  readonly timeZoneId: string;
  readonly online: boolean;
  readonly releasing: boolean;
  readonly onRelease: (reservationId: string, outcome: ReleaseOutcome) => void;
}) {
  const { t } = useTranslation(['staff', 'common']);
  const format = useBranchFormat(timeZoneId);
  return (
    <section className="tp-affected" aria-label={t('table.affected.title')}>
      <Warn tone="red">
        <b>{t('table.affected.count', { count: bookings.length })}</b> {t('table.affected.body')}
      </Warn>
      <ul className="tp-affected-list">
        {bookings.map((booking) => (
          <li key={booking.reservationId} className="tp-affected-row">
            <span>
              <b>
                {format.time(booking.startUtc)} · {booking.guestName} ·{' '}
                {t('table.guests', { count: booking.partySize })}
              </b>
              <small>
                <a href={`tel:${booking.guestPhone}`}>{booking.guestPhone}</a> ·{' '}
                {t('table.affected.code', { code: booking.code })}
              </small>
            </span>
            {/* The venue broke the table, so releasing one of these is
            never a no-show. There is one button here and it is the
            forgiving outcome. */}
            <button
              type="button"
              className="tp-btn tp-sec tp-small"
              disabled={!online || releasing}
              onClick={() => onRelease(booking.reservationId, 'guestCancelled')}
            >
              {t('table.affected.release')}
            </button>
          </li>
        ))}
      </ul>
      {!online ? <p className="tp-hint">{t('table.release.needsOnline')}</p> : null}
    </section>
  );
}
