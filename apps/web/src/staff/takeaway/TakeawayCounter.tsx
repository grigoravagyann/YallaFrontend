import {
  canMarkTakeawayNoShow,
  takeawayItemCount,
  takeawayNoShowFromUtc,
  type BranchTakeawayOrders,
  type StaffTakeawayOrder,
  type TakeawayPaymentMethod,
} from '@yalla/api';
import { useCollectTakeawayOrder, useMarkTakeawayOrderNoShow, useNow } from '@yalla/api/react';
import { formatPhone } from '@yalla/format';
import { useTranslation } from '@yalla/i18n';
import type { TFunction } from 'i18next';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useDialogFocus } from '../../components/useDialogFocus';
import { useBranchFormat, type BranchFormat } from '../useBranchFormat';
import {
  ANSWERED_MS,
  TakeawayAcceptCard,
  answeredText,
  type TakeawayAnswered,
} from './TakeawayAccept';
import { takeawayFailureText, whoAndItems } from './takeawayText';

/**
 * The Takeaway page (2026-10-22, the Counter artboard): the floor tablet's
 * third screen, beside Floor and Kitchen.
 *
 * Three columns, in the order a person at the counter needs them:
 *
 * - **Ready · waiting** — what can be handed over now, oldest first, with what
 *   the guest pays. "Hand over" opens the payment: cash or card at the venue's
 *   own terminal, then "Paid, handed over". Nothing is charged in the app.
 *   Thirty minutes after ready, and only then, a guest who has not come can be
 *   marked "No-show" — a red outline button beside Call, which asks first.
 * - **Being prepared** — the orders waiting for an answer (the rail's same
 *   card), then the ones in the kitchen with their ready time.
 * - **Handed over today** — collected, with how it was paid; no-shows in red;
 *   declined, quiet.
 *
 * Every move is online only and never queued; a refusal (another tablet got
 * there first) is said on the card and the list is read again.
 */
export interface TakeawayCounterProps {
  readonly branchId: string;
  readonly counter: BranchTakeawayOrders | null;
  readonly timeZoneId: string;
  readonly online: boolean;
  readonly loading: boolean;
  /** The counter could not be read (again). */
  readonly failed: boolean;
  readonly onRetry: () => void;
}

/** What the last move here did, for the line that says so. */
type Done =
  | TakeawayAnswered
  | {
      readonly kind: 'collected';
      readonly code: string;
      readonly amountDram: number;
      readonly method: TakeawayPaymentMethod;
    }
  | { readonly kind: 'noShow'; readonly code: string };

