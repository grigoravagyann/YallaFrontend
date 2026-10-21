import {
  newCommandId,
  onYourWayFromUtc,
  preOrderActionFailure,
  type DuePreOrder,
} from '@yalla/api';
import { useMarkPreOrderNotComing, useSendPreOrder } from '@yalla/api/react';
import { formatPhone } from '@yalla/format';
import { useTranslation } from '@yalla/i18n';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { GuestRecordLine } from '../console/venue/overview/GuestRecordLine';
import { ICONS, RailSection } from './FloorRail';
import { useBranchFormat } from './useBranchFormat';

/**
 * Pre-orders on a booking, on the floor (2026-10-21).
 *
 * A guest with a booking may choose dishes ahead. The branch's `minutesBefore`
 * (30 by default) before the start, the booking's card comes onto the "Now"
 * rail with everything a waiter needs to decide whether to cook: the table,
 * the time, the guest and their record, the dishes — a dish that has sold out
 * since is flagged, it is still promised — the booking's note, the total at
 * the prices the guest was shown, and either "the guest confirmed they are on
 * the way" or their number to call.
 *
 * - **Coming → Send to kitchen** sends it at once: a ticket in the kitchen,
 *   and the first order on the party's tab when they sit. One tap: by the time
 *   the card is up somebody has phoned, or the guest has said yes.
 * - **Not coming / no answer** asks first. Nothing goes to the kitchen; the
 *   card stays, quieter, and Send still works until the booking ends — a party
 *   that did not pick up the phone often walks in anyway.
 *
 * Both are online only and never queued: a ticket the kitchen cooks from is
 * not something to send from a tablet that cannot see whether the other one
 * already did. Each tap is its own command id; the server answers a second
 * send (from here or another tablet) as the pre-order stands, one ticket.
 */

/** Whether a card still waits for a waiter: not sent, not marked, not gone. */
export function preOrderNeedsAction(item: DuePreOrder): boolean {
  const { state, sentAtUtc, notComingAtUtc } = item.preOrder;
  return (state === 'editable' || state === 'locked') && !sentAtUtc && !notComingAtUtc;
}

/**
 * The rail's order: the cards still waiting for a waiter first, then the ones
 * sent or marked not coming — each group as the server sorts it, by start and
 * then table (live QA 2026-10-21: a card marked not coming stayed on top).
 */
export function railOrder(items: readonly DuePreOrder[]): readonly DuePreOrder[] {
  const waiting = items.filter(preOrderNeedsAction);
  return waiting.length === items.length
    ? items
    : [...waiting, ...items.filter((item) => !preOrderNeedsAction(item))];
}

/**
 * The pre-order of a table's booking, from the rail.
 *
 * On an occupied table, the sitting's: the seated booking's card. The
 * table's `nextReservationId` is then the booking *after* it, and its card
 * under the waiter's thumb — with a primary Send — in the panel they opened
 * to serve the party in front of them is the wrong one (review S7). Only when
 * nobody sits on a booking (a walk-in) the next booking's. On a free table,
 * its next booking's, then the earliest.
 */
export function preOrderForTable(
  items: readonly DuePreOrder[],
  tableId: string | null | undefined,
  reservationId: string | null | undefined,
  occupied: boolean,
): DuePreOrder | null {
  if (!tableId) return null;
  const here = items.filter((item) => item.tableId === tableId);
  const seated = occupied ? here.find((item) => item.status === 'seated') : undefined;
  return seated ?? here.find((item) => item.reservationId === reservationId) ?? here[0] ?? null;
}

/** What an action did, for the floor's notice. */
export interface PreOrderOutcome {
  readonly kind: 'sent' | 'notComing';
  readonly tableLabel: string;
  /** Another tap or tablet got there first: the answer is the pre-order as it stands. */
  readonly wasReplay: boolean;
}

export interface PreOrderSectionProps {
  readonly branchId: string;
  readonly items: readonly DuePreOrder[];
  readonly timeZoneId: string;
  readonly loading: boolean;
  /** The rail could not be read: said, rather than shown as none due. */
  readonly failed: boolean;
  readonly online: boolean;
  readonly onDone: (outcome: PreOrderOutcome) => void;
}

/**
 * The rail's section, right after the bookings: both have a clock on them.
 * Only there while a card is (or the list could not be read): an empty heading
 * every shift would teach the floor to skip it.
 */
