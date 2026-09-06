import type { Compared } from '@yalla/api';
import { useTranslation } from '@yalla/i18n';

export interface ComparisonProps {
  readonly value: Compared;
  /** Days in the period being compared against, for "on the 7 days before". */
  readonly comparedDays: number;
}

/**
 * The change on the previous equivalent period, or **nothing at all**.
 *
 * The rule this component exists to enforce: a comparison the server did not
 * send is not rendered. Not as 0%, not as a dash, not as a grey "—" that reads
 * like a measured zero. A venue's first week has no previous week, and a screen
 * that prints "0%" against one has stated something false with total
 * confidence.
 *
 * `changeFraction` is nullable independently of `previous`, and both cases end
 * up here: no prior period at all, and a prior period of exactly zero, which
 * has no percentage because growth from nothing is not a percentage. Neither is
 * the client's to fill in — the client never divides.
 *
 * Direction is carried by a word and an arrow as well as by colour, for the
 * same reason the floor plan never uses colour alone: about one in twelve men
 * cannot tell the red from the green, and this is a number somebody is making a
 * decision on.
 */
export function Comparison({ value, comparedDays }: ComparisonProps) {
  const { t } = useTranslation(['admin', 'common']);

  // The whole point. No fraction, no element.
  if (value.changeFraction === null) return null;

  const fraction = value.changeFraction;
  const rounded = Math.round(Math.abs(fraction) * 100);
  const direction = rounded === 0 ? 'flat' : fraction > 0 ? 'up' : 'down';

  return (
    <p className={`report-delta report-delta-${direction}`}>
      <span aria-hidden="true" className="report-delta-arrow">
        {direction === 'up' ? '↑' : direction === 'down' ? '↓' : '→'}
      </span>{' '}
      {t(`reports.delta.${direction}`, { percent: rounded, days: comparedDays })}
    </p>
  );
}

/**
 * Said once per section rather than on every number.
 *
 * Repeating "on the 7 days before" under six tiles is noise; saying it nowhere
 * leaves an owner guessing what a percentage is against, which is the one thing
 * that decides whether it means anything.
 */
export function ComparisonLegend({ range }: { range: { from: string; to: string } }) {
  const { t } = useTranslation(['admin', 'common']);
  return (
    <p className="report-compared-note muted small">
      {t('reports.comparedWith', { from: range.from, to: range.to })}
    </p>
  );
}
