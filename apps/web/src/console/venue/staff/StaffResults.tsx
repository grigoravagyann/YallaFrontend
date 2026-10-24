import {
  PERFORMANCE_PERIODS,
  performanceRange,
  type PerformanceFigures,
  type PerformancePeriod,
  type StaffPerformanceRow,
} from '@yalla/api';
import { useConsoleGateway, useStaffPerformance } from '@yalla/api/react';
import { branchDayKey, type Locale, type TimeZone } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import type { TFunction } from 'i18next';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { QueryFailureNotice } from '../../../components/QueryFailureNotice';
import { ChevronDownIcon, ChevronUpIcon, DownloadIcon } from '../../ui/icons';
import { useToast } from '../../ui/toast';
import { dram, durationLabel } from '../activity/activityText';
import { localDateLabel } from '../messageHistory/historyText';
import { saveFile } from '../reports/download';

/** A column of the Results table: what it measures and how it is written. */
type FigureKey = Exclude<
  keyof PerformanceFigures,
  'callsClaimed' | 'messagesAnswered' | 'cashBills'
>;

interface Column {
  readonly key: FigureKey;
  readonly labelKey: string;
  readonly kind: 'count' | 'money' | 'time';
}

/** The board's columns, in its order. */
export const RESULT_COLUMNS: readonly Column[] = [
  { key: 'tables', labelKey: 'staffResults.col.tables', kind: 'count' },
  { key: 'guests', labelKey: 'staffResults.col.guests', kind: 'count' },
  { key: 'salesAmd', labelKey: 'staffResults.col.sales', kind: 'money' },
  { key: 'averageCheckAmd', labelKey: 'staffResults.col.avgCheck', kind: 'money' },
  { key: 'tipsAmd', labelKey: 'staffResults.col.tips', kind: 'money' },
  { key: 'callMedianSeconds', labelKey: 'staffResults.col.calls', kind: 'time' },
  { key: 'replyMedianSeconds', labelKey: 'staffResults.col.replies', kind: 'time' },
  { key: 'approvals', labelKey: 'staffResults.col.approvals', kind: 'count' },
  { key: 'cashAmd', labelKey: 'staffResults.col.cash', kind: 'money' },
  { key: 'discountsAndComps', labelKey: 'staffResults.col.discounts', kind: 'count' },
];

const SORT_KEYS = RESULT_COLUMNS.map((column) => column.key);

export function periodFrom(value: string | null): PerformancePeriod {
  return PERFORMANCE_PERIODS.includes(value as PerformancePeriod)
    ? (value as PerformancePeriod)
    : 'today';
}

/** "Today, 24 Oct", "18 Oct – 24 Oct". */
export function periodCaption(
  t: TFunction,
  range: { readonly from: string; readonly to: string },
  today: string,
  locale: Locale,
): string {
  if (range.from === range.to) {
    const day = localDateLabel(range.to, today, locale);
    return range.to === today
      ? t('staffResults.caption.today', { date: day })
      : t('staffResults.caption.day', { date: day });
  }
  return t('staffResults.caption.range', {
    from: localDateLabel(range.from, today, locale),
    to: localDateLabel(range.to, today, locale),
  });
}

export function periodLabel(t: TFunction, period: PerformancePeriod): string {
  return period === 'today'
    ? t('staffResults.periods.today')
    : period === 'week'
      ? t('staffResults.periods.week')
      : t('staffResults.periods.month');
}

/** One figure as a cell says it; a median with nothing measured is a dash with words for a screen reader. */
export function FigureCell({
  value,
  kind,
  locale,
  t,
}: {
  readonly value: number | null;
  readonly kind: Column['kind'];
  readonly locale: Locale;
  readonly t: TFunction;
}) {
  if (value === null) {
    return (
      <>
        <span aria-hidden="true">{'—'}</span>
        <span className="yc-sr">{t('staffResults.none')}</span>
      </>
    );
  }
  if (kind === 'money') return <>{dram(value, locale)}</>;
  if (kind === 'time') return <>{durationLabel(t, value)}</>;
  return <>{new Intl.NumberFormat(locale).format(value)}</>;
}

/**
 * Staff → Results (2026-10-24, the Team board): each person's tables,
 * guests, sales, average check, tips, how fast they answered calls and
 * messages, approvals, cash and discounts, over today, seven or thirty days,
 * with the branch's totals. Sortable by any column; the period and the sort
 * live in the address. CSV downloads the server's file.
 *
 * Sales, guests and tips are the table's waiter's, and a transfer moves the
 * table from that moment; the response times are medians. Only managers and
 * above see this page: a waiter sees their own numbers on their phone.
 */
