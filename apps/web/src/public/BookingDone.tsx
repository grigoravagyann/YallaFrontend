import {
  approvalCountdown,
  awaitsVenueAnswer,
  declinedCopy,
  freeCancellationCopy,
  venueAnswerCopy,
  type Booking,
  type PublicBranch,
  type VenueAnswerState,
} from '@yalla/api';
import { useManagedBooking, useNow } from '@yalla/api/react';
import { formatDate, formatDuration, formatTime } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { useState } from 'react';
import { appUrl } from './gateways';
import { bookingIcs, downloadIcs, icsDescription } from './calendarFile';
import { useLangPath } from './language';

/**
 * The booking is made. Now the part that is specific to the web.
 *
 * A booking made in the app gets a reminder an hour before, a "still coming?"
 * nudge if the party is late, and a cancel button in the notification. A
 * booking made here gets **none of those**, because there is no push channel to
 * a page somebody opened from a chat. That is the entire no-show story, and it
 * does not reach this visitor.
 *
 * So this screen does three things beyond confirming, in this order, and the
 * order is the argument:
 *
 * 1. **Add to calendar.** Works everywhere, needs nothing, and puts the
 *    reminder where they already look. It is first because it is the only one
 *    of the three that is a complete substitute for what they are missing.
 * 2. **Get the app**, described as what it *adds* rather than as a download.
 *    Rendered only when there is an app to get — see `appUrl`.
 * 3. **A link to manage this booking**, which is not optional. Without it the
 *    only way out of a booking made here is not turning up, and a page that
 *    makes no-showing easier than cancelling is worse for the venue than no
 *    page at all.
 *
 * A booking for tonight is a request first: the venue's floor has fifteen
 * minutes to answer. With no push channel, this page is where the answer
 * arrives — it counts the minutes down and reads the booking again through its
 * manage link until the venue has said yes or no, then says which. Declined,
 * the three offers above go: there is nothing to remember or manage.
 */
export interface BookingDoneProps {
  readonly booking: Booking;
  readonly branch: PublicBranch;
}

