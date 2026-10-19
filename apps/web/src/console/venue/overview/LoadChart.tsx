import type { BranchOverview } from '@yalla/api';
import { useLocale, useTranslation } from '@yalla/i18n';
import { useId } from 'react';

/** The y-axis: the top and its quarters, as the artboard draws 52, 39, 26, 13, 0. */
const TICKS = [1, 0.75, 0.5, 0.25, 0] as const;

/**
 * Booked people per hour today, against the seats the room has (Main
 * artboard): the dashed line is the room full, the hour now is in the brand,
 * the hours gone are faded. A bar over the line is an hour booked past the
 * seats, and the axis grows to show it rather than clipping the bar.
 *
 * `people` is confirmed, seated and finished parties; the requests still
 * waiting for an answer are not drawn — nothing is promised to them — and are
 * said in the chart's description, where a screen reader reads every hour.
 */
export function LoadChart({ overview }: { readonly overview: BranchOverview }) {
  const { t } = useTranslation(['admin', 'common']);
  const { locale } = useLocale();
  const titleId = useId();
  const { capacity, hours } = overview.load;
  const number = new Intl.NumberFormat(locale);
  // Past midnight at a branch still open, the service day's hours run on: 24 is 00:00.
  const nowHour =
    Number(overview.localTime.slice(0, 2)) + (overview.serviceDate !== overview.localDate ? 24 : 0);
  const most = Math.max(0, ...hours.map((hour) => hour.people));
  const top = Math.max(1, capacity, most);
  const clock = (hour: number) => String(hour % 24).padStart(2, '0');
  const label = (hour: number) =>
    hour >= 24 ? t('overview.load.nextDay', { hour: `${clock(hour)}:00` }) : `${clock(hour)}:00`;
  const peak = hours.reduce<(typeof hours)[number] | null>(
    (best, hour) => (hour.people > (best?.people ?? 0) ? hour : best),
    null,
  );

  const described = hours
    .map((hour) =>
      hour.pendingPeople > 0
        ? t('overview.load.hourPending', {
            hour: label(hour.hour),
            people: hour.people,
            pending: hour.pendingPeople,
          })
        : t('overview.load.hour', { hour: label(hour.hour), people: hour.people }),
    )
    .join(', ');

  return (
    <section className="yc-card" aria-labelledby={titleId}>
      <div className="yc-card-h">
        <div>
          <h2 className="yc-h2" id={titleId}>
            {t('overview.load.title')}
          </h2>
          <p className="yc-cap">{t('overview.load.cap')}</p>
        </div>
      </div>
      {hours.length === 0 || peak === null ? (
        <p className="yc-empty-line">{t('overview.load.empty')}</p>
      ) : (
        <div className="yc-load">
          <div className="yc-loadg">
            <div className="yc-yax" aria-hidden="true">
              <span className="yc-yax-u">{t('overview.load.unit')}</span>
              <div className="yc-yticks">
                {TICKS.map((share) => (
                  <span key={share}>{number.format(Math.round(top * share))}</span>
                ))}
              </div>
            </div>
            <div className="yc-loadp">
              <div
                className="yc-lbars"
                role="img"
                aria-label={t('overview.load.aria', {
                  capacity: number.format(capacity),
                  hours: described,
                })}
              >
                {capacity > 0 ? (
                  <div
                    className="yc-capline"
                    style={{ top: `${((1 - capacity / top) * 100).toFixed(1)}%` }}
                  >
                    <span>{t('overview.load.capacity', { count: capacity })}</span>
                  </div>
                ) : null}
                {hours.map((hour) => (
                  <div className="yc-lc" key={hour.hour}>
                    {/* The number rides on its bar, so it never meets the line's label. */}
                    <span
                      className={
                        hour.hour < nowHour
                          ? 'yc-lb is-past'
                          : hour.hour === nowHour
                            ? 'yc-lb is-now'
                            : 'yc-lb'
                      }
                      style={{ height: `${((hour.people / top) * 100).toFixed(1)}%` }}
                    >
                      <span className="yc-lv">{number.format(hour.people)}</span>
                    </span>
                  </div>
                ))}
              </div>
              <div className="yc-lx" aria-hidden="true">
                {hours.map((hour) => (
                  <span
                    key={hour.hour}
                    className={
                      hour.hour === nowHour ? 'is-now' : hour.hour >= 24 ? 'is-next' : undefined
                    }
                  >
                    {clock(hour.hour)}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <p className="yc-help yc-load-f">
            {capacity > 0
              ? t('overview.load.peak', {
                  hour: label(peak.hour),
                  people: peak.people,
                  capacity: number.format(capacity),
                  percent: number.format(Math.round((peak.people / capacity) * 100)),
                })
              : t('overview.load.peakNoSeats', { hour: label(peak.hour), people: peak.people })}
          </p>
        </div>
      )}
    </section>
  );
}
