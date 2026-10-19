import type { ReportQuery } from '@yalla/api';
import { useRevenueReport } from '@yalla/api/react';
import { formatDram, type Locale } from '@yalla/format';
import { useTranslation } from '@yalla/i18n';
import { useId, useMemo, useState } from 'react';
import { BarChart, type Bar } from './BarChart';
import { hadPreviousPeriod, revenueCsv } from './csv';
import { serviceHours } from './hours';
import { CsvButton, ReportCard } from './ReportCard';
import { RevenueLine, type RevenuePoint } from './RevenueLine';
import { everyDayIn } from './range';

export interface RevenueSectionProps {
  readonly query: ReportQuery | null;
  readonly locale: Locale;
  /** The legend's name for this period: the pressed preset, or "Selected range". */
  readonly periodName: string;
  readonly onCsv: (title: string, fileSection: 'revenue', text: string) => void;
}

/** Up to a week, the x-axis says the weekday; past it, the date. */
const WEEKDAY_LIMIT = 7;

/**
 * What was taken (Reports artboard, "Revenue"): by day against the previous
 * period, with the days as a table one click away; by hour as shares; cash
 * against in-app, and the service charge.
 *
 * Every date is a local date key of the branch, labelled as such: parsed at
 * noon UTC and formatted in UTC, so no device zone can move it a day.
 */
