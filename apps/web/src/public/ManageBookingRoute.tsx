import { freeCancellationCopy, newCommandId } from '@yalla/api';
import {
  isOfflinePaused,
  useCancelManagedBooking,
  useManagedBooking,
  useNow,
} from '@yalla/api/react';
import { formatDate, formatTime } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { FailedPage, LoadingPage } from './PageStates';

/**
 * `/{venueSlug}/{branchSlug}/booking/{token}` — the way out, without an account.
 *
 * The most important page in this route group, and the least visited. A booking
 * made from the web reaches no push channel: no reminder, no "still coming?",
 * no one-tap cancel. Everything Yalla does about no-shows is delivered through
 * a notification this person will never receive. If cancelling is harder than
 * not turning up, they will not turn up — and the venue that printed the link
 * on a card is worse off than before it did.
 *
 * So: no session, no phone number re-entry, no account. The token in the URL is
 * the credential, it grants sight of and power over **this one booking**, and
 * the page it opens has one button on it.
 */
export function ManageBookingRoute() {
  const { venueSlug, branchSlug, token } = useParams<{
    venueSlug: string;
    branchSlug: string;
    token: string;
  }>();
  const { t } = useTranslation('public');
  const { t: td } = useTranslation('diner');
  const { locale } = useLocale();

  const bookingQuery = useManagedBooking(token);
  const cancel = useCancelManagedBooking(token);
  const [confirming, setConfirming] = useState(false);
  // Subscribed to rather than read during render, so the deadline actually
  // passes on a page somebody left open — and so the render stays pure.
  const now = useNow(30_000);

  /*
   * One id for the life of this page, reused on every retry — the same rule the
   * booking itself follows. Cancelling twice because the first response was
   * lost must be the same command, not a second one.
   */
  const commandId = useRef(newCommandId()).current;

  if (bookingQuery.isLoading) return <LoadingPage />;
  if (bookingQuery.isError || isOfflinePaused(bookingQuery)) {
    return (
      <FailedPage
        offline={isOfflinePaused(bookingQuery)}
        error={bookingQuery.error}
        onRetry={() => void bookingQuery.refetch()}
      />
    );
  }

  const booking = bookingQuery.data;

  /*
   * One answer for an unknown, expired, malformed or revoked token. Telling
   * them apart would turn this endpoint into an oracle somebody could use to
   * find valid tokens, and none of the four is actionable by the visitor
   * anyway — the useful sentence is the same in all of them.
   */
  if (!booking) {
    return (
      <main className="pub-state">
        <h1 className="display">{t('manage.gone.title')}</h1>
        <p>{t('manage.gone.body')}</p>
        <Link className="pub-button" to={`/${venueSlug}/${branchSlug}`}>
          {t('manage.seeVenue')}
        </Link>
      </main>
    );
  }

  const when = `${formatDate(booking.slotUtc, booking.timeZoneId, locale)} · ${formatTime(
    booking.slotUtc,
    booking.timeZoneId,
    locale,
  )}`;
  const cancellation = freeCancellationCopy(
    booking.freeCancellationUntilUtc,
    booking.timeZoneId,
    locale,
  );
  const past = new Date(booking.freeCancellationUntilUtc).getTime() < now.getTime();

  if (booking.status === 'cancelled') {
    return (
      <main className="pub-state">
        <h1 className="display">{t('manage.cancelled')}</h1>
        <p>{t('manage.cancelledBody')}</p>
        <Link className="pub-button" to={`/${booking.venueSlug}/${booking.branchSlug}`}>
          {t('manage.seeVenue')}
        </Link>
      </main>
    );
  }

  return (
    <main className="pub-page">
      <header className="pub-head">
        <h1 className="display">{t('manage.title')}</h1>
      </header>

      <section className="pub-section">
        <div className="pub-code">
          <p className="pub-code-label">{td('success.codeLabel')}</p>
          <p className="pub-code-value num" aria-label={booking.code.split('').join(' ')}>
            {booking.code}
          </p>
        </div>

        <dl className="pub-summary">
          <div>
            <dt>{td('confirm.venue')}</dt>
            <dd>{`${booking.venueName} · ${booking.branchName}`}</dd>
          </div>
          <div>
            <dt>{td('confirm.when')}</dt>
            <dd>{when}</dd>
          </div>
          <div>
            <dt>{td('confirm.party')}</dt>
            <dd>{td('booking.guests', { count: booking.partySize })}</dd>
          </div>
          <div>
            <dt>{td('confirm.tableRow')}</dt>
            <dd>{booking.tableLabel}</dd>
          </div>
        </dl>

        <p className="pub-muted">{td(cancellation.key, cancellation.params)}</p>
      </section>

      {booking.canCancel ? (
        <section className="pub-section">
          {confirming ? (
            <div className="pub-confirm">
              <p>{td('bookings.detail.cancelTitle')}</p>
              {/*
                Lateness is a sentence, never a disabled button. Cancelling ten
                minutes before is far better for the venue than a no-show, and a
                page that refused here would be optimising the wrong number.
              */}
              <p className="pub-muted">
                {past ? td('bookings.detail.cancelLate') : td('bookings.detail.cancelFree')}
              </p>
              {cancel.isError ? <p className="pub-error">{t('manage.cancelFailed')}</p> : null}
              <div className="pub-actions">
                <button
                  type="button"
                  className="pub-button pub-button-danger"
                  disabled={cancel.isPending}
                  onClick={() => cancel.mutate(commandId)}
                >
                  {cancel.isPending ? t('manage.cancelling') : td('bookings.detail.cancelConfirm')}
                </button>
                <button
                  type="button"
                  className="pub-button pub-button-quiet"
                  onClick={() => setConfirming(false)}
                >
                  {td('bookings.detail.cancelKeep')}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="pub-button pub-button-quiet"
              onClick={() => setConfirming(true)}
            >
              {t('manage.cancel')}
            </button>
          )}
        </section>
      ) : null}

      <section className="pub-section">
        <address className="pub-address">{booking.addressLine}</address>
        <Link
          className="pub-button pub-button-quiet"
          to={`/${booking.venueSlug}/${booking.branchSlug}`}
        >
          {t('manage.seeVenue')}
        </Link>
      </section>
    </main>
  );
}
