import {
  TAKEAWAY_LIMITS,
  defaultTakeawayReadyAtUtc,
  stepTakeawayReadyAtUtc,
  takeawayNote,
  type StaffTakeawayOrder,
} from '@yalla/api';
import { useAcceptTakeawayOrder, useDeclineTakeawayOrder, useNow } from '@yalla/api/react';
import { formatPhone } from '@yalla/format';
import { useTranslation } from '@yalla/i18n';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { RailSection } from '../FloorRail';
import { useBranchFormat } from '../useBranchFormat';
import { answerCountdown, takeawayFailureText } from './takeawayText';

/**
 * A takeaway order waiting for the venue's answer (2026-10-22, the Rail
 * artboard): "Takeaway · accept" on the Now rail, and at the top of the
 * Takeaway page's middle column.
 *
 * Everything the decision needs, in the order it is read: the code and the
 * clock (an order nobody answers is declined by itself five minutes after it
 * lands, and the guest told), who and their number, the dishes, the note, when
 * they want it — then the ready time the guest will be told, ±5 minutes, and
 * Decline / Accept. Accepting sends it straight to the kitchen.
 *
 * Online only, never queued: an accept that landed minutes late would promise
 * the guest a time nobody saw. Declining asks first, with an optional reason
 * the guest is shown.
 */

/** What an answer did, for the line that says so. */
export interface TakeawayAnswered {
  readonly kind: 'accepted' | 'declined';
  readonly code: string;
  /** The promised ready time, accepted. */
  readonly readyAtUtc: string | null;
}

export interface TakeawayAcceptCardProps {
  readonly branchId: string;
  readonly order: StaffTakeawayOrder;
  readonly timeZoneId: string;
  readonly online: boolean;
  /** One clock for every card on the screen, read each second. */
  readonly now: Date;
  readonly onAnswered: (answer: TakeawayAnswered) => void;
}

