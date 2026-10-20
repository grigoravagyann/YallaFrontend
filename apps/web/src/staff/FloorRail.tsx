import type { OrderQueueEntry, OrderStatus, ServiceRequest } from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import { useId, useState, type ReactNode } from 'react';
import { billRequestText } from './billRequestText';
import { ageBand } from './OrderQueuePanel';
import { useBranchFormat } from './useBranchFormat';

/** A table freed with money still owed on its tab. */
export interface UnresolvedTab {
  readonly tabId: string;
  readonly tableId: string;
  readonly tableLabel: string;
  readonly amountDram: number;
}

export interface FloorRailProps {
  /** "9 tables occupied · 34 guests". */
  readonly summary: string;
  /** The bookings waiting for an answer: `ApprovalPanel`, first in the rail. */
  readonly approvals: ReactNode;
  /**
   * Tables that scanned with no verified number, waiting for a waiter to let
   * them order: `AdmissionSection`, right after the bookings.
   */
  readonly admissions?: ReactNode;
  /** No-shows this tablet marked, still undoable: `NoShowSection`, after the tables waiting. */
  readonly noShows?: ReactNode;
  readonly requests: readonly ServiceRequest[];
  /** The calls could not be read. Not the same as nobody calling. */
  readonly requestsFailed: boolean;
  /** The calls have not been read yet: not the same as nobody calling either. */
  readonly requestsLoading: boolean;
  readonly orders: readonly OrderQueueEntry[];
  readonly ordersLoading: boolean;
  readonly ordersFailed: boolean;
  readonly timeZoneId: string;
  readonly onAcknowledge: (request: ServiceRequest) => void;
  readonly onAdvance: (order: OrderQueueEntry, next: OrderStatus) => void;
  readonly unresolved: readonly UnresolvedTab[];
  readonly onSettle: (tabId: string) => void;
  /** Under the table panel: kept mounted, so nothing in it is lost, but out of sight. */
  readonly hidden?: boolean | undefined;
}

/**
 * "Now": everything on the floor waiting for a person, beside the tables (the
 * Main artboard's rail).
 *
 * In the order a waiter should look: bookings with a clock on them, tables
 * that cannot order until somebody lets them, people calling, food going cold
 * on the pass, then money left on a freed table.
 * Each section folds, says how many, and says plainly when it is empty —
 * "nobody is waiting" and "we could not ask" are different sentences.
 *
 * Orders still cooking are the kitchen's and live on its tab. The one kind
 * that stays here is an order nobody has sent to the kitchen yet, because
 * only a waiter can send it.
 */
