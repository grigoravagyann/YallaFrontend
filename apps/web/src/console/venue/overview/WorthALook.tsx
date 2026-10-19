import type { StaffDevice } from '@yalla/api';
import { useBranchReadiness, useDevices, useNow, useOccupancyReport } from '@yalla/api/react';
import { formatDayAndTime, type TimeZone } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { useId, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ChevronRightIcon,
  FlagIcon,
  MenuIcon,
  PublicPageIcon,
  ReportsIcon,
  TabletIcon,
} from '../../ui/icons';
import { addDays, branchToday } from '../reports/range';
import { useVenueNavCounts } from '../useVenueNavCounts';

/**
 * A tablet's "last seen" moves only when somebody signs in on it with a PIN or
 * its session renews — about every 15 minutes while in use, and a tablet left
 * idle locks after 30. So only a silence well past both says something: 45
 * minutes, and only while the branch is open.
 */
const QUIET_DEVICE_MINUTES = 45;

/** The devices list is read again this often, so "since 18:40" keeps up with the clock. */
const DEVICES_POLL_MS = 60_000;

/** The sittings are compared over the last full week. */
const TURN_DAYS = 7;
/** Fewer closed sittings than this in the week is too thin to say anything about. */
const TURN_MIN_SITTINGS = 20;
/** The middle sitting must run at least this far past the policy to be worth a look. */
const TURN_MIN_OVERRUN_MINUTES = 10;
/** And at least this share of sittings must have run past it. */
const TURN_MIN_OVER_SHARE = 0.25;

interface Item {
  readonly key: string;
  readonly to: string;
  readonly tone: 'amber' | 'red' | 'brand';
  readonly icon: ReactNode;
  readonly title: string;
  readonly body: string;
}

/**
 * "Worth a look" (Main artboard): the few things elsewhere in the console that
 * want somebody's attention, each a link to the screen that deals with it.
 *
 * Every line is an existing read (VC2 wire: none of them is in the overview):
 * unfinished dishes from the readiness answer and reported reviews from the
 * reviews list — the sidebar's own badge counts, so the two never disagree —
 * a tablet gone quiet from the devices list, sittings running past the
 * policy's turn time from last week's occupancy report, and online bookings
 * switched off from the readiness answer (the choice the setup checklist does
 * not count). A read that fails or is refused leaves its line out: this card
 * is advice, and a failure here is said on the screen the line would open.
 */
export function WorthALook({
  branchId,
  timeZoneId,
  open,
}: {
  readonly branchId: string;
  readonly timeZoneId: string;
  /** Whether the branch is open now: a quiet tablet means nothing while it is shut. */
  readonly open: boolean;
}) {
  const { t } = useTranslation(['admin', 'common']);
  const { locale } = useLocale();
  const titleId = useId();
  const now = useNow(60_000);
  const counts = useVenueNavCounts(branchId);
  const readiness = useBranchReadiness(branchId);
  const devices = useDevices(branchId, { pollMs: DEVICES_POLL_MS });
  const today = branchToday(timeZoneId as TimeZone, now);
  const occupancy = useOccupancyReport({
    branchId,
    from: addDays(today, -TURN_DAYS),
    to: addDays(today, -1),
  });

  const items: Item[] = [];
  if (counts.incompleteDishes) {
    items.push({
      key: 'dishes',
      to: '/venue/menu',
      tone: 'amber',
      icon: <MenuIcon />,
      title: t('overview.attn.dishes', { count: counts.incompleteDishes }),
      body: t('overview.attn.dishesBody'),
    });
  }
  if (counts.reportedReviews) {
    items.push({
      key: 'reviews',
      to: '/venue/reviews',
      tone: 'red',
      icon: <FlagIcon />,
      title: t('overview.attn.reviews', { count: counts.reportedReviews }),
      body: t('overview.attn.reviewsBody'),
    });
  }
  for (const device of open ? quietDevices(devices.data ?? [], now) : []) {
    const seen = formatDayAndTime(device.lastSeenAtUtc!, timeZoneId as TimeZone, locale, now);
    items.push({
      key: `device-${device.id}`,
      to: '/venue/staff',
      tone: 'amber',
      icon: <TabletIcon />,
      title:
        seen.day === 'today'
          ? t('overview.attn.device', { name: device.name, time: seen.time })
          : t('overview.attn.deviceOn', { name: device.name, date: seen.date, time: seen.time }),
      body: t('overview.attn.deviceBody'),
    });
  }
  const turn = occupancy.data?.turnTime;
  const median = turn?.medianMinutes ?? null;
  // Only on enough sittings, and only for a real overrun that most nights see.
  if (
    turn &&
    median !== null &&
    turn.closedSessions >= TURN_MIN_SITTINGS &&
    median - turn.policyTurnTimeMinutes >= TURN_MIN_OVERRUN_MINUTES &&
    turn.overPolicyFraction >= TURN_MIN_OVER_SHARE
  ) {
    items.push({
      key: 'turn',
      to: '/venue/reports',
      tone: 'brand',
      icon: <ReportsIcon />,
      title: t('overview.attn.turn', { count: median - turn.policyTurnTimeMinutes }),
      body: t('overview.attn.turnBody', { median, policy: turn.policyTurnTimeMinutes }),
    });
  }
  if (readiness.data && !readiness.data.acceptsWebBookings) {
    items.push({
      key: 'bookingsOff',
      to: '/venue/public',
      tone: 'amber',
      icon: <PublicPageIcon />,
      title: t('overview.attn.bookingsOff'),
      body: t('overview.attn.bookingsOffBody'),
    });
  }

  return (
    <section className="yc-card" aria-labelledby={titleId}>
      <div className="yc-card-h">
        <h2 className="yc-h2" id={titleId}>
          {t('overview.attn.title')}
        </h2>
      </div>
      {items.length === 0 ? (
        <p className="yc-empty-line">{t('overview.attn.empty')}</p>
      ) : (
        <ul className="yc-attn">
          {items.map((item) => (
            <li key={item.key}>
              <Link to={item.to}>
                <span className={`yc-attn-ic is-${item.tone}`} aria-hidden="true">
                  {item.icon}
                </span>
                <span className="yc-attn-t">
                  <b>{item.title}</b>
                  <small>{item.body}</small>
                </span>
                <ChevronRightIcon className="yc-i yc-attn-go" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Enrolled, not revoked, seen once, and not since a while ago. */
function quietDevices(devices: readonly StaffDevice[], now: Date): StaffDevice[] {
  return devices.filter(
    (device) =>
      !device.isRevoked &&
      device.lastSeenAtUtc !== null &&
      now.getTime() - Date.parse(device.lastSeenAtUtc) > QUIET_DEVICE_MINUTES * 60_000,
  );
}
