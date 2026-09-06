import type { ReportQuery } from '@yalla/api';
import { useRevenueReport } from '@yalla/api/react';
import { formatDram, type Locale } from '@yalla/format';
import { useTranslation } from '@yalla/i18n';
import { useMemo } from 'react';
import { Bars, ChartFrame, TrendLine, type ChartDatum } from './Chart';
import { ReportSectionFrame } from './ReportSection';
import { Stat } from './Stat';
import { daysInRange, everyDayIn } from './range';

export interface RevenueSectionProps {
  readonly query: ReportQuery | null;
  readonly locale: Locale;
  /** The branch's zone, so a day labelled Tuesday is the venue's Tuesday. */
  readonly timeZoneId: string;
}

/**
 * What was taken, by day and by hour.
 *
 * Every amount goes through `formatDram` and every date through a formatter
 * given the **branch's** zone explicitly. A report labelled Tuesday has to mean
 * the venue's Tuesday, and the console is opened from laptops that are not
 * always set to Yerevan.
 */
export function RevenueSection({ query, locale, timeZoneId }: RevenueSectionProps) {
  const { t } = useTranslation(['admin', 'common']);
  const report = useRevenueReport(query);
  const data = report.data;

  const comparedDays = query ? daysInRange({ from: query.from, to: query.to }) : 0;

  const dayLabel = useMemo(
    () => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: timeZoneId }),
    [locale, timeZoneId],
  );

  /*
   * Gaps filled before plotting.
   *
   * `byDay` is sparse — the server sends a row only for a day a tab closed — so
   * plotting it straight would draw a straight line across the days the venue
   * was shut and read as steady trade through them.
   */
  const byDay: ChartDatum[] = useMemo(
    () =>
      (query && data ? everyDayIn({ from: query.from, to: query.to }, data.byDay) : []).map(
        (day) => ({
          // Parsed as UTC midnight and formatted in the branch's zone. The key is
          // already a local date key, so this is a label for a day rather than a
          // conversion of an instant.
          label: dayLabel.format(new Date(`${day.localDate}T12:00:00Z`)),
          value: day.revenueAmd,
        }),
      ),
    [data, query, dayLabel],
  );

  const byHour: ChartDatum[] = useMemo(
    () =>
      (data?.byHour ?? []).map((hour) => ({
        label: `${String(hour.hour).padStart(2, '0')}:00`,
        value: hour.revenueAmd,
      })),
    [data],
  );

  const cash = data?.cashAmd.value ?? 0;
  const inApp = data?.inAppAmd.value ?? 0;
  const taken = cash + inApp;

  return (
    <ReportSectionFrame
      section="revenue"
      titleKey="reports.revenue.title"
      blurbKey="reports.revenue.blurb"
      query={query}
      isLoading={report.isLoading}
      error={report.error}
      onRetry={() => void report.refetch()}
      isEmpty={Boolean(data) && data!.totalAmd.value === 0}
    >
      {data ? (
        <>
          <div className="report-stats">
            <Stat
              large
              labelKey="reports.revenue.total"
              value={formatDram(Math.round(data.totalAmd.value), locale)}
              compared={data.totalAmd}
              comparedDays={comparedDays}
            />
            <Stat
              labelKey="reports.revenue.serviceCharge"
              value={formatDram(Math.round(data.serviceChargeAmd.value), locale)}
              compared={data.serviceChargeAmd}
              comparedDays={comparedDays}
            />
          </div>

          <ChartFrame
            titleKey="reports.revenue.byDay"
            labelHeaderKey="reports.revenue.day"
            valueHeaderKey="reports.revenue.taken"
            data={byDay}
            formatValue={(value) => formatDram(Math.round(value), locale)}
          >
            <TrendLine data={byDay} />
          </ChartFrame>

          <ChartFrame
            titleKey="reports.revenue.byHour"
            labelHeaderKey="reports.revenue.hour"
            valueHeaderKey="reports.revenue.taken"
            data={byHour}
            formatValue={(value) => formatDram(Math.round(value), locale)}
          >
            <Bars data={byHour} />
          </ChartFrame>

          {/*
            Cash against in-app, which reads 100% cash today and is correct:
            there is no wallet rail yet. Shown rather than hidden, because "all
            of it was cash" is itself the finding — and the day a rail exists
            nothing on this screen has to change.
          */}
          <div className="report-block">
            <h4 className="report-chart-title">{t('reports.revenue.howPaid.title')}</h4>
            <div className="report-stats">
              <Stat
                labelKey="reports.revenue.howPaid.cash"
                value={t('reports.revenue.howPaid.value', {
                  amount: formatDram(Math.round(cash), locale),
                  percent: taken === 0 ? 0 : Math.round((cash / taken) * 100),
                })}
                compared={data.cashAmd}
                comparedDays={comparedDays}
              />
              <Stat
                labelKey="reports.revenue.howPaid.inApp"
                value={t('reports.revenue.howPaid.value', {
                  amount: formatDram(Math.round(inApp), locale),
                  percent: taken === 0 ? 0 : Math.round((inApp / taken) * 100),
                })}
                compared={data.inAppAmd}
                comparedDays={comparedDays}
              />
            </div>
          </div>

          {/*
            Comps and discounts, with who authorised them.

            This is why adjustments are manager-only, and an owner looks at it
            first. The name is not decoration — "what did we give away last
            month, and who decided" is one question with two halves.
          */}
          <div className="report-block report-highlight">
            <h4 className="report-chart-title">{t('reports.revenue.adjustments.title')}</h4>
            <div className="report-stats">
              <Stat
                labelKey="reports.revenue.adjustments.total"
                value={formatDram(Math.round(data.adjustmentsTotalAmd.value), locale)}
                compared={data.adjustmentsTotalAmd}
                comparedDays={comparedDays}
              />
            </div>

            {data.adjustments.length === 0 ? (
              <p className="muted">{t('reports.revenue.adjustments.none')}</p>
            ) : (
              <div className="report-table-wrap">
                <table className="report-table">
                  <thead>
                    <tr>
                      <th scope="col">{t('reports.revenue.adjustments.reason')}</th>
                      <th scope="col">{t('reports.revenue.adjustments.kind')}</th>
                      <th scope="col">{t('reports.revenue.adjustments.authorisedBy')}</th>
                      <th scope="col" className="numeric">
                        {t('reports.revenue.adjustments.count')}
                      </th>
                      <th scope="col" className="numeric">
                        {t('reports.revenue.adjustments.amount')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.adjustments.map((line) => (
                      <tr key={`${line.staffMemberId}-${line.kind}-${line.reason}`}>
                        <th scope="row">{line.reason}</th>
                        <td>{t(`reports.revenue.adjustments.${line.kind}`)}</td>
                        <td>{line.staffName}</td>
                        <td className="numeric">{line.count.toLocaleString(locale)}</td>
                        <td className="numeric">{formatDram(line.totalAmd, locale)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : null}
    </ReportSectionFrame>
  );
}
