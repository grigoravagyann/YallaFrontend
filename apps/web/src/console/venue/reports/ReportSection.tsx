import { ReportRangeTooLongError, type ReportQuery, type ReportSection } from '@yalla/api';
import { useExportReport } from '@yalla/api/react';
import { useTranslation } from '@yalla/i18n';
import { useId, useState, type ReactNode } from 'react';
import { QueryFailureNotice } from '../../../components/QueryFailureNotice';
import { saveFile } from './download';

export interface ReportSectionFrameProps {
  /** Which report group this is, for the export and the section key. */
  readonly section: ReportSection;
  readonly titleKey: string;
  /** One line under the title saying what the section answers. */
  readonly blurbKey?: string;
  readonly query: ReportQuery | null;
  readonly isLoading: boolean;
  readonly error: unknown;
  readonly onRetry?: (() => void) | undefined;
  /** True when the request succeeded and there is genuinely nothing in it. */
  readonly isEmpty?: boolean;
  readonly defaultOpen?: boolean;
  readonly children: ReactNode;
}

/**
 * One collapsible section, with its own export and its own failure.
 *
 * The isolation is the design, not a convenience. Reports are slow queries of
 * very different cost — the menu one anti-joins a branch's whole menu against
 * the period's order lines — and an owner who opened the page for tonight's
 * covers should not wait on it, nor lose the page when it times out. So each
 * section owns its loading state, its error and its retry, and a section that
 * fails renders a notice *in its own box* with the rest of the page intact.
 *
 * The export sits here rather than in each section body for the same reason it
 * is per-section at all: the file is the artefact that leaves the building, and
 * it comes off the server as bytes. This component never sees a row.
 */
export function ReportSectionFrame({
  section,
  titleKey,
  blurbKey,
  query,
  isLoading,
  error,
  onRetry,
  isEmpty = false,
  defaultOpen = true,
  children,
}: ReportSectionFrameProps) {
  const { t } = useTranslation(['admin', 'common']);
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  const exportReport = useExportReport();

  const tooLong = error instanceof ReportRangeTooLongError;

  async function download() {
    if (!query) return;
    const file = await exportReport.mutateAsync({ ...query, section });
    saveFile(file);
  }

  return (
    <section className="report-section" aria-labelledby={`${bodyId}-title`}>
      <header className="report-section-head">
        <button
          type="button"
          className="report-section-toggle"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((was) => !was)}
        >
          <span aria-hidden="true" className="report-caret">
            {open ? '▾' : '▸'}
          </span>
          <span id={`${bodyId}-title`} className="report-section-title">
            {t(titleKey)}
          </span>
        </button>

        {/* Nothing to export until there is something to export. Offering the
            button against a failed or empty section produces a file with a
            header row and nothing under it, which reads as data loss. */}
        <button
          type="button"
          className="button button-small"
          onClick={() => void download()}
          disabled={!query || isLoading || Boolean(error) || isEmpty || exportReport.isPending}
        >
          {exportReport.isPending ? t('reports.export.working') : t('reports.export.csv')}
        </button>
      </header>

      {blurbKey ? <p className="report-section-blurb muted">{t(blurbKey)}</p> : null}

      <div id={bodyId} hidden={!open}>
        {tooLong ? (
          <p className="report-notice" role="status">
            {t('reports.rangeTooLong', { max: (error as ReportRangeTooLongError).maxDays })}
          </p>
        ) : error ? (
          <QueryFailureNotice error={error} onRetry={onRetry} />
        ) : isLoading ? (
          <ReportSkeleton label={t('reports.loading')} />
        ) : isEmpty ? (
          <EmptyRange />
        ) : (
          children
        )}

        {exportReport.isError ? (
          <p className="report-notice" role="status">
            {t('reports.export.failed')}
          </p>
        ) : null}
      </div>
    </section>
  );
}

/**
 * A real loading state, sized like the content it replaces.
 *
 * Reports take seconds rather than milliseconds, so this is the state an owner
 * will actually look at. A blank panel for three seconds reads as a broken
 * screen; a block the shape of the answer reads as one on its way.
 */
export function ReportSkeleton({ label }: { label: string }) {
  return (
    <div className="report-skeleton" role="status" aria-live="polite">
      <span className="visually-hidden">{label}</span>
      <span className="report-skeleton-bar" aria-hidden="true" />
      <span className="report-skeleton-bar" aria-hidden="true" />
      <span className="report-skeleton-bar" aria-hidden="true" />
    </div>
  );
}

/**
 * A range with nothing in it.
 *
 * Deliberately not a chart of zeroes. A zeroed bar chart says "your venue took
 * no money", which is a claim about the business; what is true is that this
 * range has no data in it, and the next move is a wider range. Those are
 * different sentences and the wrong one loses a pilot.
 */
export function EmptyRange() {
  const { t } = useTranslation(['admin', 'common']);
  return (
    <div className="report-empty">
      <p className="report-empty-title">{t('reports.empty.title')}</p>
      <p className="muted">{t('reports.empty.body')}</p>
    </div>
  );
}
