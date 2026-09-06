import type { Compared } from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import { Comparison } from './Comparison';

export interface StatProps {
  readonly labelKey: string;
  /** Already formatted — dram through `formatDram`, counts through the locale. */
  readonly value: string;
  /** Absent when the server sent no comparable measure for this tile. */
  readonly compared?: Compared | undefined;
  readonly comparedDays: number;
  readonly large?: boolean;
}

/**
 * One number, with its comparison when there is one.
 *
 * "142 covers" means nothing on its own; "142 covers, up 9% on the week before"
 * is a fact somebody can act on. But the comparison is the server's to supply —
 * {@link Comparison} renders nothing when it did not — so a tile with no
 * comparable measure behind it simply shows the number, rather than a dash or a
 * zero that reads like a measurement.
 */
export function Stat({ labelKey, value, compared, comparedDays, large = false }: StatProps) {
  const { t } = useTranslation(['admin', 'common']);

  return (
    <div className={large ? 'report-stat report-stat-large' : 'report-stat'}>
      <p className="report-stat-label">{t(labelKey)}</p>
      <p className="report-stat-value">{value}</p>
      {compared ? <Comparison value={compared} comparedDays={comparedDays} /> : null}
    </div>
  );
}
