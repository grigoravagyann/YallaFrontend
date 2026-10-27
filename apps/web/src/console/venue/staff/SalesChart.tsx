import type { DailySales } from '@yalla/api';
import { intlTag, type Locale } from '@yalla/format';
import { useTranslation } from '@yalla/i18n';
import { useId, useState, type KeyboardEvent } from 'react';
import { dram } from '../activity/activityText';

export interface SalesChartProps {
  readonly daily: readonly DailySales[];
  /** The branch's today: its bar is the brand's, the others a lighter step. */
  readonly today: string;
  readonly locale: Locale;
}

/** The axis's top: the tallest day rounded up to a clean step, never 0. */
function axisTop(most: number): number {
  if (most <= 0) return 1_000;
  const magnitude = 10 ** Math.floor(Math.log10(most));
  const step = magnitude / 2;
  return Math.ceil(most / step) * step;
}

/**
 * Sales by day on the person page (2026-10-24, the Person board): one series,
 * columns from one baseline, today in the brand and the other days a lighter
 * step of it (`reportBar`, 3.58:1 on white), a hairline axis with three clean
 * ticks.
 *
 * Every number is reachable without a pointer: each column is one stop of a
 * roving group (the arrow keys, Home and End move between days) whose name
 * says the day and its sales, the same words the tooltip shows on hover,
 * focus or a tap — and "Show the numbers" opens the same series as a table.
 * A tap is a click: iOS gives a tapped button no focus, and a finger's
 * pointer leaves the moment it lifts, so the tip stays until the next tap.
 */
export function SalesChart({ daily, today, locale }: SalesChartProps) {
  const { t } = useTranslation(['admin', 'common']);
  const tableId = useId();
  const [active, setActive] = useState<number | null>(null);
  const [focusIndex, setFocusIndex] = useState(Math.max(0, daily.length - 1));
  const [asTable, setAsTable] = useState(false);
  // Another period is another series: the stop goes back to its last day
  // (today). Clamped too, so thirty days narrowed to seven can never leave it
  // on day 25, where no column would be tabbable.
  const [seenLength, setSeenLength] = useState(daily.length);
  if (seenLength !== daily.length) {
    setSeenLength(daily.length);
    setFocusIndex(Math.max(0, daily.length - 1));
    setActive(null);
  }
  const stop = Math.min(focusIndex, Math.max(0, daily.length - 1));

  const most = Math.max(0, ...daily.map((day) => day.salesAmd));
  const top = axisTop(most);
  const compact = new Intl.NumberFormat(intlTag(locale), {
    notation: 'compact',
    maximumFractionDigits: 1,
  });
  const dense = daily.length > 10;
  const peak = daily.reduce(
    (best, day, index) => (day.salesAmd > (daily[best]?.salesAmd ?? -1) ? index : best),
    0,
  );

  const dayName = (date: string, style: 'short' | 'long') => {
    if (date === today && style === 'short') return t('person.chart.today');
    const [year, month, day] = date.split('-').map(Number) as [number, number, number];
    const at = new Date(Date.UTC(year, month - 1, day, 12));
    return new Intl.DateTimeFormat(
      intlTag(locale),
      style === 'long'
        ? { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }
        : dense
          ? { day: 'numeric', timeZone: 'UTC' }
          : { weekday: 'short', timeZone: 'UTC' },
    ).format(at);
  };
  const said = (day: DailySales) =>
    t('person.chart.bar', { day: dayName(day.date, 'long'), amount: dram(day.salesAmd, locale) });

  function onKey(event: KeyboardEvent<HTMLDivElement>) {
    const last = daily.length - 1;
    const next =
      event.key === 'ArrowRight'
        ? Math.min(last, stop + 1)
        : event.key === 'ArrowLeft'
          ? Math.max(0, stop - 1)
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

  if (daily.length === 0) return null;

  return (
    <div className="yc-sc">
      <div className="yc-sc-chart">
        <div className="yc-sc-y" aria-hidden="true">
          <span>{compact.format(top)}</span>
          <span>{compact.format(top / 2)}</span>
          <span>0</span>
        </div>
        <div className="yc-sc-plot">
          <div
            className={dense ? 'yc-sc-bars is-dense' : 'yc-sc-bars'}
            role="group"
            aria-label={t('person.chart.label')}
            onKeyDown={onKey}
            onPointerLeave={(event) => {
              if (event.pointerType === 'mouse') setActive(null);
            }}
          >
            {daily.map((day, index) => {
              const isToday = day.date === today;
              const labelled = !dense && (isToday || index === peak) && day.salesAmd > 0;
              return (
                <div key={day.date} className="yc-sc-col">
                  {/* The whole column is the target, not the painted bar: a
                      quiet day's bar is a few pixels tall. */}
                  <button
                    type="button"
                    data-bar=""
                    className={isToday ? 'yc-sc-hit is-today' : 'yc-sc-hit'}
                    tabIndex={index === stop ? 0 : -1}
                    aria-label={said(day)}
                    onPointerEnter={(event) => {
                      if (event.pointerType === 'mouse') setActive(index);
                    }}
                    onClick={() => {
                      setActive(index);
                      setFocusIndex(index);
                    }}
                    onFocus={() => {
                      setActive(index);
                      setFocusIndex(index);
                    }}
                    onBlur={() => setActive(null)}
                  >
                    {labelled ? (
                      <span className="yc-sc-v" aria-hidden="true">
                        {compact.format(day.salesAmd)}
                      </span>
                    ) : null}
                    <span
                      className="yc-sc-bar"
                      aria-hidden="true"
                      style={{
                        height: `${Math.max(day.salesAmd > 0 ? 2 : 0, (day.salesAmd / top) * 100).toFixed(1)}%`,
                      }}
                    />
                  </button>
                  {active === index ? (
                    <span
                      className={
                        index > daily.length - 3 ? 'yc-tip yc-sc-tip is-end' : 'yc-tip yc-sc-tip'
                      }
                      aria-hidden="true"
                    >
                      {said(day)}
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
          <div className={dense ? 'yc-sc-x is-dense' : 'yc-sc-x'} aria-hidden="true">
            {daily.map((day, index) => (
              <span key={day.date} className={day.date === today ? 'is-today' : undefined}>
                {/* A month of days: every fifth date and today, so the labels never collide. */}
                {!dense || day.date === today || (daily.length - 1 - index) % 5 === 0
                  ? dayName(day.date, 'short')
                  : ''}
              </span>
            ))}
          </div>
        </div>
      </div>
      <button
        type="button"
        className="yc-lnk yc-sc-toggle"
        aria-expanded={asTable}
        aria-controls={tableId}
        onClick={() => setAsTable((open) => !open)}
      >
        {asTable ? t('person.chart.hideTable') : t('person.chart.showTable')}
      </button>
      <div id={tableId} hidden={!asTable} className="yc-tscroll">
        {asTable ? (
          <table className="yc-tbl yc-sc-table">
            <caption className="yc-sr">{t('person.chart.tableCaption')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('person.chart.day')}</th>
                <th scope="col" className="yc-num">
                  {t('person.chart.sales')}
                </th>
              </tr>
            </thead>
            <tbody>
              {daily.map((day) => (
                <tr key={day.date}>
                  <th scope="row">{dayName(day.date, 'long')}</th>
                  <td className="yc-num">{dram(day.salesAmd, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>
    </div>
  );
}
