import type { BranchOverview, OverviewHours } from '@yalla/api';
import { useBranchOverview, useVenueProfile } from '@yalla/api/react';
import { formatDram, formatTime, zonedParts, type TimeZone } from '@yalla/format';
import { useLocale, useTranslation, type Locale } from '@yalla/i18n';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { QueryFailureNotice } from '../../components/QueryFailureNotice';
import { PageHeader } from '../ui/PageHeader';
import { OnboardingChecklist } from './OnboardingChecklist';
import { ApprovalsCard } from './overview/ApprovalsCard';
import { LoadChart } from './overview/LoadChart';
import { serviceDayLine } from './overview/serviceDayLine';
import { TodayBookings } from './overview/TodayBookings';
import { WorthALook } from './overview/WorthALook';
import { useVenueOutlet } from './VenueLayout';
import { useFeatureLocked } from './featureLock';

type Translate = ReturnType<typeof useTranslation>['t'];

/**
 * Overview (venue-console Main artboard): where the venue section opens, and
 * the screen left open through an evening.
 *
 * - **The setup card** while the branch is not ready for diners, from the
 *   readiness read; gone once it is.
 * - **Four numbers for today**: bookings, people in the room now, open tabs
 *   with what they still owe, and revenue against the same weekday last week.
 * - **The bookings waiting for a decision**, with their live countdowns — the
 *   panel moved here from the policy screen (venue HANDOFF section 6).
 * - **Today's bookings**, with a ⋮ menu per row to seat a party, mark a
 *   no-show, call one off or finish a sitting; **the load by hour** against
 *   the seats the room has; and **what is worth a look**.
 *
 * Every number is `GET /api/branches/{id}/overview`'s, read every 30 seconds
 * and after every action. The cards that come from other reads (approvals,
 * the checklist, worth a look) load and fail on their own.
 */
export function VenueOverviewScreen() {
  const { t } = useTranslation(['admin', 'common']);
  const { locale } = useLocale();
  const { branchId, branchName, timeZoneId } = useVenueOutlet();
  const query = useBranchOverview(branchId ?? undefined);
  const name = useVenueProfile().data?.fullName ?? '';
  // Never the branch shown before a switch: its numbers are another room's.
  const overview = query.data?.branchId === branchId ? query.data : undefined;

  if (!branchId) {
    return (
      <div className="yc-overview">
        <PageHeader title={t('nav.overview')} />
        <p className="yc-card yc-empty-line">{t('overview.noBranch')}</p>
      </div>
    );
  }

  return (
    <div className="yc-overview">
      <PageHeader
        title={greeting(t, overview, name)}
        sub={
          overview
            ? t('overview.sub', {
                date: serviceDayLine(overview.serviceDate, t),
                branch: branchName ?? '',
                time: formatTime(overview.asOfUtc, overview.timeZoneId as TimeZone, locale),
              })
            : null
        }
        actions={overview ? <HoursPill hours={overview.hours} /> : null}
      />

      <OnboardingChecklist />

      {overview ? (
        <Kpis overview={overview} locale={locale} />
      ) : query.isError ? (
        <div className="yc-card yc-ov-pad">
          <QueryFailureNotice
            error={query.error}
            offline={query.fetchStatus === 'paused'}
            onRetry={() => void query.refetch()}
          />
        </div>
      ) : (
        <p className="yc-card yc-empty-line" role="status">
          {t('loading')}
        </p>
      )}

      <div className="yc-ov-g2">
        <div className="yc-ov-col">
          <ApprovalsCard branchId={branchId} timeZoneId={timeZoneId} />
          {overview ? <TodayBookings overview={overview} branchId={branchId} /> : null}
        </div>
        <div className="yc-ov-col">
          {overview ? <LoadChart overview={overview} /> : null}
          <WorthALook
            branchId={branchId}
            timeZoneId={timeZoneId}
            open={overview?.hours.isOpen ?? false}
          />
        </div>
      </div>
    </div>
  );
}

/** "Good evening, Aram" by the branch's own clock; the section's name until it is known. */
function greeting(t: Translate, overview: BranchOverview | undefined, fullName: string): string {
  if (!overview) return t('nav.overview');
  const hour = Number(overview.localTime.slice(0, 2));
  const part =
    hour >= 5 && hour < 12 ? 'morning' : hour >= 12 && hour < 18 ? 'afternoon' : 'evening';
  const first = fullName.trim().split(/\s+/u)[0] ?? '';
  return first
    ? t(`overview.greeting.${part}`, { name: first })
    : t(`overview.greeting.${part}Plain`);
}

/**
 * "Open until 00:00", green; "Closed · opens at 12:00", grey. The server's
 * verdict, not the browser's — special days included, with the day's note
 * after it ("Closed today · New Year").
 */
