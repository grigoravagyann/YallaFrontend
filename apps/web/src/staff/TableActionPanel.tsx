import type {
  AffectedReservation,
  DerivedTableState,
  FloorTable,
  ReleaseOutcome,
  StaffTab,
  StaffTableDetail,
  TableActionKind,
  TableStatus,
} from '@yalla/api';
import type { DayAndTime } from '@yalla/format';
import { useTranslation } from '@yalla/i18n';
import type { TFunction } from 'i18next';
import { useEffect, useRef, useState } from 'react';
import { nextBookingLine } from './approvalRequests';
import { useBranchFormat } from './useBranchFormat';

/**
 * What a waiter does to a table, beside the table.
 *
 * Beside the table list with the floor still on screen, because a waiter is
 * looking at the room and not at a form: a full-screen sheet would hide the
 * two tables they are deciding between. The selected row stays marked and the
 * panel is titled with the table, so there is never a question of which table
 * the buttons belong to.
 *
 * Only the actions that are legal from this table's state are rendered. Not
 * greyed out — absent. A disabled control on a counter screen is something a
 * waiter presses twice and then distrusts, and "free table" on a table that is
 * already free is not an action, it is a puzzle.
 */

export interface TableActionPanelProps {
  readonly table: FloorTable;
  readonly detail: StaffTableDetail | undefined;
  readonly timeZoneId: string;
  /**
   * The status this table will be in once everything queued for it has been
   * sent — the server's status with the pending commands applied.
   *
   * Not the server's own status. A table seated offline is *drawn* occupied by
   * the optimistic overlay, and a panel that reads the server's `free` would
   * then offer "seat a walk-in" on a table it is calling occupied two lines
   * above. The waiter would seat it twice.
   */
  readonly projectedStatus: TableStatus | null;
  /** The tab on this table, when one is known. Drives the balance line. */
  readonly tab: StaffTab | null;
  /** True while a command for this table is still queued. */
  readonly pending: boolean;
  readonly online: boolean;
  /**
   * Bookings this table still has tonight, reported by the server when it was
   * marked out of service.
   *
   * Surfaced, never cancelled automatically. A broken table is the venue's
   * doing; somebody has to phone these people, and the phone number is the
   * whole reason the list exists.
   */
  readonly affectedReservations: readonly AffectedReservation[];
  readonly onAct: (kind: TableActionKind, input?: { partySize?: number }) => void;
  /** Let a booking go, with the outcome the waiter chose. Never a default. */
  readonly onRelease: (reservationId: string, outcome: ReleaseOutcome) => void;
  readonly releasing: boolean;
  /** Show the tab that is open on this table. */
  readonly onOpenTab: () => void;
  /** Start a tab for a seated party that is not going to scan. Online only. */
  readonly onStartTab: () => void;
  readonly startingTab: boolean;
  readonly onOrder: () => void;
  readonly onClose: () => void;
}

