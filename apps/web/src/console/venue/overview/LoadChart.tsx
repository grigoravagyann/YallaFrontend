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
 * `people` is confirmed (a booking whose change waits, at the slot it keeps),
 * seated and finished parties. The requests still waiting for an answer sit on
 * top in the waiting tint — nothing is promised to them, but an hour that only
 * has requests is not an hour nobody booked — and the chart's description
 * says both for every hour, and which hour is now.
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
  // The axis holds the booked and the waiting together: a request is drawn on top.
  const most = Math.max(0, ...hours.map((hour) => hour.people + hour.pendingPeople));
  const anyPending = hours.some((hour) => hour.pendingPeople > 0);
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
      {hours.length === 0 || (peak === null && !anyPending) ? (
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
                  now: label(nowHour),
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
                    {/* The number rides on its stack, so it never meets the line's label. */}
                    <span
                      className="yc-lstack"
                      style={{
                        height: `${(((hour.people + hour.pendingPeople) / top) * 100).toFixed(1)}%`,
                      }}
                    >
                      <span className="yc-lv">{number.format(hour.people)}</span>
                      {hour.pendingPeople > 0 ? (
                        <span
                          className="yc-lb is-pending"
                          style={{ flexGrow: hour.pendingPeople }}
                        />
                      ) : null}
                      {hour.people > 0 ? (
                        <span
                          className={
                            hour.hour < nowHour
                              ? 'yc-lb is-past'
                              : hour.hour === nowHour
                                ? 'yc-lb is-now'
                                : 'yc-lb'
                          }
                          style={{ flexGrow: hour.people }}
                        />
                      ) : null}
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
            {peak === null
              ? t('overview.load.onlyPending')
              : capacity > 0
                ? t('overview.load.peak', {
                    hour: label(peak.hour),
                    people: peak.people,
                    capacity: number.format(capacity),
                    percent: number.format(Math.round((peak.people / capacity) * 100)),
                  })
                : t('overview.load.peakNoSeats', { hour: label(peak.hour), people: peak.people })}
            {anyPending ? ` ${t('overview.load.pendingLegend')}` : null}
          </p>
        </div>
      )}
    </section>
  );
}
