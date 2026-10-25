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
import { Link } from 'react-router-dom';
import {
  ChipGroup,
  DataTable,
  EmptyState,
  LoadingLine,
  NoValue,
  QueryFailure,
  pickParam,
  putParam,
  useFileExport,
  useUrlFilters,
  type UrlFilterCodec,
} from '../../kit';
import { ChevronDownIcon, ChevronUpIcon, DownloadIcon } from '../../ui/icons';
import { dram, durationLabel } from '../activity/activityText';
import { localDateLabel } from '../messageHistory/historyText';

/** A column of the Results table: what it measures and how it is written. */
interface Column {
  readonly key: ColumnKey;
  readonly labelKey: string;
  readonly kind: 'count' | 'money' | 'time';
  readonly value: (figures: PerformanceFigures) => number | null;
}

type ColumnKey =
  | 'tables'
  | 'guests'
  | 'salesAmd'
  | 'averageCheckAmd'
  | 'tipsAmd'
  | 'callMedianSeconds'
  | 'replyMedianSeconds'
  | 'approvals'
  | 'declines'
  | 'cashAmd'
  | 'discountsAndComps';

/** The board's columns, in its order; the declines beside the approvals. */
export const RESULT_COLUMNS: readonly Column[] = [
  { key: 'tables', labelKey: 'staffResults.col.tables', kind: 'count', value: (f) => f.tables },
  { key: 'guests', labelKey: 'staffResults.col.guests', kind: 'count', value: (f) => f.guests },
  { key: 'salesAmd', labelKey: 'staffResults.col.sales', kind: 'money', value: (f) => f.salesAmd },
  {
    key: 'averageCheckAmd',
    labelKey: 'staffResults.col.avgCheck',
    kind: 'money',
    value: (f) => f.averageCheckAmd,
  },
  { key: 'tipsAmd', labelKey: 'staffResults.col.tips', kind: 'money', value: (f) => f.tipsAmd },
  {
    key: 'callMedianSeconds',
    labelKey: 'staffResults.col.calls',
    kind: 'time',
    value: (f) => f.callMedianSeconds,
  },
  {
    key: 'replyMedianSeconds',
    labelKey: 'staffResults.col.replies',
    kind: 'time',
    value: (f) => f.replyMedianSeconds,
  },
  {
    key: 'approvals',
    labelKey: 'staffResults.col.approvals',
    kind: 'count',
    value: (f) => f.approvals,
  },
  {
    key: 'declines',
    labelKey: 'staffResults.col.declines',
    kind: 'count',
    value: (f) => f.declines,
  },
  { key: 'cashAmd', labelKey: 'staffResults.col.cash', kind: 'money', value: (f) => f.cashAmd },
  {
    key: 'discountsAndComps',
    labelKey: 'staffResults.col.discounts',
    kind: 'count',
    value: (f) => f.discounts + f.comps,
  },
];

const SORT_KEYS = RESULT_COLUMNS.map((column) => column.key);

export function periodFrom(value: string | null): PerformancePeriod {
  return pickParam(value, PERFORMANCE_PERIODS, 'today');
}

interface ResultsView {
  readonly period: PerformancePeriod;
  readonly sort: ColumnKey;
  readonly dir: 'asc' | 'desc';
}

/** The period and the sort in the address; the defaults (today, by sales, the most first) left out. */
const resultsCodec: UrlFilterCodec<ResultsView> = {
  read: (params) => ({
    period: periodFrom(params.get('period')),
    sort: pickParam(params.get('sort'), SORT_KEYS, 'salesAmd'),
    dir: params.get('dir') === 'asc' ? 'asc' : 'desc',
  }),
  write: (params, next) => {
    putParam(params, 'period', next.period === 'today' ? null : next.period);
    putParam(params, 'sort', next.sort === 'salesAmd' && next.dir === 'desc' ? null : next.sort);
    putParam(params, 'dir', next.dir === 'desc' ? null : 'asc');
  },
};

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

