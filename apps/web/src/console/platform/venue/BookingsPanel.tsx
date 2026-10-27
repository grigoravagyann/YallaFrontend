import { describeFailure, type BookingStatusCounts, type BookingSummaryDays } from '@yalla/api';
import { useVenueBookingsSummary } from '@yalla/api/react';
import { useLocale, useTranslation } from '@yalla/i18n';
import { useId, useState } from 'react';
import { PadlockIcon } from '../../ui/icons';
import { DataTable } from '../../kit';

/** The status bars, in the order a booking's life runs, each with its colour class. */
const STATUSES: readonly { key: keyof BookingStatusCounts; tone: string }[] = [
  { key: 'completed', tone: 'is-ok' },
  { key: 'upcoming', tone: 'is-up' },
  { key: 'pending', tone: 'is-pending' },
  { key: 'cancelled', tone: 'is-cancel' },
  { key: 'noShow', tone: 'is-noshow' },
];

/**
 * The venue page's Bookings tab (VenueDetail artboard): the last 7 or 30 days
 * in **totals only** — how many, what became of them, by weekday and by
 * branch, and the average party. The platform admin never sees a guest's
 * name or phone (HANDOFF section 3); the note under the period says so.
 *
 * Shares of "came" and "no-show" are of the bookings already past: a booking
 * still ahead has not had the chance to do either.
 */
