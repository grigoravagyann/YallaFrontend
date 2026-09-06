import { useTranslation } from '@yalla/i18n';
import { useId, useState, type ReactNode } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

/**
 * The three charts this section is allowed to draw, and the table under each.
 *
 * ## Why there is a table under every chart
 *
 * Owners screenshot tables and send them to accountants. Nobody can read a
 * number off a bar, and the one thing an owner does with a report is quote a
 * figure at somebody else. The chart is for the shape — when the room fills,
 * whether the tail is long — and the table is for the number. Both, always,
 * with the table one click away rather than on another screen.
 *
 * It is also the whole accessibility story for these charts. An SVG of bars is
 * unreadable to a screen reader whatever is done to it; a table of the same
 * numbers is a table.
 *
 * ## Colour
 *
 * Every fill is a token, referenced as a CSS custom property so a token change
 * reaches the charts without a second palette existing. Colour is never the
 * only signal: the policy line on the turn-time chart is dashed *and*
 * labelled, and the one series per chart means nothing has to be told apart by
 * hue in the first place.
 */

const AXIS = {
  stroke: 'var(--color-subtle-foreground)',
  fontSize: 12,
  fontFamily: 'var(--font-family-sans)',
};

const GRID = 'var(--color-border-soft)';

export interface ChartDatum {
  /** The x-axis label, already formatted and localised by the caller. */
  readonly label: string;
  readonly value: number;
}

export interface ChartFrameProps {
  readonly titleKey: string;
  /** Column heading for the label column of the table under the chart. */
  readonly labelHeaderKey: string;
  readonly valueHeaderKey: string;
  readonly data: readonly ChartDatum[];
  /** Renders one value for the table; the chart always plots the raw number. */
  readonly formatValue?: (value: number) => string;
  readonly children: ReactNode;
  /** A sentence under the chart — the plain-language reading of it. */
  readonly reading?: ReactNode;
}

/**
 * A chart, its table, and the toggle between them.
 *
 * The chart is `aria-hidden` and the table carries the accessible name, so a
 * screen reader gets the numbers rather than a description of a picture.
 */
export function ChartFrame({
  titleKey,
  labelHeaderKey,
  valueHeaderKey,
  data,
  formatValue = String,
  children,
  reading,
}: ChartFrameProps) {
  const { t } = useTranslation(['admin', 'common']);
  const [showTable, setShowTable] = useState(false);
  const tableId = useId();

  return (
    <figure className="report-chart">
      <figcaption className="report-chart-head">
        <h4 className="report-chart-title">{t(titleKey)}</h4>
        <button
          type="button"
          className="button button-ghost button-small"
          aria-expanded={showTable}
          aria-controls={tableId}
          onClick={() => setShowTable((was) => !was)}
        >
          {showTable ? t('reports.chart.hideTable') : t('reports.chart.showTable')}
        </button>
      </figcaption>

      <div className="report-chart-canvas" aria-hidden="true">
        {children}
      </div>

      {reading ? <p className="report-reading">{reading}</p> : null}

      {/* Rendered always and hidden with `hidden`, not swapped out: the table
          is the accessible representation of the chart above it, and a table
          that only exists after a click is a table a screen reader never
          reaches. */}
      <div id={tableId} hidden={!showTable} className="report-table-wrap">
        <table className="report-table">
          <caption className="visually-hidden">{t(titleKey)}</caption>
          <thead>
            <tr>
              <th scope="col">{t(labelHeaderKey)}</th>
              <th scope="col" className="numeric">
                {t(valueHeaderKey)}
              </th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.label}>
                <th scope="row">{row.label}</th>
                <td className="numeric">{formatValue(row.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

/** Bars, for time-of-day and day-of-week. One series, one colour. */
export function Bars({
  data,
  height = 220,
}: {
  readonly data: readonly ChartDatum[];
  readonly height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={[...data]} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={44} allowDecimals={false} />
        <Tooltip cursor={{ fill: 'var(--color-green-tint)' }} />
        <Bar dataKey="value" fill="var(--color-primary)" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/**
 * A histogram with the policy drawn across it.
 *
 * The `ReferenceLine` is the reason this is its own component rather than
 * `Bars` with a prop. Reading a distribution against a policy is the single
 * finding in this whole report section that a venue cannot get anywhere else,
 * and asking an owner to do the comparison by eye — "which of these bars is
 * past 120?" — throws away the entire point of drawing it.
 */
export function Histogram({
  data,
  markerLabel,
  markerAt,
  height = 240,
}: {
  readonly data: readonly ChartDatum[];
  /** The policy value's label, drawn on the line itself. */
  readonly markerLabel: string;
  /** Which bar the line sits after, by label. */
  readonly markerAt: string | null;
  readonly height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={[...data]} margin={{ top: 20, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={44} allowDecimals={false} />
        <Tooltip cursor={{ fill: 'var(--color-green-tint)' }} />
        <Bar dataKey="value" fill="var(--color-primary)" radius={[3, 3, 0, 0]} />
        {markerAt ? (
          <ReferenceLine
            x={markerAt}
            stroke="var(--color-danger)"
            strokeDasharray="5 4"
            strokeWidth={2}
            label={{
              value: markerLabel,
              position: 'top',
              fill: 'var(--color-danger)',
              fontSize: 12,
            }}
          />
        ) : null}
      </BarChart>
    </ResponsiveContainer>
  );
}

/** A line, for revenue across the range. */
export function TrendLine({
  data,
  height = 220,
}: {
  readonly data: readonly ChartDatum[];
  readonly height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={[...data]} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={64} />
        <Tooltip />
        <Line
          type="monotone"
          dataKey="value"
          stroke="var(--color-primary)"
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
