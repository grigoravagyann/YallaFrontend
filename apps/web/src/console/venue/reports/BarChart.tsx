import { useLocale } from '@yalla/i18n';

export interface Bar {
  readonly key: string;
  /** Under the bar: "12", "<2 h", "≤120". */
  readonly label: string;
  /** A share, 0–1. */
  readonly share: number;
  /** `hot`: a peak, in the brand; `over`: past the policy, in amber. */
  readonly tone?: 'hot' | 'over';
}

export interface BarChartProps {
  readonly bars: readonly Bar[];
  /**
   * The chart said in words — every bar's label and share — since a picture of
   * bars says nothing to a screen reader (HANDOFF section 4).
   */
  readonly description: string;
  /** Shares written on top of each bar. */
  readonly showValues?: boolean;
  /** A dashed line after the bar at this index, with its label: the policy. */
  readonly marker?: { readonly afterIndex: number; readonly label: string } | null;
  readonly size?: 'tall' | 'short';
}

/** The axis's top: the tallest bar rounded up to a step of 5 %, never below 10 %. */
function axisTop(bars: readonly Bar[]): number {
  const most = Math.max(0, ...bars.map((bar) => bar.share));
  return Math.max(0.1, Math.ceil((most * 100) / 5) * 0.05);
}

/**
 * Bars of shares with a y-axis (the design's second review: every bar chart
 * has one) — revenue by hour, lead time, turn time.
 *
 * Drawn with the console's own boxes rather than a chart library, in the
 * console's tokens: the axis reads 0, half and the top, the bars are the
 * brown family, a peak is the brand and a bar past the policy amber. The
 * picture is hidden from a screen reader, which is read `description`
 * instead.
 */
export function BarChart({
  bars,
  description,
  showValues = false,
  marker = null,
  size = 'tall',
}: BarChartProps) {
  const { locale } = useLocale();
  const percent = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 });
  const top = axisTop(bars);

  return (
    <div
      className={['yc-bchart', size === 'short' ? 'is-short' : '', marker ? 'has-marker' : '']
        .filter(Boolean)
        .join(' ')}
    >
      <div className="yc-bc-y" aria-hidden="true">
        <span>{percent.format(top)}</span>
        <span>{percent.format(top / 2)}</span>
        <span>0</span>
      </div>
      <div className="yc-bc-plot">
        <div className="yc-bc-bars" role="img" aria-label={description}>
          {bars.map((bar) => (
            <div key={bar.key} className="yc-bc-col">
              <span
                className={bar.tone ? `yc-bc-bar is-${bar.tone}` : 'yc-bc-bar'}
                style={{ height: `${Math.min(100, (bar.share / top) * 100).toFixed(1)}%` }}
              >
                {showValues ? (
                  <span className="yc-bc-v" aria-hidden="true">
                    {percent.format(bar.share)}
                  </span>
                ) : null}
              </span>
            </div>
          ))}
          {marker ? (
            <span
              className="yc-bc-marker"
              style={{ left: `${(((marker.afterIndex + 1) / bars.length) * 100).toFixed(2)}%` }}
            >
              <span>{marker.label}</span>
            </span>
          ) : null}
        </div>
        <div className="yc-bc-x" aria-hidden="true">
          {bars.map((bar) => (
            <span key={bar.key}>{bar.label}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
