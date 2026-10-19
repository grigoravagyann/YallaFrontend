import {
  approvalCountdown,
  waitsOnEarlierGuestInApp,
  type ApprovalCountdown,
  type ConsoleBooking,
} from '@yalla/api';
import {
  useApproveReservation,
  useNow,
  usePendingReservations,
  useRejectReservation,
} from '@yalla/api/react';
import { branchDayKey, type TimeZone } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { QueryFailureNotice } from '../../../components/QueryFailureNotice';
import { ClockIcon } from '../../ui/icons';
import { useToast } from '../../ui/toast';
import { decisionFailureText, isAwaitingEarlierGuest } from './decisionFailure';

/** Under five minutes left the clock turns amber; under one, red (the Main artboard). */
const SOON_SECONDS = 300;
const NOW_SECONDS = 60;

/** The artboard caps the reason at 200 characters. */
const MAX_REASON = 200;

/**
 * The bookings waiting for the venue's yes or no, at the top of Overview.
 *
 * It used to sit on the policy screen, where the rule that creates these is
 * set. The user moved it here (venue HANDOFF section 6): a short-notice
 * booking has fifteen minutes, and Overview is the screen that is open while
 * they run. What it is careful about:
 *
 * - **A decision leaves the list at once.** The list is read again on settle,
 *   success or refusal, because a 409 means somebody else decided first and
 *   the stale list is the thing to fix.
 * - **Declining asks.** The diner is told their booking was refused; an
 *   accidental click here is a phone call nobody wants to make. The reason is
 *   optional and recorded on the booking, never shown to the diner.
 * - **A refusal is shown in the server's words, on the row it is about**, with
 *   the console's own sentence for the few the server's are not written for
 *   (too late, answered elsewhere, the guest before answers it).
 * - **A clock where there is one.** A short-notice booking is declined by
 *   itself when its window closes; the time left is on its row, and once it is
 *   up the row stops offering a decision the server would refuse and says what
 *   happened instead, until it is put away.
 * - **The guest before answers some in the app** (`awaitsEarlierGuestAnswer`):
 *   those rows say so and offer nothing, and the server's
 *   `reservation-awaiting-earlier-guest` refusal turns a row round the same way.
 */
