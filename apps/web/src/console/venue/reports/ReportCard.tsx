import type { Compared } from '@yalla/api';
import { useTranslation } from '@yalla/i18n';
import { useId, type ReactNode } from 'react';
import { QueryFailureNotice } from '../../../components/QueryFailureNotice';

export interface ReportCardProps {
  readonly title: string;
  /** One line under the title saying what the section answers. */
  readonly cap: string;
  /** The header's buttons: the table toggle, the CSV. */
  readonly actions?: ReactNode;
  readonly isLoading: boolean;
  readonly error: unknown;
  readonly onRetry: () => void;
  /** The request succeeded and there is genuinely nothing in it. */
  readonly isEmpty: boolean;
  readonly className?: string;
  readonly children: ReactNode;
}

/**
 * One section of the Reports page: its own card, its own loading state, its
 * own failure and its own CSV (Reports artboard).
 *
 * The isolation is the design. Reports are slow queries of very different
 * cost — the menu one anti-joins a branch's whole menu against the period's
 * order lines — and an owner who opened the page for tonight's covers should
 * not wait on it, nor lose the page when it fails.
 */
export function ReportCard({
  title,
  cap,
  actions,
  isLoading,
  error,
  onRetry,
  isEmpty,
  className,
  children,
}: ReportCardProps) {
  const titleId = useId();

  return (
    <section className={className ? `yc-card ${className}` : 'yc-card'} aria-labelledby={titleId}>
      <div className="yc-card-h">
        <div>
          <h2 className="yc-h2" id={titleId}>
            {title}
          </h2>
          <p className="yc-cap">{cap}</p>
        </div>
        {actions ? <div className="yc-row-acts">{actions}</div> : null}
      </div>
      {error ? (
        <div className="yc-rp-pad">
          <QueryFailureNotice error={error} onRetry={onRetry} />
        </div>
      ) : isLoading ? (
        <ReportSkeleton />
      ) : isEmpty ? (
        <EmptyRange />
      ) : (
        children
      )}
    </section>
  );
}

/**
 * A real loading state, sized like the content it replaces: reports take
 * seconds, and a blank card for three seconds reads as a broken screen.
 */
export function ReportSkeleton() {
  const { t } = useTranslation(['admin', 'common']);
  return (
    <div className="yc-rp-sk" role="status" aria-live="polite">
      <span className="yc-sr">{t('reports.loading')}</span>
      <span className="yc-sk" aria-hidden="true" />
      <span className="yc-sk" aria-hidden="true" />
      <span className="yc-sk" aria-hidden="true" />
    </div>
  );
}

/**
 * A range with nothing in it. Deliberately not a chart of zeroes: a zeroed
 * chart says "your venue took no money", which is a claim about the business;
 * what is true is that this range has nothing recorded in it.
 */
export function EmptyRange() {
  const { t } = useTranslation(['admin', 'common']);
  return (
    <div className="yc-rp-empty">
      <p className="yc-strong">{t('reports.empty.title')}</p>
      <p className="yc-muted">{t('reports.empty.body')}</p>
    </div>
  );
}

/**
 * The change on the previous equivalent period, or **nothing at all**.
 *
 * A comparison the server did not send is not rendered — not as 0 %, not as a
 * dash. A venue's first week has no previous week, and a previous period of
 * zero has no percentage: neither is the client's to fill in, and the client
 * never divides. Direction is said by a word for a screen reader and by an
 * arrow, as well as by colour.
 */
export function Delta({ value }: { readonly value: Compared | null }) {
  const { t } = useTranslation(['admin', 'common']);
  if (!value || value.changeFraction === null) return null;
  const percent = Math.round(Math.abs(value.changeFraction) * 100);
  const direction = percent === 0 ? 'flat' : value.changeFraction > 0 ? 'up' : 'down';
  if (direction === 'flat') {
    return <span className="yc-delta is-flat">{t('reports.delta.flat')}</span>;
  }
  return (
    <span className={`yc-delta is-${direction}`}>
      <span aria-hidden="true">{direction === 'up' ? '↑' : '↓'} </span>
      <span className="yc-sr">
        {direction === 'up' ? t('reports.delta.upWord') : t('reports.delta.downWord')}{' '}
      </span>
      {t('reports.delta.change', { percent })}
    </span>
  );
}

/** A card's CSV button. */
export function CsvButton({
  label,
  disabled,
  onClick,
}: {
  readonly label: string;
  readonly disabled: boolean;
  readonly onClick: () => void;
}) {
  const { t } = useTranslation(['admin', 'common']);
  return (
    <button
      type="button"
      className="yc-btn yc-btn-sec yc-btn-sm"
      aria-label={t('reports.export.csvFor', { section: label })}
      disabled={disabled}
      onClick={onClick}
    >
      {t('reports.export.csv')}
    </button>
  );
}