export function BookingDone({ booking, branch }: BookingDoneProps) {
  const { t } = useTranslation('public');
  const { t: td } = useTranslation('diner');
  const { locale } = useLocale();
  const langPath = useLangPath();
  const [copied, setCopied] = useState(false);

  /* Resolved here rather than at import: see `gateways.ts`. */
  const installUrl = appUrl();

  /*
   * The booking as it now stands, while the venue decides: read through the
   * manage link, which polls itself until the answer is in. Only for a request
   * with a clock — every other booking already says all there is.
   */
  const waitsWithClock = awaitsVenueAnswer(booking);
  const live = useManagedBooking(waitsWithClock ? (booking.manageToken ?? undefined) : undefined, {
    venueSlug: branch.venue.slug,
    branchSlug: branch.slug,
  }).data;
  const answerState: VenueAnswerState = live
    ? {
        status: live.status,
        approvalExpiresAtUtc: live.approvalExpiresAtUtc,
        declinedBecause: live.declinedBecause,
        awaitingApprovalBecause: live.awaitingApprovalBecause ?? booking.awaitingApprovalBecause,
        awaitsEarlierGuestAnswer: live.awaitsEarlierGuestAnswer ?? booking.awaitsEarlierGuestAnswer,
      }
    : booking;
  const now = useNow(awaitsVenueAnswer(answerState) ? 1000 : 30_000);
  const answer = venueAnswerCopy(answerState, now, locale);
  const countdown = approvalCountdown(answerState.approvalExpiresAtUtc, now, locale);
  const declinedTitle = declinedCopy(answerState.declinedBecause, 'title');
  const declinedBody = declinedCopy(answerState.declinedBecause, 'body');

  const pending = answerState.status === 'pendingApproval';
  // The booking view names the branch, not the venue; this page knows the venue.
  const venueName = booking.venueName ?? branch.venue.name;
  const when = `${formatDate(booking.slotUtc, booking.timeZoneId, locale)} · ${formatTime(
    booking.slotUtc,
    booking.timeZoneId,
    locale,
  )}`;

  /*
   * Absolute, because this link's whole job is to survive being pasted
   * somewhere else — a note, a second phone, a message to whoever is coming.
   * The token is minted by the server and scoped to this one booking; see
   * `Booking.manageToken` and `ManagedBooking`.
   */
  const manageUrl = booking.manageToken
    ? new URL(
        // With the reader's `?lang=` when they chose one: the link they keep
        // opens in the language they booked in, not whatever the next
        // browser prefers. Without one, the browser was deciding, and still will.
        // The short form the reminders carry: the page finds the branch from the answer.
        langPath(`/booking/${booking.manageToken}`),
        window.location.origin,
      ).toString()
    : null;

  const cancellation = freeCancellationCopy(
    booking.freeCancellationUntilUtc,
    booking.timeZoneId,
    locale,
  );

  const addToCalendar = () => {
    const summary = td('table.title', { label: booking.tableLabel });
    downloadIcs(
      bookingIcs({
        booking,
        venueName,
        addressLine: branch.addressLine,
        manageUrl: manageUrl ?? '',
        locale,
        summary: `${summary} · ${venueName}`,
        descriptionLines: icsDescription({
          booking,
          locale,
          codeLabel: td('success.codeLabel'),
          cancellationLine: td(cancellation.key, cancellation.params),
          manageLabel: t('done.manage'),
          manageUrl: manageUrl ?? '',
        }),
      }),
      venueName,
      locale,
    );
  };

  const copyLink = async () => {
    if (!manageUrl) return;
    try {
      await navigator.clipboard.writeText(manageUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked, or an insecure origin. The link is on screen and
      // selectable, which is what the `<a>` below is for — no error needed.
    }
  };

  if (declinedTitle) {
    return (
      <div className="pub-done">
        {/* The answer arriving is announced: it replaces the waiting title. */}
        <h3 className="display" aria-live="polite">
          {td(declinedTitle.key, declinedTitle.params)}
        </h3>
        {declinedBody ? (
          <p className="pub-notice pub-notice-alert">{td(declinedBody.key, declinedBody.params)}</p>
        ) : null}
        <dl className="pub-summary">
          <div>
            <dt>{td('confirm.venue')}</dt>
            <dd>{`${venueName} · ${booking.branchName}`}</dd>
          </div>
          <div>
            <dt>{td('confirm.when')}</dt>
            <dd>{when}</dd>
          </div>
        </dl>
      </div>
    );
  }

  return (
    <div className="pub-done">
      <h3 className="display" aria-live="polite">
        {pending ? td('success.pendingTitle') : td('success.confirmedTitle')}
      </h3>
      {pending ? (
        <p className="pub-notice">
          {answerState.awaitingApprovalBecause === 'earlierGuestConsent'
            ? // The venue rings a guest before who cannot answer in the app.
              td(
                answerState.awaitsEarlierGuestAnswer === false
                  ? 'booking.approval.venueAsksEarlierGuest'
                  : 'table.requestable.earlierGuest',
              )
            : answerState.approvalExpiresAtUtc
              ? td('booking.approval.why')
              : td('success.pendingBody')}
        </p>
      ) : null}
      {/* While the venue decides: the minutes it has left to answer. A timer,
          so a screen reader reads it when asked rather than every second. */}
      {pending && answer ? (
        <p
          className={`pub-answer${countdown?.urgent ? ' is-urgent' : ''}`}
          role="timer"
          aria-label={td(answer.key, answer.params)}
        >
          {td(answer.key, answer.params)}
        </p>
      ) : null}

      {/*
        Large and legible: staff ask for this at the door and it gets read
        aloud over the phone, so it is the one thing here that has to survive a
        noisy room.
      */}
      <div className={pending ? 'pub-code is-pending' : 'pub-code'}>
        <p className="pub-code-label">{td('success.codeLabel')}</p>
        <p className="pub-code-value num" aria-label={booking.code.split('').join(' ')}>
          {booking.code}
        </p>
        <p className="pub-code-hint">{td('success.codeHint')}</p>
      </div>

      <dl className="pub-summary">
        <div>
          <dt>{td('confirm.venue')}</dt>
          <dd>{`${venueName} · ${booking.branchName}`}</dd>
        </div>
        <div>
          <dt>{td('confirm.when')}</dt>
          <dd>{when}</dd>
        </div>
        <div>
          <dt>{td('confirm.tableRow')}</dt>
          <dd>{booking.tableLabel}</dd>
        </div>
      </dl>

      {booking.promisedFreeByUtc ? (
        <p className="pub-notice">
          {td('booking.freeBy.promised', {
            time: formatTime(booking.promisedFreeByUtc, booking.timeZoneId, locale),
          })}
        </p>
      ) : null}
      <p className="pub-muted">{td(cancellation.key, cancellation.params)}</p>

      {/*
        What happens *after* that time, which the deadline alone does not say.
        Cancelling late is allowed and merely recorded as late — a venue would
        far rather know than have the table sit empty — and a diner who thinks
        they have missed their chance to cancel simply does not turn up. The
        number is the branch's own published rule, not a constant.
      */}
      <p className="pub-muted">
        {t('done.lateCancellation', {
          window: formatDuration(branch.policy.cancellationDeadlineMinutes, locale),
        })}
      </p>

      {/* 1. The reminder they would otherwise never get. */}
      <section className="pub-offer">
        <h4>{t('done.addCalendar')}</h4>
        <p className="pub-muted">{t('done.addCalendarBody')}</p>
        <button type="button" className="pub-button pub-button-primary" onClick={addToCalendar}>
          {t('done.addCalendar')}
        </button>
      </section>

      {/*
        3. The way out. Not optional — see the module comment.

        When the server issued no token there is genuinely nothing to link to,
        and a link that goes nowhere is worse than none. In that case the
        venue's own number is offered instead, because *some* way to cancel has
        to exist: a person who cannot cancel does not stay home politely, they
        simply do not turn up.
      */}
      {manageUrl ? (
        <section className="pub-offer">
          <h4>{t('done.manage')}</h4>
          <p className="pub-muted">{t('done.manageBody')}</p>
          <a className="pub-manage-link" href={manageUrl}>
            {manageUrl}
          </a>
          <div className="pub-actions">
            <button
              type="button"
              className="pub-button pub-button-quiet"
              onClick={() => void copyLink()}
            >
              {copied ? t('done.copied') : t('done.copyLink')}
            </button>
          </div>
        </section>
      ) : branch.phoneE164 ? (
        <section className="pub-offer">
          <h4>{t('done.manage')}</h4>
          <a className="pub-button pub-button-quiet" href={`tel:${branch.phoneE164}`}>
            {t('findUs.call')}
          </a>
        </section>
      ) : null}

      {/*
        2. Last, and only when there is something to link to.
        Framed as what it adds, not as "download our app" — and omitted
        entirely when `VITE_APP_URL` is unset, because an app-store badge for an
        app that is not published is a dead end with a logo on it.
      */}
      {installUrl ? (
        <section className="pub-offer pub-offer-quiet">
          <h4>{t('done.getApp')}</h4>
          <p className="pub-muted">{t('done.getAppBody')}</p>
          <a
            className="pub-button pub-button-quiet"
            href={installUrl}
            target="_blank"
            rel="noreferrer noopener"
          >
            {t('done.getApp')}
          </a>
        </section>
      ) : null}
    </div>
  );
}
