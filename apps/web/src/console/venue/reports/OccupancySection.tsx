import type { ReportQuery, TurnTimeDistribution } from '@yalla/api';
import { useOccupancyReport } from '@yalla/api/react';
import type { Locale } from '@yalla/format';
import { useTranslation } from '@yalla/i18n';
import { useMemo } from 'react';
import { Bars, ChartFrame, Histogram, type ChartDatum } from './Chart';
import { ReportSectionFrame } from './ReportSection';
import { Stat } from './Stat';
import { daysInRange } from './range';

export interface OccupancySectionProps {
  readonly query: ReportQuery | null;
  readonly locale: Locale;
}

/** Weekday names in the console's language, not the device's. */
function weekdayNames(locale: Locale): string[] {
  const format = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' });
  // 2026-03-01 is a Sunday, so index 0 is Sunday — matching `DayOfWeek`.
  return Array.from({ length: 7 }, (_, i) => format.format(new Date(Date.UTC(2026, 2, 1 + i))));
}

/**
 * The sentence a chart cannot say.
 *
 * `overPolicyFraction` and the median are the two numbers that decide whether
 * a policy needs changing, and leaving an owner to compare a dashed line
 * against a pile of bars is leaving the finding on the floor. So the reading is
 * written out — but only when it is actually true, and never as a
 * recommendation the software is not in a position to make.
 */
function turnTimeReading(
  turnTime: TurnTimeDistribution,
  t: (key: string, values: Record<string, unknown>) => string,
): string | null {
  if (turnTime.closedSessions === 0 || turnTime.medianMinutes === null) return null;

  const overBy = turnTime.medianMinutes - turnTime.policyTurnTimeMinutes;
  const percent = Math.round(turnTime.overPolicyFraction * 100);

  // Only when the *middle* sitting runs past the policy. A long tail alone is
  // normal in any room; a median past the policy means the policy describes a
  // service the venue is not running.
  if (overBy <= 0) {
    return t('reports.occupancy.turnTime.withinPolicy', {
      median: turnTime.medianMinutes,
      policy: turnTime.policyTurnTimeMinutes,
      percent,
    });
  }

  return t('reports.occupancy.turnTime.overPolicy', {
    median: turnTime.medianMinutes,
    policy: turnTime.policyTurnTimeMinutes,
    overBy,
    percent,
  });
}

/**
 * When the room is full, and how long people actually stay.
 *
 * The by-hour chart is the one that tells a venue when to staff, and it counts
 * sittings **in progress** rather than arrivals — the server does that, and it
 * is why a restaurant does not look empty at its busiest hour.
 */
