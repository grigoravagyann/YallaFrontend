import type { Menu, OrderQueueEntry, OrderStatus, UserRole } from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  TICKET_LATE_MINUTES,
  allergenIndex,
  dishAllergens,
  firstName,
  kitchenCounts,
  sortTickets,
  ticketBand,
  ticketMinutes,
  ticketMinutesFromStart,
  type TicketSort,
} from './kitchenBoard';
import { useBranchFormat } from './useBranchFormat';

/**
 * The kitchen board (floor-tablet `Kitchen` artboard): what is cooking, how
 * long it has waited, and one tap to say it is ready.
 *
 * The kitchen account's whole screen, and the waiter's Kitchen tab. Counts of
 * new, waiting and late sit over a horizontal board of tickets, oldest on the
 * left; each ticket says who sent it, every line's note, and the dish's
 * allergens from the menu.
 *
 * **Ageing is the board's whole point.** A ticket fourteen minutes old and one
 * that arrived a minute ago look the same in every naive implementation, and
 * telling them apart is the only reason to look up from the stove. So the age
 * is the largest number on the ticket, late says "late" in words, and the band
 * changes the ticket's edge as well as its colour, because at two metres in a
 * bright kitchen the hue may not resolve.
 *
 * **One action.** The kitchen moves `InKitchen → Ready` and nothing else
 * (floor-tablet HANDOFF §3): serving is the waiter's, at the table, from the
 * floor's rail. A new ticket — not yet sent by its waiter — is shown, because it
 * is what is coming, but only a waiter can send it, so the kitchen is told what
 * it is waiting for. The waiter's tab keeps that send beside the ticket, so a
 * waiter who sees one they forgot does not have to go and find it.
 *
 * **A pre-order says so** (2026-10-21): "Pre-order · Table 11 · 19:30 · 4 ·
 * Anna" over its lines — cooked for the booking's time, and sent before the
 * party sat, so it may have no tab yet. It moves on with the same one action.
 */

export interface OrderQueuePanelProps {
  readonly orders: readonly OrderQueueEntry[];
  readonly timeZoneId: string;
  readonly role: UserRole;
  readonly onAdvance: (order: OrderQueueEntry, next: OrderStatus) => void;
  readonly loading: boolean;
  /** The queue could not be read at all — offline, or the branch is unreachable. */
  readonly failed: boolean;
  /** The branch menu, for each dish's allergens. The board warns with what it has. */
  readonly menu?: Menu | null | undefined;
  /** Tickets whose status comes from a queued tap the server has not had yet. */
  readonly pendingOrderIds?: ReadonlySet<string> | undefined;
  /** Of those, the ones waiting for somebody else to sign in, and who. */
  readonly heldOrders?: ReadonlyMap<string, string> | undefined;
  /** New tickets are announced with a sound on this screen (the kitchen's own). */
  readonly sounds?: boolean | undefined;
  /** A ticket names a dish the menu does not have: read the menu again. */
  readonly onUnknownDish?: (() => void) | undefined;
}

/** Minutes at which a call stops being fresh, and then stops being acceptable. */
const WAITING_AFTER_MINUTES = 5;
const LATE_AFTER_MINUTES = 10;

type AgeBand = 'fresh' | 'waiting' | 'late';

/** A waiter call's age band, on the floor's rail. Tickets have their own (`ticketBand`). */
export function ageBand(minutes: number): AgeBand {
  if (minutes >= LATE_AFTER_MINUTES) return 'late';
  if (minutes >= WAITING_AFTER_MINUTES) return 'waiting';
  return 'fresh';
}

/**
 * The count on the Kitchen tab: orders waiting at the kitchen — the ones a
 * waiter has still to send, and the ones cooking. Ready has left it.
 */
export function kitchenWaiting(orders: readonly OrderQueueEntry[]): number {
  return orders.filter((order) => order.status === 'new' || order.status === 'inKitchen').length;
}

/** The board shows four tickets across a 1280px tablet; more are a swipe away. */
const TICKETS_IN_VIEW = 4;

const NO_PENDING: ReadonlySet<string> = new Set();

