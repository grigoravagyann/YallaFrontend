import type { ReportQuery } from '@yalla/api';
import {
  useMenuReport,
  useOccupancyReport,
  useReservationReport,
  useRevenueReport,
} from '@yalla/api/react';
import { useLocale, useTranslation } from '@yalla/i18n';
import { useEffect, useState } from 'react';
import { PageHeader } from '../../ui/PageHeader';
import { DownloadIcon } from '../../ui/icons';
import { useToast } from '../../ui/toast';
import { useVenueOutlet } from '../VenueLayout';
import {
  allCsv,
  csvBlob,
  csvFileName,
  menuCsv,
  occupancyCsv,
  reservationsCsv,
  revenueCsv,
  summaryCsv,
  type CsvSection,
} from './csv';
import { saveFile } from './download';
import { MenuSection } from './MenuSection';
import { OccupancySection } from './OccupancySection';
import {
  CONSOLE_REPORT_MAX_DAYS,
  DEFAULT_PRESET,
  RANGE_PRESETS,
  branchToday,
  daysInRange,
  previousRange,
  problemWith,
  rangeFor,
  type DateRange,
  type RangePreset,
} from './range';
import { ReservationsSection } from './ReservationsSection';
import { RevenueSection } from './RevenueSection';
import { SummarySection } from './SummarySection';

/**
 * How the period went, and what is worth changing (Reports artboard).
 *
 * The range comes first and everything below answers to it: the presets an
 * owner actually asks for, a custom range up to 92 days, and — for an owner or
 * a general manager with more than one branch — the branch or all of them
 * (`canRollUpVenue`; the server refuses a branch manager the rollup). Under
 * it the six numbers, then a card per section, each loading, failing and
 * exporting on its own.
 *
 * Every CSV is made here from the JSON on screen (VC5 wire §3), so the file
 * says what the page says, the previous period included.
 */
