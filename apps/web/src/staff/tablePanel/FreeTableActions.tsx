import type { DuePreOrder, FloorTable, StaffTableDetail, TableActionKind } from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import type { ReactNode } from 'react';
import { useBranchFormat } from '../useBranchFormat';
import { Fact, Facts, Warn } from './panelParts';
import { SeatConfirm } from './SeatConfirm';
import { bookedParty, lateText } from './tablePanelRules';

export interface FreeTableActionsProps {
  readonly table: FloorTable;
  readonly detail: StaffTableDetail | undefined;
  readonly timeZoneId: string;
  readonly room: string | null;
  /** What is still owed on the table's tab, or `null`. */
  readonly balance: number | null;
  /** The next booking, as its fact's value. */
  readonly nextBooking: ReactNode;
  readonly bookingStart: string | null | undefined;
  /** The start, dated when it is not today. */
  readonly bookingWhen: string | null;
  /** The booking is due and its party is not here, and nobody has let it go. */
  readonly lateOpen: boolean;
  readonly lateBy: number | null;
  readonly reservationId: string | null;
  /** "Release the booking", or the question it opens. */
  readonly releaseBooking: ReactNode;
  /** The walk-in stepper is open. */
  readonly seatingWalkIn: boolean;
  readonly partySize: number;
  readonly onPartySize: (size: number) => void;
  readonly onStartWalkIn: () => void;
  readonly onCancelSeating: () => void;
  readonly offerSeatBooking: boolean;
  /** The booking's confirmed pre-order, whose guest is named on "Seat the booking". */
  readonly preOrderParty: DuePreOrder | null;
  readonly onAct: (kind: TableActionKind, input?: { partySize?: number }) => void;
  /** "Book this table" (2026-10-31): a booking by hand with this table chosen. Absent: not offered. */
  readonly onBookTable?: (() => void) | undefined;
}

/** A free table: its facts, then a late booking's choices, the walk-in stepper, or its actions. */
export function FreeTableActions({
  table,
  detail,
  timeZoneId,
  room,
  balance,
  nextBooking,
  bookingStart,
  bookingWhen,
  lateOpen,
  lateBy,
  reservationId,
  releaseBooking,
  seatingWalkIn,
  partySize,
  onPartySize,
  onStartWalkIn,
  onCancelSeating,
  offerSeatBooking,
  preOrderParty,
  onAct,
  onBookTable,
}: FreeTableActionsProps) {
  const { t } = useTranslation(['staff', 'common']);
  const format = useBranchFormat(timeZoneId);
  return (
    <>
      <Facts>
        <Fact label={t('table.fact.seats')}>{table.seats}</Fact>
        <Fact label={t('table.nextBooking')}>{nextBooking}</Fact>
        <Fact label={t('table.fact.room')}>{room ?? '—'}</Fact>
        {balance !== null && balance > 0 ? (
          <Fact label={t('table.balance')} warn>
            {format.dram(balance)}
          </Fact>
        ) : null}
      </Facts>

      {lateOpen ? (
        // A booking whose party has not turned up. Nothing here expires
        // on its own, and nothing here is a default.
        <section className="tp-late" aria-label={t('table.late.title')}>
          <Warn tone="held">
            {t('table.late.body', { time: bookingWhen, late: lateText(t, lateBy ?? 0) })}
          </Warn>
          <div className="tp-acts">
            {reservationId ? (
              <button
                type="button"
                className="tp-btn tp-ok"
                onClick={() => onAct('seatReservation', bookedParty(detail))}
              >
                {t('table.action.seatBooking', { time: bookingWhen })}
              </button>
            ) : null}
            <button type="button" className="tp-btn tp-sec" onClick={() => onAct('hold')}>
              {t('table.action.hold')}
            </button>
            <hr className="tp-sep" />
            {releaseBooking}
          </div>
        </section>
      ) : seatingWalkIn ? (
        <SeatConfirm
          partySize={partySize}
          seats={table.seats}
          onChange={onPartySize}
          warning={
            bookingStart ? t('table.warn.upcoming', { time: format.time(bookingStart) }) : null
          }
          onConfirm={() => onAct('seatWalkIn', { partySize })}
          onCancel={onCancelSeating}
        />
      ) : (
        <>
          {table.state === 'reservedSoon' && bookingStart ? (
            <Warn tone="amber">
              <b>{t('table.warn.bookedAt', { time: format.time(bookingStart) })}</b>{' '}
              {detail?.freeUntilUtc
                ? t('table.warn.freeBy', { time: format.time(detail.freeUntilUtc) })
                : null}
            </Warn>
          ) : null}
          <div className="tp-acts">
            <button type="button" className="tp-btn tp-pri" onClick={onStartWalkIn}>
              {t('table.action.seatWalkIn')}
            </button>
            {offerSeatBooking && bookingStart ? (
              <button
                type="button"
                className="tp-btn tp-sec"
                onClick={() => onAct('seatReservation', bookedParty(detail))}
              >
                {preOrderParty
                  ? t('table.action.seatBookingGuest', {
                      name: preOrderParty.guestName,
                      time: format.time(bookingStart),
                    })
                  : t('table.action.seatBooking', { time: format.time(bookingStart) })}
              </button>
            ) : null}
            <button type="button" className="tp-btn tp-sec" onClick={() => onAct('hold')}>
              {t('table.action.holdLate')}
            </button>
            {/* A booking by hand for this table (2026-10-31): the guest is on the
                phone, or wants to come back later tonight. */}
            {onBookTable ? (
              <button type="button" className="tp-btn tp-sec" onClick={onBookTable}>
                {t('newBooking.bookThisTable')}
              </button>
            ) : null}
            <button type="button" className="tp-btn tp-ghost" onClick={() => onAct('outOfService')}>
              {t('table.action.outOfService')}
            </button>
          </div>
        </>
      )}
    </>
  );
}
