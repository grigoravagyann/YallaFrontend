import { approvalCountdown, waitsOnEarlierGuestInApp, type AwaitingApproval } from '@yalla/api';
import { useFloorApproveReservation, useFloorRejectReservation, useNow } from '@yalla/api/react';
import { useLocale, useTranslation } from '@yalla/i18n';
import { useEffect, useId, useRef, useState } from 'react';
import {
  decisionFailureText,
  isAwaitingEarlierGuest,
} from '../console/venue/policy/decisionFailure';
import {
  arrivalAnnouncement,
  branchToday,
  contextLines,
  newArrivals,
  requestLine,
  requestTable,
} from './approvalRequests';
import { playChime } from './chime';
import { useBranchFormat } from './useBranchFormat';

/**
 * Bookings waiting for somebody on the floor to say yes or no.
 *
 * An app booking for tonight must not be confirmed blindly for a table a
 * party may have just sat down at, so it waits here, and the people who can
 * see the room decide. Each card is built for that decision and nothing else:
 *
 * - **The clock first.** A short-notice request is declined by itself fifteen
 *   minutes after it arrives, so the time left is the largest thing on the
 *   card after the table, and it turns urgent in the last two minutes.
 * - **The table around it.** Who booked the table before (with a Call, to ask
 *   whether they are leaving), whether somebody is sitting there now, and who
 *   comes after. The three things a waiter would otherwise walk over to check.
 * - **Declining asks, once.** The guest is told no; the reason is optional and
 *   stays with the booking, never shown to them.
 *
 * A new request arrives with a soft chime, a pulse on its card and the header
 * count, and a sentence for a screen reader. Reduced motion keeps the
 * highlight and drops the pulse; a browser that refuses sound gets none.
 */
export interface ApprovalPanelProps {
  readonly branchId: string;
  readonly requests: readonly AwaitingApproval[];
  readonly timeZoneId: string;
  readonly loading: boolean;
  /** The list could not be read. Not the same as nobody waiting. */
  readonly failed: boolean;
  readonly online: boolean;
  /** Requests that arrived since the last read, pulsed. */
  readonly fresh: ReadonlySet<string>;
  /** What the live region says about them. */
  readonly announcement: string;
  /** A decision landed: the floor says so in its notice. */
  readonly onDecided: (outcome: {
    readonly approved: boolean;
    readonly request: AwaitingApproval;
  }) => void;
  /**
   * A decision was refused. Said on the card and in the floor's notice too:
   * the refusal is usually that somebody else answered or the time ran out,
   * and the next read takes the card — and its message — away.
   */
  readonly onRefused: (refusal: {
    readonly request: AwaitingApproval;
    readonly text: string;
  }) => void;
}

/** The section's id, so the header count can take the waiter to it. */
export const APPROVAL_PANEL_ID = 'floor-approvals';

