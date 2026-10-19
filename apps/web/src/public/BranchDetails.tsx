import { WEEK_ORDER, type BranchDetail, type PublicBranch, type WeekdayIndex } from '@yalla/api';
import { useNow } from '@yalla/api/react';
import { branchDayKey, type Locale } from '@yalla/format';
import { useTranslation } from '@yalla/i18n';
import { useId } from 'react';
import { Icon } from './icons';
import { formatPhone } from './phone';

/**
 * Where the place is, and when it is open.
 *
 * The bottom of the page, and the part a person acts on with a different app:
 * the address opens their maps, the number opens their dialler. Neither is a
 * Yalla feature and both are the right answer — somebody who has decided to
 * come here needs directions, not a booking.
 */

/**
 * A maps link that works on every device without choosing a maps provider.
 *
 * `geo:` is the correct URI scheme and Safari on iOS ignores it, so the link is
 * an ordinary `https://` maps search: iOS opens Apple Maps, Android offers the
 * chooser, a desktop gets a web map. Coordinates when the venue placed a pin,
 * because a pin is unambiguous and an Armenian street address transliterated
 * into a search box is not; the address as the label either way, so the person
 * can read where they are being sent before they tap.
 */
function mapsHref(branch: PublicBranch): string {
  const query =
    branch.latitude !== null && branch.longitude !== null
      ? `${branch.latitude},${branch.longitude}`
      : branch.addressLine;
  return `https://maps.google.com/?q=${encodeURIComponent(query)}`;
}

/**
 * The venue's website as a link, or nothing: only an `http(s)` address, shown
 * as its host ("lumen.am") rather than the whole URL.
 */
function website(url: string | null | undefined): { href: string; host: string } | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    return { href: url, host: parsed.hostname.replace(/^www\./u, '') };
  } catch {
    return null;
  }
}

/**
 * "How to find" (Main artboard): the address, the district, and three ways
 * out — the map, the phone with its number on the button, the venue's own
 * website. The district and the website come with the listing and join when
 * it does.
 */
export function FindUs({
  branch,
  detail,
}: {
  readonly branch: PublicBranch;
  readonly detail: BranchDetail | null | undefined;
}) {
  const { t } = useTranslation('public');
  const headingId = useId();
  const district = detail?.listing.district ?? null;
  const site = website(detail?.websiteUrl);

  return (
    <section className="pub-section pub-find" id="find" aria-labelledby={headingId}>
      <h2 id={headingId}>{t('section.findUs')}</h2>
      <address className="pub-address">{branch.addressLine}</address>
      {district ? <p className="pub-muted pub-find-district">{district}</p> : null}
      <div className="pub-actions">
        <a className="pub-button" href={mapsHref(branch)} target="_blank" rel="noreferrer noopener">
          {t('findUs.openMap')}
          <span aria-hidden="true"> ↗</span>
          <span className="visually-hidden"> ({t('findUs.newTab')})</span>
        </a>
        {branch.phoneE164 ? (
          <a className="pub-button pub-tel" href={`tel:${branch.phoneE164}`}>
            <Icon name="phone" />
            {formatPhone(branch.phoneE164)}
          </a>
        ) : null}
        {site ? (
          <a className="pub-button" href={site.href} target="_blank" rel="noreferrer noopener">
            {site.host}
            <span aria-hidden="true"> ↗</span>
            <span className="visually-hidden"> ({t('findUs.newTab')})</span>
          </a>
        ) : null}
      </div>
    </section>
  );
}

/**
 * The week, today marked, and the special days ahead (Main artboard).
 *
 * Open now and until when is already at the top of the page; this is for
 * planning, so the whole week is shown rather than folded — seven short rows —
 * with a line saying whose clock the times are on. Holidays and closures
 * replace the week's hours on their date and sit under it, in amber.
 */
export function OpeningHours({
  branch,
  locale,
}: {
  readonly branch: PublicBranch;
  readonly locale: Locale;
}) {
  const { t } = useTranslation('public');
  const headingId = useId();

  const byDay = new Map<WeekdayIndex, PublicBranch['weeklyHours'][number]>();
  for (const day of branch.weeklyHours) byDay.set(day.day, day);

  // Which row to mark, read in the branch's zone: at 00:30 in Yerevan a phone
  // in London still thinks it is yesterday.
  // From the clock as state, so a page left open past midnight moves the mark.
  const now = useNow(60_000);
  const todayKey = branchDayKey(now, branch.timeZoneId);
  const [year, month, dayOfMonth] = todayKey.split('-').map(Number) as [number, number, number];
  const today = new Date(Date.UTC(year, month - 1, dayOfMonth)).getUTCDay() as WeekdayIndex;
  // The read also carries yesterday's special day when its night runs into
  // today: it counts for "open now", and is not listed as a day ahead.
  const upcoming = branch.specialDays.filter((day) => day.date >= todayKey);
  // A special day today replaces the week's hours on today's row too, so the
  // row the eye goes to first never says the venue keeps its usual hours.
  const todaySpecial = branch.specialDays.find((day) => day.date === todayKey) ?? null;

  return (
    <section className="pub-section" aria-labelledby={headingId}>
      <h2 id={headingId}>{t('section.hours')}</h2>
      <p className="pub-muted pub-hours-zone">
        {branch.timeZoneId === 'Asia/Yerevan'
          ? t('hours.zoneYerevan')
          : t('hours.zone', { zone: branch.timeZoneId })}
      </p>
      <table className="pub-hours-table">
        <tbody>
          {WEEK_ORDER.map((day) => {
            const isToday = day === today;
            const special = isToday ? todaySpecial : null;
            const blocks = special ? special.blocks : (byDay.get(day)?.blocks ?? []);
            return (
              <tr key={day} aria-current={isToday ? 'date' : undefined}>
                <th scope="row" lang={locale}>
                  {t(`hours.day.${day}`)}
                  {isToday ? (
                    <span className="pub-hours-today"> · {t('hours.todayMark')}</span>
                  ) : null}
                  {special?.note ? (
                    <span className="pub-hours-today pub-hours-special"> · {special.note}</span>
                  ) : null}
                </th>
                <td>
                  {blocks.length === 0
                    ? t('hours.closed')
                    : // Two blocks in a day is a real venue with a closed
                      // kitchen between lunch and dinner, not an edge case.
                      blocks.map((block) => `${block.opensAt}–${block.closesAt}`).join(', ')}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {upcoming.length > 0 ? (
        <div className="pub-special">
          <table className="pub-hours-table pub-special-days">
            <caption>{t('hours.special')}</caption>
            <tbody>
              {upcoming.map((day) => (
                <tr key={day.date} aria-current={day.date === todayKey ? 'date' : undefined}>
                  <th scope="row" lang={locale}>
                    {specialDate(day.date, locale)}
                    {day.note ? <span className="pub-special-note"> · {day.note}</span> : null}
                  </th>
                  <td>
                    {day.blocks.length === 0
                      ? t('hours.closed')
                      : day.blocks.map((block) => `${block.opensAt}–${block.closesAt}`).join(', ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

/** "Thu 31 December": a calendar date, with no zone to move it. */
function specialDate(dateKey: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${dateKey}T12:00:00Z`));
}
