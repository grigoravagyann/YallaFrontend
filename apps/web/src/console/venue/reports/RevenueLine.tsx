import { useLocale, useTranslation } from '@yalla/i18n';
import { useState } from 'react';

export interface RevenuePoint {
  readonly key: string;
  /** "Mon 12" for a week, "Oct 12" for longer. */
  readonly label: string;
  readonly value: number;
  /** The same day of the previous period, when the server sent one. */
  readonly previous: number | null;
  /** Of `value`, the takeaway orders collected that day: the day table's own column. */
  readonly takeaway?: number;
}

export interface RevenueLineProps {
  readonly points: readonly RevenuePoint[];
  readonly description: string;
  readonly money: (amount: number) => string;
}

/** Past this many days the points are not tab stops: the table holds every day. */
const FOCUSABLE_POINTS = 31;

const X = (index: number, count: number) => (count === 1 ? 50 : (index / (count - 1)) * 100);

function path(values: readonly number[], top: number): string {
  return values
    .map(
      (value, index) =>
        `${index === 0 ? 'M' : 'L'}${X(index, values.length).toFixed(2)} ${(100 - (value / top) * 100).toFixed(2)}`,
    )
    .join(' ');
}

/**
 * Revenue by day, with the previous period dashed behind it (Reports
 * artboard).
 *
 * The y-axis reads in compact money (120K), the x-axis every day of a week
 * and every third of a month. Each day is a point to hover or focus for its
 * figure and the previous one; past a month the points stop being tab stops —
 * the table toggle beside the title has every day, as rows.
 */
export function RevenueLine({ points, description, money }: RevenueLineProps) {
  const { t } = useTranslation(['admin', 'common']);
  const { locale } = useLocale();
  const [picked, setPicked] = useState<number | null>(null);
  const compact = new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 });

  const values = points.map((point) => point.value);
  const previous = points.every((point) => point.previous !== null)
    ? points.map((point) => point.previous ?? 0)
    : null;
  const top = Math.max(1, ...values, ...(previous ?? [])) * 1.12;
  const line = path(values, top);
  const shown = picked !== null && picked < points.length ? picked : points.length - 1;
  const dense = points.length > 14;
  const focusable = points.length <= FOCUSABLE_POINTS;

  return (
    <div className="yc-rl" role="group" aria-label={description}>
      {[1, 2 / 3, 1 / 3, 0].map((share) => (
        <span
          key={share}
          className="yc-rl-y"
          aria-hidden="true"
          style={{ top: `calc(8px + (100% - 32px) * ${(1 - share).toFixed(3)})` }}
        >
          {compact.format(Math.round(top * share))}
        </span>
      ))}
      <div className="yc-rl-plot">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {[0, 33.3, 66.6].map((y) => (
            <line key={y} className="yc-rl-grid" x1="0" x2="100" y1={y} y2={y} />
          ))}
          <line className="yc-rl-base" x1="0" x2="100" y1="100" y2="100" />
          <path className="yc-rl-area" d={`${line} L100 100 L0 100 Z`} />
          {previous ? <path className="yc-rl-prev" d={path(previous, top)} /> : null}
          <path className="yc-rl-line" d={line} />
        </svg>
        {points.map((point, index) => {
          const left = `${X(index, points.length).toFixed(2)}%`;
          const at = { left, top: `${(100 - (point.value / top) * 100).toFixed(2)}%` };
          const label =
            point.previous === null
              ? t('reports.revenue.pointNoPrevious', {
                  day: point.label,
                  value: money(point.value),
                })
              : t('reports.revenue.point', {
                  day: point.label,
                  value: money(point.value),
                  previous: money(point.previous),
                });
          return (
            <span key={point.key}>
              <button
                type="button"
                className={index === shown ? 'yc-rl-pt is-on' : 'yc-rl-pt'}
                style={at}
                aria-label={label}
                tabIndex={focusable ? 0 : -1}
                onMouseEnter={() => setPicked(index)}
                onFocus={() => setPicked(index)}
                onClick={() => setPicked(index)}
              />
              {index === shown ? (
                <span
                  className={
                    index === 0
                      ? 'yc-rl-tip is-start'
                      : index === points.length - 1
                        ? 'yc-rl-tip is-end'
                        : 'yc-rl-tip'
                  }
                  style={at}
                  aria-hidden="true"
                >
                  {point.label} · {money(point.value)}
                </span>
              ) : null}
              {!dense || index % 3 === 0 || index === points.length - 1 ? (
                <span className="yc-rl-x" style={{ left }} aria-hidden="true">
                  {point.label}
                </span>
              ) : null}
            </span>
          );
        })}
      </div>
    </div>
  );
}
