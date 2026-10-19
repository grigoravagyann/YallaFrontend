import {
  OPEN_ENDED_BUCKET,
  type OccupancyReport,
  type ReportQuery,
  type TurnTimeDistribution,
} from '@yalla/api';
import { useOccupancyReport } from '@yalla/api/react';
import type { Locale } from '@yalla/format';
import { useTranslation } from '@yalla/i18n';
import { BarChart, type Bar } from './BarChart';
import { occupancyCsv } from './csv';
import { CsvButton, ReportCard } from './ReportCard';

export interface OccupancySectionProps {
  readonly query: ReportQuery | null;
  readonly locale: Locale;
  readonly onCsv: (title: string, fileSection: 'occupancy', text: string) => void;
}

/**
 * The sentence a chart cannot say: whether the middle sitting runs past the
 * policy, and by how much — only when it is true, and never as an instruction
 * the software is not in a position to give.
 */
function turnTimeReading(
  turnTime: TurnTimeDistribution,
  t: (key: string, values: Record<string, unknown>) => string,
): string | null {
  if (turnTime.closedSessions === 0 || turnTime.medianMinutes === null) return null;
  const overBy = turnTime.medianMinutes - turnTime.policyTurnTimeMinutes;
  const percent = Math.round(turnTime.overPolicyFraction * 100);
  if (overBy <= 0) {
    return t('reports.occupancy.withinPolicy', {
      median: turnTime.medianMinutes,
      policy: turnTime.policyTurnTimeMinutes,
      percent,
    });
  }
  return t('reports.occupancy.overPolicy', {
    median: turnTime.medianMinutes,
    policy: turnTime.policyTurnTimeMinutes,
    overBy,
    percent,
  });
}

/** Guests by kind when the server counts people; sittings from an older one. */
function mixOf(report: OccupancyReport) {
  if (report.walkInGuests && report.reservationGuests) {
    return {
      people: true,
      walkIns: report.walkInGuests.value,
      booked: report.reservationGuests.value,
    };
  }
  return { people: false, walkIns: report.walkIns.value, booked: report.fromReservations.value };
}

/**
 * When the room fills and how long people really stay (Reports artboard,
 * "Occupancy"): the sittings by length against the policy — the one finding
 * a venue gets nowhere else — with the median, the 90th percentile and the
 * policy beside it in words, and the guests who walked in against those who
 * booked.
 */