export function PreOrderSection(props: PreOrderSectionProps) {
  const { t } = useTranslation(['staff', 'common']);
  const format = useBranchFormat(props.timeZoneId);
  const { items } = props;
  const ordered = useMemo(() => railOrder(items), [items]);

  if (props.loading || (items.length === 0 && !props.failed)) return null;

  return (
    <RailSection
      title={t('preOrders.title')}
      count={items.filter(preOrderNeedsAction).length}
      tone="waiting"
      icon={ICONS.clipboard}
    >
      {props.failed && items.length === 0 ? (
        <p className="ft-rail-empty is-failed">{t('preOrders.unreachable')}</p>
      ) : (
        <>
          {/* The last read's cards, kept — but a read failed since, so they
              may be out of date, and their buttons with them. */}
          {props.failed ? <p className="ft-rail-empty is-failed">{t('preOrders.stale')}</p> : null}
          <ul className="ft-items">
            {ordered.map((item) => (
              <RailCard key={item.reservationId} {...props} item={item} format={format} />
            ))}
          </ul>
        </>
      )}
    </RailSection>
  );
}

function RailCard({
  item,
  format,
  ...props
}: PreOrderSectionProps & {
  readonly item: DuePreOrder;
  readonly format: ReturnType<typeof useBranchFormat>;
}) {
  const { t } = useTranslation(['staff', 'common']);
  const titleId = useId();
  const quiet = item.preOrder.notComingAtUtc !== null && !item.preOrder.sentAtUtc;
  const sent = item.preOrder.sentAtUtc !== null || item.preOrder.state === 'sent';
  return (
    <li
      className={['ft-item preorder-card', quiet ? 'is-quiet' : '', sent ? 'is-sent' : '']
        .filter(Boolean)
        .join(' ')}
      aria-labelledby={titleId}
    >
      <div className="ft-item-top">
        <b id={titleId}>{t('table.title', { label: item.tableLabel })}</b>
        <span className="preorder-time">{item.localStartTime}</span>
        <span className="ft-item-age">
          {startText(t, item, format.minutesSince(item.startUtc))}
        </span>
      </div>
      <PreOrderCard
        branchId={props.branchId}
        item={item}
        timeZoneId={props.timeZoneId}
        online={props.online}
        variant="rail"
        onDone={props.onDone}
      />
    </li>
  );
}

/** "in 25 min", "starting now", "started 5 min ago", or "seated". */
function startText(
  t: ReturnType<typeof useTranslation>['t'],
  item: DuePreOrder,
  minutesSince: number,
): string {
  if (item.status === 'seated') return t('preOrders.seated');
  if (minutesSince < 0) return t('preOrders.startsIn', { count: -minutesSince });
  if (minutesSince === 0) return t('preOrders.startsNow');
  return t('preOrders.started', { count: minutesSince });
}

const BUTTONS = {
  rail: {
    send: 'ft-btn ft-btn-primary',
    sendQuiet: 'ft-btn ft-btn-secondary',
    notComing: 'ft-btn ft-btn-secondary',
    confirm: 'ft-btn ft-btn-primary',
    cancel: 'ft-btn ft-btn-secondary',
    row: 'ft-item-actions',
    note: 'table-note',
    warn: 'table-warn',
    question: 'admission-confirm',
  },
  panel: {
    send: 'tp-btn tp-pri',
    sendQuiet: 'tp-btn tp-sec',
    notComing: 'tp-btn tp-sec',
    confirm: 'tp-btn tp-pri',
    cancel: 'tp-btn tp-sec',
    row: 'tp-row',
    note: 'tp-hint',
    warn: 'tp-warn',
    question: 'tp-confirm',
  },
} as const;

export interface PreOrderCardProps {
  readonly branchId: string;
  readonly item: DuePreOrder;
  readonly timeZoneId: string;
  readonly online: boolean;
  /** The rail's look, or the table panel's. */
  readonly variant: 'rail' | 'panel';
  readonly onDone: (outcome: PreOrderOutcome) => void;
}

/**
 * One booking's pre-order and its two actions: the same on the rail and in
 * the table's panel. The rail's card says the table and the time above it;
 * the panel is the table's already, so it says the time here.
 */
