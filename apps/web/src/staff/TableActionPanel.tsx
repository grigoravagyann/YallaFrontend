import type {
  AffectedReservation,
  DerivedTableState,
  FloorTable,
  ReleaseOutcome,
  ServiceRequest,
  StaffTab,
  StaffTableDetail,
  TableActionKind,
  TableStatus,
} from '@yalla/api';
import type { DayAndTime } from '@yalla/format';
import { useTranslation } from '@yalla/i18n';
import type { TFunction } from 'i18next';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { AdmissionDecision, type AdmissionOutcome, type AdmissionSubject } from './AdmissionPanel';
import { billRequestText } from './billRequestText';
import { seatedMinutes } from './seatedMinutes';
import { tableCardText, tableTone } from './tableCard';
import { useBranchFormat } from './useBranchFormat';

/**
 * What a waiter does to a table: the floor tablet's table panel (Table
 * artboard), 560px at the right of the floor, which dims behind it.
 *
 * Beside the floor rather than over it, because a waiter is looking at the
 * room and not at a form: a full-screen sheet would hide the two tables they
 * are deciding between. The chosen card stays lit and the panel is titled with
 * the table, so there is never a question of which table the buttons belong to.
 *
 * Only the actions that are legal from this table's state are rendered. Not
 * greyed out — absent. A disabled control on a counter screen is something a
 * waiter presses twice and then distrusts, and "free table" on a table that is
 * already free is not an action, it is a puzzle. The exceptions are the
 * online-only actions (releasing a booking, taking cash, starting a tab),
 * which stay in place with a line saying why they are off.
 */

/** The server's bound on a party (`[Range(1, 100)]` on every seat request). */
const MAX_PARTY = 100;

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
  /** The tab on this table, when one is known. Drives the bill and cash lines. */
  readonly tab: StaffTab | null;
  /** The newest bill request the table made from the app, while it is open. */
  readonly billRequest?: ServiceRequest | null | undefined;
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
  /** The tab, with the cash keypad open on it. Online only. */
  readonly onCash: () => void;
  /** Start a tab for a seated party that is not going to scan. Online only. */
  readonly onStartTab: () => void;
  readonly startingTab: boolean;
  /**
   * The table's tab, when a scan with no verified number opened it and it
   * waits for a waiter: Admit and Reject, as on the rail. Online only.
   */
  readonly admission?: AdmissionSubject | null | undefined;
  readonly branchId?: string | null | undefined;
  readonly onAdmissionDecided?: ((outcome: AdmissionOutcome) => void) | undefined;
  readonly onOrder: () => void;
  readonly onClose: () => void;
}