export function StaffResults({
  branchId,
  timeZoneId,
}: {
  readonly branchId: string;
  readonly timeZoneId: string;
}) {
  const { t } = useTranslation(['admin', 'common']);
  const { locale } = useLocale();
  const toast = useToast();
  const gateway = useConsoleGateway();
  const [params, setParams] = useSearchParams();
  const today = branchDayKey(new Date(), timeZoneId as TimeZone);
  const period = periodFrom(params.get('period'));
  const range = performanceRange(period, today);
  const sortParam = params.get('sort') as FigureKey | null;
  const sort: FigureKey = sortParam && SORT_KEYS.includes(sortParam) ? sortParam : 'salesAmd';
  const dir: 'asc' | 'desc' = params.get('dir') === 'asc' ? 'asc' : 'desc';
  const query = useStaffPerformance(branchId, range);

  function put(next: Record<string, string | null>, replace = false) {
    setParams(
      (current) => {
        const copy = new URLSearchParams(current);
        for (const [key, value] of Object.entries(next)) {
          if (value === null) copy.delete(key);
          else copy.set(key, value);
        }
        return copy;
      },
      { replace },
    );
  }

  function sortBy(key: FigureKey) {
    // A new column starts from the most; the same column turns around.
    const nextDir = key === sort ? (dir === 'desc' ? 'asc' : 'desc') : 'desc';
    put(
      {
        sort: key === 'salesAmd' && nextDir === 'desc' ? null : key,
        dir: nextDir === 'desc' ? null : 'asc',
      },
      true,
    );
  }

  const [exporting, setExporting] = useState(false);
  async function exportCsv() {
    if (exporting) return;
    setExporting(true);
    try {
      const file = await gateway.exportStaffPerformanceCsv(branchId, range);
      saveFile(file.fileName, file.bytes);
      toast.say(t('staffResults.csvReady'));
    } catch {
      toast.say(t('activity.csvFailed'), { tone: 'error' });
    } finally {
      setExporting(false);
    }
  }

  const rows: readonly StaffPerformanceRow[] = [...(query.data?.rows ?? [])].sort((a, b) => {
    const left = a[sort];
    const right = b[sort];
    // Nothing measured goes last, whichever way the column is turned.
    if (left === null && right === null) return a.name.localeCompare(b.name, locale);
    if (left === null) return 1;
    if (right === null) return -1;
    const by = dir === 'desc' ? right - left : left - right;
    return by !== 0 ? by : a.name.localeCompare(b.name, locale);
  });

  let body;
  if (query.isPending) {
    body = (
      <p className="yc-empty-line" role="status">
        {t('loading')}
      </p>
    );
  } else if (query.isError && !query.data) {
    body = (
      <div className="yc-mh-pad">
        <QueryFailureNotice error={query.error} onRetry={() => void query.refetch()} />
      </div>
    );
  } else if (rows.length === 0) {
    body = (
      <div className="yc-empty">
        <h3 className="yc-h2">{t('staffResults.empty.title')}</h3>
        <p>{t('staffResults.empty.body')}</p>
      </div>
    );
  } else {
    body = (
      <div className="yc-tscroll">
        <table className="yc-tbl yc-res-tbl" aria-busy={query.isPlaceholderData || undefined}>
          <caption className="yc-res-cap">{periodCaption(t, range, today, locale)}</caption>
          <thead>
            <tr>
              <th scope="col">{t('staffResults.col.name')}</th>
              {RESULT_COLUMNS.map((column) => {
                const on = column.key === sort;
                return (
                  <th
                    key={column.key}
                    scope="col"
                    className="yc-num"
                    aria-sort={on ? (dir === 'desc' ? 'descending' : 'ascending') : undefined}
                  >
                    <button
                      type="button"
                      className={on ? 'yc-res-sort is-on' : 'yc-res-sort'}
                      onClick={() => sortBy(column.key)}
                    >
                      {t(column.labelKey)}
                      {on ? (
                        dir === 'desc' ? (
                          <ChevronDownIcon className="yc-res-arrow" />
                        ) : (
                          <ChevronUpIcon className="yc-res-arrow" />
                        )
                      ) : null}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.staffMemberId}>
                <th scope="row" className="yc-res-name">
                  <Link
                    to={`/venue/staff/${encodeURIComponent(row.staffMemberId)}${
                      period === 'today' ? '' : `?period=${period}`
                    }`}
                  >
                    {row.name}
                  </Link>
                  <span className="yc-res-role">{t(`role.${row.role}`)}</span>
                </th>
                {RESULT_COLUMNS.map((column) => (
                  <td key={column.key} className="yc-num">
                    <FigureCell value={row[column.key]} kind={column.kind} locale={locale} t={t} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {query.data ? (
            <tfoot>
              <tr className="yc-res-total">
                <th scope="row">{t('staffResults.total')}</th>
                {RESULT_COLUMNS.map((column) => (
                  <td key={column.key} className="yc-num">
                    <FigureCell
                      value={query.data.totals[column.key]}
                      kind={column.kind}
                      locale={locale}
                      t={t}
                    />
                  </td>
                ))}
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    );
  }

  return (
    <div className="yc-panel-body">
      <div className="yc-res-tools">
        <div className="yc-chips" role="group" aria-label={t('staffResults.periods.label')}>
          {PERFORMANCE_PERIODS.map((value) => (
            <button
              key={value}
              type="button"
              className={value === period ? 'yc-chip is-on' : 'yc-chip'}
              aria-pressed={value === period}
              onClick={() => put({ period: value === 'today' ? null : value })}
            >
              {periodLabel(t, value)}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="yc-btn yc-btn-sec"
          onClick={() => void exportCsv()}
          disabled={exporting}
          aria-busy={exporting || undefined}
        >
          <DownloadIcon />
          {exporting ? t('activity.csvPreparing') : t('activity.csv')}
        </button>
      </div>
      <section className="yc-card yc-res-card" aria-label={t('staffResults.label')}>
        {body}
      </section>
      <p className="yc-res-note">{t('staffResults.note')}</p>
    </div>
  );
}
