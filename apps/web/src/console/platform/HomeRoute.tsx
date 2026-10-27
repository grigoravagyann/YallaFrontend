import {
  BRANCH_FEATURES,
  type BranchFeature,
  type OutboxCounts,
  type OverviewBookings,
  type PlatformActivityEntry,
  type PlatformOverview,
  type RecentVenue,
  type VenueCounter,
} from '@yalla/api';
import { useOutboxHealth, usePlatformActivity, usePlatformOverview } from '@yalla/api/react';
import { branchDayKey, formatDate, formatTime } from '@yalla/format';
import { useLocale, useTranslation, type Locale } from '@yalla/i18n';
import { useId, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowsUpDownIcon,
  CalendarIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ClockIcon,
  DotIcon,
  EyeOffIcon,
  GlobeIcon,
  PadlockIcon,
  PauseIcon,
  PlusIcon,
  RestoreIcon,
  SendIcon,
  SettingsIcon,
  TabIcon,
  TrashIcon,
  UserIcon,
  VenuesIcon,
  WarningIcon,
} from '../ui/icons';
import { PageHeader } from '../ui/PageHeader';
import { BookingBlocksCard } from './BookingBlocksCard';
import { useVenueTypeLabel } from './venue/venueFields';
import { issueText } from './venues/venueList';
import { VenueThumb } from './venues/VenueThumb';

/** Every venue in the pilot is in Yerevan; the server labels the days there too. */
const CONSOLE_TIME_ZONE = 'Asia/Yerevan';
/** Home shows the first few unfinished branches; the venues list has the rest. */
const NOT_READY_SHOWN = 5;
/** The newest few lines; the feed is a glance, not the log. */
const FEED_LIMIT = 8;

type Translate = ReturnType<typeof useTranslation>['t'];

/**
 * Home (Main artboard): the platform as it stands, in one read.
 *
 * - **The outbox alert** says how many messages did not reach guests in the
 *   last day, red because it is a real failure. "Details" lists them. There is
 *   **no retry**, by decision: a dead letter is a decision to stop.
 * - **Four cards**: venues by plan, bookings this week against the last, and
 *   two that open a per-venue list — the bookings waiting for a venue's
 *   approval, and the tabs open now.
 * - **Bookings per day** for 14 or 30 days, today last and in the brand's tan.
 * - **Guests blocked for no-shows**, while any are, with a lift that asks why
 *   (`BookingBlocksCard`).
 * - **Not ready yet**: branches a guest can reach but would find unfinished.
 * - **Recently added** and **recent activity**: who did what, with no guest in it.
 */
export function HomeRoute() {
  const { t } = useTranslation(['admin', 'common']);
  const { locale } = useLocale();
  const query = usePlatformOverview();
  const data = query.data;

  let body: ReactNode;
  if (data) {
    body = <Home overview={data} locale={locale} />;
  } else if (query.isError) {
    body = (
      <div className="yc-alert" role="alert">
        <span className="yc-grow">{t('home.failed')}</span>
        <button
          type="button"
          className="yc-btn yc-btn-sec yc-btn-sm"
          onClick={() => void query.refetch()}
        >
          {t('home.retry')}
        </button>
      </div>
    );
  } else {
    body = (
      <p className="yc-card yc-empty-line" role="status">
        {t('home.loading')}
      </p>
    );
  }

  return (
    <div className="yc-home">
      <PageHeader
        title={t('nav.home')}
        sub={
          data
            ? t('home.sub', { time: formatTime(data.generatedAtUtc, CONSOLE_TIME_ZONE, locale) })
            : null
        }
      />
      {body}
    </div>
  );
}

type Drill = 'pending' | 'tabs' | null;

