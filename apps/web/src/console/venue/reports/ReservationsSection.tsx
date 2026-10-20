import { OPEN_ENDED_BUCKET, type Compared, type ReportQuery } from '@yalla/api';
import { useReservationReport } from '@yalla/api/react';
import type { Locale } from '@yalla/format';
import { useTranslation } from '@yalla/i18n';
import { Link } from 'react-router-dom';
import { PhoneIcon } from '../../ui/icons';
import { BarChart, type Bar } from './BarChart';
import { reservationsCsv } from './csv';
import { CsvButton, ReportCard } from './ReportCard';

export interface ReservationsSectionProps {
  readonly query: ReportQuery | null;
  readonly locale: Locale;
  readonly onCsv: (title: string, fileSection: 'reservations', text: string) => void;
}

/**
 * "<2 h", "<1 day", "≥7 days": a lead-time bucket by its top, in the unit a
 * person counts it in. The open-ended last one says "at least" the one before.
 */
export function useLeadLabel() {
  const { t } = useTranslation(['admin', 'common']);
  const under = (hours: number) =>
    hours % 24 === 0
      ? t('reports.reservations.lead.underDays', { count: hours / 24 })
      : t('reports.reservations.lead.underHours', { hours });
  return (tops: readonly number[], index: number) => {
    const top = tops[index] ?? 0;
    if (top !== OPEN_ENDED_BUCKET) return under(top);
    const below = tops[index - 1] ?? 0;
    return below % 24 === 0
      ? t('reports.reservations.lead.atLeastDays', { count: below / 24 })
      : t('reports.reservations.lead.atLeastHours', { hours: below });
  };
}

/**
 * Bookings, and what became of them (Reports artboard, "Reservations"): the
 * funnel from booked to seated, cancelled, cancelled late and not come (and
 * cancelled because the guest was blocked for no-shows, when any were); the
 * web bookings no reminder can reach; and how far ahead people book, which is
 * what the booking window is worth setting from — so the policy is a link
 * away.
 */
export function ReservationsSection({ query, locale, onCsv }: ReservationsSectionProps) {
  const { t } = useTranslation(['admin', 'common']);
  const report = useReservationReport(query);
  const data = report.data;
  const leadLabel = useLeadLabel();
  const percent = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 });
  const number = new Intl.NumberFormat(locale);
  const title = t('reports.reservations.title');
  const empty = Boolean(data) && data!.booked.value === 0;

  const booked = data?.booked.value ?? 0;
  const share = (value: Compared) => (booked === 0 ? 0 : value.value / booked);
  const funnel = data
    ? [
        { key: 'booked', label: t('reports.reservations.booked'), value: data.booked, tone: '' },
        {
          key: 'seated',
          label: t('reports.reservations.seated'),
          value: data.seated,
          tone: 'is-ok',
        },
        {
          key: 'cancelled',
          label: t('reports.reservations.cancelled'),
          value: data.cancelled,
          tone: 'is-cancel',
        },
        {
          key: 'late',
          label: t('reports.reservations.late'),
          value: data.lateCancellations,
          tone: 'is-late',
        },
        {
          key: 'noShow',
          label: t('reports.reservations.noShow'),
          value: data.noShow,
          tone: 'is-noshow',
        },
        // Cancelled by the platform because the guest was blocked for
        // no-shows: neither the venue's cancellation nor the guest's own, so
        // apart from both. Said only when there were some.
        ...(data.systemCancelled && data.systemCancelled.value > 0
          ? [
              {
                key: 'system',
                label: t('reports.reservations.systemCancelled'),
                value: data.systemCancelled,
                tone: 'is-cancel',
              },
            ]
          : []),
      ]
    : [];

  const totalLead = data?.leadTime.reduce((sum, bucket) => sum + bucket.bookings, 0) ?? 0;
  const tops = data?.leadTime.map((bucket) => bucket.upToHours) ?? [];
  const lead: Bar[] = (data?.leadTime ?? []).map((bucket, index) => ({
    key: String(bucket.upToHours),
    label: leadLabel(tops, index),
    share: totalLead === 0 ? 0 : bucket.bookings / totalLead,
  }));

  return (
    <ReportCard
      title={title}
      cap={t('reports.reservations.cap')}
      isLoading={report.isLoading}
      error={report.error}
      onRetry={() => void report.refetch()}
      isEmpty={empty}
      actions={
        <CsvButton
          label={title}
          disabled={!data || empty}
          onClick={() => data && onCsv(title, 'reservations', reservationsCsv(data))}
        />
      }
    >
      {data ? (
        <div className="yc-rp-body">
          <dl className="yc-rp-funnel">
            {funnel.map((row) => (
              <div key={row.key} className="yc-rp-fr">
                <dt>{row.label}</dt>
                <dd className="yc-track" aria-hidden="true">
                  <span
                    className={row.tone ? `yc-fill ${row.tone}` : 'yc-fill'}
                    style={{ width: `${Math.max(2, share(row.value) * 100).toFixed(0)}%` }}
                  />
                </dd>
                <dd className="yc-num">
                  {row.key === 'booked'
                    ? number.format(row.value.value)
                    : t('reports.countShare', {
                        count: number.format(row.value.value),
                        percent: percent.format(share(row.value)),
                      })}
                </dd>
              </div>
            ))}
          </dl>
          {data.webBookingsWithoutAnApp.value > 0 ? (
            <p className="yc-rp-callout">
              <PhoneIcon />
              <span>
                <b>
                  {t('reports.reservations.noApp', {
                    count: data.webBookingsWithoutAnApp.value,
                    percent: percent.format(share(data.webBookingsWithoutAnApp)),
                  })}
                </b>{' '}
                {t('reports.reservations.noAppBody')}
              </span>
            </p>
          ) : null}
          <h3 className="yc-h3">{t('reports.reservations.leadTitle')}</h3>
          <BarChart
            size="short"
            showValues
            bars={lead}
            description={t('reports.reservations.leadAria', {
              buckets: lead.map((bar) => `${bar.label} ${percent.format(bar.share)}`).join(', '),
            })}
          />
          <p className="yc-help">
            {t('reports.reservations.leadHelp')}{' '}
            <Link to="/venue/policy">{t('reports.reservations.policyLink')}</Link>
          </p>
        </div>
      ) : null}
    </ReportCard>
  );
}