export function TableActionPanel(props: TableActionPanelProps) {
  const { table, detail, tab, timeZoneId, pending, online, onAct, onRelease, onClose } = props;
  const { t } = useTranslation(['staff', 'common']);
  const format = useBranchFormat(timeZoneId);

  const [seating, setSeating] = useState<false | 'walkIn' | 'heldParty'>(false);
  const [partySize, setPartySize] = useState(2);
  const [confirmFree, setConfirmFree] = useState(false);
  /**
   * The booking has been released, so this device stops offering to hold it and
   * the table's ordinary actions come back. Optimistic only: the floor refetch
   * behind it is what makes it true.
   */
  const [bookingLetGo, setBookingLetGo] = useState(false);

  const status: TableStatus =
    props.projectedStatus ?? detail?.physicalStatus ?? physicalFrom(table.state);
  const balance = tab && tab.status !== 'closed' ? tab.totals.remainingDram : null;

  // Into the panel when it opens, or opens on another table: otherwise its
  // actions are after every remaining row in the tab order (QA 2026-10-16).
  const panelRef = useRef<HTMLElement>(null);
  useEffect(() => {
    panelRef.current?.focus();
  }, [table.id]);

  const bookingStart = detail?.nextReservationStartUtc ?? table.nextReservationStartUtc;
  const bookingLate =
    bookingStart !== null &&
    bookingStart !== undefined &&
    status === 'free' &&
    format.minutesSince(bookingStart) > 0;

  const seatedMinutes = detail?.seatedAtUtc ? format.minutesSince(detail.seatedAtUtc) : null;

  return (
    <aside
      ref={panelRef}
      className="table-panel"
      role="dialog"
      aria-label={t('table.panelLabel', { label: table.label })}
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || event.defaultPrevented) return;
        event.preventDefault();
        onClose();
      }}
    >
      <header className="table-panel-head">
        <div>
          <h2>{t('table.title', { label: table.label })}</h2>
          <p className="table-panel-state">
            {t(`common:tableStatus.${table.state}`)}
            {' · '}
            {t('table.seats', { count: table.seats })}
          </p>
        </div>
        <button
          type="button"
          className="icon-button"
          onClick={onClose}
          aria-label={t('common:action.close')}
        >
          ✕
        </button>
      </header>

      {/* Context: what a waiter needs before choosing, and nothing else. */}
      <dl className="table-facts">
        {seatedMinutes !== null && seatedMinutes >= 0 ? (
          <div>
            <dt>{t('table.seatedFor')}</dt>
            {/* The party sitting here promised to be gone by a time: said with it. */}
            <dd>
              {nextBookingLine(
                t,
                t('table.minutes', { count: seatedMinutes }),
                detail?.sittingPromisedFreeByUtc,
                format.time,
              )}
            </dd>
          </div>
        ) : null}
        {detail?.partySize ? (
          <div>
            <dt>{t('table.party')}</dt>
            <dd>{t('table.guests', { count: detail.partySize })}</dd>
          </div>
        ) : null}
        {bookingStart && !bookingLate ? (
          <div>
            <dt>{t('table.nextBooking')}</dt>
            {/* A bare time reads as tonight; a booking days away said so is
                how a waiter seats nobody over it (QA 2026-10-16). */}
            <dd>
              {nextBookingLine(
                t,
                nextBookingText(t, format.dayAndTime(bookingStart)),
                detail?.nextReservationPromisedFreeByUtc,
                format.time,
              )}
            </dd>
          </div>
        ) : null}
        {balance !== null && balance > 0 ? (
          <div>
            <dt>{t('table.balance')}</dt>
            <dd className="table-balance">{format.dram(balance)}</dd>
          </div>
        ) : null}
      </dl>

      {pending ? <p className="table-pending">{t('table.pendingHere')}</p> : null}

      {/* A booking whose party has not turned up. Nothing here expires on its
          own, and nothing here is a default. */}
      {bookingLate && !bookingLetGo ? (
        <section className="table-late" aria-label={t('table.late.title')}>
          <p className="table-late-line">
            {t('table.late.body', {
              time: format.time(bookingStart),
              until: detail?.freeUntilUtc ? format.time(detail.freeUntilUtc) : '—',
            })}
          </p>
          <div className="table-late-actions">
            <button type="button" className="floor-button big" onClick={() => onAct('hold')}>
              {t('table.action.hold')}
            </button>
          </div>

          {/*
            Two release buttons, deliberately identical in weight.

            One of them puts a no-show on somebody's record and the other does
            not, and that is the entire difference between them. Make either one
            the obvious default — bigger, primary-coloured, first under the thumb
            — and it gets tapped for both cases within a week, at which point the
            no-show threshold starts punishing the people who phoned to cancel.
            So: same class, same size, side by side, and one line underneath
            saying what separates them.
          */}
          {detail?.nextReservationId ? (
            <>
              <div className="table-release-pair">
                <button
                  type="button"
                  className="button big"
                  disabled={!online || props.releasing}
                  onClick={() => {
                    onRelease(detail.nextReservationId!, 'noShow');
                    setBookingLetGo(true);
                  }}
                >
                  {t('table.release.noShow')}
                </button>
                <button
                  type="button"
                  className="button big"
                  disabled={!online || props.releasing}
                  onClick={() => {
                    onRelease(detail.nextReservationId!, 'guestCancelled');
                    setBookingLetGo(true);
                  }}
                >
                  {t('table.release.cancelled')}
                </button>
              </div>
              <p className="table-note">{t('table.release.difference')}</p>
              {!online ? <p className="table-note">{t('table.release.needsOnline')}</p> : null}
            </>
          ) : (
            <p className="table-note">{t('table.late.noBookingId')}</p>
          )}
        </section>
      ) : null}

      {/* Bookings stranded by this table going out of service. Time, party
          size, name, code and a number to call — everything needed to make the
          call, because nobody is going to look them up on another screen. */}
      {props.affectedReservations.length > 0 ? (
        <section className="table-affected" aria-label={t('table.affected.title')}>
          <h3>{t('table.affected.title')}</h3>
          <p className="table-warn">{t('table.affected.body')}</p>
          <ul className="affected-list">
            {props.affectedReservations.map((booking) => (
              <li key={booking.reservationId} className="affected-row">
                <p className="affected-who">
                  <strong>{format.time(booking.startUtc)}</strong> ·{' '}
                  {t('table.guests', { count: booking.partySize })} · {booking.guestName}
                </p>
                <p className="affected-contact">
                  <a href={`tel:${booking.guestPhone}`}>{booking.guestPhone}</a> ·{' '}
                  {t('table.affected.code', { code: booking.code })}
                </p>
                {/* The venue broke the table, so releasing one of these is
                    never a no-show. There is one button here and it is the
                    forgiving outcome. */}
                <button
                  type="button"
                  className="button"
                  disabled={!online || props.releasing}
                  onClick={() => onRelease(booking.reservationId, 'guestCancelled')}
                >
                  {t('table.affected.release')}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* --- Free ----------------------------------------------------------- */}
      {status === 'free' && !(bookingLate && !bookingLetGo) ? (
        seating === 'walkIn' ? (
          <SeatConfirm
            partySize={partySize}
            seats={table.seats}
            onChange={setPartySize}
            warning={
              bookingStart ? t('table.warn.upcoming', { time: format.time(bookingStart) }) : null
            }
            confirmLabel={t('table.action.seatConfirm', { count: partySize })}
            onConfirm={() => onAct('seatWalkIn', { partySize })}
            onCancel={() => setSeating(false)}
          />
        ) : (
          <div className="table-actions">
            <button
              type="button"
              className="floor-button big"
              onClick={() => {
                setPartySize(Math.min(2, table.seats));
                setSeating('walkIn');
              }}
            >
              {t('table.action.seatWalkIn')}
            </button>
            <button type="button" className="button big" onClick={() => onAct('hold')}>
              {t('table.action.holdLate')}
            </button>
            <button
              type="button"
              className="button big danger-spaced"
              onClick={() => onAct('outOfService')}
            >
              {t('table.action.outOfService')}
            </button>
          </div>
        )
      ) : null}

      {/* --- Held ----------------------------------------------------------- */}
      {status === 'held' ? (
        seating === 'heldParty' ? (
          <SeatConfirm
            partySize={partySize}
            seats={table.seats}
            onChange={setPartySize}
            warning={null}
            confirmLabel={t('table.action.seatConfirm', { count: partySize })}
            onConfirm={() =>
              onAct('seatHeldParty', {
                partySize,
              })
            }
            onCancel={() => setSeating(false)}
          />
        ) : (
          <div className="table-actions">
            <button
              type="button"
              className="floor-button big"
              onClick={() => {
                setPartySize(Math.min(2, table.seats));
                setSeating('heldParty');
              }}
            >
              {t('table.action.seatHeld')}
            </button>
            <button type="button" className="button big" onClick={() => onAct('releaseHold')}>
              {t('table.action.releaseHold')}
            </button>
          </div>
        )
      ) : null}

      {/* --- Occupied -------------------------------------------------------- */}
      {status === 'occupied' ? (
        confirmFree ? (
          <section className="table-confirm">
            {/* The warning is impossible to miss and impossible to be stopped
                by: the diners have physically left, and a floor plan that
                refuses to admit it is a floor plan nobody trusts. */}
            {balance !== null && balance > 0 ? (
              <p className="table-warn">
                {t('table.warn.balance', { amount: format.dram(balance) })}
              </p>
            ) : null}
            <p className="table-note">{t('table.free.note')}</p>
            <div className="table-actions">
              <button type="button" className="floor-button big" onClick={() => onAct('freeTable')}>
                {t('table.action.freeConfirm')}
              </button>
              <button type="button" className="button big" onClick={() => setConfirmFree(false)}>
                {t('common:action.cancel')}
              </button>
            </div>
          </section>
        ) : (
          <div className="table-actions">
            {/* Orders need a tab. A guest opens one by scanning; for a party
                that will not, the waiter starts one here. Online only — it is
                not a floor command the tablet queues — and not while this
                table's seating is itself still waiting to sync, because the
                server has nobody seated there to bill yet. */}
            {detail && detail.openTabId === null ? (
              <>
                <p className="table-warn">{t('table.noTab')}</p>
                <p className="table-note">{t('table.noTabWhy')}</p>
                <button
                  type="button"
                  className="floor-button big"
                  onClick={props.onStartTab}
                  disabled={!online || pending || props.startingTab}
                >
                  {props.startingTab ? t('table.action.startingTab') : t('table.action.startTab')}
                </button>
                {!online ? <p className="table-note">{t('table.startTabNeedsOnline')}</p> : null}
              </>
            ) : (
              <>
                <button type="button" className="floor-button big" onClick={props.onOrder}>
                  {t('table.action.takeOrder')}
                </button>
                <button type="button" className="button big" onClick={props.onOpenTab}>
                  {t('table.action.openTab')}
                </button>
              </>
            )}
            {/* Destructive, so it is separated from the two above rather than
                sitting under the thumb that just tapped "take an order". */}
            <button
              type="button"
              className="button big danger-spaced"
              onClick={() => setConfirmFree(true)}
            >
              {t('table.action.free')}
            </button>
          </div>
        )
      ) : null}

      {/* --- Out of service --------------------------------------------------- */}
      {status === 'outOfService' ? (
        <div className="table-actions">
          <button
            type="button"
            className="floor-button big"
            onClick={() => onAct('returnToService')}
          >
            {t('table.action.returnToService')}
          </button>
        </div>
      ) : null}

      {!online ? <p className="table-note">{t('table.offlineNote')}</p> : null}
    </aside>
  );
}

interface SeatConfirmProps {
  readonly partySize: number;
  readonly seats: number;
  readonly onChange: (next: number) => void;
  readonly warning: string | null;
  readonly confirmLabel: string;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

/**
 * A party-size stepper and a confirm. Nothing else.
 *
 * No keyboard, no dropdown, no name field. Seating is the most frequent action
 * on this screen and every control that is not the number of people is a
 * control a waiter has to skip past while holding two plates.
 *
 * The stepper is not capped at the table's seat count. Five people do sit at a
 * four-top, and a client rule stricter than the server's teaches the floor to
 * lie about party sizes to get past it.
 */
function SeatConfirm({
  partySize,
  seats,
  onChange,
  warning,
  confirmLabel,
  onConfirm,
  onCancel,
}: SeatConfirmProps) {
  const { t } = useTranslation(['staff', 'common']);

  return (
    <section className="table-confirm">
      <div className="stepper" role="group" aria-label={t('table.partySize')}>
        <button
          type="button"
          className="stepper-button"
          onClick={() => onChange(Math.max(1, partySize - 1))}
          aria-label={t('table.fewer')}
        >
          −
        </button>
        <output className="stepper-value">{partySize}</output>
        <button
          type="button"
          className="stepper-button"
          onClick={() => onChange(partySize + 1)}
          aria-label={t('table.more')}
        >
          +
        </button>
      </div>
      <p className="table-note">{t('table.seatsHint', { count: seats })}</p>

      {warning ? <p className="table-warn">{warning}</p> : null}

      <div className="table-actions">
        <button type="button" className="floor-button big" onClick={onConfirm}>
          {confirmLabel}
        </button>
        <button type="button" className="button big" onClick={onCancel}>
          {t('common:action.cancel')}
        </button>
      </div>
    </section>
  );
}

/** The physical status a drawn state implies, when no detail row is available. */
function physicalFrom(state: DerivedTableState): TableStatus {
  switch (state) {
    case 'occupied':
      return 'occupied';
    case 'held':
      return 'held';
    case 'outOfService':
      return 'outOfService';
    default:
      // `reservedSoon` is an overlay on a physically free table. Treating it as
      // anything else would hide "seat a walk-in" on exactly the tables a
      // waiter most often has to seat against a booking.
      return 'free';
  }
}

function nextBookingText(t: TFunction, when: DayAndTime): string {
  if (when.day === 'today') return when.time;
  if (when.day === 'tomorrow') return t('table.nextBookingTomorrow', { time: when.time });
  return t('table.nextBookingOn', { date: when.date, time: when.time });
}
