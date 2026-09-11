import type { ConsoleBooking } from '@yalla/api';
import {
  useApproveReservation,
  usePendingReservations,
  useRejectReservation,
} from '@yalla/api/react';
import { useTranslation } from '@yalla/i18n';
import { useId, useState } from 'react';
import { QueryFailureNotice } from '../../../components/QueryFailureNotice';
import { decisionFailureText } from './decisionFailure';

/**
 * The bookings the policy stopped, with the two decisions beside each.
 *
 * It lives on the policy tab because that is where the rule that creates
 * these is set: an owner who turns approval on is looking at the place the
 * consequence lands. Three things it is careful about:
 *
 * - **A decision leaves the list at once.** The list is refetched on settle,
 *   success or refusal, because a 409 means somebody else decided first and
 *   the stale list is the thing to fix.
 * - **Declining asks.** The diner is told their booking was refused; an
 *   accidental tap here is a phone call nobody wants to make. The reason is
 *   optional and recorded on the booking, never shown to the diner.
 * - **A refusal is shown in the server's words, on the row it is about.** The
 *   403 and the 409 are written to be read, and a generic "something went
 *   wrong" would hide the one fact the person needs.
 */
export function AwaitingApprovalPanel({ branchId }: { readonly branchId: string }) {
  const { t } = useTranslation(['admin', 'common']);
  const titleId = useId();
  const query = usePendingReservations(branchId);
  const pending = query.data ?? [];

  return (
    <section className="todo approvals" aria-labelledby={titleId}>
      <div className="approvals-head">
        <h3 id={titleId} className="approvals-title">
          {t('approvals.title')}
          {pending.length > 0 ? (
            <span className="badge badge-warn">
              {t('approvals.count', { count: pending.length })}
            </span>
          ) : null}
        </h3>
        <p className="small muted">{t('approvals.body')}</p>
      </div>

      {query.isError ? (
        <QueryFailureNotice
          error={query.error}
          offline={query.fetchStatus === 'paused'}
          onRetry={() => void query.refetch()}
        />
      ) : query.isPending ? (
        <p className="muted small">{t('loading')}</p>
      ) : pending.length === 0 ? (
        <p className="muted">{t('approvals.empty')}</p>
      ) : (
        <ul className="approvals-list">
          {pending.map((booking) => (
            <BookingRow key={booking.id} booking={booking} branchId={branchId} />
          ))}
        </ul>
      )}
    </section>
  );
}

function BookingRow({
  booking,
  branchId,
}: {
  readonly booking: ConsoleBooking;
  readonly branchId: string;
}) {
  const { t, i18n } = useTranslation(['admin', 'common']);
  const reasonId = useId();
  const approve = useApproveReservation(branchId);
  const reject = useRejectReservation(branchId);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');
  const [failure, setFailure] = useState<string | null>(null);

  const busy = approve.isPending || reject.isPending;
  const copy = { offline: t('approvals.offline'), generic: t('approvals.failed') };

  function decide(run: typeof approve, command: { reason?: string }) {
    setFailure(null);
    run.mutate(
      { reservationId: booking.id, ...command },
      {
        onSuccess: () => setDeclining(false),
        onError: (error) => setFailure(decisionFailureText(error, copy)),
      },
    );
  }

  return (
    <li className="approvals-row">
      <div className="approvals-who">
        <strong>{booking.guestName}</strong>
        <span className="muted small">{booking.guestPhone}</span>
      </div>

      <div className="approvals-what">
        <span>{whenAt(booking, i18n.language)}</span>
        <span className="muted">
          {t('approvals.party', { count: booking.partySize })}
          {' · '}
          {t('approvals.table', { label: booking.tableLabel })}
          {' · '}
          <code>{booking.code}</code>
        </span>
        <span className="badge">
          {t(`approvals.because.${booking.awaitingApprovalBecause ?? 'unknown'}`)}
        </span>
      </div>

      <div className="approvals-actions">
        {declining ? (
          <div className="approvals-decline">
            <label className="labelled" htmlFor={reasonId}>
              {t('approvals.reasonLabel')}
            </label>
            <textarea
              id={reasonId}
              className="field"
              rows={2}
              value={reason}
              disabled={busy}
              onChange={(event) => setReason(event.target.value)}
            />
            <p className="small muted">{t('approvals.reasonHint')}</p>
            <div className="page-actions">
              <button
                type="button"
                className="button"
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
                className="button button-danger"
                disabled={busy}
                onClick={() => {
                  const typed = reason.trim();
                  decide(reject, typed ? { reason: typed } : {});
                }}
              >
                {reject.isPending ? t('saving') : t('approvals.confirmDecline')}
              </button>
            </div>
          </div>
        ) : (
          <div className="page-actions">
            <button
              type="button"
              className="button"
              disabled={busy}
              onClick={() => setDeclining(true)}
            >
              {t('approvals.decline')}
            </button>
            <button
              type="button"
              className="button button-primary"
              disabled={busy}
              onClick={() => decide(approve, {})}
            >
              {approve.isPending ? t('saving') : t('approvals.approve')}
            </button>
          </div>
        )}

        {failure ? (
          <p className="error small" role="alert">
            {failure}
          </p>
        ) : null}
      </div>
    </li>
  );
}

/**
 * "Fri 12 Sep, 19:00" in the viewer's language. The two fields are the
 * branch's own wall clock, so no zone conversion: they are joined as written
 * and formatted as a plain calendar date, which is what the diner was told.
 */
function whenAt(booking: ConsoleBooking, language: string): string {
  const time = booking.localStartTime.slice(0, 5);
  const date = new Date(`${booking.localDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return `${booking.localDate} ${time}`;
  const day = new Intl.DateTimeFormat(language, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(date);
  return `${day}, ${time}`;
}
