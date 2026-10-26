import {
  PERFORMANCE_PERIODS,
  performanceRange,
  type ActivityEntry,
  type DailySales,
  type PerformancePeriod,
  type StaffRecentList,
} from '@yalla/api';
import { useMyResults } from '@yalla/api/react';
import { branchDayKey, intlTag, type Locale, type TimeZone } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import type { TFunction } from 'i18next';
import { useId, useMemo, useState, type KeyboardEvent } from 'react';
import { QueryFailureNotice } from '../../components/QueryFailureNotice';
import {
  actionLabel,
  dram,
  durationLabel,
  timeLabel,
} from '../../console/venue/activity/activityText';

export interface PhoneResultsProps {
  /**
   * The branch to read, for an owner or a general manager (who has no home
   * branch); a waiter or a manager reads their own and leaves it out.
   */
  readonly branchId?: string | undefined;
  readonly timeZoneId: string;
  /** The screen is in front: read only then. */
  readonly active: boolean;
}

/** The recent actions: a few of each list (orders, messages, bookings, calls), newest first. */
const RECENT_LISTS: readonly StaffRecentList[] = ['orders', 'messages', 'bookings', 'calls'];
const RECENT_EACH = 5;
const RECENT_SHOWN = 8;

/**
 * My results (history-stats MyStats artboard): a waiter's own numbers, from
 * their own session — `GET /api/staff/me/results`, one request per period —
 * and nobody else's.
 * Today, seven or thirty days; six tiles; sales over the last seven days; the
 * latest things they did; and the note that only they and their manager see
 * it. There is no ranking here and no other name.
 *
 * Reached from More. The kitchen has no such screen (the server refuses it).
 */