export function PreOrderCard({
  branchId,
  item,
  timeZoneId,
  online,
  variant,
  onDone,
}: PreOrderCardProps) {
  const { t } = useTranslation(['staff', 'common']);
  const format = useBranchFormat(timeZoneId);
  const send = useSendPreOrder(branchId);
  const notComing = useMarkPreOrderNotComing(branchId);
  const titleId = useId();
  const [asking, setAsking] = useState(false);
  /**
   * A failed tap, said on the card — for the card as it was then (its
   * `updatedAtUtc`). Once the card has moved on (sent from another tablet,
   * marked, put on the tab), the failure is about a card that is gone, and
   * is not shown (review NIT 10).
   */
  const [failure, setFailure] = useState<{ readonly text: string; readonly at: string } | null>(
    null,
  );
  /**
   * An action is under way. A ref, not the mutations' pending state: two taps
   * in one frame both run before that state reaches a render.
   */
  const acting = useRef(false);
  const questionRef = useRef<HTMLDivElement>(null);
  const sendRef = useRef<HTMLButtonElement>(null);
  const notComingRef = useRef<HTMLButtonElement>(null);
  /** The question was open: when it closes, focus goes back to the buttons. */
  const asked = useRef(false);
  const classes = BUTTONS[variant];
  const { preOrder } = item;
  const busy = send.isPending || notComing.isPending;
  const off = busy || !online;
  const failureText = failure?.at === preOrder.updatedAtUtc ? failure.text : null;

  // The question replaces the button that asked it: focus follows it there,
  // and back when it closes — to "Not coming" after a Cancel, or to Send once
  // it is marked and "Not coming" is gone (review NIT 11).
  useEffect(() => {
    if (asking) {
      asked.current = true;
      questionRef.current?.focus({ preventScroll: true });
    } else if (asked.current) {
      asked.current = false;
      (notComingRef.current ?? sendRef.current)?.focus({ preventScroll: true });
    }
  }, [asking]);

  const sent = preOrder.sentAtUtc !== null || preOrder.state === 'sent';
  const gone = !sent && (preOrder.state === 'cancelled' || preOrder.state === 'unknown');
  const markedNotComing = !sent && !gone && preOrder.notComingAtUtc !== null;

  function act(kind: 'sent' | 'notComing') {
    if (acting.current || !online) return;
    acting.current = true;
    setFailure(null);
    const at = preOrder.updatedAtUtc;
    const run = kind === 'sent' ? send : notComing;
    run.mutate(
      { reservationId: item.reservationId, clientCommandId: newCommandId() },
      {
        onSuccess: (card) => {
          acting.current = false;
          setAsking(false);
          onDone({ kind, tableLabel: item.tableLabel, wasReplay: card.wasReplay });
        },
        onError: (error) => {
          acting.current = false;
          const { line } = preOrderActionFailure(error);
          setFailure({ text: t(line.key, line.params), at });
        },
      },
    );
  }

  const guest = t('preOrders.guest', { name: item.guestName, count: item.partySize });
  /**
   * When "on your way?" goes out: the server's 45 minutes before the start
   * (the rail does not carry the setting). Before then nobody has asked the
   * guest anything, and a card telling the waiter to phone is wrong.
   */
  const askAtUtc = onYourWayFromUtc(item.startUtc);
  const notAskedYet = new Date() < new Date(askAtUtc);
  // Grouped as the public page writes a number; dialled as stored.
  const shownPhone = item.guestPhone ? formatPhone(item.guestPhone) : null;
  const phone =
    item.guestPhone && shownPhone ? (
      <a
        className="approval-call"
        href={`tel:${item.guestPhone.replace(/\s+/gu, '')}`}
        aria-label={t('preOrders.callLabel', { name: item.guestName, phone: shownPhone })}
      >
        {shownPhone}
      </a>
    ) : null;

  return (
    <div className={`preorder preorder-${variant}`}>
      <p className="preorder-guest">
        {variant === 'panel' ? `${item.localStartTime} · ${guest}` : guest}
      </p>
      <GuestRecordLine
        record={item.guestRecord}
        surface="staff"
        timeZoneId={timeZoneId}
        now={new Date()}
      />

      <ul className="preorder-lines" aria-label={t('preOrders.dishes')}>
        {preOrder.lines.map((line) => (
          <li key={line.id} className={line.availableNow ? undefined : 'is-gone'}>
            <span className="preorder-qty">
              {t('preOrders.quantity', { count: line.quantity })}
            </span>
            <span className="preorder-dish">
              <b>{line.name}</b>
              {line.availableNow ? null : (
                // Promised to the guest all the same: the kitchen decides.
                <span className="badge badge-warn">{t('preOrders.soldOutNow')}</span>
              )}
              {line.note ? <span className="preorder-line-note">{line.note}</span> : null}
            </span>
          </li>
        ))}
      </ul>
      {preOrder.note ? (
        <p className="preorder-note">
          <b>{t('preOrders.note')}</b> <span>{preOrder.note}</span>
        </p>
      ) : null}
      <p className="preorder-total">
        {t('preOrders.total', { amount: format.dram(preOrder.totalDram) })}
      </p>

      {/* Whether anybody has to phone: the guest said yes; or "on your way?"
          has not gone out yet (45 minutes before), so nobody is told to call
          — it says when it will, with the number to hand; or marked not
          coming, the number alone; or here is the number to call. */}
      {sent || gone ? null : item.guestConfirmedOnWayAtUtc ? (
        <p className="preorder-onway">
          <svg className="ft-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M20 6 9 17l-5-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>{t('preOrders.onTheWay')}</span>
        </p>
      ) : markedNotComing ? (
        phone ? (
          <p className="preorder-call is-plain">{phone}</p>
        ) : null
      ) : notAskedYet ? (
        <p className="preorder-call is-plain">
          <span>{t('preOrders.askAt', { time: format.time(askAtUtc) })}</span>
          {phone ? <> {phone}</> : null}
        </p>
      ) : phone ? (
        <p className="preorder-call">
          <span>{t('preOrders.call')}</span> {phone}
        </p>
      ) : (
        <p className="preorder-call">{t('preOrders.notConfirmed')}</p>
      )}

      {sent ? (
        <div className="preorder-state" role="status">
          <p>
            {preOrder.sentAtUtc
              ? item.sentByName
                ? t('preOrders.sentBy', {
                    time: format.time(preOrder.sentAtUtc),
                    name: item.sentByName,
                  })
                : t('preOrders.sentAt', { time: format.time(preOrder.sentAtUtc) })
              : t('preOrders.sentPlain')}
          </p>
          {preOrder.kitchenStatus ? (
            <span
              className={
                preOrder.kitchenStatus === 'voided'
                  ? 'preorder-kitchen is-voided'
                  : 'preorder-kitchen'
              }
            >
              {preOrder.kitchenStatus === 'voided'
                ? t('preOrders.voided')
                : t(`panel.orders.status.${preOrder.kitchenStatus}`)}
            </span>
          ) : null}
          {/* A voided held ticket is never put on their bill: nothing is owed. */}
          {preOrder.onTab || preOrder.kitchenStatus === 'voided' ? null : (
            <p>{t('preOrders.waitsForTable')}</p>
          )}
        </div>
      ) : gone ? (
        <p className="preorder-state">{t('preOrders.cancelled')}</p>
      ) : (
        <>
          {markedNotComing ? (
            <p className="preorder-state">
              {item.notComingByName
                ? t('preOrders.notComingBy', {
                    time: format.time(preOrder.notComingAtUtc!),
                    name: item.notComingByName,
                  })
                : t('preOrders.notComingAt', { time: format.time(preOrder.notComingAtUtc!) })}
            </p>
          ) : null}
          {asking ? (
            <div
              ref={questionRef}
              className={classes.question}
              role="group"
              aria-labelledby={titleId}
              tabIndex={-1}
            >
              <h3 id={titleId}>{t('preOrders.confirmTitle', { label: item.tableLabel })}</h3>
              <p className={classes.note}>{t('preOrders.confirmBody')}</p>
              <div className={classes.row}>
                <button
                  type="button"
                  className={classes.cancel}
                  disabled={busy}
                  onClick={() => {
                    setAsking(false);
                    setFailure(null);
                  }}
                >
                  {t('preOrders.confirmKeep')}
                </button>
                <button
                  type="button"
                  className={classes.confirm}
                  disabled={off}
                  onClick={() => act('notComing')}
                >
                  {notComing.isPending ? t('preOrders.sending') : t('preOrders.confirmNotComing')}
                </button>
              </div>
            </div>
          ) : (
            <div className={`${classes.row} preorder-actions`}>
              <button
                ref={sendRef}
                type="button"
                className={markedNotComing ? classes.sendQuiet : classes.send}
                disabled={off}
                aria-label={t('preOrders.sendTable', { label: item.tableLabel })}
                onClick={() => act('sent')}
              >
                {send.isPending ? t('preOrders.sending') : t('preOrders.send')}
              </button>
              {markedNotComing ? null : (
                <button
                  ref={notComingRef}
                  type="button"
                  className={classes.notComing}
                  disabled={off}
                  aria-label={t('preOrders.notComingTable', { label: item.tableLabel })}
                  onClick={() => {
                    setFailure(null);
                    setAsking(true);
                  }}
                >
                  {t('preOrders.notComing')}
                </button>
              )}
            </div>
          )}
          {!online ? <p className={classes.note}>{t('preOrders.needsOnline')}</p> : null}
        </>
      )}
      {failureText ? (
        <p
          className={classes.warn}
          data-tone={variant === 'panel' ? 'red' : undefined}
          role="alert"
        >
          {failureText}
        </p>
      ) : null}
    </div>
  );
}