export function OrderQueuePanel(props: OrderQueuePanelProps) {
  const { orders, timeZoneId, role, loading, failed, menu, sounds = false } = props;
  const { t } = useTranslation(['staff', 'admin', 'common']);
  const format = useBranchFormat(timeZoneId);
  const [sort, setSort] = useState<TicketSort>('age');

  // Served has left the kitchen and the server does not list it; a voided
  // order is not food.
  const visible = sortTickets(
    orders.filter((order) => order.status !== 'served' && order.status !== 'voided'),
    sort,
  );
  const counts = kitchenCounts(visible);
  const kitchen = role === 'kitchen';
  const pending = props.pendingOrderIds ?? NO_PENDING;
  const index = useMemo(() => allergenIndex(menu), [menu]);

  // A dish added or changed since the menu was read has no warning to give:
  // read it again, once per new set of such dishes, while the line says to
  // check (FT4 review S4).
  const unknownDishes = visible
    .flatMap((order) => order.lines)
    .filter(
      (line) => index && line.menuItemId && dishAllergens(index, line.menuItemId) === 'unknown',
    )
    .map((line) => line.menuItemId)
    .sort()
    .join(',');
  const onUnknownDish = useRef(props.onUnknownDish);
  useEffect(() => {
    onUnknownDish.current = props.onUnknownDish;
  });
  useEffect(() => {
    if (unknownDishes) onUnknownDish.current?.();
  }, [unknownDishes]);

  return (
    <section className="ft-kitchen" aria-label={t('kitchen.title')}>
      <div className="ft-kbar">
        <div className="ft-kcounts" role="group" aria-label={t('kitchen.counts.label')}>
          <span className="ft-kcount">
            <i className="is-fresh" aria-hidden="true" />
            {t('kitchen.counts.fresh', { count: counts.fresh })}
          </span>
          <span className="ft-kcount">
            <i className="is-waiting" aria-hidden="true" />
            {t('kitchen.counts.waiting', { count: counts.waiting })}
          </span>
          <span className="ft-kcount">
            <i className="is-late" aria-hidden="true" />
            {t('kitchen.counts.late', { count: counts.late })}
          </span>
        </div>
        <p className="ft-khint">
          {[
            t('kitchen.hint.lateAfter', { count: TICKET_LATE_MINUTES }),
            sort === 'age' ? t('kitchen.hint.oldestLeft') : t('kitchen.hint.byTable'),
            visible.length > TICKETS_IN_VIEW
              ? t('kitchen.hint.more', { count: visible.length - TICKETS_IN_VIEW })
              : t('kitchen.hint.all'),
          ].join(' ')}
        </p>
        <div className="ft-ksort" role="group" aria-label={t('kitchen.sort.label')}>
          {(['age', 'table'] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={sort === option}
              onClick={() => setSort(option)}
            >
              {t(`kitchen.sort.${option}`)}
            </button>
          ))}
        </div>
      </div>

      {failed ? (
        // Not an empty board. "No orders" and "we could not ask" look the same
        // and mean opposite things to somebody deciding whether to start a dish.
        <p className="ft-note ft-note-failure ft-kmessage">{t('panel.orders.unreachable')}</p>
      ) : loading ? (
        <p className="ft-kempty">{t('floor.loading')}</p>
      ) : visible.length === 0 ? (
        <p className="ft-kempty">{sounds ? t('kitchen.empty') : t('kitchen.emptyQuiet')}</p>
      ) : (
        // Focusable, so the board scrolls from a keyboard too.
        <ul className="ft-kboard" aria-label={t('kitchen.board')} tabIndex={0}>
          {visible.map((order) => {
            const band = ticketBand(order);
            const queued = pending.has(order.orderId);
            const heldBy = props.heldOrders?.get(order.orderId);
            // A pre-order counts to its booking's start, then from it.
            const fromStart = ticketMinutesFromStart(order);
            const age =
              fromStart !== null && fromStart < 0
                ? t('kitchen.ticket.dueIn', { count: -fromStart })
                : t('kitchen.ticket.age', { count: fromStart ?? order.waitingMinutes });
            const sender = order.placedByName
              ? firstName(order.placedByName)
              : t('kitchen.fromApp');
            // The wire's marker: the party and the guest's first name too,
            // when the server named one — the strip wraps if it must.
            const guest = order.preOrder ? firstName(order.preOrder.guestName) : '';
            const preOrder = order.preOrder
              ? guest
                ? t('kitchen.ticket.preOrderGuest', {
                    label: order.tableLabel,
                    time: order.preOrder.localStartTime,
                    party: order.preOrder.partySize,
                    guest,
                  })
                : t('kitchen.ticket.preOrder', {
                    label: order.tableLabel,
                    time: order.preOrder.localStartTime,
                  })
              : null;
            const name = t('kitchen.ticket.name', {
              label: order.tableLabel,
              // What the timer shows: "in 20 minutes" before a pre-order's
              // start, never the minutes since it was sent.
              minutes:
                fromStart !== null && fromStart < 0
                  ? t('kitchen.ticket.dueInMinutes', { count: -fromStart })
                  : t('kitchen.ticket.minutes', { count: ticketMinutes(order) }),
              band: t(`kitchen.band.${band}`),
              items: order.lines.map((line) => `${line.quantity} ${line.name}`).join(', '),
            });

            return (
              <li
                key={order.orderId}
                className={`ft-ticket is-${band}${preOrder ? ' is-preorder' : ''}`}
                aria-label={
                  preOrder ? t('kitchen.ticket.withPreOrder', { marker: preOrder, name }) : name
                }
              >
                <div className="ft-ticket-head">
                  <span className="ft-ticket-label" aria-hidden="true">
                    {order.tableLabel}
                  </span>
                  <span className="ft-ticket-meta">
                    <b>{t('table.title', { label: order.tableLabel })}</b>
                    <span>
                      {t('kitchen.ticket.sent', {
                        time: format.time(order.placedAtUtc),
                        name: sender,
                      })}
                    </span>
                  </span>
                  {/* The server's own count, computed at read time — not the
                      device's clock. Late is said in words, not only in red. */}
                  <span className={`ft-ticket-age is-${band}`} role="timer">
                    {band === 'late' ? t('kitchen.ticket.late', { age }) : age}
                  </span>
                </div>

                {preOrder ? <p className="ft-ticket-preorder">{preOrder}</p> : null}

                <ul className="ft-ticket-lines">
                  {order.lines.map((line) => {
                    const allergens = dishAllergens(index, line.menuItemId);
                    return (
                      <li key={line.lineId}>
                        <span className="ft-ticket-qty">{line.quantity}×</span>
                        <span className="ft-ticket-dish">
                          <b>{line.name}</b>
                          {line.note ? <span className="ft-ticket-note">{line.note}</span> : null}
                          {allergens === 'unknown' ? (
                            <span className="ft-ticket-allergen is-unknown">
                              <span aria-hidden="true">⚠</span>
                              <span>{t('kitchen.allergensUnknown')}</span>
                            </span>
                          ) : allergens ? (
                            <span className="ft-ticket-allergen">
                              <span aria-hidden="true">⚠</span>
                              <span>
                                {t('kitchen.allergens', {
                                  list: [
                                    ...allergens.presets.map((preset) =>
                                      t(`admin:menu.allergen.${preset}`),
                                    ),
                                    ...(allergens.other ? [allergens.other] : []),
                                  ].join(', '),
                                })}
                              </span>
                            </span>
                          ) : null}
                        </span>
                      </li>
                    );
                  })}
                </ul>

                <div className="ft-ticket-foot">
                  {queued ? (
                    // Moved on this tablet, not yet on the server: no second
                    // button to tap, and it says so.
                    <>
                      {order.status === 'ready' ? (
                        <p className="ft-ticket-ready">{t('kitchen.readyWaiting')}</p>
                      ) : null}
                      <span className="ft-ticket-pending">
                        {heldBy ? t('floor.heldMark', { name: heldBy }) : t('floor.pendingMark')}
                      </span>
                    </>
                  ) : order.status === 'inKitchen' ? (
                    // One large tap. No menu, no confirm: the most frequent
                    // action on the pass, pressed a hundred times a service.
                    <button
                      type="button"
                      className="ft-btn ft-btn-ok ft-ticket-action"
                      aria-label={t('kitchen.readyName', { label: order.tableLabel })}
                      onClick={() => props.onAdvance(order, 'ready')}
                    >
                      <svg
                        className="ft-icon"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                      {t('kitchen.ready')}
                    </button>
                  ) : order.status === 'new' ? (
                    kitchen ? (
                      <p className="ft-hint">{t('kitchen.newHint')}</p>
                    ) : (
                      // The waiter's own send, the same one the rail offers.
                      <button
                        type="button"
                        className="ft-btn ft-btn-secondary ft-ticket-send"
                        aria-label={t('kitchen.sendName', { label: order.tableLabel })}
                        onClick={() => props.onAdvance(order, 'inKitchen')}
                      >
                        {t('panel.orders.advance.inKitchen')}
                      </button>
                    )
                  ) : (
                    <>
                      <p className="ft-ticket-ready">{t('kitchen.readyWaiting')}</p>
                      <p className="ft-hint">
                        {kitchen ? t('kitchen.servedByWaiter') : t('kitchen.servedFromRail')}
                      </p>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