export function PhoneResults(props: PhoneResultsProps) {
  const { t } = useTranslation(['staff', 'common']);
  const { t: tAdmin } = useTranslation(['admin', 'common']);
  const { locale } = useLocale();
  const periodsLabel = useId();
  const [period, setPeriod] = useState<PerformancePeriod>('today');
  const today = branchDayKey(new Date(), props.timeZoneId as TimeZone);
  const range = performanceRange(period, today);
  const base = { ...range, ...(props.branchId ? { branchId: props.branchId } : {}) };

  // One read per period: the figures, sales by day, and a few of each list,
  // merged into one "latest" list.
  const page = useMyResults({ ...base, limit: RECENT_EACH }, props.active);

  const recent = useMemo(() => {
    const seen = new Set<string>();
    const all: ActivityEntry[] = [];
    for (const list of RECENT_LISTS) {
      for (const entry of page.data?.recent[list].items ?? []) {
        if (seen.has(entry.id)) continue;
        seen.add(entry.id);
        all.push(entry);
      }
    }
    return all
      .sort((a, b) => b.occurredAtUtc.localeCompare(a.occurredAtUtc))
      .slice(0, RECENT_SHOWN);
  }, [page.data]);
  const recentLoading = page.isLoading && !page.data;

  const data = page.data ?? null;
  const figures = data?.figures ?? null;
  const week = (data?.daily ?? []).slice(-7);

  return (
    <div className="ph-screen ph-results">
      {/* Its title is the bar's (a screen opened from More, with Back). */}
      <div className="ph-periods" role="group" aria-labelledby={periodsLabel}>
        <span id={periodsLabel} className="visually-hidden">
          {t('phone.results.periods')}
        </span>
        {PERFORMANCE_PERIODS.map((one) => (
          <button
            key={one}
            type="button"
            className={one === period ? 'ph-period is-on' : 'ph-period'}
            aria-pressed={one === period}
            onClick={() => setPeriod(one)}
          >
            {t(`phone.results.period.${one}`)}
          </button>
        ))}
      </div>

      {page.isError && !data ? (
        <QueryFailureNotice error={page.error} onRetry={() => void page.refetch()} />
      ) : !figures ? (
        <p className="ph-results-note" role="status">
          {t('phone.results.loading')}
        </p>
      ) : (
        <>
          <dl className="ph-tiles" aria-busy={page.isPlaceholderData || undefined}>
            <Tile
              label={t('phone.results.kpi.sales')}
              value={dram(figures.salesAmd, locale)}
              sub={t('phone.results.sub.tables', { count: figures.tables })}
            />
            <Tile
              label={t('phone.results.kpi.tips')}
              value={dram(figures.tipsAmd, locale)}
              sub={
                figures.salesAmd > 0
                  ? t('phone.results.sub.tipShare', {
                      share: new Intl.NumberFormat(intlTag(locale), {
                        style: 'percent',
                        maximumFractionDigits: 1,
                      }).format(figures.tipsAmd / figures.salesAmd),
                    })
                  : '—'
              }
            />
            <Tile
              label={t('phone.results.kpi.guests')}
              value={new Intl.NumberFormat(intlTag(locale)).format(figures.guests)}
              sub={
                figures.averageCheckAmd === null
                  ? '—'
                  : t('phone.results.sub.average', {
                      amount: dram(figures.averageCheckAmd, locale),
                    })
              }
            />
            <Tile
              label={t('phone.results.kpi.call')}
              value={durationLabel(tAdmin, figures.callMedianSeconds) ?? '—'}
              sub={
                figures.callMedianSeconds === null
                  ? t('phone.results.sub.none')
                  : t('phone.results.sub.median')
              }
            />
            <Tile
              label={t('phone.results.kpi.reply')}
              value={durationLabel(tAdmin, figures.replyMedianSeconds) ?? '—'}
              sub={
                figures.replyMedianSeconds === null
                  ? t('phone.results.sub.none')
                  : t('phone.results.sub.median')
              }
            />
            <Tile
              label={t('phone.results.kpi.cash')}
              value={dram(figures.cashAmd, locale)}
              sub={t('phone.results.sub.bills', { count: figures.cashPayments })}
            />
          </dl>

          {week.length > 0 ? (
            <PhoneSalesChart daily={week} today={today} locale={locale} t={t} />
          ) : null}
        </>
      )}

      <h2 className="ph-section-title">{t('phone.results.recent.title')}</h2>
      {recentLoading ? (
        <p className="ph-results-note" role="status">
          {t('phone.results.loading')}
        </p>
      ) : recent.length === 0 ? (
        <p className="ph-results-note">{t('phone.results.recent.empty')}</p>
      ) : (
        <ul className="ph-rows ph-results-recent">
          {recent.map((entry) => {
            const value =
              durationLabel(tAdmin, entry.seconds) ??
              (entry.amountAmd !== null ? dram(entry.amountAmd, locale) : null);
            return (
              <li key={entry.id} className="ph-row">
                <span>
                  <time dateTime={entry.occurredAtUtc}>
                    {timeLabel(entry, props.timeZoneId, locale)}
                  </time>
                  {' · '}
                  {/* What and where, as the board says it; how long or how much on the right. */}
                  {actionLabel(tAdmin, entry, locale)}
                  {entry.tableLabel
                    ? ` · ${t('phone.results.recent.table', { label: entry.tableLabel })}`
                    : ''}
                </span>
                {value ? <span className="ph-row-state">{value}</span> : null}
              </li>
            );
          })}
        </ul>
      )}

      <p className="ph-results-note">{t('phone.results.privacy')}</p>
    </div>
  );
}

function Tile(props: { readonly label: string; readonly value: string; readonly sub: string }) {
  return (
    <div className="ph-tile">
      <dt>{props.label}</dt>
      <dd className="ph-tile-value">{props.value}</dd>
      <dd className="ph-tile-sub">{props.sub}</dd>
    </div>
  );
}

/**
 * Sales over the last seven days, the console person page's chart (SalesChart)
 * in the phone's size: one series from one baseline, today in the brand and
 * the other days a lighter step of it, the peak and today labelled.
 *
 * Every number is reachable without a pointer: each column is a stop of a
 * roving group (the arrow keys, Home and End) named with its day and sales;
 * the day tapped or focused is said under the chart; "Show the numbers" opens
 * the same seven days as a table.
 */