export function TableActionPanel(props: TableActionPanelProps) {
  const { table, detail, tab, timeZoneId, pending, online, onAct, onRelease, onClose } = props;
  const { t } = useTranslation(['staff', 'common']);
  const format = useBranchFormat(timeZoneId);
  const headingId = useId();

  const [seating, setSeating] = useState<false | 'walkIn' | 'heldParty'>(false);
  const [partySize, setPartySize] = useState(2);
  const [confirmFree, setConfirmFree] = useState(false);
  const [askingRelease, setAskingRelease] = useState(false);
  /**
   * The booking has been released, so this device stops offering to hold it and
   * the table's ordinary actions come back. Optimistic only: the floor refetch
   * behind it is what makes it true.
   */
  const [bookingLetGo, setBookingLetGo] = useState(false);

  const status: TableStatus =
    props.projectedStatus ?? detail?.physicalStatus ?? physicalFrom(table.state);
  const tabDone = tab?.status === 'closed' || tab?.status === 'abandoned';
  const balance = tab && !tabDone ? tab.totals.remainingDram : null;

  // Into the panel when it opens, or opens on another table: otherwise its
  // actions are after every remaining row in the tab order (QA 2026-10-16).
  const panelRef = useRef<HTMLElement>(null);
  useEffect(() => {
    panelRef.current?.focus();
  }, [table.id]);
  // A question or the stepper replaces the button that opened it, and closing
  // it removes the button that closed it: focus that falls out of the panel
  // comes back to it, so Escape still closes the panel.
  useEffect(() => {
    const panel = panelRef.current;
    if (panel && !panel.contains(document.activeElement)) panel.focus();
  }, [seating, confirmFree, askingRelease]);

  const bookingStart = detail?.nextReservationStartUtc ?? table.nextReservationStartUtc;
  /**
   * Minutes since the booking was due, once it is: null before its start.
   *
   * Only a booking whose time has come can be a no-show. A table is held for
   * a walk-in on its way too, and the server attaches that hold to whatever is
   * booked next — 22:00, or tomorrow — so "release the booking" is offered for
   * a booking that is due, never for one that is not (review B1).
   */
  const lateBy =
    bookingStart !== null && bookingStart !== undefined && format.minutesSince(bookingStart) > 0
      ? format.minutesSince(bookingStart)
      : null;
  const bookingLate = lateBy !== null && status === 'free';
  const lateOpen = bookingLate && !bookingLetGo;
  const reservationId = detail?.nextReservationId ?? null;
  /** The booking's start, dated when it is not today. */
  const bookingWhen = bookingStart ? nextBookingText(t, format.dayAndTime(bookingStart)) : null;

  const seatedFor = detail?.seatedAtUtc
    ? seatedMinutes(format.minutesSince(detail.seatedAtUtc))
    : null;
  // The card's own words, so the panel and the card it was opened from agree.
  const card = tableCardText({
    table,
    detail,
    debt: null,
    now: new Date(),
    t,
    time: format.time,
    minutesSince: format.minutesSince,
  });
  const tone = tableTone(table.state);
  const seats = t('table.seats', { count: table.seats });
  const room = table.floorAreaName;

  // A bare time reads as tonight; a booking days away said so is how a waiter
  // seats nobody over it (QA 2026-10-16). The guest's promise to free the
  // table goes under it, smaller, as on the card.
  // Booked without a verified number: said beside it, wherever the booking is.
  const bookingFlag = detail?.nextReservationPhoneUnverified ? (
    <span className="badge badge-warn tp-flag">{t('admission.unverified')}</span>
  ) : null;
  const nextBooking = bookingStart ? (
    <>
      {bookingWhen}
      {bookingFlag}
      {detail?.nextReservationPromisedFreeByUtc ? (
        <small>
          {t('table.mustFreeBy', { time: format.time(detail.nextReservationPromisedFreeByUtc) })}
        </small>
      ) : null}
    </>
  ) : (
    '—'
  );

  const startSeating = (kind: 'walkIn' | 'heldParty', size: number) => {
    setPartySize(Math.max(1, Math.min(MAX_PARTY, size)));
    setSeating(kind);
  };
  const release = (outcome: ReleaseOutcome) => {
    if (!reservationId) return;
    onRelease(reservationId, outcome);
    setAskingRelease(false);
    setBookingLetGo(true);
  };

  /**
   * Releasing a booking: the trigger, or the question it opens. Online only,
   * and not while a command for this table is still queued — a release that
   * overtakes a queued hold finds the table not yet held and leaves it held.
   */
  const releaseOff = !online || pending || props.releasing;
  const releaseBooking = reservationId ? (
    askingRelease ? (
      <ReleaseChoice
        disabled={releaseOff}
        onRelease={release}
        onCancel={() => setAskingRelease(false)}
      />
    ) : (
      <>
        <button
          type="button"
          className="tp-btn tp-danger"
          disabled={releaseOff}
          onClick={() => setAskingRelease(true)}
        >
          {t('table.release.ask')}
        </button>
        {!online ? <p className="tp-hint">{t('table.release.needsOnline')}</p> : null}
      </>
    )
  ) : (
    <p className="tp-hint">{t('table.late.noBookingId')}</p>
  );

  return (
    <aside
      ref={panelRef}
      className="tp"
      role="dialog"
      aria-modal="false"
      aria-label={t('table.panelLabel', { label: table.label })}
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || event.defaultPrevented) return;
        event.preventDefault();
        onClose();
      }}
    >
      <header className="tp-head">
        <span className="tp-mark" data-tone={tone} aria-hidden="true">
          {table.label}
        </span>
        <div className="tp-title">
          <h2 id={headingId}>{t('table.title', { label: table.label })}</h2>
          <p className="tp-state" data-ink={tone}>
            {card.state}
          </p>
          <p className="tp-sub">{room ? t('table.subRoom', { seats, room }) : seats}</p>
        </div>
        <button type="button" className="tp-close" onClick={onClose} aria-label={t('table.close')}>
          <svg className="ft-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M18 6 6 18M6 6l12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </header>

      <div className="tp-body">
        {/* --- Free ---------------------------------------------------------- */}
        {status === 'free' ? (
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
                <Warn tone="blue">
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
            ) : seating === 'walkIn' ? (
              <SeatConfirm
                partySize={partySize}
                seats={table.seats}
                onChange={setPartySize}
                warning={
                  bookingStart
                    ? t('table.warn.upcoming', { time: format.time(bookingStart) })
                    : null
                }
                onConfirm={() => onAct('seatWalkIn', { partySize })}
                onCancel={() => setSeating(false)}
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
                  <button
                    type="button"
                    className="tp-btn tp-pri"
                    onClick={() => startSeating('walkIn', Math.min(2, table.seats))}
                  >
                    {t('table.action.seatWalkIn')}
                  </button>
                  {table.state === 'reservedSoon' && reservationId && bookingStart ? (
                    <button
                      type="button"
                      className="tp-btn tp-sec"
                      onClick={() => onAct('seatReservation', bookedParty(detail))}
                    >
                      {t('table.action.seatBooking', { time: format.time(bookingStart) })}
                    </button>
                  ) : null}
                  <button type="button" className="tp-btn tp-sec" onClick={() => onAct('hold')}>
                    {t('table.action.holdLate')}
                  </button>
                  <button
                    type="button"
                    className="tp-btn tp-ghost"
                    onClick={() => onAct('outOfService')}
                  >
                    {t('table.action.outOfService')}
                  </button>
                </div>
              </>
            )}
          </>
        ) : null}

        {/* --- Occupied ------------------------------------------------------- */}
        {status === 'occupied' ? (
          <>
            <Facts>
              <Fact label={t('table.seatedFor')} warn={card.long}>
                {seatedFor !== null ? t('table.minutes', { count: seatedFor }) : '—'}
                {/* The party sitting here promised to be gone by a time: said with it. */}
                {detail?.sittingPromisedFreeByUtc ? (
                  <small>
                    {t('table.mustFreeBy', { time: format.time(detail.sittingPromisedFreeByUtc) })}
                  </small>
                ) : null}
              </Fact>
              <Fact label={t('table.party')}>{detail?.partySize ?? '—'}</Fact>
              <Fact label={t('table.fact.bill')}>
                {balance !== null ? format.dram(balance) : '—'}
              </Fact>
              {bookingStart ? <Fact label={t('table.nextBooking')}>{nextBooking}</Fact> : null}
            </Facts>

            {card.long ? (
              <Warn tone="amber">
                <b>{t('table.warn.long')}</b>{' '}
                {bookingStart
                  ? t('table.warn.longNext', { time: format.time(bookingStart) })
                  : detail?.sittingPromisedFreeByUtc
                    ? t('table.warn.longPromised', {
                        time: format.time(detail.sittingPromisedFreeByUtc),
                      })
                    : null}
              </Warn>
            ) : null}

            {props.billRequest?.bill ? (
              <Warn tone="blue">
                <b>
                  {t('table.billAsked', {
                    count: Math.max(0, format.minutesSince(props.billRequest.requestedAtUtc)),
                  })}
                </b>{' '}
                {billRequestText(props.billRequest.bill, t, format.dram, 'wants')}
              </Warn>
            ) : null}

            {/* A scan with no verified number: nobody on the tab can order until
                a waiter who can see the table lets them. */}
            {props.admission && props.branchId ? (
              <section className="tp-admission" aria-label={t('admission.panelTitle')}>
                <Warn tone="amber">
                  <b>{t('admission.panelTitle')}</b> {t('admission.why')}
                </Warn>
                <AdmissionDecision
                  branchId={props.branchId}
                  subject={props.admission}
                  online={online}
                  variant="panel"
                  onDecided={(outcome) => props.onAdmissionDecided?.(outcome)}
                />
              </section>
            ) : null}

            <div className="tp-acts">
              {/* Orders need a tab. A guest opens one by scanning; for a party
                  that will not, the waiter starts one here. Online only — it
                  is not a floor command the tablet queues — and not while this
                  table's seating is itself still waiting to sync, because the
                  server has nobody seated there to bill yet. */}
              {detail && detail.openTabId === null ? (
                <>
                  <Warn tone="amber">
                    <b>{t('table.noTab')}</b> {t('table.noTabWhy')}
                  </Warn>
                  <button
                    type="button"
                    className="tp-btn tp-pri"
                    onClick={props.onStartTab}
                    disabled={!online || pending || props.startingTab}
                  >
                    {props.startingTab ? t('table.action.startingTab') : t('table.action.startTab')}
                  </button>
                  {!online ? <p className="tp-hint">{t('table.startTabNeedsOnline')}</p> : null}
                </>
              ) : (
                <>
                  <div className="tp-row">
                    <button type="button" className="tp-btn tp-pri" onClick={props.onOrder}>
                      {t('table.action.takeOrder')}
                    </button>
                    <button type="button" className="tp-btn tp-sec" onClick={props.onOpenTab}>
                      {t('table.action.openTab')}
                    </button>
                  </div>
                  {/* A payment recorded against a balance this tablet cannot
                      verify is how a table pays twice, so cash waits for the
                      connection, as it does on the tab. */}
                  <button
                    type="button"
                    className="tp-btn tp-ok"
                    disabled={!online || tabDone}
                    onClick={props.onCash}
                  >
                    {/* The keypad opens on the newest bill request when there
                        is one — a share, or with a tip — so the label names
                        the balance only when that is what the keypad shows. */}
                    {balance !== null && balance > 0 && !props.billRequest?.bill
                      ? t('table.action.cash', { amount: format.dram(balance) })
                      : t('tab.takeCash')}
                  </button>
                  {!online ? <p className="tp-hint">{t('table.cashNeedsOnline')}</p> : null}
                </>
              )}

              {/* Destructive, so it sits under a rule rather than beside the
                  thumb that just tapped "take an order", and asks first. The
                  diners have physically left, so nothing stops it: the money
                  goes to "needs resolving", it is not lost. */}
              <hr className="tp-sep" />
              {confirmFree ? (
                <Confirm title={t('table.free.title', { label: table.label })}>
                  <p className="tp-hint">
                    {balance !== null && balance > 0
                      ? t('table.free.owed', { amount: format.dram(balance) })
                      : t('table.free.note')}
                  </p>
                  <div className="tp-row">
                    <button
                      type="button"
                      className="tp-btn tp-sec"
                      onClick={() => setConfirmFree(false)}
                    >
                      {t('common:action.cancel')}
                    </button>
                    <button
                      type="button"
                      className="tp-btn tp-danger-fill"
                      onClick={() => onAct('freeTable')}
                    >
                      {t('table.action.freeConfirm')}
                    </button>
                  </div>
                </Confirm>
              ) : (
                <button
                  type="button"
                  className="tp-btn tp-danger"
                  onClick={() => setConfirmFree(true)}
                >
                  {t('table.action.free')}
                </button>
              )}
            </div>
          </>
        ) : null}

        {/* --- Held ----------------------------------------------------------- */}
        {status === 'held' ? (
          <>
            {lateBy !== null && reservationId ? (
              <Warn tone="blue">
                <b>{t('table.held.title')}</b>{' '}
                {t('table.held.body', { time: bookingWhen, late: lateText(t, lateBy) })}
              </Warn>
            ) : (
              <Warn tone="blue">{t('table.held.kept')}</Warn>
            )}
            <Facts>
              <Fact label={t('table.fact.booked')}>
                {bookingWhen ?? '—'}
                {bookingWhen ? bookingFlag : null}
              </Fact>
              <Fact label={t('table.party')}>{detail?.nextReservationPartySize ?? '—'}</Fact>
              <Fact label={t('table.fact.room')}>{room ?? '—'}</Fact>
            </Facts>
            {seating === 'heldParty' ? (
              <SeatConfirm
                partySize={partySize}
                seats={table.seats}
                onChange={setPartySize}
                warning={null}
                onConfirm={() => onAct('seatHeldParty', { partySize })}
                onCancel={() => setSeating(false)}
              />
            ) : (
              <div className="tp-acts">
                <button
                  type="button"
                  className="tp-btn tp-ok"
                  onClick={() =>
                    startSeating(
                      'heldParty',
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
                <button
                  type="button"
                  className="tp-btn tp-ghost"
                  onClick={() => onAct('releaseHold')}
                >
                  {t('table.action.releaseHold')}
                </button>
              </div>
            )}
          </>
        ) : null}

        {/* --- Out of service --------------------------------------------------- */}
        {status === 'outOfService' ? (
          <>
            <Facts>
              <Fact label={t('table.fact.seats')}>{table.seats}</Fact>
              <Fact label={t('table.fact.room')}>{room ?? '—'}</Fact>
            </Facts>
            <div className="tp-acts">
              <button
                type="button"
                className="tp-btn tp-ok"
                onClick={() => onAct('returnToService')}
              >
                {t('table.action.returnToService')}
              </button>
            </div>
          </>
        ) : null}

        {/* Bookings stranded by this table going out of service. Time, party
            size, name, code and a number to call — everything needed to make
            the call, because nobody is going to look them up on another
            screen. */}
        {props.affectedReservations.length > 0 ? (
          <section className="tp-affected" aria-label={t('table.affected.title')}>
            <Warn tone="red">
              <b>{t('table.affected.count', { count: props.affectedReservations.length })}</b>{' '}
              {t('table.affected.body')}
            </Warn>
            <ul className="tp-affected-list">
              {props.affectedReservations.map((booking) => (
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
                    disabled={!online || props.releasing}
                    onClick={() => onRelease(booking.reservationId, 'guestCancelled')}
                  >
                    {t('table.affected.release')}
                  </button>
                </li>
              ))}
            </ul>
            {!online ? <p className="tp-hint">{t('table.release.needsOnline')}</p> : null}
          </section>
        ) : null}

        {pending ? <p className="tp-pending">{t('table.pendingHere')}</p> : null}
        {!online ? <p className="tp-hint">{t('table.offlineNote')}</p> : null}
      </div>
    </aside>
  );
}

