import { approvalCountdown } from '@yalla/api';
import { useNow, useStaffToday } from '@yalla/api/react';
import { intlTag } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { useId, useState } from 'react';
import { QueryFailureNotice } from '../../components/QueryFailureNotice';
import { useBranchFormat } from '../useBranchFormat';
import { PhoneIcon } from './PhoneShell';

export interface PhoneTodayProps {
  /** The session's branch: the one the floor's own screens act on. */
  readonly branchId: string;
  readonly timeZoneId: string;
  /** The screen is in front: the board is polled only then. */
  readonly active: boolean;
  /** "Needs you" → the first booking to approve, on this phone's own floor. */
  readonly onOpenApprovals: () => void;
  readonly onOpenMessages: () => void;
}

/** The console's Reports, for everything this summary leaves out. */
export const FULL_REPORT_PATH = '/venue/reports';

/**
 * A manager's Today (the Today artboard), from `GET /api/staff/today`: the
 * day so far in four tiles — takings split hall and takeaway, guests with
 * and without a booking, the bookings, the room now — what needs a manager,
 * and who is on shift and signed in.
 *
 * **The branch switcher** is the board's `branches`: an owner or a general
 * manager on their own phone reads any branch of the venue; a branch
 * manager's list is their branch alone, and then there is no switcher.
 * "Needs you" opens the floor's own screens only for the phone's own branch
 * — a PIN session acts on that branch and no other — and says so elsewhere.
 */
