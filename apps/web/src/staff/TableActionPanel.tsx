import {
  onYourWayFromUtc,
  type AffectedReservation,
  type DuePreOrder,
  type FloorTable,
  type GuestRecord,
  type ReleaseOutcome,
  type ServiceRequest,
  type StaffTab,
  type StaffTableDetail,
  type TableActionKind,
  type TableStatus,
} from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import { useEffect, useId, useRef, useState } from 'react';
import type { AdmissionOutcome, AdmissionSubject } from './AdmissionPanel';
import { OnMyWayAsk } from './OnMyWayAsk';
import { PhoneTransfer, type TransferDone } from './phone/PhoneTransfer';
import { PreOrderCard, type PreOrderOutcome } from './PreOrderPanel';
import { seatedMinutes } from './seatedMinutes';
import { tableCardText, tableTone } from './tableCard';
import { AffectedBookings } from './tablePanel/AffectedBookings';
import { FreeTableActions } from './tablePanel/FreeTableActions';
import { HeldTableActions } from './tablePanel/HeldTableActions';
import { BookingFlags, NextBookingValue } from './tablePanel/NextBooking';
import { OccupiedTableActions } from './tablePanel/OccupiedTableActions';
import { Fact, Facts } from './tablePanel/panelParts';
import { ReleaseChoice } from './tablePanel/ReleaseChoice';
import {
  askWindowOpen,
  clampParty,
  lateMinutes,
  nextBookingText,
  physicalFrom,
  preOrderPartyFor,
} from './tablePanel/tablePanelRules';
import type { TransferTarget } from './transferTarget';
import { useBranchFormat } from './useBranchFormat';