function HoursPill({ hours }: { readonly hours: OverviewHours }) {
  const { t } = useTranslation(['admin', 'common']);
  const clock = (time: string) => time.slice(0, 5);
  const note = hours.specialDay?.note ? ` · ${hours.specialDay.note}` : '';
  if (hours.isOpen) {
    // Midnight is "until 00:00" on its own; a later close says it is tomorrow.
    const closes = hours.closesAt ? clock(hours.closesAt) : null;
    const nextDay = hours.closesNextDay && closes !== '00:00';
    return (
      <span className="yc-pill yc-pill-green">
        <span className="yc-dot" aria-hidden="true" />
        {closes
          ? t(nextDay ? 'overview.hours.openNextDay' : 'overview.hours.open', { time: closes })
          : t('overview.hours.openNow')}
        {note}
      </span>
    );
  }
  return (
    <span className="yc-pill yc-pill-grey">
      <span className="yc-dot" aria-hidden="true" />
      {hours.opensAt
        ? t('overview.hours.closedOpensAt', { time: clock(hours.opensAt) })
        : t('overview.hours.closedToday')}
      {note}
    </span>
  );
}

function Kpis({
  overview,
  locale,
}: {
  readonly overview: BranchOverview;
  readonly locale: Locale;
}) {
  const { t } = useTranslation(['admin', 'common']);
  const number = (value: number) => new Intl.NumberFormat(locale).format(value);
  const { bookings, inRoom, openTabs, revenue } = overview;
  // Table service blocked by the platform: tabs already open still finish,
  // and are counted; with none left, the card says why there are none.
  const tabsLocked = useFeatureLocked('tableService') && openTabs.count === 0;
  return (
    <div className="yc-kpis">
      <Kpi label={t('overview.kpi.bookings')} value={number(bookings.total)}>
        {/* A change waiting for an answer is a confirmed booking still: said apart. */}
        {t(
          bookings.pendingChanges > 0
            ? 'overview.kpi.bookingsFootChanges'
            : 'overview.kpi.bookingsFoot',
          {
            confirmed: number(bookings.confirmed),
            pending: number(bookings.pendingApproval),
            changes: number(bookings.pendingChanges),
          },
        )}
        {/* Not the venue's doing, nor the guest's own cancel: said apart, when any. */}
        {bookings.cancelledBySystem > 0 ? (
          <span className="yc-kpi-system">
            {t('overview.kpi.cancelledBySystem', { count: bookings.cancelledBySystem })}
          </span>
        ) : null}
      </Kpi>
      <Link className="yc-card yc-kpi yc-kpi-a" to="/venue/floorplan">
        <span className="yc-kpi-l">{t('overview.kpi.inRoom')}</span>
        <span className="yc-kpi-n">{t('overview.kpi.people', { count: inRoom.people })}</span>
        <span className="yc-kpi-f">
          {t('overview.kpi.inRoomFoot', {
            occupied: number(inRoom.occupiedTables),
            tables: number(inRoom.tables),
          })}
        </span>
      </Link>
      <Kpi label={t('overview.kpi.tabs')} value={number(openTabs.count)}>
        {tabsLocked
          ? t('featureLocked.title')
          : openTabs.unpaidAmd > 0
            ? t('overview.kpi.unpaid', { amount: formatDram(openTabs.unpaidAmd, locale) })
            : t('overview.kpi.nothingUnpaid')}
      </Kpi>
      <Kpi label={revenueLabel(t, overview, locale)} value={formatDram(revenue.todayAmd, locale)}>
        <RevenueChange change={revenue.changePercent} locale={locale} />
      </Kpi>
    </div>
  );
}

/**
 * "Revenue today", or "Revenue since 12:00" when the service day's takings are
 * counted from its first opening rather than midnight — as the server counts
 * them, and the week before from the same opening.
 */
function revenueLabel(t: Translate, overview: BranchOverview, locale: Locale): string {
  const zone = overview.timeZoneId as TimeZone;
  const opening = zonedParts(new Date(overview.revenue.sinceUtc), zone);
  return opening.hour === 0 && opening.minute === 0
    ? t('overview.kpi.revenue')
    : t('overview.kpi.revenueSince', {
        time: formatTime(overview.revenue.sinceUtc, zone, locale),
      });
}

function Kpi({
  label,
  value,
  children,
}: {
  readonly label: string;
  readonly value: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="yc-card yc-kpi">
      <span className="yc-kpi-l">{label}</span>
      <span className="yc-kpi-n">{value}</span>
      <span className="yc-kpi-f">{children}</span>
    </div>
  );
}

/** "↑ 8 % on the same day last week", in green or plain; nothing invented when last week had none. */
function RevenueChange({
  change,
  locale,
}: {
  readonly change: number | null;
  readonly locale: Locale;
}) {
  const { t } = useTranslation(['admin', 'common']);
  if (change === null) return <>{t('overview.kpi.noLastWeek')}</>;
  if (change === 0) return <>{t('overview.kpi.sameAsLastWeek')}</>;
  const percent = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(
    Math.abs(change),
  );
  return (
    <>
      <span className={change > 0 ? 'yc-up' : 'yc-down'}>
        {change > 0 ? '↑' : '↓'} {percent} %
      </span>{' '}
      {t('overview.kpi.vsLastWeek')}
    </>
  );
}
