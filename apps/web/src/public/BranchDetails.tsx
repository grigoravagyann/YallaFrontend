import { WEEK_ORDER, type PublicBranch, type WeekdayIndex } from '@yalla/api';
import { branchDayKey, type Locale } from '@yalla/format';
import { useTranslation } from '@yalla/i18n';
import { useId, useState } from 'react';

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

export function FindUs({ branch }: { readonly branch: PublicBranch }) {
  const { t } = useTranslation('public');

  return (
    <section className="pub-section" aria-labelledby="find-us">
      <h2 id="find-us">{t('section.findUs')}</h2>
      <address className="pub-address">{branch.addressLine}</address>
      <div className="pub-actions">
        <a className="pub-button" href={mapsHref(branch)} target="_blank" rel="noreferrer noopener">
          {t('findUs.openMap')}
        </a>
        {branch.phoneE164 ? (
          <a className="pub-button pub-button-quiet" href={`tel:${branch.phoneE164}`}>
            {t('findUs.call')}
          </a>
        ) : null}
      </div>
    </section>
  );
}

/**
 * The whole week, behind a tap.
 *
 * Collapsed by default because the answer almost everybody wants — "can I come
 * now?" — is already at the top of the page, and seven rows of times between
 * the free-table count and the room would push both below the fold on a phone.
 *
 * A `<details>` element rather than a button and state: it is keyboard
 * accessible, screen-reader correct and findable by the browser's own in-page
 * search while collapsed, all of which a div would have to re-implement.
 */
export function OpeningHours({
  branch,
  locale,
}: {
  readonly branch: PublicBranch;
  readonly locale: Locale;
}) {
  const { t } = useTranslation('public');
  const [open, setOpen] = useState(false);
  const headingId = useId();

  const byDay = new Map<WeekdayIndex, PublicBranch['weeklyHours'][number]>();
  for (const day of branch.weeklyHours) byDay.set(day.day, day);

  // Which row to mark, read in the branch's zone: at 00:30 in Yerevan a phone
  // in London still thinks it is yesterday.
  const todayKey = branchDayKey(new Date(), branch.timeZoneId);
  const [year, month, dayOfMonth] = todayKey.split('-').map(Number) as [number, number, number];
  const today = new Date(Date.UTC(year, month - 1, dayOfMonth)).getUTCDay() as WeekdayIndex;

  return (
    <section className="pub-section" aria-labelledby={headingId}>
      <h2 id={headingId}>{t('section.hours')}</h2>
      <details className="pub-hours" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
        <summary>{open ? t('hours.hide') : t('hours.show')}</summary>
        <table className="pub-hours-table">
          <tbody>
            {WEEK_ORDER.map((day) => {
              const blocks = byDay.get(day)?.blocks ?? [];
              return (
                <tr key={day} aria-current={day === today ? 'date' : undefined}>
                  <th scope="row" lang={locale}>
                    {t(`hours.day.${day}`)}
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
      </details>
    </section>
  );
}
