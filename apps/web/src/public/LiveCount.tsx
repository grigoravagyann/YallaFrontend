import type { OpenState, PublicBranch } from '@yalla/api';
import { useNow } from '@yalla/api/react';
import { formatTime, type Locale } from '@yalla/format';
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
}: {
  readonly openState: OpenState;
  readonly timeZoneId: string;
  readonly locale: Locale;
  /** `span` on a branch card, which is inside a link. */
  readonly as?: 'p' | 'span';
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
      ? t('page.opensAt', { time: formatTime(openState.opensAtUtc, timeZoneId, locale) })
      : t('page.closedToday');

  return <Tag className={open ? 'pub-open pub-open-yes' : 'pub-open pub-open-no'}>{text}</Tag>;
}