function Home({
  overview,
  locale,
}: {
  readonly overview: PlatformOverview;
  readonly locale: Locale;
}) {
  const { t } = useTranslation(['admin', 'common']);
  const [drill, setDrill] = useState<Drill>(null);
  const chartId = useId();
  const number = (value: number) => new Intl.NumberFormat(locale).format(value);
  const venues = overview.venues;
  // The plan split is gone with the plan (2026-10-27): branches and state instead.
  const split = [
    t('home.kpi.branches', { count: venues.branches }),
    venues.suspended > 0 ? t('home.kpi.suspended', { count: venues.suspended }) : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const toggle = (which: Exclude<Drill, null>) =>
    setDrill((current) => (current === which ? null : which));

  return (
    <>
      <OutboxAlert outbox={overview.outbox} generatedAtUtc={overview.generatedAtUtc} />

      <div className="yc-hkpis">
        <Link className="yc-card yc-hkpi" to="/platform/venues">
          <span className="yc-hkpi-ic" aria-hidden="true">
            <VenuesIcon />
          </span>
          <span className="yc-hkpi-b">
            <span className="yc-hkpi-l">{t('venues.title')}</span>
            <span className="yc-hkpi-n">{number(venues.total)}</span>
            <span className="yc-hkpi-f">{split}</span>
          </span>
          <ChevronRightIcon className="yc-i yc-hkpi-go" />
        </Link>
        <a className="yc-card yc-hkpi" href={`#${chartId}`}>
          <span className="yc-hkpi-ic" aria-hidden="true">
            <CalendarIcon />
          </span>
          <span className="yc-hkpi-b">
            <span className="yc-hkpi-l">{t('home.kpi.bookings')}</span>
            <span className="yc-hkpi-n">{number(overview.bookings.last7Days)}</span>
            <WeekChange bookings={overview.bookings} locale={locale} />
          </span>
          <ChevronDownIcon className="yc-i yc-hkpi-go" />
        </a>
        <CounterCard
          icon={<ClockIcon />}
          amber
          label={t('home.kpi.pending')}
          counter={overview.pendingApprovals}
          none={t('home.kpi.nobodyWaiting')}
          open={drill === 'pending'}
          onToggle={() => toggle('pending')}
          locale={locale}
        />
        <CounterCard
          icon={<TabIcon />}
          label={t('home.kpi.tabs')}
          counter={overview.openTabs}
          none={t('home.kpi.noTabs')}
          open={drill === 'tabs'}
          onToggle={() => toggle('tabs')}
          locale={locale}
        />
      </div>

      {drill ? (
        <DrillPanel
          kind={drill}
          counter={drill === 'pending' ? overview.pendingApprovals : overview.openTabs}
          onClose={() => {
            // Back to the card that opened it: the Close button goes with the list.
            const opener = document.querySelector<HTMLElement>(
              '[aria-controls="home-drill"][aria-expanded="true"]',
            );
            setDrill(null);
            opener?.focus();
          }}
          locale={locale}
        />
      ) : null}

      <BookingBlocksCard />

      <div className="yc-g2">
        <BookingsChart id={chartId} bookings={overview.bookings} locale={locale} />
        <NotReady overview={overview} />
      </div>

      <div className="yc-g2">
        <RecentVenues venues={overview.recentVenues} locale={locale} />
        <ActivityFeed now={overview.generatedAtUtc} locale={locale} />
      </div>
    </>
  );
}

/**
 * Red, because a guest did not get a message they were promised. No retry
 * button: the user decided dead letters stay dead (backend `notifications.md` §5).
 */
function OutboxAlert({
  outbox,
  generatedAtUtc,
}: {
  readonly outbox: OutboxCounts;
  readonly generatedAtUtc: string;
}) {
  const { t } = useTranslation(['admin', 'common']);
  const { locale } = useLocale();
  const [open, setOpen] = useState(false);
  const details = useOutboxHealth(open);
  const listId = useId();
  if (outbox.deadLetteredLastDay <= 0) return null;

  // The alert counts the last day; so does its list.
  const since = new Date(generatedAtUtc).getTime() - 24 * 60 * 60 * 1000;
  const letters = (details.data?.deadLetters ?? []).filter(
    (letter) => !letter.deadLetteredAtUtc || new Date(letter.deadLetteredAtUtc).getTime() >= since,
  );

  return (
    // A real failure, said at once: "alert", not a polite "status".
    <div className="yc-oalert" role="alert">
      <div className="yc-oalert-row">
        <WarningIcon />
        <span className="yc-oalert-t">
          {t('home.outbox.failed', { count: outbox.deadLetteredLastDay })}
        </span>
        <button
          type="button"
          className="yc-btn yc-btn-sec yc-btn-sm"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen((current) => !current)}
        >
          {open ? t('home.outbox.hide') : t('home.outbox.details')}
        </button>
      </div>
      {open ? (
        <div id={listId}>
          {details.isPending ? (
            <p className="yc-oalert-note">{t('loading')}</p>
          ) : details.isError ? (
            <p className="yc-oalert-note">{t('home.outbox.detailsFailed')}</p>
          ) : letters.length === 0 ? (
            <p className="yc-oalert-note">{t('home.outbox.none')}</p>
          ) : (
            <ul className="yc-oalert-list">
              {letters.map((letter) => (
                <li key={letter.id}>
                  <b>{messageType(letter.type, t)}</b>
                  <span>
                    {formatTime(
                      letter.deadLetteredAtUtc ?? letter.scheduledForUtc,
                      CONSOLE_TIME_ZONE,
                      locale,
                    )}
                  </span>
                  <span>{t('home.outbox.attempts', { count: letter.attemptCount })}</span>
                  {letter.lastError ? <span>{letter.lastError}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

function messageType(type: string, t: Translate): string {
  switch (type) {
    case 'reservation.reminder':
      return t('home.outbox.type.reservationReminder');
    case 'reservation.late-nudge':
      return t('home.outbox.type.reservationLateNudge');
    case 'reservation.decided':
      return t('home.outbox.type.reservationDecided');
    case 'tab.participant-approved':
      return t('home.outbox.type.participantApproved');
    case 'tab.order-ready':
      return t('home.outbox.type.orderReady');
    default:
      return t('home.outbox.type.other');
  }
}

/** "↑ 12 % on last week", in green or plain; nothing invented when last week had none. */
function WeekChange({
  bookings,
  locale,
}: {
  readonly bookings: OverviewBookings;
  readonly locale: Locale;
}) {
  const { t } = useTranslation(['admin', 'common']);
  const change = bookings.changePercent;
  if (change === null) return <span className="yc-hkpi-f">{t('home.kpi.noLastWeek')}</span>;
  if (change === 0) return <span className="yc-hkpi-f">{t('home.kpi.sameAsLastWeek')}</span>;
  const percent = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(
    Math.abs(change),
  );
  return (
    <span className="yc-hkpi-f">
      <span className={change > 0 ? 'yc-up' : 'yc-down'}>
        {change > 0 ? '↑' : '↓'} {percent} %
      </span>{' '}
      {t('home.kpi.vsLastWeek')}
    </span>
  );
}

function CounterCard({
  icon,
  amber = false,
  label,
  counter,
  none,
  open,
  onToggle,
  locale,
}: {
  readonly icon: ReactNode;
  readonly amber?: boolean;
  readonly label: string;
  readonly counter: VenueCounter;
  readonly none: string;
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly locale: Locale;
}) {
  const { t } = useTranslation(['admin', 'common']);
  const icClass = amber ? 'yc-hkpi-ic is-amber' : 'yc-hkpi-ic';
  const body = (
    <>
      <span className={icClass} aria-hidden="true">
        {icon}
      </span>
      <span className="yc-hkpi-b">
        <span className="yc-hkpi-l">{label}</span>
        <span className="yc-hkpi-n">{new Intl.NumberFormat(locale).format(counter.total)}</span>
        <span className="yc-hkpi-f">
          {counter.venues.length > 0
            ? t('home.kpi.atVenues', { count: counter.venues.length })
            : none}
        </span>
      </span>
    </>
  );
  // Nothing to open: the card says so and is not a button.
  if (counter.venues.length === 0) return <div className="yc-card yc-hkpi is-static">{body}</div>;
  return (
    <button
      type="button"
      className={open ? 'yc-card yc-hkpi is-on' : 'yc-card yc-hkpi'}
      aria-expanded={open}
      aria-controls="home-drill"
      onClick={onToggle}
    >
      {body}
    </button>
  );
}

function DrillPanel({
  kind,
  counter,
  onClose,
  locale,
}: {
  readonly kind: 'pending' | 'tabs';
  readonly counter: VenueCounter;
  readonly onClose: () => void;
  readonly locale: Locale;
}) {
  const { t } = useTranslation(['admin', 'common']);
  const titleId = useId();
  return (
    <section className="yc-card yc-drill" id="home-drill" aria-labelledby={titleId}>
      <div className="yc-drill-h">
        <div>
          <h2 className="yc-h2" id={titleId}>
            {kind === 'pending' ? t('home.drill.pendingTitle') : t('home.drill.tabsTitle')}
          </h2>
          <p className="yc-cap">
            {kind === 'pending' ? t('home.drill.pendingCap') : t('home.drill.tabsCap')}
          </p>
        </div>
        <button type="button" className="yc-btn yc-btn-sec yc-btn-sm" onClick={onClose}>
          {t('home.drill.close')}
        </button>
      </div>
      <ul className="yc-drill-g">
        {counter.venues.map((venue) => (
          <li key={venue.venueId}>
            <Link to={`/platform/venues/${venue.venueId}`}>
              <span>{venue.name}</span>
              <b>{new Intl.NumberFormat(locale).format(venue.count)}</b>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** A `YYYY-MM-DD` day as a date at noon UTC, so no zone moves it across midnight. */
function dayOf(date: string): Date {
  return new Date(`${date}T12:00:00Z`);
}

/** Three gridlines over the tallest bar, on round numbers: 52 draws 0, 20, 40, 60. */
function chartTop(max: number): number {
  const third = Math.max(1, max) / 3;
  const magnitude = 10 ** Math.floor(Math.log10(third));
  const step =
    [1, 2, 5, 10].map((factor) => factor * magnitude).find((value) => value >= third) ??
    10 * magnitude;
  return Math.max(3, Math.ceil(step) * 3);
}

function BookingsChart({
  id,
  bookings,
  locale,
}: {
  readonly id: string;
  readonly bookings: OverviewBookings;
  readonly locale: Locale;
}) {
  const { t } = useTranslation(['admin', 'common']);
  const [range, setRange] = useState<14 | 30>(14);
  const [hover, setHover] = useState<number | null>(null);
  const rangeId = useId();
  const days = bookings.perDay.slice(-range);
  const today = days.length - 1;
  const shown = hover === null || hover > today ? today : hover;
  const top = chartTop(Math.max(0, ...days.map((day) => day.count)));
  const total = days.reduce((sum, day) => sum + day.count, 0);
  const dense = range === 30;
  const number = new Intl.NumberFormat(locale);
  const longDate = new Intl.DateTimeFormat(locale, {
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
  const shortDate = new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
  const monthName = new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' });
  const months = [...new Set(days.map((day) => monthName.format(dayOf(day.date))))].map(
    (name) => name.charAt(0).toLocaleUpperCase(locale) + name.slice(1),
  );

  return (
    <section className="yc-card" aria-labelledby={id}>
      <div className="yc-card-h">
        <div>
          <h2 className="yc-h2" id={id} tabIndex={-1}>
            {t('home.chart.title')}
          </h2>
          <p className="yc-cap">
            {t('home.chart.cap', {
              days: range,
              total: number.format(total),
              average: number.format(Math.round(total / range)),
            })}
          </p>
        </div>
        <label className="yc-sr" htmlFor={rangeId}>
          {t('home.chart.range')}
        </label>
        <select
          id={rangeId}
          className="yc-ctl yc-range"
          value={range}
          onChange={(event) => {
            setRange(event.target.value === '30' ? 30 : 14);
            setHover(null);
          }}
        >
          <option value="14">{t('home.chart.range14')}</option>
          <option value="30">{t('home.chart.range30')}</option>
        </select>
      </div>
      <div className="yc-chart">
        <div className="yc-yaxis" aria-hidden="true">
          <span className="yc-yunit">{t('home.chart.unit')}</span>
          <div className="yc-yt">
            {[top, (top * 2) / 3, top / 3, 0].map((tick) => (
              <span key={tick}>{number.format(Math.round(tick))}</span>
            ))}
          </div>
        </div>
        <div className="yc-plotw">
          <div className="yc-plot">
            <div className="yc-grid" style={{ top: '0%' }} />
            <div className="yc-grid" style={{ top: '33.33%' }} />
            <div className="yc-grid" style={{ top: '66.66%' }} />
            <div className={dense ? 'yc-bars is-dense' : 'yc-bars'}>
              {days.map((day, index) => {
                const isToday = index === today;
                const date = dayOf(day.date);
                const label = isToday
                  ? t('home.chart.barToday', { date: longDate.format(date), count: day.count })
                  : t('home.chart.bar', { date: longDate.format(date), count: day.count });
                const className = [
                  'yc-bar',
                  isToday ? 'is-today' : '',
                  shown === index ? 'is-on' : '',
                ]
                  .filter(Boolean)
                  .join(' ');
                return (
                  <div className="yc-col" key={day.date}>
                    <button
                      type="button"
                      className={className}
                      style={{ height: `${((day.count / top) * 100).toFixed(1)}%` }}
                      aria-label={label}
                      onMouseEnter={() => setHover(index)}
                      onFocus={() => setHover(index)}
                      onClick={() => setHover(index)}
                    >
                      {shown === index ? (
                        <span
                          className={
                            // Near an edge the tip opens inward rather than past the card.
                            index >= days.length - 2
                              ? 'yc-tip is-end'
                              : index <= 1
                                ? 'yc-tip is-start'
                                : 'yc-tip'
                          }
                          aria-hidden="true"
                        >
                          {t('home.chart.tip', {
                            date: isToday ? t('home.chart.today') : shortDate.format(date),
                            count: day.count,
                          })}
                        </span>
                      ) : null}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
          <div className={dense ? 'yc-xlab is-dense' : 'yc-xlab'} aria-hidden="true">
            {days.map((day, index) => (
              <span key={day.date} className={index === today ? 'is-today' : undefined}>
                {!dense || (today - index) % 5 === 0 ? dayOf(day.date).getUTCDate() : ''}
              </span>
            ))}
          </div>
          <div className="yc-xmonth" aria-hidden="true">
            {months.join(' – ')}
          </div>
        </div>
      </div>
    </section>
  );
}

function NotReady({ overview }: { readonly overview: PlatformOverview }) {
  const { t } = useTranslation(['admin', 'common']);
  const titleId = useId();
  const { total, branches } = overview.notReady;
  const shown = branches.slice(0, NOT_READY_SHOWN);
  // A venue listed twice names the branch on each line.
  const repeated = new Set(
    branches
      .map((branch) => branch.venueId)
      .filter((venueId, index, all) => all.indexOf(venueId) !== index),
  );
  return (
    <section className="yc-card yc-ready" aria-labelledby={titleId}>
      <div className="yc-card-h">
        <div>
          <h2 className="yc-h2" id={titleId}>
            {t('home.notReady.title')}
          </h2>
          <p className="yc-cap">{t('home.notReady.cap')}</p>
        </div>
        {total > 0 ? <span className="yc-pill yc-pill-amber">{total}</span> : null}
      </div>
      {shown.length === 0 ? (
        <p className="yc-empty-line">{t('home.notReady.empty')}</p>
      ) : (
        <ul className="yc-ready-list">
          {shown.map((branch) => {
            const first = branch.issues[0];
            const issue = first
              ? {
                  ...first,
                  branchName: repeated.has(branch.venueId) ? branch.branchName : null,
                }
              : null;
            return (
              <li key={branch.branchId}>
                <Link className="yc-ready-r" to={`/platform/venues/${branch.venueId}`}>
                  <VenueThumb
                    venue={{
                      name: branch.venueName,
                      // "No photo" draws the empty tile; otherwise the initial.
                      ...(first?.kind === 'noPhoto' ? { coverThumbnailUrl: null } : {}),
                    }}
                  />
                  <span className="yc-ready-t">
                    <span className="yc-ready-n">{branch.venueName}</span>
                    {issue ? (
                      <span>
                        <span className="yc-pill yc-pill-amber">{issueText(issue, t)}</span>
                      </span>
                    ) : null}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <div className="yc-ready-f">
        {total > shown.length ? (
          <span className="yc-muted">
            {t('home.notReady.more', { count: total - shown.length })}
          </span>
        ) : null}
        <Link className="yc-link" to="/platform/venues">
          {t('home.notReady.all')}
          <ChevronRightIcon />
        </Link>
      </div>
    </section>
  );
}

const PILL: Readonly<Record<RecentVenue['status'], string>> = {
  active: 'yc-pill yc-pill-green',
  suspended: 'yc-pill yc-pill-grey',
  inactive: 'yc-pill yc-pill-grey',
  deleted: 'yc-pill yc-pill-red',
};

function RecentVenues({
  venues,
  locale,
}: {
  readonly venues: readonly RecentVenue[];
  readonly locale: Locale;
}) {
  const { t } = useTranslation(['admin', 'common']);
  const typeLabel = useVenueTypeLabel();
  const titleId = useId();
  return (
    <section className="yc-card" aria-labelledby={titleId}>
      <div className="yc-card-h">
        <h2 className="yc-h2" id={titleId}>
          {t('home.recent.title')}
        </h2>
        <Link className="yc-link" to="/platform/venues">
          {t('home.notReady.all')}
          <ChevronRightIcon />
        </Link>
      </div>
      {venues.length === 0 ? (
        <p className="yc-empty-line">{t('home.recent.empty')}</p>
      ) : (
        <div className="yc-tscroll">
          <table className="yc-tbl" aria-labelledby={titleId}>
            <thead>
              <tr>
                <th scope="col">{t('venues.column.name')}</th>
                <th scope="col">{t('venues.column.category')}</th>
                <th scope="col" className="yc-num">
                  {t('home.recent.branches')}
                </th>
                <th scope="col">{t('venues.column.status')}</th>
                <th scope="col">{t('home.recent.added')}</th>
              </tr>
            </thead>
            <tbody>
              {venues.map((venue) => (
                <tr key={venue.id}>
                  <td>
                    <div className="yc-vcell">
                      <VenueThumb venue={{ name: venue.name }} />
                      <div>
                        <Link className="yc-vname" to={`/platform/venues/${venue.id}`}>
                          {venue.name}
                        </Link>
                        <div className="yc-slug">{venue.slug}</div>
                      </div>
                    </div>
                  </td>
                  <td>{typeLabel(venue.type)}</td>
                  <td className="yc-num">{venue.branchCount}</td>
                  <td>
                    <span className={PILL[venue.status]}>
                      <span className="yc-dot" aria-hidden="true" />
                      {t(`status.${venue.status}`)}
                    </span>
                  </td>
                  <td>{formatDate(venue.createdAtUtc, CONSOLE_TIME_ZONE, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ActivityFeed({ now, locale }: { readonly now: string; readonly locale: Locale }) {
  const { t } = useTranslation(['admin', 'common']);
  const feed = usePlatformActivity({ limit: FEED_LIMIT });
  const titleId = useId();
  const today = branchDayKey(now, CONSOLE_TIME_ZONE);
  const yesterday = branchDayKey(
    new Date(new Date(now).getTime() - 24 * 60 * 60 * 1000).toISOString(),
    CONSOLE_TIME_ZONE,
  );
  const when = (atUtc: string) => {
    const time = formatTime(atUtc, CONSOLE_TIME_ZONE, locale);
    const day = branchDayKey(atUtc, CONSOLE_TIME_ZONE);
    if (day === today) return t('home.activity.today', { time });
    if (day === yesterday) return t('home.activity.yesterday', { time });
    return t('home.activity.on', { date: formatDate(atUtc, CONSOLE_TIME_ZONE, locale), time });
  };

  let body: ReactNode;
  if (feed.isPending) {
    body = <p className="yc-empty-line">{t('loading')}</p>;
  } else if (feed.isError) {
    body = <p className="yc-empty-line">{t('home.activity.failed')}</p>;
  } else if (feed.data.length === 0) {
    body = <p className="yc-empty-line">{t('home.activity.empty')}</p>;
  } else {
    body = (
      <ul className="yc-feed">
        {feed.data.map((entry) => (
          <li key={entry.id}>
            <span className="yc-fi" aria-hidden="true">
              {feedIcon(entry.action)}
            </span>
            <span className="yc-ft">
              <p>
                <b>{entry.actor.name ?? t('home.activity.someone')}</b>
                {entry.actor.role !== 'platformAdmin' && entry.venue
                  ? ` · ${entry.venue.name}`
                  : ''}{' '}
                {sentence(entry, t)}
              </p>
              <span>{when(entry.atUtc)}</span>
            </span>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <section className="yc-card" aria-labelledby={titleId}>
      <div className="yc-card-h">
        <div>
          <h2 className="yc-h2" id={titleId}>
            {t('home.activity.title')}
          </h2>
          <p className="yc-cap">{t('home.activity.cap')}</p>
        </div>
      </div>
      {body}
    </section>
  );
}

function feedIcon(action: string): ReactNode {
  if (
    action === 'branch.tier-change' ||
    action === 'branch.features-change' ||
    action === 'venue.features-apply'
  ) {
    return <ArrowsUpDownIcon className="yc-fi-i" />;
  }
  if (action === 'venue.suspend') return <PauseIcon className="yc-fi-i" />;
  if (action === 'venue.delete') return <TrashIcon className="yc-fi-i" />;
  if (action === 'venue.restore' || action === 'venue.reactivate') {
    return <RestoreIcon className="yc-fi-i" />;
  }
  if (action === 'venue.create' || action === 'branch.create') {
    return <PlusIcon className="yc-fi-i" />;
  }
  if (action === 'branch.relocate') return <GlobeIcon className="yc-fi-i" />;
  if (action === 'venue.update' || action === 'branch.update') {
    return <SettingsIcon className="yc-fi-i" />;
  }
  if (action === 'staff.create') return <UserIcon className="yc-fi-i" />;
  if (action === 'staff.sign-in-issued') return <SendIcon className="yc-fi-i" />;
  if (action.startsWith('review.')) return <EyeOffIcon className="yc-fi-i" />;
  if (action.startsWith('admin.') || action.startsWith('account.')) {
    return <PadlockIcon className="yc-fi-i" />;
  }
  return <DotIcon className="yc-fi-i" />;
}

/** Feature names in the server's order, as a feed sentence lists them. */
function featureList(features: readonly BranchFeature[], t: Translate): string {
  return BRANCH_FEATURES.filter((feature) => features.includes(feature))
    .map((feature) => t(`features.name.${feature}`))
    .join(', ');
}

/** `branch.features-change`: what was switched on, off, or both. */
function featuresChangeSentence(
  entry: PlatformActivityEntry,
  names: { readonly target: string; readonly venue: string },
  t: Translate,
): string {
  const added = entry.featuresChange?.added ?? [];
  const removed = entry.featuresChange?.removed ?? [];
  if (added.length > 0 && removed.length > 0) {
    return t('home.activity.action.featuresBoth', {
      ...names,
      added: featureList(added, t),
      removed: featureList(removed, t),
    });
  }
  if (added.length > 0) {
    return t('home.activity.action.featuresOn', { ...names, features: featureList(added, t) });
  }
  if (removed.length > 0) {
    return t('home.activity.action.featuresOff', { ...names, features: featureList(removed, t) });
  }
  return t('home.activity.action.featuresChange', names);
}

/** What the actor did, as a sentence after their name. Never a guest's name: the log has none. */
function sentence(entry: PlatformActivityEntry, t: Translate): string {
  const venue = entry.venue?.name ?? entry.target.name ?? '—';
  const target = entry.target.name ?? '—';
  switch (entry.action) {
    case 'venue.create':
      return t('home.activity.action.venueCreate', { venue });
    case 'venue.update':
      return t('home.activity.action.venueUpdate', { venue });
    case 'venue.suspend':
      return t('home.activity.action.venueSuspend', { venue });
    case 'venue.reactivate':
      return t('home.activity.action.venueReactivate', { venue });
    case 'venue.delete':
      return t('home.activity.action.venueDelete', { venue });
    case 'venue.restore':
      return t('home.activity.action.venueRestore', { venue });
    case 'branch.create':
      return t('home.activity.action.branchCreate', { target, venue });
    case 'branch.update':
      return t('home.activity.action.branchUpdate', { target, venue });
    // A row from before 2026-10-27, when a branch had a plan rather than features.
    case 'branch.tier-change':
      return entry.tierTo === 'free'
        ? t('home.activity.action.tierFree', { target, venue })
        : t('home.activity.action.tierPaid', { target, venue });
    case 'branch.features-change':
      return featuresChangeSentence(entry, { target, venue }, t);
    case 'venue.features-apply':
      return entry.featuresApply
        ? t('home.activity.action.featuresApply', {
            venue,
            features: featureList(entry.featuresApply.features, t),
            count: entry.featuresApply.changedCount,
          })
        : t('home.activity.action.featuresApplySome', { venue });
    case 'branch.relocate':
      return t('home.activity.action.branchRelocate', { target, venue });
    case 'staff.create': {
      const role = roleWord(entry, t);
      // No role on record: say who joined, and guess nothing.
      return role === null
        ? t('home.activity.action.staffCreateNoRole', { target })
        : t('home.activity.action.staffCreate', { target, role });
    }
    case 'staff.sign-in-issued':
      return t('home.activity.action.signIn', { target });
    case 'review.hide':
      return t('home.activity.action.reviewHide', { target });
    case 'review.unhide':
      return t('home.activity.action.reviewUnhide', { target });
    case 'review.dismiss-reports':
      return t('home.activity.action.reviewDismiss', { target });
    case 'review.restore-reports':
      return t('home.activity.action.reviewRestore', { target });
    case 'review.remove-reply':
      // Shown only when the platform took a venue's reply down (VC4 wire).
      return t('home.activity.action.reviewRemoveReply', { target });
    case 'table.regenerate-qr':
      return t('home.activity.action.tableQr', { target });
    // The platform admin's own account, and a venue person's (My account):
    // the same sentences after whoever's name it was.
    case 'admin.rename':
    case 'account.rename':
      return t('home.activity.action.rename');
    case 'admin.password-change':
    case 'account.password-change':
      return t('home.activity.action.password');
    case 'account.sign-out-others':
      return t('home.activity.action.signOutOthers');
    default:
      // An action this build has no words for: a neutral sentence, never the code.
      return t('home.activity.action.other');
  }
}

function roleWord(entry: PlatformActivityEntry, t: Translate): string | null {
  switch (entry.staffRole) {
    case 'owner':
      return t('home.activity.role.owner');
    case 'generalManager':
      return t('home.activity.role.generalManager');
    case 'manager':
      return t('home.activity.role.manager');
    case 'waiter':
      return t('home.activity.role.waiter');
    case 'kitchen':
      return t('home.activity.role.kitchen');
    default:
      return null;
  }
}
