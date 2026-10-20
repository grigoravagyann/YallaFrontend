import {
  approvalCountdown,
  awaitsVenueAnswer,
  declinedCopy,
  pendingReasonCopy,
  promisedFreeByCopy,
  venueAnswerCopy,
  type ManagedBooking,
  type PublicBranch,
} from '@yalla/api';
import {
  useCancelManagedBooking,
  useManagedBooking,
  useNow,
  usePublicBranch,
} from '@yalla/api/react';
import { useLocale, useTranslation } from '@yalla/i18n';
import { Suspense, lazy, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { mapsHref } from './BranchDetails';
import { bookingIcs, downloadIcs, icsDescription } from './calendarFile';
import { dayWords } from './dayNames';
import { Icon } from './icons';
import { useLangPath } from './language';
import { usePageTitle } from './meta';
import { FailedPage, LoadingPage, pageState, StaleNotice } from './PageStates';
import { formatPhone } from './phone';
import { branchClock, branchToday } from './slots';

/** The change: the booking card, the room and the room's renderer — none of it needed to read the page. */
const ManageChange = lazy(() => import('./ManageChange'));

/**
 * The manage link — the way out, without an account (Manage artboard).
 *
 * Two addresses open it:
 *
 * - `/booking/{token}`, the link every reminder carries. It names no branch,
 *   so the page learns the branch from the answer (`venueSlug`, `branchSlug`).
 * - `/{venueSlug}/{branchSlug}/booking/{token}`, the long form the
 *   confirmation showed before phase 5. It keeps working; its slugs only stand
 *   in for a server that does not name the branch.
 *
 * The most important page in this route group, and the least visited. A booking
 * made from the web reaches no push channel: no reminder, no "still coming?",
 * no one-tap cancel. If cancelling is harder than not turning up, they will not
 * turn up — and the venue that printed the link on a card is worse off than
 * before it did.
 *
 * So: no session, no phone number re-entry, no account. The token in the URL is
 * the credential: it grants sight of and power over **this one booking** — to
 * read it, to change its time, party or table, and to cancel it.
 *
 * A booking for tonight may still be waiting for the venue's floor, which has
 * fifteen minutes to answer: the page counts them down and reads the booking
 * again until it is answered, slowly enough to leave the link's budget for a
 * change (`useManagedBooking`). Waiting is blue, never green (HANDOFF §3).
 *
 * A booking made without a verified number (2026-10-20) says so beside its
 * status, is never offered "Change" — the server would refuse it — and says
 * why instead: cancel and book again, or call. It gets no reminders, so the
 * page says to keep the link.
 */
export function ManageBookingRoute() {
  const { venueSlug, branchSlug, token } = useParams<{
    venueSlug?: string;
    branchSlug?: string;
    token: string;
  }>();
  const { t } = useTranslation('public');
  const langPath = useLangPath();

  // A bearer link pasted somewhere public must not end up in a search index.
  useNoIndex();

  // Stand-ins only, from the long address: the answer names its own branch.
  const bookingQuery = useManagedBooking(token, { venueSlug, branchSlug });
  const booked = bookingQuery.data;
  usePageTitle(
    booked ? headingOf(booked, t) : t('manage.gone.title'),
    t('appName', { ns: 'common' }),
  );

  const state = pageState(bookingQuery);
  if (state === 'loading') return <LoadingPage shape="single" />;
  if (state) {
    return (
      <FailedPage
        offline={state === 'offline'}
        error={bookingQuery.error}
        onRetry={() => void bookingQuery.refetch()}
      />
    );
  }

  /*
   * One answer for an unknown, expired, malformed or revoked token. Telling
   * them apart would turn this endpoint into an oracle somebody could use to
   * find valid tokens, and none of the four is actionable by the visitor
   * anyway — the useful sentence is the same in all of them. The venue link
   * only when the address named one: the short link names none, and a dead
   * token answers nothing to name.
   */
  if (!booked) {
    return (
      <main className="pub-state">
        <div className="pub-state-message">
          <div className="pub-state-icon" aria-hidden="true">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d={LINK_GONE_ICON} />
            </svg>
          </div>
          <h1 className="display">{t('manage.gone.title')}</h1>
          <p className="pub-state-body">{t('manage.gone.body')}</p>
        </div>
        {venueSlug && branchSlug ? (
          <Link className="pub-button" to={langPath(`/${venueSlug}/${branchSlug}`)}>
            {t('manage.seeVenue')}
          </Link>
        ) : null}
      </main>
    );
  }

  return (
    <ManagePage
      token={token ?? ''}
      booking={booked}
      stale={<StaleNotice query={bookingQuery} />}
      reread={async () => (await bookingQuery.refetch()).data}
    />
  );
}

/**
 * `<meta name="robots" content="noindex, nofollow">` while a manage link is on
 * screen, and the head as it was once it is not. The link is the credential to
 * one booking: somebody will paste it in a public group, and a crawler that
 * follows it must not list it. (The global `no-referrer` already keeps it out
 * of every `Referer`; the deploy's Caddy can add `X-Robots-Tag` on `/booking/*`
 * for crawlers that never run the page.)
 */
function useNoIndex(): void {
  useEffect(() => {
    let meta = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]');
    const before = meta?.getAttribute('content') ?? null;
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'robots');
      document.head.append(meta);
    }
    meta.setAttribute('content', 'noindex, nofollow');
    const placed = meta;
    return () => {
      if (before === null) placed.remove();
      else placed.setAttribute('content', before);
    };
  }, []);
}