export function FloorRail(props: FloorRailProps) {
  const { t } = useTranslation(['staff', 'common']);
  const format = useBranchFormat(props.timeZoneId);

  const toSend = props.orders.filter((order) => order.status === 'new');
  const ready = props.orders.filter((order) => order.status === 'ready');
  const dishes = (order: OrderQueueEntry) =>
    order.lines.reduce((sum, line) => sum + line.quantity, 0);

  return (
    <aside className="ft-rail" aria-label={t('rail.label')} hidden={props.hidden}>
      <div className="ft-rail-head">
        <h2>{t('rail.title')}</h2>
        <span>{props.summary}</span>
      </div>

      <div className="ft-rail-body">
        {props.approvals}

        {props.admissions}

        {props.noShows}

        <RailSection
          title={t('panel.calls.title')}
          count={props.requests.length}
          tone="waiting"
          icon={ICONS.bell}
        >
          {props.requestsFailed ? (
            <p className="ft-rail-empty is-failed">{t('panel.calls.unreachable')}</p>
          ) : props.requestsLoading ? (
            <p className="ft-rail-empty">{t('floor.loading')}</p>
          ) : props.requests.length === 0 ? (
            <p className="ft-rail-empty">{t('panel.calls.empty')}</p>
          ) : (
            <ul className="ft-items">
              {props.requests.map((request) => {
                const band = ageBand(request.waitingMinutes);
                return (
                  <li key={request.id} className={`ft-item${band === 'late' ? ' is-urgent' : ''}`}>
                    <div className="ft-item-top">
                      <b>{t('table.title', { label: request.tableLabel })}</b>
                      <span>{t(`rail.calls.reason.${request.reason}`)}</span>
                      <span className={`ft-item-age age-${band}`}>
                        {t('rail.minutes', { count: request.waitingMinutes })}
                      </span>
                    </div>
                    {/* The bill from the app's pay sheet says how much and the
                        tip, so the waiter brings the right bill the first time. */}
                    {request.reason === 'bill' && request.bill ? (
                      <p className="ft-item-bill">
                        {billRequestText(request.bill, t, format.dram, 'short')}
                      </p>
                    ) : null}
                    {request.note ? <p>{request.note}</p> : null}
                    <div className="ft-item-actions">
                      <button
                        type="button"
                        className="ft-btn ft-btn-primary"
                        onClick={() => props.onAcknowledge(request)}
                      >
                        {t('panel.calls.acknowledge')}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </RailSection>

        {toSend.length > 0 ? (
          <RailSection
            title={t('rail.toSend.title')}
            count={toSend.length}
            tone="waiting"
            icon={ICONS.send}
          >
            <OrderItems
              orders={toSend}
              next="inKitchen"
              dishes={dishes}
              onAdvance={props.onAdvance}
            />
          </RailSection>
        ) : null}

        <RailSection
          title={t('rail.ready.title')}
          count={ready.length}
          tone="waiting"
          icon={ICONS.plate}
        >
          {props.ordersFailed ? (
            <p className="ft-rail-empty is-failed">{t('panel.orders.unreachable')}</p>
          ) : props.ordersLoading ? (
            <p className="ft-rail-empty">{t('floor.loading')}</p>
          ) : ready.length === 0 ? (
            <p className="ft-rail-empty">{t('rail.ready.empty')}</p>
          ) : (
            <OrderItems orders={ready} next="served" dishes={dishes} onAdvance={props.onAdvance} />
          )}
        </RailSection>

        {props.unresolved.length > 0 ? (
          <RailSection
            title={t('unresolved.title')}
            count={props.unresolved.length}
            tone="failure"
            icon={ICONS.alert}
            open={false}
          >
            <ul className="ft-items">
              {props.unresolved.map((entry) => (
                <li key={entry.tabId} className="ft-item">
                  <div className="ft-item-top">
                    <b>{t('table.title', { label: entry.tableLabel })}</b>
                    <span>
                      {t('rail.unresolved.line', { amount: format.dram(entry.amountDram) })}
                    </span>
                  </div>
                  <p>{t('unresolved.body')}</p>
                  <div className="ft-item-actions">
                    <button
                      type="button"
                      className="ft-btn ft-btn-secondary"
                      onClick={() => props.onSettle(entry.tabId)}
                    >
                      {t('unresolved.settle')}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </RailSection>
        ) : null}
      </div>
    </aside>
  );
}

function OrderItems({
  orders,
  next,
  dishes,
  onAdvance,
}: {
  readonly orders: readonly OrderQueueEntry[];
  readonly next: OrderStatus;
  readonly dishes: (order: OrderQueueEntry) => number;
  readonly onAdvance: (order: OrderQueueEntry, next: OrderStatus) => void;
}) {
  const { t } = useTranslation(['staff', 'common']);
  return (
    <ul className="ft-items">
      {orders.map((order) => (
        <li key={order.orderId} className="ft-item">
          <div className="ft-item-top">
            <b>{t('table.title', { label: order.tableLabel })}</b>
            <span>{t('rail.ready.dishes', { count: dishes(order) })}</span>
            {/* The server's own count, not the device's clock — and since the
                order was placed, which is all the server says, so it says so. */}
            <span className="ft-item-age">
              {t('rail.ready.placed', { count: order.waitingMinutes })}
            </span>
          </div>
          <div className="ft-item-actions">
            <button
              type="button"
              className="ft-btn ft-btn-secondary"
              onClick={() => onAdvance(order, next)}
            >
              {t(`panel.orders.advance.${next}`)}
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

export interface RailSectionProps {
  readonly title: string;
  /** Shown beside the title when there is anything to count. */
  readonly count: number;
  /** Amber for waiting, red for what is owed. */
  readonly tone: 'waiting' | 'failure';
  readonly icon: ReactNode;
  /** Folded at first. Only what needs resolving starts folded, as on the artboard. */
  readonly open?: boolean | undefined;
  readonly children: ReactNode;
}

/**
 * One section of the rail: a region named by its title, which folds.
 *
 * A heading with a disclosure button in it (not `details`/`summary`): a
 * summary is exposed as a button whose children are presentational, so the
 * rail's headings vanished from heading navigation.
 */
export function RailSection({ title, count, tone, icon, open = true, children }: RailSectionProps) {
  const titleId = useId();
  const bodyId = useId();
  const [expanded, setExpanded] = useState(open);
  return (
    <section className="ft-rail-section" aria-labelledby={titleId}>
      <h3>
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={bodyId}
          onClick={() => setExpanded((now) => !now)}
        >
          {icon}
          <span id={titleId}>{title}</span>{' '}
          {count > 0 ? <span className={`ft-badge ft-badge-${tone}`}>{count}</span> : null}
        </button>
      </h3>
      <div id={bodyId} hidden={!expanded}>
        {children}
      </div>
    </section>
  );
}
function Icon({ children }: { readonly children: ReactNode }) {
  return (
    <svg
      className="ft-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/** The artboard's section icons (Lucide shapes). */
export const ICONS = {
  calendar: (
    <Icon>
      <path d="M8 2v4M16 2v4M3 10h18" />
      <rect width="18" height="18" x="3" y="4" rx="2" />
    </Icon>
  ),
  bell: (
    <Icon>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </Icon>
  ),
  plate: (
    <Icon>
      <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2M7 2v20M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" />
    </Icon>
  ),
  send: (
    <Icon>
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </Icon>
  ),
  alert: (
    <Icon>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v4M12 16h.01" />
    </Icon>
  ),
  scan: (
    <Icon>
      <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 12h10" />
    </Icon>
  ),
} as const;