export function OccupancySection({ query, locale }: OccupancySectionProps) {
  const { t } = useTranslation(['admin', 'common']);
  const report = useOccupancyReport(query);

  const comparedDays = query ? daysInRange({ from: query.from, to: query.to }) : 0;
  const data = report.data;

  const byHour: ChartDatum[] = useMemo(
    () =>
      (data?.byHour ?? []).map((bucket) => ({
        label: `${String(bucket.hour).padStart(2, '0')}:00`,
        value: bucket.sessions,
      })),
    [data],
  );

  const byWeekday: ChartDatum[] = useMemo(() => {
    const names = weekdayNames(locale);
    // Rendered Monday-first, because a trading week starts on Monday here and
    // a chart that split the weekend across both ends would be unreadable.
    const order = [1, 2, 3, 4, 5, 6, 0];
    return order.map((day) => ({
      label: names[day] ?? String(day),
      value: data?.byWeekday.find((bucket) => bucket.day === day)?.sessions ?? 0,
    }));
  }, [data, locale]);

  const turnTimeData: ChartDatum[] = useMemo(
    () =>
      (data?.turnTime.buckets ?? []).map((bucket) => ({
        label: t('reports.occupancy.turnTime.bucket', { minutes: bucket.upToMinutes }),
        value: bucket.sessions,
      })),
    [data, t],
  );

  /** The bar the policy line sits on: the first bucket that reaches it. */
  const policyBucket = useMemo(() => {
    const buckets = data?.turnTime.buckets ?? [];
    const policy = data?.turnTime.policyTurnTimeMinutes ?? 0;
    const found = buckets.find((bucket) => bucket.upToMinutes >= policy);
    return found ? t('reports.occupancy.turnTime.bucket', { minutes: found.upToMinutes }) : null;
  }, [data, t]);

  const walkIns = data?.walkIns.value ?? 0;
  const booked = data?.fromReservations.value ?? 0;
  const seated = walkIns + booked;

  return (
    <ReportSectionFrame
      section="occupancy"
      titleKey="reports.occupancy.title"
      blurbKey="reports.occupancy.blurb"
      query={query}
      isLoading={report.isLoading}
      error={report.error}
      onRetry={() => void report.refetch()}
      isEmpty={Boolean(data) && data!.sessions.value === 0}
    >
      {data ? (
        <>
          <ChartFrame
            titleKey="reports.occupancy.byHour"
            labelHeaderKey="reports.occupancy.hour"
            valueHeaderKey="reports.occupancy.sittings"
            data={byHour}
          >
            <Bars data={byHour} />
          </ChartFrame>

          <ChartFrame
            titleKey="reports.occupancy.byWeekday"
            labelHeaderKey="reports.occupancy.weekday"
            valueHeaderKey="reports.occupancy.sittings"
            data={byWeekday}
          >
            <Bars data={byWeekday} />
          </ChartFrame>

          <div className="report-block">
            <h4 className="report-chart-title">{t('reports.occupancy.mix.title')}</h4>
            <div className="report-stats">
              <Stat
                labelKey="reports.occupancy.mix.walkIns"
                value={
                  seated === 0
                    ? '—'
                    : t('reports.occupancy.mix.share', {
                        value: walkIns,
                        percent: Math.round((walkIns / seated) * 100),
                      })
                }
                compared={data.walkIns}
                comparedDays={comparedDays}
              />
              <Stat
                labelKey="reports.occupancy.mix.fromReservations"
                value={
                  seated === 0
                    ? '—'
                    : t('reports.occupancy.mix.share', {
                        value: booked,
                        percent: Math.round((booked / seated) * 100),
                      })
                }
                compared={data.fromReservations}
                comparedDays={comparedDays}
              />
            </div>
          </div>

          {/*
            Its own block, and the most useful one on the screen.

            A cafe whose policy says 120 minutes and whose real median is 165 is
            refusing a 20:00 sitting because it believes the 18:00 one ends at
            20:00 — and half the time it does not. Nothing else in the product
            surfaces that, which is why the policy is drawn *on* the chart and
            the reading is written underneath in words.
          */}
          <div className="report-block report-turn-time">
            <h4 className="report-chart-title">{t('reports.occupancy.turnTime.title')}</h4>
            <p className="muted">{t('reports.occupancy.turnTime.blurb')}</p>

            {data.turnTime.closedSessions === 0 ? (
              <p className="report-notice" role="status">
                {t('reports.occupancy.turnTime.noSittings')}
              </p>
            ) : (
              <ChartFrame
                titleKey="reports.occupancy.turnTime.chartTitle"
                labelHeaderKey="reports.occupancy.turnTime.bucketHeader"
                valueHeaderKey="reports.occupancy.sittings"
                data={turnTimeData}
                reading={turnTimeReading(data.turnTime, t)}
              >
                <Histogram
                  data={turnTimeData}
                  markerAt={policyBucket}
                  markerLabel={t('reports.occupancy.turnTime.policyMarker', {
                    minutes: data.turnTime.policyTurnTimeMinutes,
                  })}
                />
              </ChartFrame>
            )}

            {data.turnTime.closedSessions > 0 ? (
              <div className="report-stats">
                <Stat
                  labelKey="reports.occupancy.turnTime.median"
                  value={t('reports.minutes', { count: data.turnTime.medianMinutes ?? 0 })}
                  comparedDays={comparedDays}
                />
                <Stat
                  labelKey="reports.occupancy.turnTime.p90"
                  value={t('reports.minutes', { count: data.turnTime.p90Minutes ?? 0 })}
                  comparedDays={comparedDays}
                />
                <Stat
                  labelKey="reports.occupancy.turnTime.policy"
                  value={t('reports.minutes', {
                    count: data.turnTime.policyTurnTimeMinutes,
                  })}
                  comparedDays={comparedDays}
                />
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </ReportSectionFrame>
  );
}