/** A broken link, from the Manage artboard's "gone" state. */
const LINK_GONE_ICON = 'M9 17H7A5 5 0 0 1 7 7h2M15 7h2a5 5 0 0 1 4 8M8 12h4M2 2l20 20';

/** Which of the artboard's states a booking is in. */
type ManageView = 'active' | 'pending' | 'cancelled' | 'declined' | 'past';

function manageViewOf(booking: ManagedBooking): ManageView {
  switch (booking.status) {
    case 'pendingApproval':
      return 'pending';
    case 'cancelled':
      // Declined by the venue (or by nobody answering), not cancelled by anyone.
      return booking.declinedBecause ? 'declined' : 'cancelled';
    case 'completed':
    case 'noShow':
      return 'past';
    default:
      return 'active';
  }
}

/** The badge: green confirmed, blue waiting, red declined, grey for what is over (HANDOFF §3). */
const BADGE: Readonly<Record<ManageView, { readonly tone: string; readonly key: string }>> = {
  active: { tone: 'is-ok', key: 'manage.badge.confirmed' },
  pending: { tone: 'is-pending', key: 'manage.badge.pending' },
  cancelled: { tone: 'is-off', key: 'manage.badge.cancelled' },
  declined: { tone: 'is-red', key: 'manage.badge.declined' },
  past: { tone: 'is-off', key: 'manage.badge.past' },
};

type Translate = ReturnType<typeof useTranslation>['t'];

/** The page's heading, which also names the tab. */
function headingOf(booking: ManagedBooking, t: Translate): string {
  switch (manageViewOf(booking)) {
    case 'pending':
      return t('manage.heading.pending');
    case 'cancelled':
      return t('manage.heading.cancelled');
    case 'past':
      return t('manage.heading.past');
    case 'declined': {
      // Why, when the server says: a person said no, or nobody answered in time.
      const title = declinedCopy(booking.declinedBecause, 'title');
      return title ? t(title.key, { ns: 'diner', ...title.params }) : t('manage.badge.declined');
    }
    default:
      return t('manage.title');
  }
}

const MINUTE_MS = 60_000;

