import {
  approvalCountdown,
  isOnShiftAt,
  type AwaitingApproval,
  type StaffConversationListItem,
  type StaffRosterEntry,
  type UserRole,
} from '@yalla/api';
import { useNow } from '@yalla/api/react';
import { intlTag } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { QueryFailureNotice } from '../../components/QueryFailureNotice';
import { useBranchFormat } from '../useBranchFormat';
import { PhoneIcon } from './PhoneShell';
import { useStaffOverview } from './usePhoneData';

export interface PhoneTodayProps {
  readonly branchId: string;
  readonly role: UserRole;
  /** "Lumen · Lumen North": the branch the numbers are for. */
  readonly place: string;
  readonly timeZoneId: string;
  /** The screen is in front: the overview is polled only then. */
  readonly active: boolean;
  /** The floor's own awaiting list: the "Needs you" row and its clock. */
  readonly awaiting: readonly AwaitingApproval[];
  /** The inbox's rows: the unanswered ones are the other "Needs you" row. */
  readonly conversations: readonly StaffConversationListItem[];
  readonly roster: readonly StaffRosterEntry[] | undefined;
  readonly onOpenApprovals: () => void;
  readonly onOpenMessages: () => void;
}

/** The console's Reports, for everything this summary leaves out. */
export const FULL_REPORT_PATH = '/venue/reports';

/**
 * A manager's Today (the Today artboard): the day at the branch in four
 * numbers, what needs a manager now, and who is on shift — readable from
 * home as well as from the floor.
 *
 * The numbers are the venue console's Overview (`GET .../overview`), read
 * with the phone's PIN session; "Needs you" is the floor's own awaiting list
 * and inbox, so it agrees with Now to the second; the shift list is the PIN
 * gate's roster.
 *
 * TODO(staff-phone Today): two things on the artboard have no data yet, and
 * the backend's Today endpoint (being added beside device pairing and web
 * push) is where they come from — nothing is invented here meanwhile:
 * - the revenue split, "hall 368 000 · takeaway 44 000", and the guests'
 *   "78 with a booking · 18 without": the Overview gives the day's total
 *   revenue and the booked guests only, so the tiles say that;
 * - the branch switcher for a general manager or an owner: a PIN session is
 *   bound to its branch, so the screen names that branch and offers no other.
 */
