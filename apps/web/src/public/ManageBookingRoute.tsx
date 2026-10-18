import {
  approvalCountdown,
  awaitsVenueAnswer,
  declinedCopy,
  freeCancellationCopy,
  promisedFreeByCopy,
  venueAnswerCopy,
} from '@yalla/api';
import {
  isOfflinePaused,
  useCancelManagedBooking,
  useManagedBooking,
  useNow,
} from '@yalla/api/react';
import { formatDate, formatTime } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { usePageTitle } from './meta';
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
 *
 * A booking for tonight may still be waiting for the venue's floor, which has
 * fifteen minutes to answer: the page counts them down and reads the booking
 * again until it is answered (`useManagedBooking` polls while it waits). A
 * booking the venue declined says so, and why, rather than "cancelled".
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

  // The slugs travel from this URL: the endpoint does not send them back, and
  // the page links home with them.
  const slugs = { venueSlug: venueSlug ?? '', branchSlug: branchSlug ?? '' };
  const bookingQuery = useManagedBooking(token, slugs);
  const cancel = useCancelManagedBooking(token, slugs);
  const [confirming, setConfirming] = useState(false);
  // Subscribed to rather than read during render, so the deadline actually
  // passes on a page somebody left open — and so the render stays pure. Each
  // second while the venue's answer is counted down.
  const awaiting = bookingQuery.data ? awaitsVenueAnswer(bookingQuery.data) : false;
  const now = useNow(awaiting ? 1000 : 30_000);
  // What the booking is, in the tab bar: the manage page, the cancelled page
  // and the dead link each name themselves rather than leaving "Yalla".
  const booked = bookingQuery.data;
  usePageTitle(
    !booked
      ? t('manage.gone.title')
      : booked.status === 'cancelled'
        ? t('manage.cancelled')
        : t('manage.title'),
    t('appName', { ns: 'common' }),
  );

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
  const answer = venueAnswerCopy(booking, now, locale);
  // Booking times: the promise made when booking, because another follows.
  const promise = promisedFreeByCopy(booking.promisedFreeByUtc, booking.timeZoneId, locale);
  const countdown = approvalCountdown(booking.approvalExpiresAtUtc, now, locale);

  const declinedTitle = declinedCopy(booking.declinedBecause, 'title');
  if (booking.status === 'cancelled' && declinedTitle) {
    const declinedBody = declinedCopy(booking.declinedBecause, 'body');
    return (
      <main className="pub-state">
        <h1 className="display">{td(declinedTitle.key, declinedTitle.params)}</h1>
        {declinedBody ? <p>{td(declinedBody.key, declinedBody.params)}</p> : null}
        <Link className="pub-button" to={`/${booking.venueSlug}/${booking.branchSlug}`}>
          {t('manage.seeVenue')}
        </Link>
      </main>
    );
  }

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
            {/* "Table 2", not a bare "2": read on its own by a screen reader
                the digit says nothing. The room follows when the table is in
                one, so "Table 1 · Hall" says which door to walk through. */}
            <dd>
              {td('table.title', { label: booking.tableLabel })}
              {booking.floorAreaName ? ` · ${booking.floorAreaName}` : ''}
            </dd>
          </div>
        </dl>

        {booking.status === 'pendingApproval' ? (
          <p className="pub-notice">
            {booking.awaitingApprovalBecause === 'earlierGuestConsent'
              ? // The venue rings a guest before who cannot answer in the app.
                td(
                  booking.awaitsEarlierGuestAnswer === false
                    ? 'booking.approval.venueAsksEarlierGuest'
                    : 'table.requestable.earlierGuest',
                )
              : booking.approvalExpiresAtUtc
                ? td('booking.approval.why')
                : td('success.pendingBody')}
          </p>
        ) : null}
        {promise ? <p className="pub-notice">{td(promise.key, promise.params)}</p> : null}
        {answer ? (
          <p
            className={`pub-answer${countdown?.urgent ? ' is-urgent' : ''}`}
            role="timer"
            aria-label={td(answer.key, answer.params)}
          >
            {td(answer.key, answer.params)}
          </p>
        ) : null}

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
                  // No reason is collected: one button, and asking why would be a
                  // second screen between a diner and the thing the venue needs.
                  onClick={() => cancel.mutate(undefined)}
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
