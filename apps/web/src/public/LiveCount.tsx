import type { OpenState, PublicBranch } from '@yalla/api';
import { useNow } from '@yalla/api/react';
import { branchDayKey, formatTime, type Locale } from '@yalla/format';
import { useTranslation } from '@yalla/i18n';

/**
 * The number the whole page exists for, and how old it is.
 *
 * "8 tables free right now" is the one thing only this product can say. A
 * person deciding where to eat gets it from nobody else — not from a review
 * site, not from a photo, and not from ringing the venue and asking a waiter
 * mid-service. So it is the largest element on the page after the venue's name,
 * and it is the only element with a size reserved for it before it arrives.
 */

/** Older than this and the count gets a timestamp under it. */
const STALE_AFTER_MS = 60_000;

export function FreeTables({
  branch,
  locale,
}: {
  readonly branch: PublicBranch;
  readonly locale: Locale;
}) {
  const { t } = useTranslation('public');
  // Ticks on its own so the stamp appears when the answer ages, rather than
  // when something else happens to re-render this component.
  const now = useNow(30_000);

  const asOf = new Date(branch.asOfUtc);
  const ageMs = now.getTime() - asOf.getTime();
  /*
   * Only shown once the answer is genuinely old. A timestamp on a number that
   * is four seconds old is noise that teaches people to distrust a number that
   * is right; a timestamp on one that is eleven minutes old is the difference
   * between an honest page and a lie somebody drove across town for.
   */
  const stale = Number.isFinite(ageMs) && ageMs > STALE_AFTER_MS;

  return (
    /*
     * The reserved box. `min-height` on the container rather than a spinner
     * inside it: the count is the biggest thing here, and a page that reflows
     * when it lands moves the venue name, the open badge and everything below
     * — on exactly the slow connection where the reflow is most visible.
     */
    <div className="pub-count" aria-live="polite">
      <p className={branch.freeTables > 0 ? 'pub-count-value' : 'pub-count-value pub-count-none'}>
        {branch.freeTables > 0
          ? t('page.freeNow', { count: branch.freeTables })
          : t('page.fullyBooked')}
      </p>
      {stale ? (
        <p className="pub-count-age">
          {t('page.updated', { time: formatTime(asOf, branch.timeZoneId, locale) })}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Open or shut, right now, and until when.
 *
 * Tonight, not the weekly table — somebody reading this on a Friday evening
 * wants to know whether they can walk in, and a seven-row grid makes them do
 * the arithmetic themselves. The week is a tap away further down the page.
 *
 * Rendered in the *branch's* zone, always. A tourist's phone on Moscow time
 * would otherwise be told a venue shuts an hour later than it does.
 */
export function OpenBadge({
  openState,
  timeZoneId,
  locale,
  as: Tag = 'p',
  now,
}: {
  readonly openState: OpenState;
  readonly timeZoneId: string;
  readonly locale: Locale;
  /** `span` on a branch card, which is inside a link. */
  readonly as?: 'p' | 'span';
  /** Which day "today" is, for naming the next opening. Tests inject it. */
  readonly now?: Date;
}) {
  const { t } = useTranslation('public');
  const open = openState.isOpen;

  /*
   * One place decides which of the four cases this is. The branch chooser
   * renders the same badge, and two copies of the decision is how a chain's
   * card ends up saying a branch is open while the branch's own page says it
   * shut an hour ago.
   */
  const text = open
    ? openState.closesAtUtc
      ? t('page.openUntil', { time: formatTime(openState.closesAtUtc, timeZoneId, locale) })
      : // Open with no scheduled close: a venue that runs around the clock, or
        // one whose hours are not filled in. Neither warrants inventing a time.
        t('venue.openNow', { ns: 'diner' })
    : openState.opensAtUtc
      ? (() => {
          const opening = nextOpening(openState.opensAtUtc, timeZoneId, locale, now ?? new Date());
          return opening.weekday === null
            ? t('page.opensAt', { time: opening.time })
            : t('page.opensOn', { day: t(`hours.day.${opening.weekday}`), time: opening.time });
        })()
      : // Shut with nothing scheduled. "Closed today" was the old line here, and
        // it was a guess: at 01:21 the page cannot know what today holds, and
        // on the night it shipped the venue opened at 09:00.
        t('page.closedNow');

  return <Tag className={open ? 'pub-open pub-open-yes' : 'pub-open pub-open-no'}>{text}</Tag>;
}

/**
 * When a shut venue opens next: the time, and the weekday when that is not
 * today. The day is read off the branch's calendar, not the phone's: at 01:21
 * in Yerevan a phone in London still thinks it is Thursday.
 */
function nextOpening(
  opensAtUtc: string,
  timeZoneId: string,
  locale: Locale,
  now: Date,
): { readonly time: string; readonly weekday: number | null } {
  const opens = new Date(opensAtUtc);
  const time = formatTime(opens, timeZoneId, locale);
  const openingDay = branchDayKey(opens, timeZoneId);
  if (openingDay === branchDayKey(now, timeZoneId)) return { time, weekday: null };

  const [year, month, day] = openingDay.split('-').map(Number) as [number, number, number];
  return { time, weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay() };
}

/**
 * The header's one status line, and the count only when the count means
 * something.
 *
 * Shut, the page used to say three things at once: "Closed today", "8 tables
 * free right now", and "Closed right now — you can still book ahead." The
 * first was a guess, the second counted a room nobody can walk into, and a
 * reader had to pick which to believe. One line now: open or shut and when
 * that changes, then either the live count or the one sentence a shut venue
 * has to offer — that booking ahead still works.
 */
export function BranchStatus({
  branch,
  locale,
  now,
}: {
  readonly branch: PublicBranch;
  readonly locale: Locale;
  /** Injected by tests; the badge otherwise reads the clock. */
  readonly now?: Date;
}) {
  const { t } = useTranslation('public');
  const open = branch.openState.isOpen;

  return (
    <>
      <OpenBadge
        openState={branch.openState}
        timeZoneId={branch.timeZoneId}
        locale={locale}
        {...(now ? { now } : {})}
      />
      {open ? (
        <FreeTables branch={branch} locale={locale} />
      ) : branch.acceptsWebBookings ? (
        <div className="pub-count">
          <p className="pub-muted">{t('booking.closedNotice')}</p>
        </div>
      ) : null}
    </>
  );
}