export function PhoneToday(props: PhoneTodayProps) {
  const { t } = useTranslation(['staff', 'common']);
  const { locale } = useLocale();
  const format = useBranchFormat(props.timeZoneId);
  const now = useNow(30_000);
  const overview = useStaffOverview(props.branchId, props.role, props.active);
  const data = overview.data ?? null;

  const day = new Intl.DateTimeFormat(intlTag(locale), {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    timeZone: props.timeZoneId,
  }).format(now);

  // "Needs you": the soonest clock among the bookings, the longest wait among
  // the guests' messages.
  const soonest = props.awaiting
    .map((request) => approvalCountdown(request.approvalExpiresAtUtc, now, locale))
    .filter((countdown) => countdown !== null && !countdown.expired)
    .sort((a, b) => a!.secondsLeft - b!.secondsLeft)[0];
  const unanswered = props.conversations.filter(
    (item) => item.oldestUnansweredGuestMessageUtc !== null,
  );
  const longestWait = unanswered.reduce(
    (most, item) => Math.max(most, format.minutesSince(item.oldestUnansweredGuestMessageUtc!)),
    0,
  );

  const shifts = [...(props.roster ?? [])]
    .filter((entry) => entry.shift !== null || isOnShiftAt(entry, now))
    .sort((a, b) => {
      const onA = isOnShiftAt(a, now);
      const onB = isOnShiftAt(b, now);
      if (onA !== onB) return onA ? -1 : 1;
      return (a.shift?.startsAtUtc ?? '').localeCompare(b.shift?.startsAtUtc ?? '');
    });

  return (
    <div className="ph-screen ph-today">
      <div className="ph-screen-head">
        <h1 className="ph-title">{t('phone.today.title')}</h1>
        <span className="ph-screen-meta">
          {day} · {format.time(now)}
        </span>
      </div>
      <p className="ph-today-branch">{props.place}</p>

      {data ? (
        <dl className="ph-tiles">
          <div className="ph-tile">
            <dt>{t('phone.today.revenue')}</dt>
            <dd className="ph-tile-value">{format.dram(data.revenue.todayAmd)}</dd>
            <dd className="ph-tile-sub">
              {data.revenue.changePercent === null
                ? t('phone.today.revenueNoCompare')
                : t('phone.today.revenueChange', {
                    percent: `${data.revenue.changePercent > 0 ? '+' : ''}${data.revenue.changePercent}`,
                  })}
            </dd>
          </div>
          <div className="ph-tile">
            <dt>{t('phone.today.guests')}</dt>
            <dd className="ph-tile-value">{data.bookings.people}</dd>
            <dd className="ph-tile-sub">{t('phone.today.guestsBooked')}</dd>
          </div>
          <div className="ph-tile">
            <dt>{t('phone.today.bookings')}</dt>
            <dd className="ph-tile-value">{data.bookings.total}</dd>
            <dd className="ph-tile-sub">
              {t('phone.today.bookingsSub', {
                came: data.bookings.seated + data.bookings.completed,
                expected: data.bookings.confirmed,
                noShow: data.bookings.noShow,
              })}
            </dd>
          </div>
          <div className="ph-tile">
            <dt>{t('phone.today.inRoom')}</dt>
            <dd className="ph-tile-value">
              {t('phone.today.inRoomValue', {
                occupied: data.inRoom.occupiedTables,
                tables: data.inRoom.tables,
              })}
            </dd>
            <dd className="ph-tile-sub">{t('phone.today.inRoomSub')}</dd>
          </div>
        </dl>
      ) : overview.isError ? (
        <div className="ph-today-failed">
          <p className="ft-rail-empty is-failed">{t('phone.today.unreachable')}</p>
          <QueryFailureNotice error={overview.error} onRetry={() => void overview.refetch()} />
        </div>
      ) : (
        <p className="ft-rail-empty">{t('floor.loading')}</p>
      )}

      <h2 className="ph-section-title">{t('phone.today.needsYou')}</h2>
      {props.awaiting.length === 0 && unanswered.length === 0 ? (
        <p className="ft-rail-empty">{t('phone.today.nothingWaiting')}</p>
      ) : (
        <ul className="ph-links">
          {props.awaiting.length > 0 ? (
            <li>
              <button type="button" className="ph-link is-strong" onClick={props.onOpenApprovals}>
                <b className="ph-count" aria-hidden="true">
                  {props.awaiting.length}
                </b>
                <span className="ph-link-text">
                  <b>{t('phone.today.approvals', { count: props.awaiting.length })}</b>
                  {soonest ? (
                    <span className="ph-link-clock">
                      {t('approvals.leftLabel', { time: soonest.label })}
                    </span>
                  ) : null}
                </span>
                <PhoneIcon name="chevron" />
              </button>
            </li>
          ) : null}
          {unanswered.length > 0 ? (
            <li>
              <button type="button" className="ph-link" onClick={props.onOpenMessages}>
                <b className="ph-count" aria-hidden="true">
                  {unanswered.length}
                </b>
                <span className="ph-link-text">
                  <b>{t('phone.today.messages', { count: unanswered.length })}</b>
                </span>
                <span className="ph-link-sub">{t('rail.minutes', { count: longestWait })}</span>
                <PhoneIcon name="chevron" />
              </button>
            </li>
          ) : null}
        </ul>
      )}

      <h2 className="ph-section-title">{t('phone.today.shift')}</h2>
      {shifts.length === 0 ? (
        <p className="ft-rail-empty">
          {props.roster === undefined ? t('floor.loading') : t('phone.today.shiftNone')}
        </p>
      ) : (
        <ul className="ph-rows is-static">
          {shifts.map((entry) => {
            const on = isOnShiftAt(entry, now);
            return (
              <li key={entry.staffMemberId} className="ph-row">
                <span>
                  {entry.fullName} · {t(`pin.role.${entry.role}`)}
                </span>
                <span className="ph-row-state" data-tone={on ? 'ok' : 'quiet'}>
                  {on
                    ? t('phone.today.onShift')
                    : t('phone.today.from', { time: entry.shift?.startsAt ?? '' })}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <a className="ph-wide-btn" href={FULL_REPORT_PATH}>
        {t('phone.today.fullReport')}
        <PhoneIcon name="chevron" />
      </a>
    </div>
  );
}
