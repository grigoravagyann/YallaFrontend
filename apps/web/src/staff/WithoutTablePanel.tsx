import {
  isStaffTaken,
  type BookingWithoutTable,
  type FloorTable,
  type ReleaseOutcome,
} from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import type { TFunction } from 'i18next';
import { useEffect, useId, useRef, useState } from 'react';
import { GuestRecordLine } from '../console/venue/overview/GuestRecordLine';
import { ICONS, RailSection } from './FloorRail';
import { ReleaseChoice } from './tablePanel/ReleaseChoice';
import { useBranchFormat } from './useBranchFormat';
import { tableChoices, type TableChoice } from './withoutTable';

/**
 * Bookings made by time only, at the door (2026-10-29).
 *
 * At a branch that books by time only the guest chose a time and how many —
 * and maybe said where they would like to sit — but no table. Such a booking
 * is on no table's tile, so it is listed here until somebody seats it: the
 * time, the party, the name, and the guest's wish first of all, because it is
 * the one thing that should decide the table.
 *
 * **Seat** opens the room's free tables, those that fit the party first and
 * the closest fit first of those; the waiter taps one and the booking is
 * seated there through the queue, like any seat — after which it is that
 * table's booking and the floor shows it as any other. Smaller tables are
 * offered after, for a waiter who pushes two together.
 *
 * **Release the booking** asks why, as the table panel does — "they didn't
 * come" goes on the guest's record, "they let us know" does not — and lets
 * it go with no table to free. Online only, as every release is.
 *
 * Only there while a booking waits: a branch that books tables never sees it.
 */
export interface WithoutTableSectionProps {
  /** The bookings to list, soonest first (`arrivingBookings`). */
  readonly bookings: readonly BookingWithoutTable[];
  /** The floor as this tablet draws it, its unsent commands applied. */
  readonly tables: readonly FloorTable[];
  readonly timeZoneId: string;
  readonly now: Date;
  readonly onSeat: (booking: BookingWithoutTable, tableId: string) => void;
  readonly onRelease: (booking: BookingWithoutTable, outcome: ReleaseOutcome) => void;
  /** A release is on its way: no second one meanwhile. */
  readonly releasing: boolean;
  readonly online: boolean;
}

export function WithoutTableSection(props: WithoutTableSectionProps) {
  const { t } = useTranslation(['staff', 'common']);
  const { bookings } = props;
  /** The booking whose tables are open. One at a time: the rail is narrow. */
  const [picking, setPicking] = useState<string | null>(null);

  if (bookings.length === 0) return null;

  return (
    <RailSection
      title={t('withoutTable.title')}
      count={bookings.length}
      tone="waiting"
      icon={ICONS.calendar}
    >
      <ul className="ft-items">
        {bookings.map((booking) => (
          <WithoutTableCard
            key={booking.id}
            booking={booking}
            tables={props.tables}
            timeZoneId={props.timeZoneId}
            now={props.now}
            picking={picking === booking.id}
            onPick={(open) => setPicking(open ? booking.id : null)}
            onSeat={(tableId) => {
              setPicking(null);
              props.onSeat(booking, tableId);
            }}
            onRelease={(outcome) => props.onRelease(booking, outcome)}
            releasing={props.releasing}
            online={props.online}
          />
        ))}
      </ul>
    </RailSection>
  );
}

/** What the guest last said about coming, in the floor card's words; `null` for nothing. */
function arrivalText(
  t: TFunction,
  booking: BookingWithoutTable,
  now: Date,
): { readonly text: string; readonly tone: 'ok' | 'waiting' } | null {
  const late = booking.guestRunningLateMinutes ?? 0;
  if (late > 0) return { text: t('floor.card.runningLate', { count: late }), tone: 'waiting' };
  if (booking.guestConfirmedOnWayAtUtc) return { text: t('floor.card.onTheWay'), tone: 'ok' };
  if (Date.parse(booking.startUtc) <= now.getTime()) {
    return { text: t('phone.nextHour.overdue'), tone: 'waiting' };
  }
  return null;
}

interface WithoutTableCardProps {
  readonly booking: BookingWithoutTable;
  readonly tables: readonly FloorTable[];
  readonly timeZoneId: string;
  readonly now: Date;
  readonly picking: boolean;
  readonly onPick: (open: boolean) => void;
  readonly onSeat: (tableId: string) => void;
  readonly onRelease: (outcome: ReleaseOutcome) => void;
  readonly releasing: boolean;
  readonly online: boolean;
}

