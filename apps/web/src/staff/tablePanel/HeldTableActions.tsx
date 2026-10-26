import type { FloorTable, StaffTableDetail, TableActionKind } from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import type { ReactNode } from 'react';
import { Fact, Facts, Warn } from './panelParts';
import { SeatConfirm } from './SeatConfirm';
import { lateText } from './tablePanelRules';

export interface HeldTableActionsProps {
  readonly table: FloorTable;
  readonly detail: StaffTableDetail | undefined;
  readonly room: string | null;
  /** Minutes the booking is late, once it is due. */
  readonly lateBy: number | null;
  readonly reservationId: string | null;
  /** The start, dated when it is not today. */
  readonly bookingWhen: string | null;
  /** The next booking's flags, beside its start. */
  readonly bookingFlags: ReactNode;
  /** "Release the booking", or the question it opens. */
  readonly releaseBooking: ReactNode;
  /** The held party's stepper is open. */
  readonly seatingHeld: boolean;
  readonly partySize: number;
  readonly onPartySize: (size: number) => void;
  readonly onStartHeld: (size: number) => void;
  readonly onCancelSeating: () => void;
  readonly onAct: (kind: TableActionKind, input?: { partySize?: number }) => void;
}

/** A held table: why, for whom, and seating the party, letting the booking go or the hold. */
export function HeldTableActions({
  table,
  detail,
  room,
  lateBy,
  reservationId,
  bookingWhen,
  bookingFlags,
  releaseBooking,
  seatingHeld,
  partySize,
  onPartySize,
  onStartHeld,
  onCancelSeating,
  onAct,
}: HeldTableActionsProps) {
  const { t } = useTranslation(['staff', 'common']);
  return (
    <>
      {lateBy !== null && reservationId ? (
        <Warn tone="held">
          <b>{t('table.held.title')}</b>{' '}
          {t('table.held.body', { time: bookingWhen, late: lateText(t, lateBy) })}
        </Warn>
      ) : (
        <Warn tone="held">{t('table.held.kept')}</Warn>
      )}
      <Facts>
        <Fact label={t('table.fact.booked')}>
          {bookingWhen ?? '—'}
          {bookingWhen ? bookingFlags : null}
        </Fact>
        <Fact label={t('table.party')}>{detail?.nextReservationPartySize ?? '—'}</Fact>
        <Fact label={t('table.fact.room')}>{room ?? '—'}</Fact>
      </Facts>
      {seatingHeld ? (
        <SeatConfirm
          partySize={partySize}
          seats={table.seats}
          onChange={onPartySize}
          warning={null}
          onConfirm={() => onAct('seatHeldParty', { partySize })}
          onCancel={onCancelSeating}
        />
      ) : (
        <div className="tp-acts">
          <button
            type="button"
            className="tp-btn tp-ok"
            onClick={() =>
              onStartHeld(
                (lateBy !== null ? detail?.nextReservationPartySize : null) ??
                  Math.min(2, table.seats),
              )
            }
          >
            {t('table.action.seatHeld')}
          </button>
          <hr className="tp-sep" />
          {lateBy !== null && reservationId ? releaseBooking : null}
          {/* The hold alone, with no verdict on the booking: a queued
          table command, so it works offline as it always has. */}
          <button type="button" className="tp-btn tp-ghost" onClick={() => onAct('releaseHold')}>
            {t('table.action.releaseHold')}
          </button>
        </div>
      )}
    </>
  );
}