/** Today, seven days, thirty days: the Results tab's and the person page's period. */
export function PeriodChips({
  value,
  onChange,
}: {
  readonly value: PerformancePeriod;
  readonly onChange: (period: PerformancePeriod) => void;
}) {
  const { t } = useTranslation(['admin', 'common']);
  return (
    <ChipGroup
      label={t('staffResults.periods.label')}
      value={value}
      options={PERFORMANCE_PERIODS.map((period) => ({
        value: period,
        label: periodLabel(t, period),
      }))}
      onChange={onChange}
    />
  );
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
  if (value === null) return <NoValue label={t('staffResults.none')} />;
  if (kind === 'money') return <>{dram(value, locale)}</>;
  if (kind === 'time') return <>{durationLabel(t, value)}</>;
  return <>{new Intl.NumberFormat(locale).format(value)}</>;
}

/**
 * Staff → Results (2026-10-24, the Team board): each person's tables,
 * guests, sales, average check, tips, how fast they answered calls and
 * messages, bookings approved and declined, cash, and discounts and comps,
 * over today, seven or thirty days, with the branch's totals — counted once,
 * as the revenue report counts them. Sortable by any column; the period and the sort
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
  const gateway = useConsoleGateway();
  const today = branchDayKey(new Date(), timeZoneId as TimeZone);
  const { filters, update } = useUrlFilters(resultsCodec);
  const { period, sort, dir } = filters;
  const range = performanceRange(period, today);
  const sortColumn = RESULT_COLUMNS.find((column) => column.key === sort) ?? RESULT_COLUMNS[2]!;
  const query = useStaffPerformance(branchId, range);

  function sortBy(key: ColumnKey) {
    // A new column starts from the most; the same column turns around.
    const nextDir = key === sort ? (dir === 'desc' ? 'asc' : 'desc') : 'desc';
    update({ sort: key, dir: nextDir }, { replace: true });
  }

  const csv = useFileExport();
  function exportCsv() {
    void csv.run(
      () => gateway.exportStaffPerformanceCsv(branchId, range),
      t('staffResults.csvReady'),
    );
  }

  const rows: readonly StaffPerformanceRow[] = [...(query.data?.rows ?? [])].sort((a, b) => {
    const left = sortColumn.value(a);
    const right = sortColumn.value(b);
    // Nothing measured goes last, whichever way the column is turned.
    if (left === null && right === null) return a.name.localeCompare(b.name, locale);
    if (left === null) return 1;
    if (right === null) return -1;
    const by = dir === 'desc' ? right - left : left - right;
    return by !== 0 ? by : a.name.localeCompare(b.name, locale);
  });

  let body;
  if (query.isPending) {
    body = <LoadingLine />;
  } else if (query.isError && !query.data) {
    body = <QueryFailure query={query} frame="list" />;
  } else if (rows.length === 0) {
    body = (
      <EmptyState title={t('staffResults.empty.title')}>{t('staffResults.empty.body')}</EmptyState>
    );
  } else {
    body = (
      <DataTable
        className="yc-res-tbl"
        caption={periodCaption(t, range, today, locale)}
        captionClassName="yc-res-cap"
        busy={query.isPlaceholderData}
      >
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
                  <FigureCell value={column.value(row)} kind={column.kind} locale={locale} t={t} />
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
                    value={column.value(query.data.totals)}
                    kind={column.kind}
                    locale={locale}
                    t={t}
                  />
                </td>
              ))}
            </tr>
          </tfoot>
        ) : null}
      </DataTable>
    );
  }

  return (
    <div className="yc-panel-body">
      <div className="yc-res-tools">
        <PeriodChips value={period} onChange={(next) => update({ period: next })} />
        <button
          type="button"
          className="yc-btn yc-btn-sec"
          onClick={exportCsv}
          disabled={csv.busy}
          aria-busy={csv.busy || undefined}
        >
          <DownloadIcon />
          {csv.busy ? t('activity.csvPreparing') : t('activity.csv')}
        </button>
      </div>
      <section className="yc-card yc-res-card" aria-label={t('staffResults.label')}>
        {body}
      </section>
      <p className="yc-res-note">
        {[
          t('staffResults.note'),
          query.data
            ? t('staffResults.noteTotals', {
                takeaway: dram(query.data.totals.takeawayAmd, locale),
              })
            : null,
          query.data && query.data.totals.unattributedSalesAmd > 0
            ? t('staffResults.noteUnattributed', {
                amount: dram(query.data.totals.unattributedSalesAmd, locale),
              })
            : null,
        ]
          .filter(Boolean)
          .join(' ')}
      </p>
    </div>
  );
}