function ManagePage({
  token,
  booking,
  stale,
  reread,
}: {
  readonly token: string;
  readonly booking: ManagedBooking;
  readonly stale: ReactNode;
  readonly reread: () => Promise<ManagedBooking | null | undefined>;
}) {
  const { t } = useTranslation('public');
  const { t: td } = useTranslation('diner');
  const { locale } = useLocale();
  const langPath = useLangPath();

  /*
   * The branch, from the slugs the answer names: its phone, its pin, its cover
   * and — for a change — its hours, rooms and rules. Not polled: nothing on
   * this page needs its live count.
   */
  const branchQuery = usePublicBranch({
    venueSlug: booking.venueSlug || undefined,
    branchSlug: booking.branchSlug || undefined,
    live: false,
  });
  const branch: PublicBranch | null =
    branchQuery.data && branchQuery.data.status === 'live' ? branchQuery.data : null;

  const cancel = useCancelManagedBooking(token);
  const [confirming, setConfirming] = useState(false);
  const [changing, setChanging] = useState(false);
  /** The link cannot change this booking any more (its account): said, with the venue's number. */
  const [locked, setLocked] = useState(false);
  /** What the last change came to, or why it could not be made — said once, and focused. */
  const [said, setSaid] = useState<{ readonly text: string; readonly tone: string } | null>(null);
  /**
   * A change the server sent back to the venue, as its answer stood: the slot,
   * party and table asked for. When the booking stops waiting the page says
   * what came of it — kept at the new slot, or put back where it was because
   * the venue said no or nobody answered (the view carries no "was a change"
   * flag, so the page remembers it). Never stored beyond this page's life.
   */
  const [asked, setAsked] = useState<{
    readonly answer: ManagedBooking;
    /** The page has shown the booking waiting since: only then is a later read an outcome. */
    readonly seenWaiting: boolean;
  } | null>(null);
  const saidRef = useRef<HTMLParagraphElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const confirmRef = useRef<HTMLHeadingElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const changeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (said) saidRef.current?.focus();
  }, [said]);
  useEffect(() => {
    if (confirming) confirmRef.current?.focus();
  }, [confirming]);

  // Subscribed to rather than read during render, so the deadline actually
  // passes on a page somebody left open — and each second while the venue's
  // answer is counted down.
  const awaiting = awaitsVenueAnswer(booking);
  const now = useNow(awaiting ? 1000 : 30_000);

  const view = manageViewOf(booking);
  const live = view === 'active' || view === 'pending';
  // Seated, finished or cancelled elsewhere while asking: the question goes,
  // and the actions come back (review N9). Adjusted during render.
  if (confirming && !booking.canCancel) setConfirming(false);
  const zone = booking.timeZoneId;
  const today = branchToday(zone, now);
  const start = new Date(booking.slotUtc);
  // Our own day words, not `Intl`'s, which prints Armenian dates in English
  // where the browser has no Armenian data (public page phase 3).
  const when = `${dayWords(branchToday(zone, start), today, t).full} · ${branchClock(start, zone)}`;
  // The answer reaches the cache a beat after the change resolves, so an
  // outcome is read only from a booking seen waiting first. Adjusted during render.
  if (asked && !asked.seenWaiting && booking.status === 'pendingApproval') {
    setAsked({ ...asked, seenWaiting: true });
  }
  if (asked?.seenWaiting && booking.status !== 'pendingApproval') {
    setAsked(null);
    const putBack =
      booking.status === 'confirmed' &&
      (booking.slotUtc !== asked.answer.slotUtc ||
        booking.partySize !== asked.answer.partySize ||
        booking.tableId !== asked.answer.tableId);
    setSaid(
      booking.status !== 'confirmed'
        ? null
        : putBack
          ? { text: t('manage.changing.putBack', { when }), tone: 'pub-notice-alert' }
          : { text: t('manage.changing.confirmed'), tone: 'pub-notice-ok' },
    );
  }
  const deadline = new Date(booking.freeCancellationUntilUtc);
  const deadlinePassed = deadline.getTime() < now.getTime();
  const deadlineDay = dayWords(branchToday(zone, deadline), today, t);
  const freeUntil = t('manage.freeUntil', {
    // Mid-sentence: "until today, 17:30", not "until Today".
    day: deadlineDay.name ? deadlineDay.name.toLocaleLowerCase(locale) : deadlineDay.date,
    time: branchClock(deadline, zone),
  });
  const answer = venueAnswerCopy(booking, now, locale);
  const countdown = approvalCountdown(booking.approvalExpiresAtUtc, now, locale);
  // Booking times: the promise made when booking, because another follows.
  const promise = promisedFreeByCopy(booking.promisedFreeByUtc, zone, locale);
  const declinedBody = declinedCopy(booking.declinedBecause, 'body');
  const why = pendingReasonCopy(booking);
  const unproved = booking.phoneUnverified === true;
  const hasBranch = Boolean(booking.venueSlug && booking.branchSlug);
  const branchPath = langPath(`/${booking.venueSlug}/${booking.branchSlug}`);

  /*
   * Changing closes when the time can no longer be chosen: once the booking
   * has started, or inside the branch's lead time — the moment the booking
   * card stops offering it (the diner app's `canChangeBooking`).
   */
  const canChange =
    live &&
    !locked &&
    // The server's own word: false for every booking without a verified number.
    booking.canChange !== false &&
    branch !== null &&
    branch.acceptsWebBookings &&
    Boolean(booking.reservationId && booking.tableId) &&
    now.getTime() + branch.policy.minLeadMinutes * MINUTE_MS <= start.getTime();

  /*
   * The calendar entry ends where the sitting does: the promise to free the
   * table when one was made, otherwise the branch's published sitting length.
   * Without either there is no honest end to write, and no button.
   */
  const endUtc =
    booking.endsAtUtc ??
    booking.promisedFreeByUtc ??
    (branch
      ? new Date(start.getTime() + branch.policy.turnTimeMinutes * MINUTE_MS).toISOString()
      : null);
  const addToCalendar = () => {
    if (!endUtc) return;
    const manageUrl = new URL(langPath(`/booking/${token}`), window.location.origin).toString();
    const table = td('table.title', { label: booking.tableLabel });
    downloadIcs(
      bookingIcs({
        booking: {
          id: booking.reservationId || booking.code,
          slotUtc: booking.slotUtc,
          endUtc,
          timeZoneId: zone,
        },
        venueName: booking.venueName,
        addressLine: booking.addressLine,
        manageUrl,
        locale,
        summary: `${table} · ${booking.venueName}`,
        descriptionLines: icsDescription({
          booking,
          locale,
          codeLabel: td('success.codeLabel'),
          cancellationLine: deadlinePassed ? t('manage.freePassed') : freeUntil,
          manageLabel: t('done.manage'),
          manageUrl,
        }),
      }),
      booking.venueName,
      locale,
    );
  };

  const doCancel = () => {
    cancel.mutate(undefined, {
      onSuccess: () => {
        setConfirming(false);
        setSaid(null);
        // The page turns into its cancelled state; the heading says so first.
        requestAnimationFrame(() => headingRef.current?.focus());
      },
    });
  };

  const badge = BADGE[view];
  const mapHref = mapsHref(
    branch ?? { latitude: null, longitude: null, addressLine: booking.addressLine },
  );
  const phone = branch?.phoneE164 ?? null;
  const cover = branch?.venue.coverPhoto ?? null;

  return (
    <main className="pub-page pub-manage">
      <div className="pub-manage-venue">
        {cover ? <img src={cover.thumbnailUrl} alt="" /> : null}
        <p>
          <b>{`${booking.venueName} · ${booking.branchName}`}</b>
          <span>{booking.addressLine}</span>
        </p>
      </div>

      <h1 className="display" ref={headingRef} tabIndex={-1}>
        {headingOf(booking, t)}
      </h1>
      <div className="pub-badges">
        <p className={`pub-badge ${badge.tone}`}>
          <i aria-hidden="true" />
          {t(badge.key)}
        </p>
        {/* Needs attention, not a failure: amber (HANDOFF §3). */}
        {unproved ? (
          <p className="pub-badge is-amber">
            <i aria-hidden="true" />
            {t('manage.badge.unverified')}
          </p>
        ) : null}
      </div>
      {stale}

      {said ? (
        <p className={`pub-notice ${said.tone}`} role="status" tabIndex={-1} ref={saidRef}>
          {said.text}
        </p>
      ) : null}

      {live ? (
        <div className={view === 'pending' ? 'pub-code is-pending' : 'pub-code'}>
          <p className="pub-code-label">{td('success.codeLabel')}</p>
          <p className="pub-code-value num" aria-label={booking.code.split('').join(' ')}>
            {booking.code}
          </p>
          <p className="pub-code-hint">{t('manage.codeHint')}</p>
        </div>
      ) : null}

      <dl
        className={
          view === 'cancelled' || view === 'declined' ? 'pub-summary is-dim' : 'pub-summary'
        }
      >
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

      {view === 'pending' ? (
        <div className="pub-notice pub-notice-wait">
          {/* Why it waits: short notice, the guest before, no verified number. */}
          <p>{td(why.key, why.params)}</p>
          {answer ? (
            <p
              className={`pub-answer${countdown?.urgent ? ' is-urgent' : ''}`}
              role="timer"
              aria-label={td(answer.key, answer.params)}
            >
              {td(answer.key, answer.params)}
            </p>
          ) : null}
          {/* True of every waiting booking: `useManagedBooking` reads it again,
              every 15 s with a clock and once a minute without one. */}
          <p>{t('manage.updatesItself')}</p>
        </div>
      ) : null}

      {view === 'active' && promise ? (
        <p className="pub-notice pub-notice-alert">{td(promise.key, promise.params)}</p>
      ) : null}
      {/* Lateness is a sentence, never a disabled button. */}
      {view === 'active' ? (
        <p className="pub-muted">{deadlinePassed ? t('manage.freePassed') : freeUntil}</p>
      ) : null}
      {view === 'cancelled' ? (
        <p className="pub-muted">
          {booking.cancelledByVenue ? t('manage.cancelledByVenueBody') : t('manage.cancelledBody')}
        </p>
      ) : null}
      {view === 'declined' ? (
        <p className="pub-muted">
          {declinedBody ? td(declinedBody.key, declinedBody.params) : t('manage.declinedBody')}
        </p>
      ) : null}
      {view === 'past' ? (
        <p className="pub-muted">{t('manage.pastBody', { venue: booking.venueName })}</p>
      ) : null}

      {locked ? (
        <p className="pub-notice pub-notice-alert" role="status">
          {t('manage.changing.error.account')}
        </p>
      ) : null}
      {/* No "Change" for this booking, and why — said rather than a button gone missing. */}
      {live && !locked && booking.canChange === false ? (
        <p className="pub-muted">
          {unproved ? t('manage.changeUnverified') : t('manage.changing.error.account')}
        </p>
      ) : null}
      {live && unproved ? <p className="pub-muted">{t('manage.noReminders')}</p> : null}

      {confirming && booking.canCancel ? (
        <section
          className="pub-manage-confirm"
          aria-labelledby="manage-confirm"
          aria-describedby="manage-confirm-body"
        >
          <h2 id="manage-confirm" ref={confirmRef} tabIndex={-1}>
            {td('bookings.detail.cancelTitle')}
          </h2>
          {/*
            Lateness is a sentence, never a disabled button. Cancelling ten
            minutes before is far better for the venue than a no-show, and a
            page that refused here would be optimising the wrong number.
          */}
          <p className="pub-muted" id="manage-confirm-body">
            {deadlinePassed ? td('bookings.detail.cancelLate') : td('bookings.detail.cancelFree')}
          </p>
          {cancel.isError ? <p className="pub-error">{t('manage.cancelFailed')}</p> : null}
          <button
            type="button"
            className="pub-button pub-button-danger pub-button-wide"
            disabled={cancel.isPending}
            // No reason is collected: one button, and asking why would be a
            // second screen between a diner and the thing the venue needs.
            onClick={doCancel}
          >
            {cancel.isPending ? t('manage.cancelling') : t('manage.cancelYes')}
          </button>
          <button
            type="button"
            className="pub-button pub-button-wide"
            onClick={() => {
              setConfirming(false);
              requestAnimationFrame(() => cancelButton.current?.focus());
            }}
          >
            {t('manage.cancelNo')}
          </button>
        </section>
      ) : null}

      {changing && branch && canChange ? (
        <Suspense fallback={<div className="pub-card pub-skeleton-card" aria-hidden="true" />}>
          <ManageChange
            token={token}
            booking={booking}
            branch={branch}
            onClose={() => {
              setChanging(false);
              requestAnimationFrame(() => changeButton.current?.focus());
            }}
            onChanged={(moved) => {
              setChanging(false);
              // The status the answer carries, never a prediction.
              const waits = moved.status === 'pendingApproval';
              setAsked(waits ? { answer: moved, seenWaiting: false } : null);
              setSaid({
                text: t(waits ? 'manage.changing.pending' : 'manage.changing.confirmed'),
                tone: waits ? 'pub-notice-wait' : 'pub-notice-ok',
              });
            }}
            onLocked={() => {
              setChanging(false);
              setLocked(true);
            }}
            onStale={(message) => {
              setChanging(false);
              setSaid({ text: message, tone: 'pub-notice-alert' });
              void reread();
            }}
            onReread={reread}
          />
        </Suspense>
      ) : null}

      {live && !confirming && !changing ? (
        <div className="pub-manage-actions">
          <div className="pub-manage-row">
            {endUtc ? (
              <button type="button" className="pub-button" onClick={addToCalendar}>
                <Icon name="calendar" />
                {t('manage.calendar')}
              </button>
            ) : null}
            <a className="pub-button" href={mapHref} target="_blank" rel="noreferrer noopener">
              <Icon name="pin" />
              {t('manage.map')}
            </a>
          </div>
          {canChange ? (
            <button
              type="button"
              className="pub-button pub-button-wide"
              ref={changeButton}
              onClick={() => {
                setSaid(null);
                setAsked(null);
                setChanging(true);
              }}
            >
              {t('manage.change')}
            </button>
          ) : null}
          {phone ? (
            <a className="pub-button pub-button-wide" href={`tel:${phone}`}>
              <Icon name="phone" />
              {t('manage.call', { phone: formatPhone(phone) })}
            </a>
          ) : null}
          {booking.canCancel ? (
            <button
              type="button"
              className="pub-button pub-button-wide pub-button-redline"
              ref={cancelButton}
              onClick={() => setConfirming(true)}
            >
              {t('manage.cancel')}
            </button>
          ) : null}
        </div>
      ) : null}

      {!live && hasBranch ? (
        <Link className="pub-button pub-button-primary" to={branchPath}>
          {t('manage.rebook')}
        </Link>
      ) : null}
      {live && hasBranch ? (
        <Link className="pub-button pub-button-quiet pub-button-wide" to={branchPath}>
          {t('manage.seeVenue')}
        </Link>
      ) : null}
    </main>
  );
}