export function OccupancySection({ query, locale, onCsv }: OccupancySectionProps) {
  const { t } = useTranslation(['admin', 'common']);
  const report = useOccupancyReport(query);
  const data = report.data;
  const percent = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 });
  const number = new Intl.NumberFormat(locale);
  const title = t('reports.occupancy.title');
  const empty = Boolean(data) && data!.sessions.value === 0;

  const turn = data?.turnTime;
  const closed = turn?.buckets.reduce((sum, bucket) => sum + bucket.sessions, 0) ?? 0;
  const tops = turn?.buckets.map((bucket) => bucket.upToMinutes) ?? [];
  const bars: Bar[] = (turn?.buckets ?? []).map((bucket, index) => ({
    key: String(bucket.upToMinutes),
    label:
      bucket.upToMinutes === OPEN_ENDED_BUCKET
        ? t('reports.occupancy.over', { minutes: tops[index - 1] ?? 0 })
        : t('reports.occupancy.upTo', { minutes: bucket.upToMinutes }),
    share: closed === 0 ? 0 : bucket.sessions / closed,
    ...(turn && bucket.upToMinutes > turn.policyTurnTimeMinutes ? { tone: 'over' as const } : {}),
  }));
  // After the last bucket the policy still covers (VC5 wire §2).
  const markerAfter = turn
    ? tops.reduce((last, top, index) => (top <= turn.policyTurnTimeMinutes ? index : last), -1)
    : -1;

  const mix = data ? mixOf(data) : null;
  const seated = mix ? mix.walkIns + mix.booked : 0;
  const walkShare = seated === 0 ? 0 : (mix?.walkIns ?? 0) / seated;
  const amount = (count: number) =>
    mix?.people
      ? t('reports.occupancy.people', { count, formatted: number.format(count) })
      : t('reports.occupancy.sittings', { count, formatted: number.format(count) });

  return (
    <ReportCard
      title={title}
      cap={t('reports.occupancy.cap')}
      isLoading={report.isLoading}
      error={report.error}
      onRetry={() => void report.refetch()}
      isEmpty={empty}
      actions={
        <CsvButton
          label={title}
          disabled={!data || empty}
          onClick={() => data && onCsv(title, 'occupancy', occupancyCsv(data))}
        />
      }
    >
      {data && turn ? (
        <div className="yc-rp-body">
          <h3 className="yc-h3">{t('reports.occupancy.turnTitle')}</h3>
          {turn.closedSessions === 0 ? (
            <p className="yc-help">{t('reports.occupancy.noSittings')}</p>
          ) : (
            <>
              <BarChart
                showValues
                bars={bars}
                marker={
                  markerAfter >= 0
                    ? {
                        afterIndex: markerAfter,
                        label: t('reports.occupancy.policyMarker', {
                          minutes: turn.policyTurnTimeMinutes,
                        }),
                      }
                    : null
                }
                description={t('reports.occupancy.turnAria', {
                  buckets: bars
                    .map((bar) => `${bar.label} ${percent.format(bar.share)}`)
                    .join(', '),
                  policy: turn.policyTurnTimeMinutes,
                })}
              />
              <ul className="yc-rp-kv">
                <li>
                  <span>{t('reports.occupancy.median')}</span>
                  <b>{t('reports.minutes', { count: turn.medianMinutes ?? 0 })}</b>
                </li>
                <li>
                  <span>{t('reports.occupancy.p90')}</span>
                  <b>{t('reports.minutes', { count: turn.p90Minutes ?? 0 })}</b>
                </li>
                <li>
                  <span>{t('reports.occupancy.policy')}</span>
                  <b>{t('reports.minutes', { count: turn.policyTurnTimeMinutes })}</b>
                </li>
              </ul>
              {turnTimeReading(turn, t) ? (
                <p className="yc-rp-reading">{turnTimeReading(turn, t)}</p>
              ) : null}
            </>
          )}

          <h3 className="yc-h3">{t('reports.occupancy.mixTitle')}</h3>
          <div
            className="yc-rp-bar2"
            role="img"
            aria-label={t('reports.occupancy.mixAria', {
              walkIns: percent.format(walkShare),
              booked: percent.format(seated === 0 ? 0 : 1 - walkShare),
            })}
          >
            <span className="yc-rp-a" style={{ width: `${(walkShare * 100).toFixed(1)}%` }} />
            <span
              className="yc-rp-b"
              style={{ width: `${((seated === 0 ? 0 : 1 - walkShare) * 100).toFixed(1)}%` }}
            />
          </div>
          <ul className="yc-rp-kv">
            <li>
              <span>
                <i className="yc-rp-sw yc-rp-a" aria-hidden="true" />
                {t('reports.occupancy.walkIns')}
              </span>
              <b>
                {t('reports.share', {
                  value: amount(mix?.walkIns ?? 0),
                  percent: percent.format(walkShare),
                })}
              </b>
            </li>
            <li>
              <span>
                <i className="yc-rp-sw yc-rp-b" aria-hidden="true" />
                {t('reports.occupancy.fromBookings')}
              </span>
              <b>
                {t('reports.share', {
                  value: amount(mix?.booked ?? 0),
                  percent: percent.format(seated === 0 ? 0 : 1 - walkShare),
                })}
              </b>
            </li>
          </ul>
        </div>
      ) : null}
    </ReportCard>
  );
}