/** The booked party size, when the server sends it; otherwise the server keeps the booking's. */
function bookedParty(detail: StaffTableDetail | undefined): { partySize?: number } {
  return detail?.nextReservationPartySize ? { partySize: detail.nextReservationPartySize } : {};
}

function Facts({ children }: { readonly children: ReactNode }) {
  return <dl className="tp-facts">{children}</dl>;
}

function Fact({
  label,
  warn = false,
  children,
}: {
  readonly label: string;
  readonly warn?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <div className="tp-fact">
      <dt>{label}</dt>
      <dd className={warn ? 'is-warn' : undefined}>{children}</dd>
    </div>
  );
}

/** A note that never blocks: amber for waiting, blue for the guest's side, red for a real problem. */
function Warn({
  tone,
  children,
}: {
  readonly tone: 'amber' | 'blue' | 'red';
  readonly children: ReactNode;
}) {
  return (
    <p className="tp-warn" data-tone={tone}>
      {children}
    </p>
  );
}

/** A question in the panel, named by its title, so a reader knows what the buttons answer. */
function Confirm({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  const id = useId();
  const ref = useInView();
  return (
    <div ref={ref} className="tp-confirm" role="group" aria-labelledby={id} tabIndex={-1}>
      <h3 id={id}>{title}</h3>
      {children}
    </div>
  );
}

/**
 * Why a booking is being let go: two answers of identical weight, neither
 * chosen, and "Release" off until one is.
 *
 * One of them puts a no-show on somebody's record and the other does not, and
 * that is the entire difference between them. Make either one the obvious
 * default — bigger, primary-coloured, preselected — and it gets tapped for both
 * cases within a week, at which point the no-show threshold starts punishing
 * the people who phoned to cancel. So: the same card twice, side by side in
 * weight, the sentence that separates them, and an explicit pick.
 */
function ReleaseChoice({
  disabled,
  onRelease,
  onCancel,
}: {
  readonly disabled: boolean;
  readonly onRelease: (outcome: ReleaseOutcome) => void;
  readonly onCancel: () => void;
}) {
  const { t } = useTranslation(['staff', 'common']);
  const [outcome, setOutcome] = useState<ReleaseOutcome | null>(null);

  const choice = (value: ReleaseOutcome, title: string, note: string) => (
    <button
      type="button"
      className="tp-choice"
      aria-pressed={outcome === value}
      onClick={() => setOutcome(value)}
    >
      <b>{title}</b>
      <small>{note}</small>
    </button>
  );

  return (
    <Confirm title={t('table.release.why')}>
      <p className="tp-hint">{t('table.release.difference')}</p>
      <div className="tp-choices">
        {choice('noShow', t('table.release.noShowTitle'), t('table.release.noShowNote'))}
        {choice(
          'guestCancelled',
          t('table.release.cancelledTitle'),
          t('table.release.cancelledNote'),
        )}
      </div>
      <div className="tp-row">
        <button type="button" className="tp-btn tp-sec" onClick={onCancel}>
          {t('common:action.cancel')}
        </button>
        <button
          type="button"
          className="tp-btn tp-danger-fill"
          disabled={disabled || outcome === null}
          onClick={() => {
            if (outcome) onRelease(outcome);
          }}
        >
          {t('table.release.confirm')}
        </button>
      </div>
    </Confirm>
  );
}

interface SeatConfirmProps {
  readonly partySize: number;
  readonly seats: number;
  readonly onChange: (next: number) => void;
  readonly warning: string | null;
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
 * Capped where the server caps it (1 to 100), never at the table's seats. Five
 * people do sit at a four-top, and a client rule stricter than the server's
 * teaches the floor to lie about party sizes to get past it — so going past
 * the seats is said, in amber, and allowed.
 */
function SeatConfirm({
  partySize,
  seats,
  onChange,
  warning,
  onConfirm,
  onCancel,
}: SeatConfirmProps) {
  const { t } = useTranslation(['staff', 'common']);
  const ref = useInView();

  return (
    <div ref={ref} className="tp-confirm" tabIndex={-1}>
      <h3>{t('table.partySize')}</h3>
      <div className="tp-party">
        <span className="tp-party-label">{t('table.party')}</span>
        <div className="tp-stepper" role="group" aria-label={t('table.partySize')}>
          <button
            type="button"
            onClick={() => onChange(Math.max(1, partySize - 1))}
            disabled={partySize <= 1}
            aria-label={t('table.fewer')}
          >
            −
          </button>
          <output aria-live="polite">{partySize}</output>
          <button
            type="button"
            onClick={() => onChange(Math.min(MAX_PARTY, partySize + 1))}
            disabled={partySize >= MAX_PARTY}
            aria-label={t('table.more')}
          >
            +
          </button>
        </div>
      </div>
      {partySize > seats ? (
        <p className="tp-cap">{t('table.overSeats', { count: seats })}</p>
      ) : null}

      {warning ? <Warn tone="amber">{warning}</Warn> : null}

      <div className="tp-row">
        <button type="button" className="tp-btn tp-sec" onClick={onCancel}>
          {t('common:action.cancel')}
        </button>
        <button type="button" className="tp-btn tp-ok" onClick={onConfirm}>
          {t('table.action.seatConfirm', { count: partySize })}
        </button>
      </div>
    </div>
  );
}

/**
 * A question scrolled into the panel's view when it opens. It replaces the
 * button that asked it, low in a tall panel, and its answer must not be the
 * thing a waiter has to scroll to find.
 */
function useInView() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
    ref.current?.scrollIntoView?.({ block: 'nearest' });
  }, []);
  return ref;
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

/** "20 min late", "1 h 39 min late". */
function lateText(t: TFunction, minutes: number): string {
  if (minutes < 60) return t('table.lateFor', { count: minutes });
  return t('table.lateForHours', { hours: Math.floor(minutes / 60), minutes: minutes % 60 });
}

function nextBookingText(t: TFunction, when: DayAndTime): string {
  if (when.day === 'today') return when.time;
  if (when.day === 'tomorrow') return t('table.nextBookingTomorrow', { time: when.time });
  return t('table.nextBookingOn', { date: when.date, time: when.time });
}