export function ApprovalPanel(props: ApprovalPanelProps) {
  const { requests, loading, failed } = props;
  const { t } = useTranslation(['staff', 'common']);
  const titleId = useId();
  // One clock for every card, read each second: the countdowns are seconds.
  const now = useNow(1000);

  return (
    <section
      id={APPROVAL_PANEL_ID}
      className={`queue-block approvals-block${requests.length > 0 ? ' has-requests' : ''}`}
      aria-labelledby={titleId}
      tabIndex={-1}
    >
      <h2 id={titleId} className="approvals-heading">
        {t('approvals.title')}
        {requests.length > 0 ? <span className="approvals-count">{requests.length}</span> : null}
      </h2>

      {/* Always in the tree, so a screen reader is already listening when a
          request arrives; only its text changes. */}
      <p className="visually-hidden" role="status">
        {props.announcement}
      </p>

      {failed && requests.length === 0 ? (
        <p className="table-warn">{t('approvals.unreachable')}</p>
      ) : loading ? (
        <p className="floor-todo">{t('floor.loading')}</p>
      ) : requests.length === 0 ? (
        <p className="floor-todo">{t('approvals.empty')}</p>
      ) : (
        <ul className="queue-list">
          {requests.map((request) => (
            <ApprovalCard
              key={request.id}
              request={request}
              now={now}
              fresh={props.fresh.has(request.id)}
              branchId={props.branchId}
              timeZoneId={props.timeZoneId}
              online={props.online}
              onDecided={props.onDecided}
              onRefused={props.onRefused}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function ApprovalCard({
  request,
  now,
  fresh,
  branchId,
  timeZoneId,
  online,
  onDecided,
  onRefused,
}: {
  readonly request: AwaitingApproval;
  readonly now: Date;
  readonly fresh: boolean;
  readonly branchId: string;
  readonly timeZoneId: string;
  readonly online: boolean;
  readonly onDecided: ApprovalPanelProps['onDecided'];
  readonly onRefused: ApprovalPanelProps['onRefused'];
}) {
  const { t } = useTranslation(['staff', 'common']);
  const format = useBranchFormat(timeZoneId);
  const reasonId = useId();
  const approve = useFloorApproveReservation(branchId);
  const reject = useFloorRejectReservation(branchId);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');
  const [failure, setFailure] = useState<string | null>(null);
  /**
   * The answer this card already sent and the server took. The card stays
   * until the next read of the list takes it away, and in that time it offers
   * nothing more: a second tap would only be refused.
   */
  const [decided, setDecided] = useState<'approved' | 'declined' | null>(null);
  /*
   * The guest before answers this one in the app — as the server says, or as
   * it says by refusing a decision for it — so the floor has nothing to
   * decide: no approve or reject, which would only be refused, and whose
   * answer it waits for instead. Not from the clock: the floor's own question
   * to a guest before has the same two hours.
   */
  const [theirsToAnswer, setTheirsToAnswer] = useState(false);
  const guestAnswers =
    theirsToAnswer || waitsOnEarlierGuestInApp(request.because, request.awaitsEarlierGuestAnswer);
  /**
   * A send is under way. A ref, not the mutation's own pending state, because
   * two taps in one frame both run before that state reaches a render — and
   * the second would be a second request.
   */
  const sending = useRef(false);

  // The guest before's two hours read "1 hr 59 min"; the floor's fifteen, by the second.
  const { locale } = useLocale();
  const countdown = approvalCountdown(request.approvalExpiresAtUtc, now, locale);
  // The window closed on this device's clock. The server declines it at its
  // own instant and the next read takes the card away; until then nothing is
  // offered that it would refuse.
  const closed = countdown?.expired ?? false;
  const busy = approve.isPending || reject.isPending;
  // The branch's today, on the card's own clock: a booking for another day is dated.
  const days = branchToday(timeZoneId, (iso) => format.dayAndTime(iso).date, now);
  const lines = contextLines(request, t, format.time, days);

  function decide(approved: boolean) {
    if (sending.current || decided !== null) return;
    sending.current = true;
    setFailure(null);
    const typed = reason.trim();
    const run = approved ? approve : reject;
    run.mutate(
      { reservationId: request.id, ...(!approved && typed ? { reason: typed } : {}) },
      {
        onSuccess: () => {
          setDecided(approved ? 'approved' : 'declined');
          setDeclining(false);
          onDecided({ approved, request });
        },
        onError: (error) => {
          sending.current = false;
          if (isAwaitingEarlierGuest(error)) setTheirsToAnswer(true);
          const text = decisionFailureText(error, {
            offline: t('approvals.offline'),
            generic: t('approvals.failed'),
            tooLate: t('approvals.tooLate'),
            answeredElsewhere: t('approvals.answeredElsewhere'),
            awaitingEarlierGuest: t('approvals.awaitingEarlierGuest'),
          });
          setFailure(text);
          onRefused({ request, text });
        },
      },
    );
  }

  return (
    <li
      className={[
        'approval-card',
        fresh ? 'is-fresh' : '',
        countdown?.urgent ? 'is-urgent' : '',
        closed ? 'is-closed' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="approval-head">
        <span className="queue-table">{requestTable(request, t)}</span>
        {countdown && !guestAnswers ? (
          <span className="approval-countdown">
            <span className="approval-countdown-label">{t('approvals.answerWithin')}</span>{' '}
            <span
              className="approval-countdown-value"
              role="timer"
              aria-label={t('approvals.leftLabel', { time: countdown.label })}
            >
              {countdown.label}
            </span>
          </span>
        ) : null}
      </div>

      <p className="approval-line">{requestLine(request, t, format.time, days)}</p>
      <p className="approval-because">
        <span className="badge badge-warn">
          {t(`approvals.because.${request.because ?? 'unknown'}`)}
        </span>
      </p>
      {request.note ? <p className="order-line-note">{request.note}</p> : null}

      {lines.length > 0 ? (
        <ul className="approval-context">
          {lines.map((line) => (
            <li key={line.kind} className={`approval-context-${line.kind}`}>
              {line.text}
              {line.call ? (
                <>
                  {' · '}
                  <a
                    className="approval-call"
                    href={`tel:${line.call.phoneE164}`}
                    aria-label={t('approvals.callLabel', { name: line.call.name })}
                  >
                    {t('approvals.call')}
                  </a>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {decided ? (
        // Sent and taken: said once, and nothing left to tap.
        <p className="table-note approval-done" role="status">
          {decided === 'approved' ? t('approvals.doneApproved') : t('approvals.doneDeclined')}
        </p>
      ) : guestAnswers ? (
        // Theirs to answer: said once — in the alert when the server said it.
        failure ? null : (
          <p className="table-note" role="status">
            {t('approvals.awaitingEarlierGuest')}
          </p>
        )
      ) : closed ? (
        <p className="table-note">{t('approvals.timeUp')}</p>
      ) : declining ? (
        <div className="approval-decline">
          <label className="labelled" htmlFor={reasonId}>
            {t('approvals.reasonLabel')}
          </label>
          <textarea
            id={reasonId}
            className="field approval-reason"
            rows={2}
            value={reason}
            disabled={busy}
            onChange={(event) => setReason(event.target.value)}
          />
          <p className="table-note">{t('approvals.reasonHint')}</p>
          <div className="approval-actions">
            <button
              type="button"
              className="button big"
              disabled={busy}
              onClick={() => {
                setDeclining(false);
                setFailure(null);
              }}
            >
              {t('approvals.keep')}
            </button>
            <button
              type="button"
              className="button big approval-decline-confirm"
              disabled={busy || !online}
              onClick={() => decide(false)}
            >
              {reject.isPending ? t('approvals.sending') : t('approvals.confirmDecline')}
            </button>
          </div>
        </div>
      ) : (
        <div className="approval-actions">
          <button
            type="button"
            className="button big"
            disabled={busy}
            onClick={() => setDeclining(true)}
          >
            {t('approvals.decline')}
          </button>
          <button
            type="button"
            className="floor-button big"
            disabled={busy || !online}
            onClick={() => decide(true)}
          >
            {approve.isPending ? t('approvals.sending') : t('approvals.approve')}
          </button>
        </div>
      )}

      {!online && !closed && !decided && !guestAnswers ? (
        <p className="table-note">{t('approvals.needsOnline')}</p>
      ) : null}
      {failure ? (
        <p className="table-warn" role="alert">
          {failure}
        </p>
      ) : null}
    </li>
  );
}

/** How long a new request stays highlighted. */
const FRESH_MS = 8_000;

interface Arrival {
  readonly seq: number;
  readonly ids: ReadonlySet<string>;
  readonly text: string;
}

/**
 * Which requests are new since the last read, and the chime for them.
 *
 * Kept in state rather than refs: the previous list is compared while
 * rendering — the pattern React gives for "this prop changed" — and the side
 * effects, the sound and the timer that ends the highlight, run in an effect
 * keyed on the arrival. Nothing is new on the first read; see `newArrivals`.
 */
export function useRequestArrivals(
  requests: readonly AwaitingApproval[] | undefined,
  timeZoneId: string,
): { readonly fresh: ReadonlySet<string>; readonly announcement: string } {
  const { t } = useTranslation(['staff', 'common']);
  const format = useBranchFormat(timeZoneId);
  const [read, setRead] = useState<{
    readonly list: readonly AwaitingApproval[] | undefined;
    readonly seen: ReadonlySet<string> | null;
  }>({ list: undefined, seen: null });
  const [arrival, setArrival] = useState<Arrival>({ seq: 0, ids: new Set(), text: '' });
  const [cleared, setCleared] = useState(0);

  if (requests !== undefined && requests !== read.list) {
    const arrived = newArrivals(read.seen, requests);
    setRead({ list: requests, seen: new Set(requests.map((request) => request.id)) });
    if (arrived.length > 0) {
      setArrival({
        seq: arrival.seq + 1,
        ids: new Set(arrived),
        text: arrivalAnnouncement(
          requests.filter((request) => arrived.includes(request.id)),
          t,
          format.time,
          branchToday(timeZoneId, (iso) => format.dayAndTime(iso).date, new Date()),
        ),
      });
    }
  }

  useEffect(() => {
    if (arrival.seq === 0) return;
    void playChime();
    const timer = setTimeout(() => setCleared(arrival.seq), FRESH_MS);
    return () => clearTimeout(timer);
  }, [arrival.seq]);

  return {
    fresh: cleared === arrival.seq ? EMPTY : arrival.ids,
    announcement: arrival.text,
  };
}

const EMPTY: ReadonlySet<string> = new Set();