function PhoneSalesChart(props: {
  readonly daily: readonly DailySales[];
  readonly today: string;
  readonly locale: Locale;
  readonly t: TFunction;
}) {
  const { daily, today, locale, t } = props;
  const tableId = useId();
  const captionId = useId();
  const [active, setActive] = useState<number | null>(null);
  const [focusIndex, setFocusIndex] = useState(Math.max(0, daily.length - 1));
  const [asTable, setAsTable] = useState(false);

  const most = Math.max(0, ...daily.map((day) => day.salesAmd));
  const compact = new Intl.NumberFormat(intlTag(locale), {
    notation: 'compact',
    maximumFractionDigits: 1,
  });
  const peak = daily.reduce(
    (best, day, index) => (day.salesAmd > (daily[best]?.salesAmd ?? -1) ? index : best),
    0,
  );
  const dayName = (date: string, style: 'short' | 'long') => {
    if (date === today && style === 'short') return t('phone.results.chart.today');
    const [year, month, day] = date.split('-').map(Number) as [number, number, number];
    return new Intl.DateTimeFormat(
      intlTag(locale),
      style === 'long'
        ? { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }
        : { weekday: 'short', timeZone: 'UTC' },
    ).format(new Date(Date.UTC(year, month - 1, day, 12)));
  };
  const said = (day: DailySales) =>
    t('phone.results.chart.bar', {
      day: dayName(day.date, 'long'),
      amount: dram(day.salesAmd, locale),
    });
  const peakDay = daily[peak];
  const summary =
    peakDay && peakDay.salesAmd > 0
      ? t('phone.results.chart.summary', {
          day: dayName(peakDay.date, 'long'),
          amount: dram(peakDay.salesAmd, locale),
        })
      : t('phone.results.chart.nothing');

  function onKey(event: KeyboardEvent<HTMLDivElement>) {
    const last = daily.length - 1;
    const next =
      event.key === 'ArrowRight'
        ? Math.min(last, focusIndex + 1)
        : event.key === 'ArrowLeft'
          ? Math.max(0, focusIndex - 1)
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : -1;
    if (next < 0) return;
    event.preventDefault();
    setFocusIndex(next);
    setActive(next);
    event.currentTarget.querySelectorAll<HTMLElement>('[data-bar]')[next]?.focus();
  }

  const shown = active === null ? null : daily[active];
  return (
    <figure className="ph-chart" aria-labelledby={captionId}>
      <figcaption id={captionId} className="ph-chart-caption">
        {t('phone.results.chart.caption')}
      </figcaption>
      <div
        className="ph-chart-bars"
        role="group"
        aria-label={`${t('phone.results.chart.label')}. ${summary}`}
        onKeyDown={onKey}
      >
        {daily.map((day, index) => {
          const isToday = day.date === today;
          const labelled = (isToday || index === peak) && day.salesAmd > 0;
          const height = most > 0 ? (day.salesAmd / most) * 100 : 0;
          return (
            <div key={day.date} className="ph-chart-col">
              <button
                type="button"
                data-bar=""
                className={isToday ? 'ph-chart-hit is-today' : 'ph-chart-hit'}
                tabIndex={index === focusIndex ? 0 : -1}
                aria-label={said(day)}
                aria-pressed={active === index}
                onClick={() => {
                  setActive(index);
                  setFocusIndex(index);
                }}
                onFocus={() => {
                  setActive(index);
                  setFocusIndex(index);
                }}
              >
                {labelled ? (
                  <span className="ph-chart-v" aria-hidden="true">
                    {compact.format(day.salesAmd)}
                  </span>
                ) : null}
                <span
                  className="ph-chart-bar"
                  aria-hidden="true"
                  style={{
                    height: `${Math.max(day.salesAmd > 0 ? 3 : 0, height * 0.8).toFixed(1)}%`,
                  }}
                />
              </button>
              <span
                className={isToday ? 'ph-chart-day is-today' : 'ph-chart-day'}
                aria-hidden="true"
              >
                {dayName(day.date, 'short')}
              </span>
            </div>
          );
        })}
      </div>
      <p className="ph-chart-readout" aria-hidden="true">
        {shown ? said(shown) : summary}
      </p>
      <button
        type="button"
        className="ph-chart-toggle"
        aria-expanded={asTable}
        aria-controls={tableId}
        onClick={() => setAsTable((open) => !open)}
      >
        {asTable ? t('phone.results.chart.hideTable') : t('phone.results.chart.showTable')}
      </button>
      <div id={tableId} hidden={!asTable}>
        {asTable ? (
          <table className="ph-chart-table">
            <caption className="visually-hidden">{t('phone.results.chart.caption')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('phone.results.chart.day')}</th>
                <th scope="col">{t('phone.results.chart.sales')}</th>
              </tr>
            </thead>
            <tbody>
              {daily.map((day) => (
                <tr key={day.date}>
                  <th scope="row">{dayName(day.date, 'long')}</th>
                  <td>{dram(day.salesAmd, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>
    </figure>
  );
}
