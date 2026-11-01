import type { GuestRecord, StaffTableDetail } from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import { GuestRecordLine } from '../../console/venue/overview/GuestRecordLine';
import { useBranchFormat } from '../useBranchFormat';

/**
 * Beside the next booking: the guest said they are running late or are on
 * their way (the waiter need not call), and a booking made without a
 * verified number, wherever the booking is.
 */
export function BookingFlags({ detail }: { readonly detail: StaffTableDetail | undefined }) {
  const { t } = useTranslation(['staff', 'common']);
  return (
    <>
      {detail?.nextReservationGuestRunningLateMinutes != null ? (
        <span className="badge badge-warn tp-flag">
          {t('floor.card.runningLate', { count: detail.nextReservationGuestRunningLateMinutes })}
        </span>
      ) : detail?.nextReservationGuestConfirmedOnWayAtUtc ? (
        <span className="badge badge-ok tp-flag">{t('preOrders.onTheWay')}</span>
      ) : null}
      {detail?.nextReservationPhoneUnverified ? (
        <span className="badge badge-warn tp-flag">{t('admission.unverified')}</span>
      ) : null}
    </>
  );
}

/**
 * The next booking, as a fact's value: its start — a bare time reads as
 * tonight, so a booking days away is dated (QA 2026-10-16) — its flags, the
 * guest's record, and the guest's promise to free the table under it,
 * smaller, as on the card. A dash with no booking.
 */
export function NextBookingValue({
  bookingStart,
  bookingWhen,
  detail,
  record,
  timeZoneId,
  takenByName,
}: {
  readonly bookingStart: string | null | undefined;
  /** The start, dated when it is not today. */
  readonly bookingWhen: string | null;
  readonly detail: StaffTableDetail | undefined;
  readonly record: GuestRecord | null | undefined;
  readonly timeZoneId: string;
  /** Who took the booking by hand (2026-10-31), when staff did: "Taken by …". */
  readonly takenByName?: string | null | undefined;
}) {
  const { t } = useTranslation(['staff', 'common']);
  const format = useBranchFormat(timeZoneId);
  if (!bookingStart) return <>—</>;
  return (
    <>
      {bookingWhen}
      <BookingFlags detail={detail} />
      {takenByName ? (
        <small className="tp-taker">{t('toCall.takenBy', { name: takenByName })}</small>
      ) : null}
      <GuestRecordLine
        record={record}
        surface="staff"
        timeZoneId={timeZoneId}
        now={new Date()}
        className="tp-record"
      />
      {detail?.nextReservationPromisedFreeByUtc ? (
        <small>
          {t('table.mustFreeBy', { time: format.time(detail.nextReservationPromisedFreeByUtc) })}
        </small>
      ) : null}
    </>
  );
}