export function ApprovalsCard({
  branchId,
  timeZoneId,
}: {
  readonly branchId: string;
  readonly timeZoneId: string;
}) {
  const { t } = useTranslation(['admin', 'common']);
  const titleId = useId();
  const query = usePendingReservations(branchId);
  // One clock for every row: the countdowns are seconds.
  const now = useNow(1000);
  // Rows whose window closed on this device's clock and that were put away
  // with "Got it": the next read drops them anyway, once the server agrees.
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() => new Set());
  const pending = (query.data ?? []).filter((booking) => !dismissed.has(booking.id));
  const live = pending.filter(
    (booking) => !(approvalCountdown(booking.approvalExpiresAtUtc, now)?.expired ?? false),
  );

  return (
    <section className="yc-card" aria-labelledby={titleId}>
      <div className="yc-card-h">
        <div>
          <h2 className="yc-h2" id={titleId}>
            {t('approvals.title')}
          </h2>
          <p className="yc-cap">{t('approvals.body')}</p>
        </div>
        {live.length > 0 ? (
          <span className="yc-pill yc-pill-amber">
            {t('approvals.count', { count: live.length })}
          </span>
        ) : null}
      </div>

      {query.isError ? (
        <div className="yc-ov-pad">
          <QueryFailureNotice
            error={query.error}
            offline={query.fetchStatus === 'paused'}
            onRetry={() => void query.refetch()}
          />
        </div>
      ) : query.isPending ? (
        <p className="yc-empty-line" role="status">
          {t('loading')}
        </p>
      ) : pending.length === 0 ? (
        <p className="yc-ov-empty">{t('approvals.empty')}</p>
      ) : (
        <ul className="yc-appr" aria-live="polite">
          {pending.map((booking) => (
            <ApprovalRow
              key={booking.id}
              booking={booking}
              branchId={branchId}
              timeZoneId={timeZoneId}
              now={now}
              onDismiss={() => setDismissed((current) => new Set(current).add(booking.id))}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function ApprovalRow({
  booking,
  branchId,
  timeZoneId,
  now,
  onDismiss,
}: {
  readonly booking: ConsoleBooking;
  readonly branchId: string;
  readonly timeZoneId: string;
  readonly now: Date;
  readonly onDismiss: () => void;
}) {
  const { t } = useTranslation(['admin', 'common']);
  const { locale } = useLocale();
  const toast = useToast();
  const reasonId = useId();
  const helpId = useId();
  const approve = useApproveReservation(branchId);
  const reject = useRejectReservation(branchId);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');
  const [failure, setFailure] = useState<string | null>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const declineRef = useRef<HTMLButtonElement>(null);
  /** Set when the decline form closes with Keep: the focus goes back to its opener. */
  const returnFocus = useRef(false);
  // The guest before answers it in the app: nothing for the venue to decide
  // (see `waitsOnEarlierGuestInApp`) — as the server says, or as its refusal
  // says. Never from the clock: the venue's own two hours to ring them look
  // the same.
  const [theirsToAnswer, setTheirsToAnswer] = useState(false);
  const guestAnswers =
    theirsToAnswer ||
    waitsOnEarlierGuestInApp(booking.awaitingApprovalBecause, booking.awaitsEarlierGuestAnswer);

  const countdown = approvalCountdown(booking.approvalExpiresAtUtc, now, locale);
  // Up on this device's clock: the server declines it, and the next read takes the row away.
  const expired = countdown?.expired ?? false;
  const busy = approve.isPending || reject.isPending;

  useEffect(() => {
    if (declining) reasonRef.current?.focus();
    else if (returnFocus.current) {
      returnFocus.current = false;
      declineRef.current?.focus();
    }
  }, [declining]);

  const copy = {
    offline: t('approvals.offline'),
    generic: t('approvals.failed'),
    tooLate: t('approvals.tooLate'),
    answeredElsewhere: t('approvals.answeredElsewhere'),
    awaitingEarlierGuest: t('approvals.awaitingEarlierGuest'),
  };

  function decide(run: typeof approve, command: { reason?: string }, said: string) {
    setFailure(null);
    run.mutate(
      { reservationId: booking.id, ...command },
      {
        onSuccess: () => {
          setDeclining(false);
          toast.say(said);
        },
        onError: (error) => {
          if (isAwaitingEarlierGuest(error)) setTheirsToAnswer(true);
          setFailure(decisionFailureText(error, copy));
        },
      },
    );
  }

  function confirmDecline(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const typed = reason.trim();
    decide(
      reject,
      typed ? { reason: typed } : {},
      t('approvals.declined', { name: booking.guestName }),
    );
  }

  const time = booking.localStartTime.slice(0, 5);
  const otherDay = booking.localDate !== branchDayKey(now, timeZoneId as TimeZone);

  return (
    <li className={expired ? 'is-expired' : undefined}>
      <div className="yc-ap-top">
        <span className="yc-ap-time">{time}</span>
        {otherDay ? <span className="yc-ap-day">{dayOf(booking.localDate, locale)}</span> : null}
        <span className="yc-ap-who">{booking.guestName}</span>
        <span className="yc-ap-meta">
          {t('approvals.party', { count: booking.partySize })}
          {' · '}
          {t('approvals.table', { label: booking.tableLabel })}
          {' · '}
          <span className="yc-mono">{booking.code}</span>
          {booking.guestPhone ? (
            <>
              {' · '}
              <a href={`tel:${booking.guestPhone.replace(/\s+/gu, '')}`}>{booking.guestPhone}</a>
            </>
          ) : null}
        </span>
        <span className="yc-pill yc-pill-brand">
          {t(`approvals.because.${booking.awaitingApprovalBecause ?? 'unknown'}`)}
        </span>
      </div>

      {/* What the diner asked for when booking (K9). Deciding without it is
          deciding blind: "a birthday, a quiet corner" is often the reason a
          large party is worth a yes. Plain text, never markup. */}
      {booking.note ? (
        <p className="yc-ap-note">
          <b>{t('reservations.note')}</b> {booking.note}
        </p>
      ) : null}

      {expired ? (
        <div className="yc-ap-foot">
          <span className="yc-clock is-now" role="status">
            {t('approvals.timeUp')}
          </span>
          <span className="yc-grow" />
          <button type="button" className="yc-btn yc-btn-ghost yc-btn-sm" onClick={onDismiss}>
            {t('approvals.dismiss')}
          </button>
        </div>
      ) : guestAnswers ? (
        failure ? null : (
          <div className="yc-ap-foot">
            {countdown ? <Clock countdown={countdown} /> : null}
            <span className="yc-muted yc-small">{t('approvals.awaitingEarlierGuest')}</span>
          </div>
        )
      ) : declining ? (
        <form
          className="yc-decl"
          noValidate
          aria-label={t('approvals.confirmDecline')}
          onSubmit={confirmDecline}
        >
          <div className="yc-fld">
            <label htmlFor={reasonId}>{t('approvals.reasonLabel')}</label>
            <textarea
              ref={reasonRef}
              id={reasonId}
              className="yc-ctl"
              rows={3}
              maxLength={MAX_REASON}
              value={reason}
              aria-describedby={helpId}
              onChange={(event) => setReason(event.target.value)}
            />
            <span className="yc-help" id={helpId}>
              {t('approvals.reasonHint')}
            </span>
          </div>
          <div className="yc-decl-acts">
            <button
              type="button"
              className="yc-btn yc-btn-sec yc-btn-sm"
              disabled={busy}
              onClick={() => {
                returnFocus.current = true;
                setDeclining(false);
                setReason('');
                setFailure(null);
              }}
            >
              {t('approvals.keep')}
            </button>
            <button
              type="submit"
              className="yc-btn yc-btn-danger yc-btn-sm"
              aria-busy={reject.isPending}
            >
              {reject.isPending ? t('saving') : t('approvals.confirmDecline')}
            </button>
          </div>
        </form>
      ) : (
        <div className="yc-ap-foot">
          {countdown ? <Clock countdown={countdown} /> : null}
          <span className="yc-grow" />
          <button
            ref={declineRef}
            type="button"
            className="yc-btn yc-btn-sec yc-btn-sm"
            disabled={busy}
            onClick={() => {
              setReason('');
              setFailure(null);
              setDeclining(true);
            }}
          >
            {t('approvals.decline')}
          </button>
          <button
            type="button"
            className="yc-btn yc-btn-pri yc-btn-sm"
            aria-busy={approve.isPending}
            disabled={reject.isPending}
            onClick={() => {
              if (approve.isPending) return;
              decide(approve, {}, t('approvals.approved', { name: booking.guestName }));
            }}
          >
            {approve.isPending ? t('saving') : t('approvals.approve')}
          </button>
        </div>
      )}

      {failure ? (
        <p className="yc-err" role="alert">
          {failure}
        </p>
      ) : null}
    </li>
  );
}

/** "14:05 left to answer", muted, then amber under five minutes and red under one. */
function Clock({ countdown }: { readonly countdown: ApprovalCountdown }) {
  const { t } = useTranslation(['admin', 'common']);
  const left = countdown.secondsLeft;
  const tone = left > SOON_SECONDS ? 'is-ok' : left > NOW_SECONDS ? 'is-soon' : 'is-now';
  return (
    <span
      className={`yc-clock ${tone}`}
      role="timer"
      aria-label={t('approvals.minutesLeft', { count: Math.ceil(left / 60) })}
    >
      <ClockIcon />
      {t('approvals.leftToAnswer', { time: countdown.label })}
    </span>
  );
}

/**
 * "Fri 12 Sep" for a booking on another day. The date is the branch's own
 * calendar day, so it is formatted as a plain date with no zone conversion.
 */
function dayOf(localDate: string, locale: string): string {
  const date = new Date(`${localDate}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return localDate;
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(date);
}
