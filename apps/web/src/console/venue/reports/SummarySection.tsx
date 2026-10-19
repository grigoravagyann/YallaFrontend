import type { Compared, ReportQuery } from '@yalla/api';
import { useOccupancyReport, useRevenueReport } from '@yalla/api/react';
import { formatDram, type Locale } from '@yalla/format';
import { useTranslation } from '@yalla/i18n';
import { QueryFailureNotice } from '../../../components/QueryFailureNotice';
import { Delta, EmptyRange, ReportSkeleton } from './ReportCard';
import { firstActiveDay } from './range';

export interface SummarySectionProps {
  readonly query: ReportQuery | null;
  readonly locale: Locale;
}

/**
 * The six numbers an owner opens the page for (Reports artboard): guests,
 * revenue, bills closed, the average bill, per head and table turnover, each
 * with its change on the previous period when the server sent one.
 *
 * Composed from two report groups — guests and turnover from occupancy, the
 * money from revenue — because there is no summary endpoint, and each tile is
 * the server's own number: the client neither sums nor divides.
 */
export function SummarySection({ query, locale }: SummarySectionProps) {
  const { t } = useTranslation(['admin', 'common']);
  const occupancy = useOccupancyReport(query);
  const revenue = useRevenueReport(query);

  if (occupancy.error || revenue.error) {
    return (
      <div className="yc-card yc-ov-pad">
        <QueryFailureNotice
          error={occupancy.error ?? revenue.error}
          onRetry={() => {
            void occupancy.refetch();
            void revenue.refetch();
          }}
        />
      </div>
    );
  }

  if (!occupancy.data || !revenue.data) {
    return (
      <div className="yc-card">
        <ReportSkeleton />
      </div>
    );
  }

  const room = occupancy.data;
  const money = revenue.data;
  const traded = room.sessions.value > 0 || money.totalAmd.value > 0;
  if (!traded) {
    return (
      <div className="yc-card">
        <EmptyRange />
      </div>
    );
  }

  const number = new Intl.NumberFormat(locale);
  const decimal = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  });
  const dram = (value: number) => formatDram(Math.round(value), locale);

  const stats: { key: string; label: string; value: string; compared: Compared | null }[] = [
    {
      key: 'guests',
      label: t('reports.summary.guests'),
      value: number.format(room.seatsFilled.value),
      compared: room.seatsFilled,
    },
    {
      key: 'revenue',
      label: t('reports.summary.revenue'),
      value: dram(money.totalAmd.value),
      compared: money.totalAmd,
    },
    {
      key: 'tabs',
      label: t('reports.summary.tabsClosed'),
      value: number.format(money.tabs.value),
      compared: money.tabs,
    },
    {
      key: 'averageTab',
      label: t('reports.summary.averageTab'),
      value: dram(money.averageTabAmd.value),
      compared: money.averageTabAmd,
    },
    {
      key: 'perHead',
      label: t('reports.summary.averagePerHead'),
      value: dram(money.averagePerHeadAmd.value),
      compared: money.averagePerHeadAmd,
    },
    {
      key: 'turnover',
      label: t('reports.summary.turnover'),
      value: decimal.format(room.turnsPerTable.value),
      compared: room.turnsPerTable,
    },
  ];

  // A range that starts before the venue was trading. Said out loud so a ramp
  // is not read as a decline — and only what is known: no go-live date exists.
  const startedOn = query ? firstActiveDay({ from: query.from, to: query.to }, money.byDay) : null;

  return (
    <>
      {startedOn ? (
        <p className="yc-alert yc-alert-warn" role="status">
          {t('reports.partialRange', { date: startedOn })}
        </p>
      ) : null}
      <div className="yc-rp-stats">
        {stats.map((stat) => (
          <div key={stat.key} className="yc-card yc-rp-stat">
            <span className="yc-rp-stat-l">{stat.label}</span>
            <span className="yc-rp-stat-n">{stat.value}</span>
            <Delta value={stat.compared} />
          </div>
        ))}
      </div>
    </>
  );
}