export function TakeawayCounter(props: TakeawayCounterProps) {
  const { counter, timeZoneId, online } = props;
  const { t } = useTranslation(['staff', 'common']);
  const format = useBranchFormat(timeZoneId);
  // The answer countdowns are seconds; "waiting 35 min" and "No-show" follow it.
  const now = useNow(1000);
  const [paying, setPaying] = useState<StaffTakeawayOrder | null>(null);
  const [done, setDone] = useState<Done | null>(null);

  useEffect(() => {
    if (!done) return;
    const timer = setTimeout(() => setDone(null), ANSWERED_MS);
    return () => clearTimeout(timer);
  }, [done]);

  const active = counter?.active ?? [];
  const ready = active
    .filter((order) => order.status === 'ready')
    .sort((a, b) => readySince(a).localeCompare(readySince(b)));
  const toAnswer = active.filter((order) => order.status === 'sent');
  const preparing = active.filter((order) => order.status === 'accepted');
  const finished = counter?.finishedToday ?? [];
  const collected = finished.filter((order) => order.status === 'collected').length;

  if (!counter) {
    return (
      <section className="takeaway-page" aria-label={t('takeaway.title')}>
        {props.failed ? (
          <p className="ft-note ft-note-failure takeaway-message" role="alert">
            {t('takeaway.unreachable')}{' '}
            <button type="button" className="ft-btn ft-btn-secondary" onClick={props.onRetry}>
              {t('common:action.retry')}
            </button>
          </p>
        ) : (
          <p className="takeaway-message">{t('floor.loading')}</p>
        )}
      </section>
    );
  }

  return (
    <section className="takeaway-page" aria-label={t('takeaway.title')}>
      {props.failed ? (
        <p className="ft-note ft-note-failure takeaway-message" role="alert">
          {t('takeaway.stale')}
        </p>
      ) : null}
      {!online ? <p className="takeaway-message">{t('takeaway.needsOnline')}</p> : null}
      {done ? (
        <p className="takeaway-done takeaway-message" role="status">
          {doneText(t, done, format)}
        </p>
      ) : null}

      <div className="takeaway-columns">
        <Column id="ready" tone="ready" title={t('takeaway.column.ready')}>
          {ready.length === 0 ? (
            <p className="takeaway-empty">{t('takeaway.empty.ready')}</p>
          ) : (
            <ul className="takeaway-cards">
              {ready.map((order) => (
                <ReadyCard
                  key={order.id}
                  branchId={props.branchId}
                  order={order}
                  now={now}
                  online={online}
                  format={format}
                  onHandOver={() => setPaying(order)}
                  onNoShow={() => setDone({ kind: 'noShow', code: order.code })}
                />
              ))}
            </ul>
          )}
        </Column>

        <Column id="preparing" tone="preparing" title={t('takeaway.column.preparing')}>
          {toAnswer.length > 0 ? (
            <>
              <h3 className="takeaway-sub">{t('takeaway.column.toAnswer')}</h3>
              <ul className="ft-items takeaway-cards takeaway-answer">
                {toAnswer.map((order) => (
                  <TakeawayAcceptCard
                    key={order.id}
                    branchId={props.branchId}
                    order={order}
                    timeZoneId={timeZoneId}
                    online={online}
                    now={now}
                    onAnswered={setDone}
                  />
                ))}
              </ul>
            </>
          ) : null}
          {preparing.length === 0 && toAnswer.length === 0 ? (
            <p className="takeaway-empty">{t('takeaway.empty.preparing')}</p>
          ) : preparing.length > 0 ? (
            <ul className="takeaway-cards">
              {preparing.map((order) => (
                <li
                  key={order.id}
                  className="takeaway-card is-preparing"
                  aria-labelledby={`tk-${order.id}`}
                >
                  <div className="takeaway-card-top">
                    <b id={`tk-${order.id}`} className="takeaway-code">
                      {order.code}
                    </b>
                    <span>
                      {order.readyAtUtc
                        ? t('takeaway.readyFor', { time: format.time(order.readyAtUtc) })
                        : null}
                    </span>
                  </div>
                  <p className="takeaway-card-sub">
                    {t('takeaway.whoTotal', {
                      name: order.guestName,
                      count: takeawayItemCount(order.lines),
                      amount: format.dram(order.totalDram),
                    })}
                  </p>
                </li>
              ))}
            </ul>
          ) : null}
        </Column>

        <Column id="done" tone="done" title={t('takeaway.column.done', { count: collected })}>
          {finished.length === 0 ? (
            <p className="takeaway-empty">{t('takeaway.empty.done')}</p>
          ) : (
            <ul className="takeaway-finished">
              {finished.map((order) => (
                <li
                  key={order.id}
                  className={`takeaway-row is-${order.status === 'collected' ? 'collected' : order.status === 'noShow' ? 'noshow' : 'quiet'}`}
                >
                  <span>{finishedText(t, order, format)}</span>
                  <span>
                    {order.status === 'collected' && order.paymentMethod
                      ? t('takeaway.paidWith', {
                          amount: format.dram(order.paidAmountDram ?? order.totalDram),
                          method: t(`takeaway.method.${order.paymentMethod}`),
                        })
                      : format.dram(order.totalDram)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Column>
      </div>

      {paying ? (
        <PayDialog
          key={paying.id}
          branchId={props.branchId}
          order={paying}
          online={online}
          format={format}
          onClose={() => setPaying(null)}
          onCollected={(method) => {
            setDone({
              kind: 'collected',
              code: paying.code,
              amountDram: paying.totalDram,
              method,
            });
            setPaying(null);
          }}
        />
      ) : null}
    </section>
  );
}

/** When an order was ready: the kitchen's "ready", or the promised time. */
function readySince(order: StaffTakeawayOrder): string {
  return order.readyMarkedAtUtc ?? order.readyAtUtc ?? order.sentAtUtc;
}

function Column({
  id,
  tone,
  title,
  children,
}: {
  readonly id: string;
  readonly tone: 'ready' | 'preparing' | 'done';
  readonly title: string;
  readonly children: ReactNode;
}) {
  const headingId = useId();
  return (
    <section className={`takeaway-column is-${tone}`} aria-labelledby={headingId} data-column={id}>
      <h2 id={headingId}>
        {tone === 'done' ? null : <i aria-hidden="true" />}
        {title}
      </h2>
      {children}
    </section>
  );
}

function ReadyCard({
  branchId,
  order,
  now,
  online,
  format,
  onHandOver,
  onNoShow,
}: {
  readonly branchId: string;
  readonly order: StaffTakeawayOrder;
  readonly now: Date;
  readonly online: boolean;
  readonly format: BranchFormat;
  readonly onHandOver: () => void;
  readonly onNoShow: () => void;
}) {
  const { t } = useTranslation(['staff', 'common']);
  const noShow = useMarkTakeawayOrderNoShow(branchId);
  const titleId = useId();
  const confirmRef = useRef<HTMLDivElement>(null);
  const noShowButton = useRef<HTMLButtonElement>(null);
  const asked = useRef(false);
  const sending = useRef(false);
  const [asking, setAsking] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    if (asking) {
      asked.current = true;
      confirmRef.current?.focus({ preventScroll: true });
    } else if (asked.current) {
      asked.current = false;
      noShowButton.current?.focus({ preventScroll: true });
    }
  }, [asking]);

  const overdue = canMarkTakeawayNoShow(order, now);
  const since = readySince(order);
  const waiting = Math.max(0, Math.floor((now.getTime() - Date.parse(since)) / 60_000));
  const noShowFrom = order.noShowFromUtc ?? takeawayNoShowFromUtc(order);
  const shownPhone = order.guestPhone ? formatPhone(order.guestPhone) : null;

  function markNoShow() {
    if (sending.current || !online) return;
    sending.current = true;
    setFailure(null);
    noShow.mutate(order.id, {
      onSuccess: () => {
        sending.current = false;
        setAsking(false);
        onNoShow();
      },
      onError: (error) => {
        sending.current = false;
        setFailure(takeawayFailureText(t, error, (iso) => format.time(iso)));
      },
    });
  }

  return (
    <li
      className={`takeaway-card is-ready${overdue ? ' is-overdue' : ''}`}
      aria-labelledby={titleId}
    >
      <div className="takeaway-card-top">
        <b id={titleId} className="takeaway-code">
          {order.code}
        </b>
        {overdue ? (
          <span className="takeaway-overdue">{t('takeaway.waiting', { count: waiting })}</span>
        ) : (
          <span>{t('takeaway.readySince', { time: format.time(since) })}</span>
        )}
      </div>
      <p className="takeaway-card-sub">{whoAndItems(t, order)}</p>
      <p className="takeaway-pay">
        {t('takeaway.toPay', { amount: format.dram(order.totalDram) })}
      </p>

      <button
        type="button"
        className="ft-btn ft-btn-primary takeaway-handover"
        disabled={!online || noShow.isPending}
        aria-label={t('takeaway.handOverName', { code: order.code })}
        onClick={onHandOver}
      >
        {t('takeaway.handOver')}
      </button>

      {overdue ? (
        asking ? (
          <div
            ref={confirmRef}
            className="admission-confirm takeaway-noshow-confirm"
            role="group"
            aria-labelledby={`${titleId}-ns`}
            tabIndex={-1}
          >
            <h3 id={`${titleId}-ns`}>{t('takeaway.noShowTitle', { code: order.code })}</h3>
            <p className="table-note">{t('takeaway.noShowBody')}</p>
            <div className="ft-item-actions">
              <button
                type="button"
                className="ft-btn ft-btn-secondary"
                disabled={noShow.isPending}
                onClick={() => {
                  setAsking(false);
                  setFailure(null);
                }}
              >
                {t('takeaway.keep')}
              </button>
              <button
                type="button"
                className="ft-btn ft-btn-danger-fill"
                disabled={noShow.isPending || !online}
                onClick={markNoShow}
              >
                {noShow.isPending ? t('takeaway.sending') : t('takeaway.noShowConfirm')}
              </button>
            </div>
          </div>
        ) : (
          <div className="ft-item-actions takeaway-overdue-actions">
            {order.guestPhone && shownPhone ? (
              <a
                className="ft-btn ft-btn-secondary"
                href={`tel:${order.guestPhone.replace(/\s+/gu, '')}`}
                aria-label={t('takeaway.callName', { name: order.guestName, phone: shownPhone })}
              >
                {t('takeaway.call')}
              </a>
            ) : null}
            <button
              ref={noShowButton}
              type="button"
              className="ft-btn ft-btn-danger"
              disabled={!online}
              aria-label={t('takeaway.noShowName', { code: order.code })}
              onClick={() => {
                setFailure(null);
                setAsking(true);
              }}
            >
              {t('takeaway.noShow')}
            </button>
          </div>
        )
      ) : noShowFrom ? (
        <p className="table-note">{t('takeaway.noShowFrom', { time: format.time(noShowFrom) })}</p>
      ) : null}

      {failure ? (
        <p className="table-warn" role="alert">
          {failure}
        </p>
      ) : null}
    </li>
  );
}

/**
 * "Hand over": what the guest pays, how they paid — cash, or card at the
 * venue's terminal — and "Paid, handed over". A modal: it takes the focus,
 * keeps it, Escape goes back.
 */
function PayDialog({
  branchId,
  order,
  online,
  format,
  onClose,
  onCollected,
}: {
  readonly branchId: string;
  readonly order: StaffTakeawayOrder;
  readonly online: boolean;
  readonly format: BranchFormat;
  readonly onClose: () => void;
  readonly onCollected: (method: TakeawayPaymentMethod) => void;
}) {
  const { t } = useTranslation(['staff', 'common']);
  const collect = useCollectTakeawayOrder(branchId);
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const sending = useRef(false);
  const [method, setMethod] = useState<TakeawayPaymentMethod>('cash');
  const [failure, setFailure] = useState<string | null>(null);
  useDialogFocus(ref, { onEscape: onClose, escapeEnabled: !collect.isPending });

  function confirm() {
    if (sending.current || !online) return;
    sending.current = true;
    setFailure(null);
    collect.mutate(
      { orderId: order.id, method },
      {
        onSuccess: () => {
          sending.current = false;
          onCollected(method);
        },
        onError: (error) => {
          sending.current = false;
          setFailure(takeawayFailureText(t, error, (iso) => format.time(iso)));
        },
      },
    );
  }

  const option = (value: TakeawayPaymentMethod, label: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={method === value}
      className="takeaway-method"
      {...(value === 'cash' ? { 'data-autofocus': true } : {})}
      disabled={collect.isPending}
      onClick={() => setMethod(value)}
    >
      {label}
    </button>
  );

  return (
    <div className="ft-scrim">
      <div
        ref={ref}
        className="takeaway-pay-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <h2 id={titleId}>{t('takeaway.pay.title', { code: order.code })}</h2>
        <p className="takeaway-pay-due">
          {t('takeaway.pay.due')} <b>{format.dram(order.totalDram)}</b>
        </p>
        <div className="takeaway-methods" role="radiogroup" aria-label={t('takeaway.pay.method')}>
          {option('cash', t('takeaway.pay.cash'))}
          {option('card', t('takeaway.pay.card'))}
        </div>
        <p className="table-note">{t('takeaway.pay.hint', { app: t('common:appName') })}</p>
        {failure ? (
          <p className="table-warn" role="alert">
            {failure}
          </p>
        ) : null}
        {!online ? <p className="table-note">{t('takeaway.needsOnline')}</p> : null}
        <div className="takeaway-pay-actions">
          <button
            type="button"
            className="ft-btn ft-btn-secondary"
            disabled={collect.isPending}
            onClick={onClose}
          >
            {t('takeaway.pay.back')}
          </button>
          <button
            type="button"
            className="ft-btn ft-btn-ok"
            disabled={collect.isPending || !online}
            onClick={confirm}
          >
            {collect.isPending ? t('takeaway.sending') : t('takeaway.pay.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}

function finishedText(t: TFunction, order: StaffTakeawayOrder, format: BranchFormat): string {
  switch (order.status) {
    case 'collected':
      return t('takeaway.finished.collected', {
        code: order.code,
        time: order.collectedAtUtc ? format.time(order.collectedAtUtc) : '—',
      });
    case 'noShow':
      return t('takeaway.finished.noShow', { code: order.code });
    case 'declined':
      return order.declinedBecause === 'noAnswer'
        ? t('takeaway.finished.noAnswer', { code: order.code })
        : t('takeaway.finished.declined', { code: order.code });
    default:
      return order.code;
  }
}

function doneText(t: TFunction, done: Done, format: BranchFormat): string {
  switch (done.kind) {
    case 'collected':
      return t('takeaway.handed', {
        code: done.code,
        amount: format.dram(done.amountDram),
        method: t(`takeaway.method.${done.method}`),
      });
    case 'noShow':
      return t('takeaway.noShowDone', { code: done.code });
    default:
      return answeredText(t, done, (iso) => format.time(iso));
  }
}
