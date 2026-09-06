import type { ReportQuery } from '@yalla/api';
import { useOccupancyReport, useRevenueReport, useStaffReport } from '@yalla/api/react';
import { formatDram, type Locale } from '@yalla/format';
import { useTranslation } from '@yalla/i18n';
import { QueryFailureNotice } from '../../../components/QueryFailureNotice';
import { ComparisonLegend } from './Comparison';
import { EmptyRange, ReportSkeleton } from './ReportSection';
import { Stat } from './Stat';
import { firstActiveDay, previousRange, daysInRange } from './range';

export interface SummarySectionProps {
  readonly query: ReportQuery | null;
  readonly locale: Locale;
}

/**
 * The six numbers an owner opens the page for, and nothing else above the fold.
 *
 * Composed from three of the five report groups rather than fetched from a
 * summary endpoint, because there is no summary endpoint — covers come from
 * occupancy, the money from revenue, tables turned from staff. That is why this
 * section reads three queries and the other four read one each.
 *
 * **Tabs closed carries no comparison.** The count is available (it is the sum
 * of the daily `tabs`) but a *compared* version of it is not on the wire, and
 * the rule is that a comparison the server did not send is not rendered. Making
 * one up here — comparing against a previous period this section would have to
 * fetch and sum itself — is exactly the drift that ends with the screen and the
 * CSV disagreeing. So five tiles carry a delta and one does not.
 */
export function SummarySection({ query, locale }: SummarySectionProps) {
  const { t } = useTranslation(['admin', 'common']);

  const occupancy = useOccupancyReport(query);
  const revenue = useRevenueReport(query);
  const staff = useStaffReport(query);

  const loading = occupancy.isLoading || revenue.isLoading || staff.isLoading;
  const error = occupancy.error ?? revenue.error ?? staff.error;

  const comparedDays = query ? daysInRange({ from: query.from, to: query.to }) : 0;
  const prior = query ? previousRange({ from: query.from, to: query.to }) : null;

  if (error) {
    return (
      <section className="report-section report-summary">
        <h3 className="report-section-title">{t('reports.summary.title')}</h3>
        <QueryFailureNotice
          error={error}
          onRetry={() => {
            void occupancy.refetch();
            void revenue.refetch();
            void staff.refetch();
          }}
        />
      </section>
    );
  }

  if (loading || !occupancy.data || !revenue.data || !staff.data) {
    return (
      <section className="report-section report-summary">
        <h3 className="report-section-title">{t('reports.summary.title')}</h3>
        <ReportSkeleton label={t('reports.loading')} />
      </section>
    );
  }

  const tabsClosed = revenue.data.byDay.reduce((total, day) => total + day.tabs, 0);
  const traded = occupancy.data.sessions.value > 0 || revenue.data.totalAmd.value > 0;

  // A range that starts before the venue was trading. Said out loud so a ramp
  // is not read as a decline — and phrased as what is actually known, because
  // no go-live date exists on the wire to claim.
  const startedOn = firstActiveDay(revenue.data.byDay);

  return (
    <section className="report-section report-summary" aria-labelledby="report-summary-title">
      <h3 className="report-section-title" id="report-summary-title">
        {t('reports.summary.title')}
      </h3>

      {!traded ? (
        <EmptyRange />
      ) : (
        <>
          {startedOn ? (
            <p className="report-notice" role="status">
              {t('reports.partialRange', { date: startedOn })}
            </p>
          ) : null}

          <div className="report-stats">
            <Stat
              large
              labelKey="reports.summary.covers"
              value={occupancy.data.seatsFilled.value.toLocaleString(locale)}
              compared={occupancy.data.seatsFilled}
              comparedDays={comparedDays}
            />
            <Stat
              large
              labelKey="reports.summary.revenue"
              value={formatDram(Math.round(revenue.data.totalAmd.value), locale)}
              compared={revenue.data.totalAmd}
              comparedDays={comparedDays}
            />
            <Stat
              large
              labelKey="reports.summary.tabsClosed"
              value={tabsClosed.toLocaleString(locale)}
              comparedDays={comparedDays}
            />
            <Stat
              labelKey="reports.summary.averageTab"
              value={formatDram(Math.round(revenue.data.averageTabAmd.value), locale)}
              compared={revenue.data.averageTabAmd}
              comparedDays={comparedDays}
            />
            <Stat
              labelKey="reports.summary.averagePerHead"
              value={formatDram(Math.round(revenue.data.averagePerHeadAmd.value), locale)}
              compared={revenue.data.averagePerHeadAmd}
              comparedDays={comparedDays}
            />
            <Stat
              labelKey="reports.summary.tablesTurned"
              value={staff.data.tablesTurned.value.toLocaleString(locale)}
              compared={staff.data.tablesTurned}
              comparedDays={comparedDays}
            />
          </div>

          {prior ? <ComparisonLegend range={prior} /> : null}
        </>
      )}
    </section>
  );
}