export function TakeawayAcceptCard({
  branchId,
  order,
  timeZoneId,
  online,
  now,
  onAnswered,
}: TakeawayAcceptCardProps) {
  const { t } = useTranslation(['staff', 'common']);
  const format = useBranchFormat(timeZoneId);
  const accept = useAcceptTakeawayOrder(branchId);
  const decline = useDeclineTakeawayOrder(branchId);
  const titleId = useId();
  const reasonId = useId();
  const declineRef = useRef<HTMLDivElement>(null);
  const declineButton = useRef<HTMLButtonElement>(null);
  /** The question was open: when it closes, focus goes back to Decline. */
  const asked = useRef(false);
  /** A tap already on its way: two in one frame are one answer. */
  const sending = useRef(false);
  /** The stepper's ready time; the guest's own time until it is moved. */
  const [chosen, setChosen] = useState(() => defaultTakeawayReadyAtUtc(order, new Date()));
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    if (declining) {
      asked.current = true;
      declineRef.current?.focus({ preventScroll: true });
    } else if (asked.current) {
      asked.current = false;
      declineButton.current?.focus({ preventScroll: true });
    }
  }, [declining]);

  // Never a time already gone: the clock moves under a card left waiting.
  const readyMs = Math.max(Date.parse(chosen), now.getTime());
  const readyAtUtc = new Date(readyMs).toISOString();
  const countdown = answerCountdown(order.acceptDeadlineUtc, now);
  const closed = countdown?.expired ?? false;
  const busy = accept.isPending || decline.isPending;
  const off = busy || !online;
  const canEarlier = readyMs - 5 * 60_000 > now.getTime();
  const shownPhone = order.guestPhone ? formatPhone(order.guestPhone) : null;
  const time = (iso: string) => format.time(iso);

  function answer(kind: 'accepted' | 'declined') {
    if (sending.current || !online) return;
    sending.current = true;
    setFailure(null);
    const done = () => {
      sending.current = false;
      setDeclining(false);
    };
    const failed = (error: unknown) => {
      sending.current = false;
      setFailure(takeawayFailureText(t, error, time));
    };
    if (kind === 'accepted') {
      // A minute on at least: "now" is already past by the time it lands.
      const sent = new Date(Math.max(readyMs, Date.now() + 60_000)).toISOString();
      accept.mutate(
        { orderId: order.id, readyAtUtc: sent },
        {
          onSuccess: (result) => {
            done();
            onAnswered({ kind, code: order.code, readyAtUtc: result.readyAtUtc ?? sent });
          },
          onError: failed,
        },
      );
    } else {
      const typed = takeawayNote(reason);
      decline.mutate(
        { orderId: order.id, ...(typed ? { reason: typed } : {}) },
        {
          onSuccess: () => {
            done();
            onAnswered({ kind, code: order.code, readyAtUtc: null });
          },
          onError: failed,
        },
      );
    }
  }

  return (
    <li
      className={[
        'ft-item takeaway-accept',
        countdown?.urgent ? 'is-urgent' : '',
        closed ? 'is-closed' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-labelledby={titleId}
    >
      <div className="ft-item-top">
        <b
          id={titleId}
          className="takeaway-code"
          aria-label={t('takeaway.orderLabel', { code: order.code })}
        >
          {order.code}
        </b>
        {countdown ? (
          <span className="takeaway-countdown">
            {t('takeaway.answerWithin')}{' '}
            <span
              className="takeaway-countdown-value"
              role="timer"
              aria-label={t('takeaway.leftLabel', { time: countdown.label })}
            >
              {countdown.label}
            </span>
          </span>
        ) : null}
      </div>

      <p className="takeaway-guest">
        {order.guestName}
        {order.guestPhone && shownPhone ? (
          <>
            {' · '}
            <a
              href={`tel:${order.guestPhone.replace(/\s+/gu, '')}`}
              aria-label={t('takeaway.callName', { name: order.guestName, phone: shownPhone })}
            >
              {shownPhone}
            </a>
          </>
        ) : null}
      </p>

      <ul className="takeaway-lines" aria-label={t('takeaway.dishes')}>
        {order.lines.map((line) => (
          <li key={line.id}>{t('takeaway.line', { qty: line.quantity, name: line.name })}</li>
        ))}
      </ul>
      {order.note ? (
        <p className="takeaway-note">{t('takeaway.note', { note: order.note })}</p>
      ) : null}

      <p className="takeaway-wants">
        {t('takeaway.wants')}{' '}
        <b>
          {order.pickupAsap
            ? t('takeaway.asap')
            : t('takeaway.at', { time: format.time(order.requestedPickupUtc) })}
        </b>
      </p>

      {closed ? (
        <p className="table-note">{t('takeaway.timeUp')}</p>
      ) : declining ? (
        <div
          ref={declineRef}
          className="admission-confirm"
          role="group"
          aria-labelledby={`${titleId}-decline`}
          tabIndex={-1}
        >
          <h3 id={`${titleId}-decline`}>{t('takeaway.declineTitle', { code: order.code })}</h3>
          <label className="labelled" htmlFor={reasonId}>
            {t('takeaway.declineReason')}
          </label>
          <textarea
            id={reasonId}
            className="field approval-reason"
            rows={2}
            maxLength={TAKEAWAY_LIMITS.maxDeclineReason}
            value={reason}
            disabled={busy}
            onChange={(event) => setReason(event.target.value)}
          />
          <p className="table-note">{t('takeaway.declineHint')}</p>
          <div className="ft-item-actions">
            <button
              type="button"
              className="ft-btn ft-btn-secondary"
              disabled={busy}
              onClick={() => {
                setDeclining(false);
                setFailure(null);
              }}
            >
              {t('takeaway.keep')}
            </button>
            <button
              type="button"
              className="ft-btn ft-btn-danger"
              disabled={off}
              onClick={() => answer('declined')}
            >
              {decline.isPending ? t('takeaway.sending') : t('takeaway.confirmDecline')}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="takeaway-ready" role="group" aria-label={t('takeaway.readyAt')}>
            <span className="takeaway-ready-label" aria-hidden="true">
              {t('takeaway.readyAt')}
            </span>
            <button
              type="button"
              className="takeaway-step"
              aria-label={t('takeaway.earlier')}
              disabled={busy || !canEarlier}
              onClick={() => setChosen(stepTakeawayReadyAtUtc(readyAtUtc, -1, new Date()))}
            >
              −
            </button>
            <output className="takeaway-ready-value" aria-live="polite">
              {format.time(readyAtUtc)}
            </output>
            <button
              type="button"
              className="takeaway-step"
              aria-label={t('takeaway.later')}
              disabled={busy}
              onClick={() => setChosen(stepTakeawayReadyAtUtc(readyAtUtc, 1, new Date()))}
            >
              +
            </button>
          </div>
          <div className="ft-item-actions">
            <button
              ref={declineButton}
              type="button"
              className="ft-btn ft-btn-secondary"
              disabled={busy}
              aria-label={t('takeaway.declineName', { code: order.code })}
              onClick={() => {
                setFailure(null);
                setDeclining(true);
              }}
            >
              {t('takeaway.decline')}
            </button>
            <button
              type="button"
              className="ft-btn ft-btn-ok"
              disabled={off}
              aria-label={t('takeaway.acceptName', {
                code: order.code,
                time: format.time(readyAtUtc),
              })}
              onClick={() => answer('accepted')}
            >
              {accept.isPending ? t('takeaway.sending') : t('takeaway.accept')}
            </button>
          </div>
          <p className="table-note">{t('takeaway.acceptHint')}</p>
        </>
      )}

      {!online && !closed ? <p className="table-note">{t('takeaway.needsOnline')}</p> : null}
      {failure ? (
        <p className="table-warn" role="alert">
          {failure}
        </p>
      ) : null}
    </li>
  );
}

export interface TakeawayRailSectionProps {
  readonly branchId: string;
  /** The orders waiting for an answer, oldest first. */
  readonly orders: readonly StaffTakeawayOrder[];
  readonly timeZoneId: string;
  readonly online: boolean;
  /** The counter could not be read and nothing was ever: said, not hidden. */
  readonly failed: boolean;
  readonly icon: ReactNode;
}

/**
 * The rail's "Takeaway · accept" section. Only there while an order waits for
 * an answer (or the counter could not be read), and right after the bookings:
 * both have a clock on them. After an answer, a line says what became of it.
 */
export function TakeawayRailSection(props: TakeawayRailSectionProps) {
  const { t } = useTranslation(['staff', 'common']);
  // One clock for every card, read each second: the countdowns are seconds.
  const now = useNow(1000);
  const format = useBranchFormat(props.timeZoneId);
  const [answered, setAnswered] = useState<TakeawayAnswered | null>(null);

  useEffect(() => {
    if (!answered) return;
    const timer = setTimeout(() => setAnswered(null), ANSWERED_MS);
    return () => clearTimeout(timer);
  }, [answered]);

  if (props.orders.length === 0 && !props.failed && !answered) return null;

  return (
    <RailSection
      title={t('takeaway.railTitle')}
      count={props.orders.length}
      tone="waiting"
      icon={props.icon}
    >
      {answered ? (
        <p className="takeaway-done" role="status">
          {answeredText(t, answered, format.time)}
        </p>
      ) : null}
      {props.failed && props.orders.length === 0 ? (
        <p className="ft-rail-empty is-failed">{t('takeaway.unreachable')}</p>
      ) : (
        <ul className="ft-items">
          {props.orders.map((order) => (
            <TakeawayAcceptCard
              key={order.id}
              branchId={props.branchId}
              order={order}
              timeZoneId={props.timeZoneId}
              online={props.online}
              now={now}
              onAnswered={setAnswered}
            />
          ))}
        </ul>
      )}
    </RailSection>
  );
}

/** How long the line saying what became of an answer stays. */
export const ANSWERED_MS = 8_000;

export function answeredText(
  t: ReturnType<typeof useTranslation>['t'],
  answered: TakeawayAnswered,
  time: (iso: string) => string,
): string {
  return answered.kind === 'accepted'
    ? t('takeaway.accepted', {
        code: answered.code,
        time: answered.readyAtUtc ? time(answered.readyAtUtc) : '—',
      })
    : t('takeaway.declined', { code: answered.code });
}
