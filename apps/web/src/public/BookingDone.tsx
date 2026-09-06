import { freeCancellationCopy, type Booking, type PublicBranch } from '@yalla/api';
import { formatDate, formatTime } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { useState } from 'react';
import { appUrl } from './gateways';
import { bookingIcs, downloadIcs, icsDescription } from './calendarFile';

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
 */
export interface BookingDoneProps {
  readonly booking: Booking;
  readonly branch: PublicBranch;
}

export function BookingDone({ booking, branch }: BookingDoneProps) {
  const { t } = useTranslation('public');
  const { t: td } = useTranslation('diner');
  const { locale } = useLocale();
  const [copied, setCopied] = useState(false);

  const pending = booking.status === 'pendingApproval';
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
        `/${branch.venue.slug}/${branch.slug}/booking/${booking.manageToken}`,
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
        addressLine: branch.addressLine,
        manageUrl: manageUrl ?? '',
        locale,
        summary: `${summary} · ${booking.venueName}`,
        descriptionLines: icsDescription({
          booking,
          locale,
          codeLabel: td('success.codeLabel'),
          cancellationLine: td(cancellation.key, cancellation.params),
          manageLabel: t('done.manage'),
          manageUrl: manageUrl ?? '',
        }),
      }),
      booking.venueName,
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

  return (
    <div className="pub-done">
      <h3 className="display">
        {pending ? td('success.pendingTitle') : td('success.confirmedTitle')}
      </h3>
      {pending ? <p className="pub-notice">{td('success.pendingBody')}</p> : null}

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
          <dd>{`${booking.venueName} · ${booking.branchName}`}</dd>
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

      <p className="pub-muted">{td(cancellation.key, cancellation.params)}</p>

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
      {appUrl ? (
        <section className="pub-offer pub-offer-quiet">
          <h4>{t('done.getApp')}</h4>
          <p className="pub-muted">{t('done.getAppBody')}</p>
          <a
            className="pub-button pub-button-quiet"
            href={appUrl}
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
