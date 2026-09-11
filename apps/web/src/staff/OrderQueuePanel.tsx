import {
  nextOrderStatus,
  type OrderQueueEntry,
  type OrderStatus,
  type ServiceRequest,
} from '@yalla/api';
import type { UserRole } from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import { useBranchFormat } from './useBranchFormat';

/**
 * Incoming orders and service requests, in one panel.
 *
 * One panel rather than two because they are the same job: things somebody at a
 * table is waiting for. A waiter scanning from across the counter should not
 * have to check two lists to know whether anyone needs them.
 *
 * **Ageing is the panel's whole point.** A `New` order twelve minutes old and
 * one that arrived a minute ago are the same words and the same colour in every
 * naive implementation, and telling them apart is the only reason to look at
 * this panel at all. So age drives a band — fresh, waiting, late — and the band
 * changes the border weight and the left rule as well as the hue, because at
 * two metres in a bright room the hue may not resolve.
 */

export interface OrderQueuePanelProps {
  readonly orders: readonly OrderQueueEntry[];
  /**
   * Null on a screen that does not handle waiter calls — the kitchen's. The
   * section is left out rather than shown empty: "nobody is waving" is a claim
   * that screen has no way to know.
   */
  readonly requests: readonly ServiceRequest[] | null;
  readonly timeZoneId: string;
  readonly role: UserRole;
  readonly onAdvance: (order: OrderQueueEntry, next: OrderStatus) => void;
  readonly onAcknowledge?: ((request: ServiceRequest) => void) | undefined;
  readonly loading: boolean;
  /** The queue could not be read at all — offline, or the branch is unreachable. */
  readonly failed: boolean;
}

/** Minutes at which an order stops being fresh, and then stops being acceptable. */
const WAITING_AFTER_MINUTES = 5;
const LATE_AFTER_MINUTES = 10;

type AgeBand = 'fresh' | 'waiting' | 'late';

export function ageBand(minutes: number): AgeBand {
  if (minutes >= LATE_AFTER_MINUTES) return 'late';
  if (minutes >= WAITING_AFTER_MINUTES) return 'waiting';
  return 'fresh';
}

/**
 * The kitchen sees one transition and a filtered list.
 *
 * A kitchen screen showing `Ready → Served` invites the kitchen to mark food
 * served that is still sitting on the pass, which is how a table waits twenty
 * minutes for something the system says they already have. It still *sees* new
 * orders — that is what is coming — but only a waiter sends one to the
 * kitchen; the server lets the kitchen move `InKitchen` to `Ready` and nothing
 * else.
 */
function visibleTo(role: UserRole, order: OrderQueueEntry): boolean {
  if (role !== 'kitchen') return true;
  return order.status === 'new' || order.status === 'inKitchen';
}

function advanceableBy(role: UserRole, status: OrderStatus): boolean {
  if (role !== 'kitchen') return true;
  return status === 'inKitchen';
}

export function OrderQueuePanel(props: OrderQueuePanelProps) {
  const { orders, requests, timeZoneId, role, loading, failed } = props;
  const { t } = useTranslation(['staff', 'common']);
  const format = useBranchFormat(timeZoneId);

  const visible = orders.filter((order) => visibleTo(role, order));

  return (
    <aside className="floor-panel" aria-label={t('panel.orders.title')}>
      <section className="queue-block">
        <h2>{t('panel.orders.title')}</h2>

        {failed ? (
          // Not an empty list. "No orders" and "we could not ask" look the same
          // and mean opposite things to somebody deciding whether to walk to
          // the kitchen.
          <p className="table-warn">{t('panel.orders.unreachable')}</p>
        ) : loading ? (
          <p className="floor-todo">{t('floor.loading')}</p>
        ) : visible.length === 0 ? (
          <p className="floor-todo">{t('panel.orders.empty')}</p>
        ) : (
          <ul className="queue-list">
            {visible.map((order) => {
              // The server's own count, computed at read time. Not the
              // device's clock: a tablet whose time is twenty minutes out would
              // otherwise paint every order late, or none of them.
              const minutes = order.waitingMinutes;
              const band = ageBand(minutes);
              const next = nextOrderStatus(order.status);

              return (
                <li key={order.orderId} className={`queue-card age-${band}`}>
                  <div className="queue-card-head">
                    <span className="queue-table">
                      {t('table.title', { label: order.tableLabel })}
                    </span>
                    {/* The age is words, not only a colour, and it is the
                        largest thing on the card after the table. */}
                    <span className={`queue-age age-${band}`}>
                      {t('panel.orders.age', { count: minutes })}
                    </span>
                  </div>

                  <ul className="queue-items">
                    {order.lines.map((line) => (
                      <li key={line.lineId}>
                        <span className="queue-qty">{line.quantity}×</span> {line.name}
                        {line.note ? <em className="queue-note"> · {line.note}</em> : null}
                      </li>
                    ))}
                  </ul>

                  {/* Who placed it is not on `KitchenOrderView`, so the card
                      says the status and the promise and nothing it cannot
                      know. */}
                  <p className="queue-meta">
                    {t(`panel.orders.status.${order.status}`)}
                    {order.estimatedReadyAtUtc
                      ? ` · ${t('panel.orders.dueBy', { time: format.time(order.estimatedReadyAtUtc) })}`
                      : ''}
                  </p>

                  {next && advanceableBy(role, order.status) ? (
                    // One large tap per transition. No menu, no confirm: this
                    // is the most frequent action on the panel and a dialog
                    // here would be pressed a hundred times a service.
                    <button
                      type="button"
                      className="floor-button big full"
                      onClick={() => props.onAdvance(order, next)}
                    >
                      {t(`panel.orders.advance.${next}`)}
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Service requests share the panel but are visibly a different thing:
          nobody is cooking, somebody is waving. */}
      {requests === null ? null : (
        <section className="queue-block">
          <h2>{t('panel.calls.title')}</h2>

          {failed ? (
            <p className="table-warn">{t('panel.calls.unreachable')}</p>
          ) : requests.length === 0 ? (
            <p className="floor-todo">{t('panel.calls.empty')}</p>
          ) : (
            <ul className="queue-list">
              {requests.map((request) => {
                const minutes = request.waitingMinutes;
                return (
                  <li key={request.id} className={`call-card age-${ageBand(minutes)}`}>
                    <p className="call-line">
                      {t('panel.calls.line', {
                        label: request.tableLabel,
                        reason: t(`panel.calls.reason.${request.reason}`),
                        count: minutes,
                      })}
                    </p>
                    {request.note ? <p className="order-line-note">{request.note}</p> : null}
                    <button
                      type="button"
                      className="floor-button big full"
                      onClick={() => props.onAcknowledge?.(request)}
                    >
                      {t('panel.calls.acknowledge')}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </aside>
  );
}