export function BookingsPanel({ venueId }: { readonly venueId: string }) {
  const { t } = useTranslation(['admin', 'common']);
  const { locale } = useLocale();
  const [days, setDays] = useState<BookingSummaryDays>(30);
  const summary = useVenueBookingsSummary(venueId, days);
  const weekId = useId();
  const statusId = useId();
  const branchId = useId();

  const number = (value: number) => new Intl.NumberFormat(locale).format(value);
  const decimal = (value: number) =>
    new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(
      value,
    );
  const percent = (part: number, whole: number) =>
    whole > 0
      ? new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(
          part / whole,
        )
      : '—';

  const statusLabel = (key: keyof BookingStatusCounts) =>
    key === 'completed'
      ? t('venuePage.bookings.statusCompleted')
      : key === 'upcoming'
        ? t('venuePage.bookings.statusUpcoming')
        : key === 'pending'
          ? t('venuePage.bookings.statusPending')
          : key === 'cancelled'
            ? t('venuePage.bookings.statusCancelled')
            : t('venuePage.bookings.statusNoShow');
  const weekdays = [
    t('venuePage.bookings.mon'),
    t('venuePage.bookings.tue'),
    t('venuePage.bookings.wed'),
    t('venuePage.bookings.thu'),
    t('venuePage.bookings.fri'),
    t('venuePage.bookings.sat'),
    t('venuePage.bookings.sun'),
  ];

  const data = summary.data;
  let body;
  if (summary.isLoading) {
    body = (
      <p className="yc-empty-line" role="status">
        {t('loading')}
      </p>
    );
  } else if (!data) {
    const offline = describeFailure(summary.error) === 'offline';
    body = (
      <p className="yc-alert" role="alert">
        {offline ? t('state.offline') : t('venuePage.bookings.failed')}
      </p>
    );
  } else if (data.total === 0) {
    body = <p className="yc-card yc-empty-line">{t('venuePage.bookings.empty')}</p>;
  } else {
    const { byStatus } = data;
    const past = byStatus.completed + byStatus.cancelled + byStatus.noShow;
    const peak = Math.max(...data.byWeekday, 1);
    const cap = t('venuePage.bookings.cap', { days: data.days, count: data.total });
    body = (
      <>
        <div className="yc-kpis">
          <div className="yc-card yc-kpi">
            <span className="yc-kpi-l">{t('venuePage.bookings.total')}</span>
            <span className="yc-kpi-n">{number(data.total)}</span>
            <span className="yc-kpi-f">
              {t('venuePage.bookings.perDay', { value: decimal(data.total / data.days) })}
            </span>
          </div>
          <div className="yc-card yc-kpi">
            <span className="yc-kpi-l">{t('venuePage.bookings.completed')}</span>
            <span className="yc-kpi-n">{percent(byStatus.completed, past)}</span>
            <span className="yc-kpi-f">
              {t('venuePage.bookings.ofPast')} ·{' '}
              {t('venuePage.bookings.count', { count: byStatus.completed })}
            </span>
          </div>
          <div className="yc-card yc-kpi">
            <span className="yc-kpi-l">{t('venuePage.bookings.noShow')}</span>
            <span className="yc-kpi-n">{percent(byStatus.noShow, past)}</span>
            <span className="yc-kpi-f">
              {t('venuePage.bookings.ofPast')} ·{' '}
              {t('venuePage.bookings.count', { count: byStatus.noShow })}
            </span>
          </div>
          <div className="yc-card yc-kpi">
            <span className="yc-kpi-l">{t('venuePage.bookings.party')}</span>
            <span className="yc-kpi-n">
              {data.averagePartySize === null ? '—' : decimal(data.averagePartySize)}
            </span>
            <span className="yc-kpi-f">{t('venuePage.bookings.partyUnit')}</span>
          </div>
        </div>

        <div className="yc-g2">
          <section className="yc-card" aria-labelledby={weekId}>
            <div className="yc-card-h">
              <div>
                <h2 className="yc-h2" id={weekId}>
                  {t('venuePage.bookings.byWeekday')}
                </h2>
                <p className="yc-cap">{cap}</p>
              </div>
            </div>
            <div
              className="yc-wk"
              role="img"
              aria-label={t('venuePage.bookings.weekAria', {
                list: weekdays
                  .map((day, index) => `${day} ${data.byWeekday[index] ?? 0}`)
                  .join(', '),
              })}
            >
              {data.byWeekday.map((value, index) => (
                <div key={weekdays[index]} className="yc-wk-c">
                  <span className="yc-wk-v">{number(value)}</span>
                  <span
                    className={value === peak ? 'yc-wk-b is-peak' : 'yc-wk-b'}
                    style={{ height: `${Math.max(2, (value / peak) * 82).toFixed(1)}%` }}
                  />
                </div>
              ))}
            </div>
            <div className="yc-wk-x" aria-hidden="true">
              {weekdays.map((day) => (
                <span key={day}>{day}</span>
              ))}
            </div>
          </section>

          <section className="yc-card" aria-labelledby={statusId}>
            <div className="yc-card-h">
              <div>
                <h2 className="yc-h2" id={statusId}>
                  {t('venuePage.bookings.byStatus')}
                </h2>
                <p className="yc-cap">{cap}</p>
              </div>
            </div>
            <dl className="yc-split">
              {STATUSES.map(({ key, tone }) => (
                <div key={key} className="yc-bar-row">
                  <dt>{statusLabel(key)}</dt>
                  <dd className="yc-track" aria-hidden="true">
                    <span
                      className={`yc-fill ${tone}`}
                      style={{
                        width: `${Math.max(2, (byStatus[key] / data.total) * 100).toFixed(1)}%`,
                      }}
                    />
                  </dd>
                  <dd className="yc-num">
                    {t('venuePage.bookings.share', {
                      count: number(byStatus[key]),
                      percent: percent(byStatus[key], data.total),
                    })}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        </div>

        <section className="yc-card" aria-labelledby={branchId}>
          <div className="yc-card-h">
            <h2 className="yc-h2" id={branchId}>
              {t('venuePage.bookings.byBranch')}
            </h2>
          </div>
          <DataTable labelledBy={branchId} phone="cards">
            <thead>
              <tr>
                <th scope="col">{t('venuePage.branches.name')}</th>
                <th scope="col" className="yc-num">
                  {t('venuePage.bookings.total')}
                </th>
                {STATUSES.map(({ key }) => (
                  <th key={key} scope="col" className="yc-num">
                    {statusLabel(key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.byBranch.map((row) => (
                <tr key={row.branchId}>
                  <td className="yc-pn">{row.name}</td>
                  <td className="yc-num">{number(row.total)}</td>
                  {STATUSES.map(({ key }) => (
                    <td key={key} className="yc-num">
                      {number(row[key])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </DataTable>
        </section>
      </>
    );
  }

  return (
    <div className="yc-panel-body">
      <div className="yc-tools">
        <div className="yc-fld">
          <label htmlFor="bk-range">{t('venuePage.bookings.range')}</label>
          <select
            id="bk-range"
            className="yc-ctl"
            value={days}
            onChange={(event) => setDays(Number(event.target.value) === 7 ? 7 : 30)}
          >
            <option value="7">{t('venuePage.bookings.last7')}</option>
            <option value="30">{t('venuePage.bookings.last30')}</option>
          </select>
        </div>
        <p className="yc-note">
          <PadlockIcon />
          <span>{t('venuePage.bookings.privacy')}</span>
        </p>
      </div>
      {body}
    </div>
  );
}
