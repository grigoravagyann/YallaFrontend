import type { ReportQuery } from '@yalla/api';
import { useReservationReport } from '@yalla/api/react';
import type { Locale } from '@yalla/format';
import { useTranslation } from '@yalla/i18n';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Bars, ChartFrame, type ChartDatum } from './Chart';
import { ReportSectionFrame } from './ReportSection';
import { Stat } from './Stat';
import { daysInRange } from './range';

export interface ReservationsSectionProps {
  readonly query: ReportQuery | null;
  readonly locale: Locale;
}

/** A rate arrives as a fraction and is read as a percentage. */
function percent(fraction: number, locale: Locale): string {
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    maximumFractionDigits: 1,
  }).format(fraction);
}

/**
 * Bookings, and what became of them.
 *
 * Two blocks here earn their place by pointing somewhere rather than by being
 * numbers: lead time links to the reservation policy screen because it is what
 * `bookingWindowDays` should be set from, and web-bookings-without-an-app is
 * labelled as the commercial question it is rather than left as a curiosity.
 */
export function ReservationsSection({ query, locale }: ReservationsSectionProps) {
  const { t } = useTranslation(['admin', 'common']);
  const report = useReservationReport(query);
  const data = report.data;

  const comparedDays = query ? daysInRange({ from: query.from, to: query.to }) : 0;

  const leadTime: ChartDatum[] = useMemo(
    () =>
      (data?.leadTime ?? []).map((bucket) => ({
        label: t('reports.reservations.leadTime.bucket', { hours: bucket.upToHours }),
        value: bucket.bookings,
      })),
    [data, t],
  );

  return (
    <ReportSectionFrame
      section="reservations"
      titleKey="reports.reservations.title"
      blurbKey="reports.reservations.blurb"
      query={query}
      isLoading={report.isLoading}
      error={report.error}
      onRetry={() => void report.refetch()}
      isEmpty={Boolean(data) && data!.booked.value === 0}
    >
      {data ? (
        <>
          <div className="report-stats">
            <Stat
              labelKey="reports.reservations.booked"
              value={data.booked.value.toLocaleString(locale)}
              compared={data.booked}
              comparedDays={comparedDays}
            />
            <Stat
              labelKey="reports.reservations.seated"
              value={data.seated.value.toLocaleString(locale)}
              compared={data.seated}
              comparedDays={comparedDays}
            />
            <Stat
              labelKey="reports.reservations.cancelled"
              value={t('reports.reservations.countWithRate', {
                value: data.cancelled.value,
                rate: percent(data.cancellationRate.value, locale),
              })}
              compared={data.cancelled}
              comparedDays={comparedDays}
            />
            <Stat
              labelKey="reports.reservations.noShow"
              value={t('reports.reservations.countWithRate', {
                value: data.noShow.value,
                rate: percent(data.noShowRate.value, locale),
              })}
              compared={data.noShow}
              comparedDays={comparedDays}
            />
            <Stat
              labelKey="reports.reservations.lateCancellations"
              value={data.lateCancellations.value.toLocaleString(locale)}
              compared={data.lateCancellations}
              comparedDays={comparedDays}
            />
          </div>

          {/*
            The number that decides whether an SMS channel is worth paying for.

            Somebody who booked from the public page and has no app cannot be
            reached by the reminder, the late nudge or one-tap cancel — the
            whole no-show story. Labelled as that question rather than as a
            statistic, because as a statistic nobody would know what to do with
            it.
          */}
          <div className="report-block report-highlight">
            <h4 className="report-chart-title">{t('reports.reservations.noApp.title')}</h4>
            <p className="muted">{t('reports.reservations.noApp.blurb')}</p>
            <div className="report-stats">
              <Stat
                large
                labelKey="reports.reservations.noApp.label"
                value={t('reports.reservations.noApp.value', {
                  value: data.webBookingsWithoutAnApp.value,
                  percent:
                    data.booked.value === 0
                      ? 0
                      : Math.round((data.webBookingsWithoutAnApp.value / data.booked.value) * 100),
                })}
                compared={data.webBookingsWithoutAnApp}
                comparedDays={comparedDays}
              />
            </div>
          </div>

          <div className="report-block">
            <ChartFrame
              titleKey="reports.reservations.leadTime.title"
              labelHeaderKey="reports.reservations.leadTime.header"
              valueHeaderKey="reports.reservations.bookings"
              data={leadTime}
              reading={
                <>
                  {t('reports.reservations.leadTime.reading')}{' '}
                  {/* The point of the block: this is the number the setting
                      should come from, so the setting is one tap away. */}
                  <Link to="/venue/policy">{t('reports.reservations.leadTime.policyLink')}</Link>
                </>
              }
            >
              <Bars data={leadTime} />
            </ChartFrame>
          </div>
        </>
      ) : null}
    </ReportSectionFrame>
  );
}