export type { TransferTarget } from './transferTarget';

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
  /**
   * The next booking's guest record, when the floor knows it. The table read
   * carries none; the awaiting list does, so only a next booking that still
   * waits for an answer has one. Absent: nothing is said.
   */
  readonly nextBookingRecord?: GuestRecord | null | undefined;
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
   * False where the platform has not allowed table service at the branch
   * (2026-10-27): no tab is started here, and the panel says why. Default true.
   */
  readonly tableService?: boolean | undefined;
  /**
   * The table's tab, when a scan with no verified number opened it and it
   * waits for a waiter: Admit and Reject, as on the rail. Online only.
   */
  readonly admission?: AdmissionSubject | null | undefined;
  readonly branchId?: string | null | undefined;
  readonly onAdmissionDecided?: ((outcome: AdmissionOutcome) => void) | undefined;
  /**
   * The pre-order of this table's booking, while it is on the rail: the same
   * card and the same two actions (online only).
   */
  readonly preOrder?: DuePreOrder | null | undefined;
  readonly onPreOrderDone?: ((outcome: PreOrderOutcome) => void) | undefined;
  /**
   * The next booking still waits for the floor's yes (it is on the awaiting
   * list): not confirmed, so nobody asks whether the guest is coming.
   */
  readonly nextBookingAwaiting?: boolean | undefined;
  readonly onOrder: () => void;
  readonly onClose: () => void;
  /**
   * Where the panel is: beside the floor on the tablet (the default), or a
   * bottom sheet over the phone's floor (staff phone, the Floor artboard),
   * which is modal — the screen under it is inert while it is up.
   */
  readonly variant?: 'rail' | 'sheet' | undefined;
  /**
   * "Write to the guest" for the next booking: opens its conversation. Left
   * out where the Messages screen is a tab away anyway (the tablet's rail).
   */
  readonly onMessageGuest?: ((reservationId: string) => void) | undefined;
  /**
   * Transfer the table (2026-10-24): who could take it — the branch's people
   * who serve, its waiter left out — or `null` while that is being read.
   * Absent, the action is not offered.
   */
  readonly transferTargets?: readonly TransferTarget[] | null | undefined;
  /** The list could not be read. */
  readonly transferTargetsFailed?: boolean | undefined;
  /** …because the server said no (403): not this person's table, and they are not a manager. */
  readonly transferNotYours?: boolean | undefined;
  /** The chooser opened: the caller reads who is on shift. */
  readonly onWantTransfer?: (() => void) | undefined;
  /**
   * Hand the table over. `onDone`, given by the phone's sheet, hears the
   * success and keeps the sheet up to say it; without it the caller closes
   * the panel and says it in the notice (the tablet).
   */
  readonly onTransfer?:
    ((target: TransferTarget, onDone?: (done: TransferDone) => void) => void) | undefined;
  readonly transferring?: boolean | undefined;
  /** Who is signed in here: "Lilit → Aram" when the table had no waiter yet. */
  readonly actorName?: string | undefined;
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
  const [transferOpen, setTransferOpen] = useState(false);
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
  }, [seating, confirmFree, askingRelease, transferOpen]);

  const bookingStart = detail?.nextReservationStartUtc ?? table.nextReservationStartUtc;
  // Minutes since the booking was due, once it is (see `lateMinutes`).
  const lateBy = lateMinutes(bookingStart, format.minutesSince);
  const bookingLate = lateBy !== null && status === 'free';
  const lateOpen = bookingLate && !bookingLetGo;
  const reservationId = detail?.nextReservationId ?? null;
  // "Ask: are you coming?" for the next booking (see `askWindowOpen`).
  const askOpen = askWindowOpen({
    reservationId,
    bookingStart,
    preOrderReservationId: props.preOrder?.reservationId,
    awaiting: Boolean(props.nextBookingAwaiting),
    status,
    runningLateMinutes: detail?.nextReservationGuestRunningLateMinutes ?? null,
    minutesSince: format.minutesSince,
  });
  /**
   * The table's next booking, when its pre-order card is on the rail: the
   * party may walk in up to two hours early, their food already cooking, and
   * must be seated on the booking so it reaches their tab (live QA 2026-10-21,
   * bug 3). The server seats a confirmed booking whenever it is asked to; the
   * floor's own `reservedSoon` window is only when the tablet offers it
   * unprompted.
   */
  const preOrderParty = preOrderPartyFor(props.preOrder, reservationId);
  const offerSeatBooking =
    reservationId !== null &&
    Boolean(bookingStart) &&
    (table.state === 'reservedSoon' || preOrderParty !== null);
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

  const nextBooking = (
    <NextBookingValue
      bookingStart={bookingStart}
      bookingWhen={bookingWhen}
      detail={detail}
      record={props.nextBookingRecord}
      timeZoneId={timeZoneId}
    />
  );

  const startSeating = (kind: 'walkIn' | 'heldParty', size: number) => {
    setPartySize(clampParty(size));
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

  /** The phone's sheet hands the table over on a screen of its own (Transfer artboard). */
  const phoneTransfer =
    props.variant === 'sheet' && transferOpen && Boolean(props.onTransfer && detail?.openTabId);

  return (
    <aside
      ref={panelRef}
      className={props.variant === 'sheet' ? 'tp is-sheet' : 'tp'}
      role="dialog"
      aria-modal={props.variant === 'sheet' ? 'true' : 'false'}
      aria-label={t('table.panelLabel', { label: table.label })}
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || event.defaultPrevented) return;
        event.preventDefault();
        // On the phone the chooser is the whole sheet: Escape goes back to the table.
        if (phoneTransfer) setTransferOpen(false);
        else onClose();
      }}
    >
      {phoneTransfer ? (
        <PhoneTransfer
          label={table.label}
          serverName={detail?.serverName ?? null}
          actorName={props.actorName ?? ''}
          targets={props.transferTargets ?? null}
          failed={props.transferTargetsFailed ?? false}
          notYours={props.transferNotYours ?? false}
          online={online}
          busy={pending || (props.transferring ?? false)}
          timeZoneId={timeZoneId}
          onTransfer={(target, onDone) => props.onTransfer?.(target, onDone)}
          onCancel={() => setTransferOpen(false)}
          onDone={onClose}
        />
      ) : (
        <>
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
            <button
              type="button"
              className="tp-close"
              onClick={onClose}
              aria-label={t('table.close')}
            >
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
            {/* First, whatever the table's state: the kitchen is waiting on the
            answer, and it is what the waiter opened the table for. */}
            {props.preOrder && props.branchId ? (
              <section className="tp-preorder" aria-labelledby={`${headingId}-po`}>
                <h3 id={`${headingId}-po`}>{t('preOrders.panelTitle')}</h3>
                <PreOrderCard
                  branchId={props.branchId}
                  item={props.preOrder}
                  timeZoneId={timeZoneId}
                  online={online}
                  variant="panel"
                  onDone={(outcome) => props.onPreOrderDone?.(outcome)}
                />
              </section>
            ) : null}

            {/* Whether the next booking's guest is coming, and "Ask now", for a
            booking with no pre-order card here (the Ask artboard). */}
            {askOpen && props.branchId && reservationId && bookingStart ? (
              <section className="tp-ask" aria-labelledby={`${headingId}-ask`}>
                <h3 id={`${headingId}-ask`}>
                  {t('onMyWay.panelTitle', { time: format.time(bookingStart) })}
                </h3>
                <OnMyWayAsk
                  branchId={props.branchId}
                  timeZoneId={timeZoneId}
                  online={online}
                  variant="panel"
                  subject={{
                    reservationId,
                    status: 'confirmed',
                    startUtc: bookingStart,
                    guestName: null,
                    guestPhone: null,
                    guestConfirmedOnWayAtUtc: detail?.nextReservationGuestConfirmedOnWayAtUtc,
                    guestRunningLateMinutes: detail?.nextReservationGuestRunningLateMinutes,
                    staffAskedOnMyWayAtUtc: detail?.nextReservationStaffAskedOnMyWayAtUtc,
                    autoAskAtUtc: onYourWayFromUtc(bookingStart, false),
                  }}
                />
              </section>
            ) : null}

            {props.onMessageGuest && reservationId && status !== 'occupied' ? (
              <div className="tp-acts tp-message">
                <button
                  type="button"
                  className="tp-btn tp-sec"
                  onClick={() => props.onMessageGuest?.(reservationId)}
                >
                  {t('messages.writeToGuest')}
                </button>
              </div>
            ) : null}

            {status === 'free' ? (
              <FreeTableActions
                table={table}
                detail={detail}
                timeZoneId={timeZoneId}
                room={room}
                balance={balance}
                nextBooking={nextBooking}
                bookingStart={bookingStart}
                bookingWhen={bookingWhen}
                lateOpen={lateOpen}
                lateBy={lateBy}
                reservationId={reservationId}
                releaseBooking={releaseBooking}
                seatingWalkIn={seating === 'walkIn'}
                partySize={partySize}
                onPartySize={setPartySize}
                onStartWalkIn={() => startSeating('walkIn', Math.min(2, table.seats))}
                onCancelSeating={() => setSeating(false)}
                offerSeatBooking={offerSeatBooking}
                preOrderParty={preOrderParty}
                onAct={onAct}
              />
            ) : null}

            {status === 'occupied' ? (
              <OccupiedTableActions
                table={table}
                detail={detail}
                timeZoneId={timeZoneId}
                online={online}
                pending={pending}
                balance={balance}
                tabDone={tabDone}
                seatedFor={seatedFor}
                long={card.long}
                bookingStart={bookingStart}
                nextBooking={nextBooking}
                billRequest={props.billRequest}
                admission={props.admission}
                branchId={props.branchId}
                onAdmissionDecided={props.onAdmissionDecided}
                onStartTab={props.onStartTab}
                startingTab={props.startingTab}
                tableService={props.tableService ?? true}
                onOrder={props.onOrder}
                onOpenTab={props.onOpenTab}
                onCash={props.onCash}
                transfer={
                  props.onTransfer && detail?.openTabId
                    ? {
                        open: transferOpen,
                        targets: props.transferTargets ?? null,
                        failed: props.transferTargetsFailed ?? false,
                        notYours: props.transferNotYours ?? false,
                        transferring: props.transferring ?? false,
                        onOpen: () => {
                          setTransferOpen(true);
                          props.onWantTransfer?.();
                        },
                        onCancel: () => setTransferOpen(false),
                        onTransfer: (target) => props.onTransfer?.(target),
                      }
                    : null
                }
                confirmFree={confirmFree}
                onConfirmFree={setConfirmFree}
                onAct={onAct}
              />
            ) : null}

            {status === 'held' ? (
              <HeldTableActions
                table={table}
                detail={detail}
                room={room}
                lateBy={lateBy}
                reservationId={reservationId}
                bookingWhen={bookingWhen}
                bookingFlags={<BookingFlags detail={detail} />}
                releaseBooking={releaseBooking}
                seatingHeld={seating === 'heldParty'}
                partySize={partySize}
                onPartySize={setPartySize}
                onStartHeld={(size) => startSeating('heldParty', size)}
                onCancelSeating={() => setSeating(false)}
                onAct={onAct}
              />
            ) : null}

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

            {props.affectedReservations.length > 0 ? (
              <AffectedBookings
                bookings={props.affectedReservations}
                timeZoneId={timeZoneId}
                online={online}
                releasing={props.releasing}
                onRelease={onRelease}
              />
            ) : null}

            {pending ? <p className="tp-pending">{t('table.pendingHere')}</p> : null}
            {!online ? <p className="tp-hint">{t('table.offlineNote')}</p> : null}
          </div>
        </>
      )}
    </aside>
  );
}