export function ReportsScreen() {
  const { t } = useTranslation(['admin', 'common']);
  const { locale } = useLocale();
  const toast = useToast();
  const { branchId, branchName, timeZoneId, canRollUpVenue } = useVenueOutlet();

  const today = useBranchToday(timeZoneId);
  const [preset, setPreset] = useState<RangePreset>(DEFAULT_PRESET);
  /** The dates typed under Custom; a preset's range is worked out from today. */
  const [custom, setCustom] = useState<DateRange>(
    () => rangeFor(DEFAULT_PRESET, today) ?? { from: today, to: today },
  );
  // Derived, not stored: a page left open past midnight moves its preset to
  // the new day ("this week" gains a day, "yesterday" moves on), while a
  // custom range stays as typed.
  const range: DateRange = (preset === 'custom' ? null : rangeFor(preset, today)) ?? custom;
  const [rollUpVenue, setRollUpVenue] = useState(false);
  const [exporting, setExporting] = useState(false);
  const problem = problemWith(range);
  const allBranches = canRollUpVenue && rollUpVenue;

  const query: ReportQuery | null =
    branchId && !problem
      ? { branchId, from: range.from, to: range.to, ...(allBranches ? { rollUpVenue: true } : {}) }
      : null;

  // The same reads the sections make (one cache entry each): "Export
  // everything" writes what is on screen, once every section has it.
  const occupancy = useOccupancyReport(query);
  const reservations = useReservationReport(query);
  const revenue = useRevenueReport(query);
  const menu = useMenuReport(query);

  const days = daysInRange(range);
  const dayFormat = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
  const span = (from: string, to: string) => {
    const start = new Date(`${from}T12:00:00Z`);
    return from === to
      ? dayFormat.format(start)
      : dayFormat.formatRange(start, new Date(`${to}T12:00:00Z`));
  };
  const before = previousRange(range);
  const scopeLine = allBranches ? t('reports.scope.allBranches') : (branchName ?? '');
  const periodName = preset === 'custom' ? t('reports.summary.customTitle') : presetLabel(preset);

  function presetLabel(option: RangePreset): string {
    switch (option) {
      case 'yesterday':
        return t('reports.range.yesterday');
      case 'thisWeek':
        return t('reports.range.thisWeek');
      case 'lastWeek':
        return t('reports.range.lastWeek');
      case 'thisMonth':
        return t('reports.range.thisMonth');
      case 'lastMonth':
        return t('reports.range.lastMonth');
      case 'custom':
        return t('reports.range.custom');
    }
  }

  function choosePreset(next: RangePreset) {
    // Custom starts from the dates on screen: snapping them when somebody
    // picks "Custom" would undo the change they are about to make.
    if (next === 'custom') setCustom(range);
    setPreset(next);
  }

  function save(section: CsvSection, text: string) {
    if (!query) return;
    saveFile(csvFileName(section, query), csvBlob(text));
  }

  function saveSection(title: string, section: CsvSection, text: string) {
    save(section, text);
    toast.say(t('reports.export.ready', { section: title, period: periodName }));
  }

  const everything =
    occupancy.data && reservations.data && revenue.data && menu.data
      ? {
          occupancy: occupancy.data,
          reservations: reservations.data,
          revenue: revenue.data,
          menu: menu.data,
        }
      : null;

  /** One file: every section a titled block, as on screen. */
  function exportEverything() {
    if (!everything || exporting || !query) return;
    setExporting(true);
    // A frame for the busy state to show before the file is written.
    requestAnimationFrame(() => {
      const text = allCsv([
        ['summary', summaryCsv(everything.occupancy, everything.revenue)],
        ['revenue', revenueCsv(everything.revenue)],
        ['reservations', reservationsCsv(everything.reservations)],
        ['occupancy', occupancyCsv(everything.occupancy)],
        ['menu', menuCsv(everything.menu)],
      ]);
      saveFile(csvFileName('report', query), csvBlob(text));
      setExporting(false);
      toast.say(t('reports.export.readyAll', { scope: scopeLine }));
    });
  }

  if (!branchId) {
    return (
      <div className="yc-page">
        <PageHeader title={t('nav.reports')} />
        <p className="yc-card yc-empty-line">{t('menu.noBranch')}</p>
      </div>
    );
  }

  const rangeError =
    problem === 'incomplete'
      ? t('reports.range.incomplete')
      : problem === 'backwards'
        ? t('reports.range.backwards')
        : problem === 'tooLong'
          ? t('reports.rangeTooLong', { max: CONSOLE_REPORT_MAX_DAYS })
          : null;

  return (
    <div className="yc-page yc-reports">
      <PageHeader
        title={t('nav.reports')}
        sub={`${scopeLine} · ${t('reports.sub')}`}
        actions={
          <button
            type="button"
            className="yc-btn yc-btn-sec"
            aria-busy={exporting}
            disabled={!everything}
            onClick={exportEverything}
          >
            {exporting ? <span className="yc-spin" aria-hidden="true" /> : <DownloadIcon />}
            {exporting ? t('reports.export.working') : t('reports.export.all')}
          </button>
        }
      />

      <div className="yc-rp-bar">
        <div className="yc-seg" role="group" aria-label={t('reports.range.legend')}>
          {RANGE_PRESETS.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={option === preset}
              onClick={() => choosePreset(option)}
            >
              {presetLabel(option)}
            </button>
          ))}
        </div>
        {/* Only where there is something to roll up, and only for somebody the
            server lets roll it up: a branch manager would be offered a 403. */}
        {canRollUpVenue ? (
          <div className="yc-seg" role="group" aria-label={t('reports.scope.label')}>
            <button type="button" aria-pressed={!rollUpVenue} onClick={() => setRollUpVenue(false)}>
              {t('reports.scope.thisBranch')}
            </button>
            <button type="button" aria-pressed={rollUpVenue} onClick={() => setRollUpVenue(true)}>
              {t('reports.scope.allBranches')}
            </button>
          </div>
        ) : null}
      </div>

      {preset === 'custom' ? (
        <div className="yc-rp-custom">
          <div className="yc-fld">
            <label htmlFor="r-from">{t('reports.range.from')}</label>
            <input
              id="r-from"
              className="yc-ctl"
              type="date"
              max={today}
              value={range.from}
              aria-invalid={Boolean(rangeError)}
              {...(rangeError ? { 'aria-describedby': 'r-err' } : {})}
              onChange={(event) => {
                const from = event.currentTarget.value;
                setCustom((was) => ({ ...was, from }));
              }}
            />
          </div>
          <div className="yc-fld">
            <label htmlFor="r-to">{t('reports.range.to')}</label>
            <input
              id="r-to"
              className="yc-ctl"
              type="date"
              max={today}
              value={range.to}
              aria-invalid={Boolean(rangeError)}
              {...(rangeError ? { 'aria-describedby': 'r-err' } : {})}
              onChange={(event) => {
                const to = event.currentTarget.value;
                setCustom((was) => ({ ...was, to }));
              }}
            />
          </div>
          {rangeError ? (
            <span className="yc-err" id="r-err" role="alert">
              {rangeError}
            </span>
          ) : null}
        </div>
      ) : null}

      <p className="yc-rp-line">
        {problem
          ? t('reports.range.chooseValid')
          : t('reports.range.line', {
              range: span(range.from, range.to),
              count: days,
              previous: span(before.from, before.to),
            })}
      </p>

      {/* Nothing is asked for an invalid range: the line above says why, and
          no section sits on a "loading" that would never end. */}
      {query ? (
        <>
          <SummarySection query={query} locale={locale} />
          <RevenueSection
            query={query}
            locale={locale}
            periodName={periodName}
            onCsv={saveSection}
          />
          <div className="yc-rp-pair">
            <ReservationsSection query={query} locale={locale} onCsv={saveSection} />
            <OccupancySection query={query} locale={locale} onCsv={saveSection} />
          </div>
          <MenuSection query={query} locale={locale} onCsv={saveSection} />
        </>
      ) : null}
    </div>
  );
}

/** How often the page checks whether the branch's day has turned. */
const DAY_CHECK_MS = 60_000;

/**
 * The branch's date today, kept current: checked every minute and when the
 * tab comes back into view, so a Reports page left open overnight answers
 * for the new day.
 */
function useBranchToday(timeZoneId: string): string {
  const [today, setToday] = useState(() => branchToday(timeZoneId));
  useEffect(() => {
    const check = () => setToday(branchToday(timeZoneId));
    check();
    const timer = setInterval(check, DAY_CHECK_MS);
    document.addEventListener('visibilitychange', check);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
    };
  }, [timeZoneId]);
  return today;
}