export function RevenueSection({ query, locale, periodName, onCsv }: RevenueSectionProps) {
  const { t } = useTranslation(['admin', 'common']);
  const report = useRevenueReport(query);
  const data = report.data;
  const [table, setTable] = useState(false);
  const tableId = useId();
  const money = (amount: number) => formatDram(Math.round(amount), locale);

  const points: RevenuePoint[] = useMemo(() => {
    if (!data || !query) return [];
    // Dense from the server since VC5; filled anyway, so an older sparse
    // series never draws a straight slope across days the venue was shut.
    const days = everyDayIn({ from: query.from, to: query.to }, data.byDay);
    const short = new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    });
    const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' });
    // No previous period (a venue's first weeks, summed to 0 by the server):
    // no dashed line of zeroes behind this one, the same rule as the deltas.
    const previous = hadPreviousPeriod(data.totalAmd) ? data.previousByDay : null;
    return days.map((day, index) => {
      const date = new Date(`${day.localDate}T12:00:00Z`);
      return {
        key: day.localDate,
        label:
          days.length <= WEEKDAY_LIMIT
            ? `${weekday.format(date)} ${date.getUTCDate()}`
            : short.format(date),
        value: day.revenueAmd,
        previous: previous ? (previous[index]?.revenueAmd ?? 0) : null,
      };
    });
  }, [data, query, locale]);

  const hours: Bar[] = useMemo(() => {
    if (!data || data.totalAmd.value === 0) return [];
    const amounts = Array.from(
      { length: 24 },
      (_, hour) => data.byHour.find((entry) => entry.hour === hour)?.revenueAmd ?? 0,
    );
    // In service order: a bar open past midnight keeps 23, 00 and 01 together.
    const shares = serviceHours(amounts).map((hour) => ({
      hour,
      share: (amounts[hour] ?? 0) / data.totalAmd.value,
    }));
    if (shares.length === 0) return [];
    const peak = Math.max(...shares.map((entry) => entry.share));
    return shares.map((entry) => ({
      key: String(entry.hour),
      label: String(entry.hour).padStart(2, '0'),
      share: entry.share,
      ...(entry.share >= peak * 0.75 ? { tone: 'hot' as const } : {}),
    }));
  }, [data]);

  const percent = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 });
  const cash = data?.cashAmd.value ?? 0;
  const inApp = data?.inAppAmd.value ?? 0;
  const paid = cash + inApp;
  const cashShare = paid === 0 ? 0 : cash / paid;
  const appShare = paid === 0 ? 0 : 1 - cashShare;
  const total = points.reduce((sum, point) => sum + point.value, 0);
  const hasPrevious = points.length > 0 && points[0]!.previous !== null;
  const empty = Boolean(data) && data!.totalAmd.value === 0;
  const title = t('reports.revenue.title');

  return (
    <ReportCard
      title={title}
      cap={t('reports.revenue.cap')}
      isLoading={report.isLoading}
      error={report.error}
      onRetry={() => void report.refetch()}
      isEmpty={empty}
      actions={
        <>
          {points.length > 1 && !empty ? (
            <button
              type="button"
              className="yc-btn yc-btn-ghost yc-btn-sm"
              aria-expanded={table}
              aria-controls={tableId}
              onClick={() => setTable((was) => !was)}
            >
              {table ? t('reports.revenue.hideTable') : t('reports.revenue.showTable')}
            </button>
          ) : null}
          <CsvButton
            label={title}
            disabled={!data || empty}
            onClick={() => data && onCsv(title, 'revenue', revenueCsv(data))}
          />
        </>
      }
    >
      {data ? (
        <div className="yc-rp-split">
          <div className="yc-rp-body yc-rp-divide">
            {points.length > 1 ? (
              <div className="yc-rp-legend">
                <span>
                  <i className="yc-lg-now" aria-hidden="true" />
                  {periodName}
                </span>
                {hasPrevious ? (
                  <span>
                    <i className="yc-lg-prev" aria-hidden="true" />
                    {t('reports.revenue.previous')}
                  </span>
                ) : null}
              </div>
            ) : null}
            {points.length > 1 ? (
              <RevenueLine
                points={points}
                money={money}
                description={t('reports.revenue.aria', {
                  count: points.length,
                  total: money(total),
                })}
              />
            ) : (
              <p className="yc-rp-reading">{t('reports.revenue.oneDay')}</p>
            )}
            {points.length > 1 ? (
              <div id={tableId} hidden={!table} className="yc-tscroll">
                <table className="yc-tbl">
                  <caption className="yc-sr">{title}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{t('reports.revenue.day')}</th>
                      <th scope="col" className="yc-num">
                        {t('reports.revenue.taken')}
                      </th>
                      {hasPrevious ? (
                        <th scope="col" className="yc-num">
                          {t('reports.revenue.previousColumn')}
                        </th>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody>
                    {points.map((point) => (
                      <tr key={point.key}>
                        <th scope="row">{point.label}</th>
                        <td className="yc-num">{money(point.value)}</td>
                        {hasPrevious ? (
                          <td className="yc-num">{money(point.previous ?? 0)}</td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
          <div className="yc-rp-body">
            <h3 className="yc-h3">{t('reports.revenue.byHour')}</h3>
            {hours.length > 0 ? (
              <BarChart
                bars={hours}
                description={t('reports.revenue.byHourAria', {
                  hours: hours
                    .map((bar) => `${bar.label}:00 ${percent.format(bar.share)}`)
                    .join(', '),
                })}
              />
            ) : null}
            <h3 className="yc-h3">{t('reports.revenue.howPaid')}</h3>
            <div
              className="yc-rp-bar2"
              role="img"
              aria-label={t('reports.revenue.payAria', {
                cash: percent.format(cashShare),
                app: percent.format(appShare),
              })}
            >
              <span className="yc-rp-a" style={{ width: `${(cashShare * 100).toFixed(1)}%` }} />
              <span className="yc-rp-b" style={{ width: `${(appShare * 100).toFixed(1)}%` }} />
            </div>
            <ul className="yc-rp-kv">
              <li>
                <span>
                  <i className="yc-rp-sw yc-rp-a" aria-hidden="true" />
                  {t('reports.revenue.cash')}
                </span>
                <b>
                  {t('reports.share', { value: money(cash), percent: percent.format(cashShare) })}
                </b>
              </li>
              <li>
                <span>
                  <i className="yc-rp-sw yc-rp-b" aria-hidden="true" />
                  {t('reports.revenue.inApp')}
                </span>
                <b>
                  {t('reports.share', { value: money(inApp), percent: percent.format(appShare) })}
                </b>
              </li>
              <li>
                <span>{t('reports.revenue.serviceCharge')}</span>
                <b>{money(data.serviceChargeAmd.value)}</b>
              </li>
            </ul>
          </div>
        </div>
      ) : null}
    </ReportCard>
  );
}