function WithoutTableCard({
  booking,
  tables,
  timeZoneId,
  now,
  picking,
  onPick,
  onSeat,
  onRelease,
  releasing,
  online,
}: WithoutTableCardProps) {
  const { t } = useTranslation(['staff', 'common']);
  const format = useBranchFormat(timeZoneId);
  const seatRef = useRef<HTMLButtonElement>(null);
  /**
   * The picker was closed from its own "Not now": the focus goes back to Seat,
   * never to the page's top. Not when another card's Seat closed it — that
   * card's picker has the focus.
   */
  const refocus = useRef(false);
  /** "Why is it being released?" is open in place of the buttons. */
  const [asking, setAsking] = useState(false);
  useEffect(() => {
    if (refocus.current && !picking && !asking) {
      refocus.current = false;
      seatRef.current?.focus({ preventScroll: true });
    }
  }, [picking, asking]);

  const arrival = arrivalText(t, booking, now);
  const party = t('floor.card.party', { count: booking.partySize });

  return (
    <li className="ft-item wt-card" data-reservation-id={booking.id}>
      <div className="ft-item-top">
        <b className="wt-time">{format.time(booking.startUtc)}</b>
        <span>
          {party} · {booking.guestName}
        </span>
        <span className="badge badge-warn">{t('withoutTable.noTable')}</span>
      </div>

      {/* Taken by hand (2026-10-31): whose booking it is, so the right person calls. */}
      {isStaffTaken(booking) && booking.takenByName ? (
        <p className="wt-taker">{t('toCall.takenBy', { name: booking.takenByName })}</p>
      ) : null}

      {/* The wish first: it is what decides the table. */}
      {booking.note ? (
        <p className="wt-wish">
          <span className="wt-wish-label">{t('withoutTable.wish')}</span>{' '}
          <span className="wt-wish-text">
            {t('withoutTable.wishQuote', { text: booking.note })}
          </span>
        </p>
      ) : null}

      {arrival ? (
        <p className="wt-arrival" data-tone={arrival.tone}>
          {arrival.text}
        </p>
      ) : null}
      {booking.phoneUnverified ? (
        <p>
          <span className="badge badge-warn">{t('admission.unverified')}</span>
        </p>
      ) : null}
      <GuestRecordLine
        record={booking.guestRecord}
        surface="staff"
        timeZoneId={timeZoneId}
        now={now}
      />

      {picking ? (
        <TablePicker
          booking={booking}
          tables={tables}
          timeZoneId={timeZoneId}
          onSeat={onSeat}
          onCancel={() => {
            refocus.current = true;
            onPick(false);
          }}
        />
      ) : asking ? (
        <ReleaseChoice
          disabled={releasing || !online}
          onRelease={(outcome) => {
            setAsking(false);
            onRelease(outcome);
          }}
          onCancel={() => {
            refocus.current = true;
            setAsking(false);
          }}
        />
      ) : (
        <>
          <div className="ft-item-actions">
            <button
              ref={seatRef}
              type="button"
              className="ft-btn ft-btn-primary"
              aria-label={t('withoutTable.seatLabel', {
                name: booking.guestName,
                count: booking.partySize,
              })}
              onClick={() => onPick(true)}
            >
              {t('withoutTable.seat')}
            </button>
            <button
              type="button"
              className="ft-btn ft-btn-danger"
              disabled={releasing || !online}
              aria-label={t('withoutTable.releaseLabel', { name: booking.guestName })}
              onClick={() => {
                onPick(false);
                setAsking(true);
              }}
            >
              {t('table.release.ask')}
            </button>
          </div>
          {!online ? <p>{t('table.release.needsOnline')}</p> : null}
        </>
      )}
    </li>
  );
}

interface TablePickerProps {
  readonly booking: BookingWithoutTable;
  readonly tables: readonly FloorTable[];
  readonly timeZoneId: string;
  readonly onSeat: (tableId: string) => void;
  readonly onCancel: () => void;
}

/** The free tables for one booking: those that fit first, then smaller ones. */
function TablePicker({ booking, tables, timeZoneId, onSeat, onCancel }: TablePickerProps) {
  const { t } = useTranslation(['staff', 'common']);
  const titleId = useId();
  const groupRef = useRef<HTMLDivElement>(null);
  const { fit, smaller } = tableChoices(tables, booking.partySize);

  // The picker replaces the button that opened it: the focus follows it there.
  useEffect(() => {
    groupRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div ref={groupRef} className="wt-picker" role="group" aria-labelledby={titleId} tabIndex={-1}>
      <h4 id={titleId}>{t('withoutTable.chooseTitle', { count: booking.partySize })}</h4>
      {fit.length === 0 && smaller.length === 0 ? (
        <p className="wt-picker-empty">{t('withoutTable.noneFree')}</p>
      ) : null}
      {fit.length > 0 ? (
        <TableButtons choices={fit} timeZoneId={timeZoneId} onSeat={onSeat} />
      ) : null}
      {smaller.length > 0 ? (
        <>
          <p className="wt-picker-sub">{t('withoutTable.smaller')}</p>
          <TableButtons choices={smaller} timeZoneId={timeZoneId} onSeat={onSeat} />
        </>
      ) : null}
      <div className="ft-item-actions">
        <button type="button" className="ft-btn ft-btn-secondary" onClick={onCancel}>
          {t('withoutTable.cancel')}
        </button>
      </div>
    </div>
  );
}

function TableButtons({
  choices,
  timeZoneId,
  onSeat,
}: {
  readonly choices: readonly TableChoice[];
  readonly timeZoneId: string;
  readonly onSeat: (tableId: string) => void;
}) {
  const { t } = useTranslation(['staff', 'common']);
  const format = useBranchFormat(timeZoneId);
  return (
    <ul className="wt-tables">
      {choices.map((choice) => {
        const seats = t('table.seats', { count: choice.seats });
        const booked = choice.bookedAtUtc
          ? t('withoutTable.bookedAt', { time: format.time(choice.bookedAtUtc) })
          : null;
        return (
          <li key={choice.tableId}>
            <button
              type="button"
              className="wt-table"
              data-table-id={choice.tableId}
              aria-label={[
                t('table.title', { label: choice.label }),
                seats,
                choice.roomName,
                booked,
              ]
                .filter(Boolean)
                .join(', ')}
              onClick={() => onSeat(choice.tableId)}
            >
              <b aria-hidden="true">{choice.label}</b>
              <span aria-hidden="true">
                {choice.roomName ? t('table.subRoom', { seats, room: choice.roomName }) : seats}
              </span>
              {booked ? (
                <span className="wt-table-booked" aria-hidden="true">
                  {booked}
                </span>
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
