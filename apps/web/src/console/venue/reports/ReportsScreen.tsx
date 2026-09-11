import { REPORT_SECTIONS, type ReportQuery } from '@yalla/api';
import { useExportReport } from '@yalla/api/react';
import { useLocale, useTranslation } from '@yalla/i18n';
import { useMemo, useState } from 'react';
import { useVenueOutlet } from '../VenueLayout';
import { MenuSection } from './MenuSection';
import { OccupancySection } from './OccupancySection';
import { ReservationsSection } from './ReservationsSection';
import { RevenueSection } from './RevenueSection';
import { SummarySection } from './SummarySection';
import { saveFile } from './download';
import {
  DEFAULT_PRESET,
  RANGE_PRESETS,
  branchToday,
  daysInRange,
  problemWith,
  rangeFor,
  type DateRange,
  type RangePreset,
} from './range';

/**
 * What the owner is paying for.
 *
 * Not a dashboard. A dashboard is a wall of numbers nobody reads twice; this is
 * a short answer to a specific question, and the question changes with the day
 * — so the range control is the first thing on the screen and everything below
 * it answers to that one range.
 *
 * ## Why the sections are separate queries
 *
 * Five report groups, five requests, five loading states. They cost very
 * different amounts — the menu report anti-joins a branch's whole menu against
 * the period's order lines — and an owner who opened the page for tonight's
 * covers should not wait on the slowest, nor lose the page when it fails. Each
 * section owns its own spinner, its own error and its own retry.
 *
 * ## Why there is no second branch picker
 *
 * `VenueLayout` already owns which branch the venue section is looking at, and
 * a manager with one branch correctly gets no control at all. Adding a full
 * branch list here would put two branch pickers on one screen that could
 * disagree with each other. What reports add instead is the thing the layout's
 * switcher cannot express: **All branches**, the owner's rollup, offered only
 * when the layout says this person may roll up — an owner with more than one
 * branch. A manager who sees several branches is not offered it, because the
 * server refuses them the query.
 */
export function ReportsScreen() {
  const { t } = useTranslation(['admin', 'common']);
  const { locale } = useLocale();
  const { branchId, timeZoneId, canRollUpVenue } = useVenueOutlet();

  const today = useMemo(() => branchToday(timeZoneId), [timeZoneId]);

  const [preset, setPreset] = useState<RangePreset>(DEFAULT_PRESET);
  const [range, setRange] = useState<DateRange>(
    () => rangeFor(DEFAULT_PRESET, branchToday(timeZoneId)) ?? { from: today, to: today },
  );
  const [rollUpVenue, setRollUpVenue] = useState(false);

  const exportAll = useExportReport();
  const problem = problemWith(range);

  function choosePreset(next: RangePreset) {
    setPreset(next);
    // Custom keeps whatever is on screen: snapping the dates when somebody
    // selects "Custom" would undo the change they are about to make.
    const resolved = rangeFor(next, today);
    if (resolved) setRange(resolved);
  }

  /**
   * The one question every section asks.
   *
   * Null while there is no branch — a manager whose branch list has not arrived
   * yet, or a range the server would refuse — and every section is disabled by
   * that rather than each deciding for itself.
   */
  const query: ReportQuery | null =
    branchId && !problem
      ? { branchId, from: range.from, to: range.to, ...(rollUpVenue ? { rollUpVenue } : {}) }
      : null;

  /**
   * Every section's CSV, fetched from the server and saved one after another.
   *
   * Five files rather than one archive, and every byte of each is the server's.
   * There is no combined-export endpoint, and building one on the client would
   * mean the client deciding the order, the headings and the separator between
   * five reports — which is precisely the re-derivation the export rule exists
   * to prevent. Five correct files beat one invented one.
   */
  async function exportEverything() {
    if (!query) return;
    for (const section of REPORT_SECTIONS) {
      saveFile(await exportAll.mutateAsync({ ...query, section }));
    }
  }

  if (!branchId) {
    return (
      <section className="page">
        <h2>{t('nav.reports')}</h2>
        <p className="muted">{t('menu.noBranch')}</p>
      </section>
    );
  }

  return (
    <section className="page reports-page">
      <header className="reports-head">
        <div>
          <h2>{t('nav.reports')}</h2>
          <p className="muted">{t('reports.intro')}</p>
        </div>

        <button
          type="button"
          className="button button-small"
          onClick={() => void exportEverything()}
          disabled={!query || exportAll.isPending}
        >
          {exportAll.isPending ? t('reports.export.working') : t('reports.export.all')}
        </button>
      </header>

      <div className="reports-controls">
        <fieldset className="report-presets">
          <legend className="visually-hidden">{t('reports.range.legend')}</legend>
          {RANGE_PRESETS.map((option) => (
            <button
              key={option}
              type="button"
              className={option === preset ? 'chip is-on' : 'chip'}
              aria-pressed={option === preset}
              onClick={() => choosePreset(option)}
            >
              {t(`reports.range.${option}`)}
            </button>
          ))}
        </fieldset>

        {/* Always editable, not only under "Custom": adjusting a date is how
            somebody discovers Custom, rather than something they have to
            select first. Editing one switches the preset to Custom. */}
        <label className="labelled inline">
          <span>{t('reports.range.from')}</span>
          <input
            className="field"
            type="date"
            value={range.from}
            max={today}
            onChange={(event) => {
              const from = event.currentTarget.value;
              if (!from) return;
              setPreset('custom');
              setRange((was) => ({ ...was, from }));
            }}
          />
        </label>

        <label className="labelled inline">
          <span>{t('reports.range.to')}</span>
          <input
            className="field"
            type="date"
            value={range.to}
            max={today}
            onChange={(event) => {
              const to = event.currentTarget.value;
              if (!to) return;
              setPreset('custom');
              setRange((was) => ({ ...was, to }));
            }}
          />
        </label>

        {/* Only where there is something to roll up, and only for somebody the
            server lets roll it up. An owner with one branch would be choosing
            between a thing and itself; a manager would be offered a 403. */}
        {canRollUpVenue ? (
          <label className="labelled inline">
            <span>{t('reports.scope.label')}</span>
            <select
              className="field"
              value={rollUpVenue ? 'venue' : 'branch'}
              onChange={(event) => setRollUpVenue(event.currentTarget.value === 'venue')}
            >
              <option value="branch">{t('reports.scope.thisBranch')}</option>
              <option value="venue">{t('reports.scope.allBranches')}</option>
            </select>
          </label>
        ) : null}
      </div>

      {problem ? (
        <p className="report-notice" role="alert">
          {problem === 'backwards'
            ? t('reports.range.backwards')
            : t('reports.rangeTooLong', { max: 366 })}
        </p>
      ) : (
        <p className="muted small">
          {t('reports.range.showing', { days: daysInRange(range), from: range.from, to: range.to })}
        </p>
      )}

      <SummarySection query={query} locale={locale} />
      <OccupancySection query={query} locale={locale} />
      <ReservationsSection query={query} locale={locale} />
      <MenuSection query={query} locale={locale} />
      <RevenueSection query={query} locale={locale} timeZoneId={timeZoneId} />
    </section>
  );
}