export function PhoneToday(props: PhoneTodayProps) {
  const { t } = useTranslation(['staff', 'common']);
  const { locale } = useLocale();
  const switcherId = useId();
  const now = useNow(30_000);
  const [picked, setPicked] = useState<string | null>(null);
  // Named, not left to the session: the same answer from the server, and the
  // switcher's own branch is always the one asked for.
  const today = useStaffToday(picked ?? props.branchId, props.active);
  const data = today.data ?? null;
  const format = useBranchFormat(data?.timeZoneId ?? props.timeZoneId);
  const own = !data || data.branchId === props.branchId;

  const day = new Intl.DateTimeFormat(intlTag(locale), {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    timeZone: data?.timeZoneId ?? props.timeZoneId,
  }).format(now);

  const needs = data?.needsYou ?? null;
  const deadline = needs?.soonestApprovalDeadlineUtc
    ? approvalCountdown(needs.soonestApprovalDeadlineUtc, now, locale)
    : null;
  const waitedMinutes = needs?.oldestUnansweredMessageAtUtc
    ? format.minutesSince(needs.oldestUnansweredMessageAtUtc)
    : 0;

  const shifts = [...(data?.shifts ?? [])].sort((a, b) => {
    if (a.onShiftNow !== b.onShiftNow) return a.onShiftNow ? -1 : 1;
    return a.startsAtUtc.localeCompare(b.startsAtUtc);
  });

  return (
    <div className="ph-screen ph-today">
      {data && data.branches.length > 1 ? (
        <div className="ph-today-switch">
          <label htmlFor={switcherId}>{t('phone.today.branch')}</label>
          <select
            id={switcherId}
            value={data.branchId}
            onChange={(event) => setPicked(event.target.value)}
          >
            {data.branches.map((branch) => (
              <option key={branch.branchId} value={branch.branchId}>
                {data.venueName} · {branch.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="ph-screen-head">
        <h1 className="ph-title">{t('phone.today.title')}</h1>
        <span className="ph-screen-meta">
          {day} · {format.time(now)}
        </span>
      </div>
      {data && data.branches.length <= 1 ? (
        <p className="ph-today-branch">
          {data.venueName} · {data.branchName}
        </p>
      ) : null}

      {data ? (
        <dl className="ph-tiles" aria-busy={today.isPlaceholderData || undefined}>
          <div className="ph-tile">
            <dt>{t('phone.today.revenue')}</dt>
            <dd className="ph-tile-value">{format.dram(data.revenue.totalAmd)}</dd>
            <dd className="ph-tile-sub">
              {t('phone.today.revenueSplit', {
                hall: format.dram(data.revenue.hallAmd),
                takeaway: format.dram(data.revenue.takeawayAmd),
              })}
            </dd>
          </div>
          <div className="ph-tile">
            <dt>{t('phone.today.guests')}</dt>
            <dd className="ph-tile-value">{data.guests.total}</dd>
            <dd className="ph-tile-sub">
              {t('phone.today.guestsSplit', {
                booked: data.guests.withBooking,
                walkIn: data.guests.walkIn,
              })}
            </dd>
          </div>
          <div className="ph-tile">
            <dt>{t('phone.today.bookings')}</dt>
            <dd className="ph-tile-value">{data.bookings.total}</dd>
            <dd className="ph-tile-sub">
              {t('phone.today.bookingsSub', {
                came: data.bookings.came,
                expected: data.bookings.expected,
                noShow: data.bookings.noShow,
              })}
            </dd>
          </div>
          <div className="ph-tile">
            <dt>{t('phone.today.inRoom')}</dt>
            <dd className="ph-tile-value">
              {t('phone.today.inRoomValue', {
                occupied: data.room.occupiedTables,
                tables: data.room.tables,
              })}
            </dd>
            <dd className="ph-tile-sub">{t('phone.today.inRoomSub')}</dd>
          </div>
        </dl>
      ) : today.isError ? (
        <div className="ph-today-failed">
          <p className="ft-rail-empty is-failed">{t('phone.today.unreachable')}</p>
          <QueryFailureNotice error={today.error} onRetry={() => void today.refetch()} />
        </div>
      ) : (
        <p className="ft-rail-empty" role="status">
          {t('floor.loading')}
        </p>
      )}

      {needs ? (
        <>
          <h2 className="ph-section-title">{t('phone.today.needsYou')}</h2>
          {needs.pendingApprovals === 0 && needs.unansweredMessages === 0 ? (
            <p className="ft-rail-empty">{t('phone.today.nothingWaiting')}</p>
          ) : (
            <ul className="ph-links">
              {needs.pendingApprovals > 0 ? (
                <li>
                  <NeedsRow
                    strong
                    count={needs.pendingApprovals}
                    label={t('phone.today.approvals', { count: needs.pendingApprovals })}
                    clock={
                      deadline && !deadline.expired
                        ? t('approvals.leftLabel', { time: deadline.label })
                        : null
                    }
                    onOpen={own ? props.onOpenApprovals : null}
                  />
                </li>
              ) : null}
              {needs.unansweredMessages > 0 ? (
                <li>
                  <NeedsRow
                    count={needs.unansweredMessages}
                    label={t('phone.today.messages', { count: needs.unansweredMessages })}
                    clock={t('rail.minutes', { count: waitedMinutes })}
                    onOpen={own ? props.onOpenMessages : null}
                  />
                </li>
              ) : null}
            </ul>
          )}
          {!own ? <p className="ph-today-note">{t('phone.today.otherBranch')}</p> : null}
        </>
      ) : null}

      {data ? (
        <>
          <h2 className="ph-section-title">{t('phone.today.shift')}</h2>
          {shifts.length === 0 ? (
            <p className="ft-rail-empty">{t('phone.today.shiftNone')}</p>
          ) : (
            <ul className="ph-rows is-static">
              {shifts.map((shift) => (
                <li key={`${shift.staffMemberId}-${shift.startsAtUtc}`} className="ph-row">
                  <span>
                    {shift.fullName} · {t(`pin.role.${shift.role}`)}
                  </span>
                  <span
                    className="ph-row-state"
                    data-tone={shift.signedIn || shift.onShiftNow ? 'ok' : 'quiet'}
                  >
                    {shift.signedIn
                      ? t('phone.today.signedIn')
                      : shift.onShiftNow
                        ? t('phone.today.onShift')
                        : t('phone.today.from', { time: shift.startsAt })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}

      <a className="ph-wide-btn" href={FULL_REPORT_PATH}>
        {t('phone.today.fullReport')}
        <PhoneIcon name="chevron" />
      </a>
    </div>
  );
}

function NeedsRow(props: {
  readonly strong?: boolean;
  readonly count: number;
  readonly label: string;
  readonly clock: string | null;
  /** Null for another branch: its floor is not this phone's to act on. */
  readonly onOpen: (() => void) | null;
}) {
  const inner = (
    <>
      <b className="ph-count" aria-hidden="true">
        {props.count}
      </b>
      <span className="ph-link-text">
        <b>{props.label}</b>
      </span>
      {props.clock ? <span className="ph-link-sub">{props.clock}</span> : null}
      {props.onOpen ? <PhoneIcon name="chevron" /> : null}
    </>
  );
  const className = props.strong ? 'ph-link is-strong' : 'ph-link';
  return props.onOpen ? (
    <button type="button" className={className} onClick={props.onOpen}>
      {inner}
    </button>
  ) : (
    <div className={`${className} is-static`}>{inner}</div>
  );
}
