import {
  STATUS_AFTER,
  minutesLate,
  newCommandId,
  overviewRowState,
  type BranchOverview,
  type ConsoleBookingActionKind,
  type ConsoleBookingActionResult,
  type OverviewBooking,
  type OverviewRowState,
  type ReservationStatusCode,
} from '@yalla/api';
import { useBookingAction, useNow } from '@yalla/api/react';
import { formatDram, formatTime, type TimeZone } from '@yalla/format';
import { useLocale, useTranslation } from '@yalla/i18n';
import { useEffect, useId, useRef, useState } from 'react';
import { RowMenu, type RowMenuItem } from '../../ui/RowMenu';
import { useToast } from '../../ui/toast';
import { decisionFailureText } from './decisionFailure';

type Filter = 'next' | 'seated' | 'all';
const FILTERS: readonly Filter[] = ['next', 'seated', 'all'];

/** Each row state's pill (Main artboard's `stMap`). */
const PILL: Readonly<Record<Exclude<OverviewRowState, 'declined'>, string>> = {
  pending: 'yc-pill yc-pill-amber',
  confirmed: 'yc-pill yc-pill-blue',
  late: 'yc-pill yc-pill-red',
  seated: 'yc-pill yc-pill-green',
  completed: 'yc-pill yc-pill-grey',
  noShow: 'yc-pill yc-pill-grey',
  cancelled: 'yc-pill yc-pill-grey',
};

/** What the ⋮ menu offers for each state, in the artboard's order. Nothing for the rest. */
const ACTIONS: Readonly<Partial<Record<OverviewRowState, readonly ConsoleBookingActionKind[]>>> = {
  late: ['seat', 'noShow'],
  confirmed: ['seat', 'cancel'],
  seated: ['finish'],
};

const DANGER: ReadonlySet<ConsoleBookingActionKind> = new Set(['noShow', 'cancel']);

interface Row {
  readonly booking: OverviewBooking;
  readonly state: Exclude<OverviewRowState, 'declined'>;
}

/**
 * Today's bookings, with the Main artboard's three filters — still to come,
 * in the room now, all of them — and a ⋮ menu per row.
 *
 * - **Still to come** is everything not seated and not over: waiting,
 *   confirmed, late. **In the room now** is the seated parties and the late
 *   ones, the two a person on the floor is looking at.
 * - **The menu acts at once**, as designed: seat a late or confirmed party,
 *   mark a late one a no-show (it counts against the diner, and frees the
 *   table held for them), call a confirmed one off (it does not count, and the
 *   diner is told), finish a sitting. The toast says what happened; a refusal
 *   — somebody on the floor acted first — is said in the server's words, and
 *   the list is read again.
 * - **No "are they coming?"**: the app asks the guest by itself at
 *   `lateNudgeAtUtc`, and the backend has no manual nudge (VC2 wire), so a late
 *   row says when it asked instead of offering a button that would do nothing.
 * - Declined requests are left out, as in the artboard.
 */
export function TodayBookings({
  overview,
  branchId,
}: {
  readonly overview: BranchOverview;
  readonly branchId: string;
}) {
  const { t } = useTranslation(['admin', 'common']);
  const { locale } = useLocale();
  const toast = useToast();
  const titleId = useId();
  const now = useNow(30_000);
  const action = useBookingAction(branchId);
  const [filter, setFilter] = useState<Filter>('next');
  const [menu, setMenu] = useState<string | null>(null);
  /** A row an action just moved: its focus is settled once the list shows the move. */
  const moved = useRef<{ id: string; status: ReservationStatusCode } | null>(null);

  // After every render: the one that shows the move hands the focus back.
  useEffect(() => {
    const done = moved.current;
    if (!done) return;
    const row = overview.todayBookings.find((booking) => booking.id === done.id);
    if (row && row.status !== done.status) return;
    moved.current = null;
    focusRow(done.id, titleId);
  });
  const zone = overview.timeZoneId as TimeZone;

  const rows: Row[] = overview.todayBookings.flatMap((booking) => {
    const state = overviewRowState(booking, now);
    return state === 'declined' ? [] : [{ booking, state }];
  });
  const shown = rows.filter(({ state }) =>
    filter === 'seated'
      ? state === 'seated' || state === 'late'
      : filter === 'next'
        ? state === 'pending' || state === 'confirmed' || state === 'late'
        : true,
  );

  function said(result: ConsoleBookingActionResult, booking: OverviewBooking): string {
    const name = booking.guestName;
    const table = t('approvals.table', { label: result.tableLabel });
    switch (result.kind) {
      case 'seat':
        return t('overview.bookings.done.seated', { name });
      case 'noShow':
        return result.tableFreed
          ? t('overview.bookings.done.noShow', { name, table })
          : t('overview.bookings.done.noShowKept', { name });
      case 'cancel':
        return t('overview.bookings.done.cancelled', { name });
      case 'finish':
        return result.outstandingDram
          ? t('overview.bookings.done.finishedOwed', {
              table,
              amount: formatDram(result.outstandingDram, locale),
            })
          : t('overview.bookings.done.finished', { table });
    }
  }

  function run(kind: ConsoleBookingActionKind, booking: OverviewBooking) {
    // Back to the row's own button at once, so the focus is not left on the
    // menu that just closed; again once the row has moved (below).
    window.setTimeout(() => focusRow(booking.id, titleId), 0);
    if (action.isPending) return;
    action.mutate(
      {
        kind,
        branchId,
        reservationId: booking.id,
        tableId: booking.tableId,
        clientCommandId: newCommandId(),
      },
      {
        onSuccess: (result) => {
          toast.say(said(result, booking));
          moved.current = { id: booking.id, status: STATUS_AFTER[result.kind] };
        },
        onError: (error) =>
          toast.say(
            decisionFailureText(error, {
              offline: t('overview.bookings.offline'),
              generic: t('overview.bookings.failed'),
            }),
            { tone: 'error' },
          ),
      },
    );
  }

  function items(row: Row): RowMenuItem[] {
    return (ACTIONS[row.state] ?? []).map((kind) => ({
      key: kind,
      label: t(`overview.bookings.action.${kind}`),
      // The artboard's menu is words only.
      icon: null,
      danger: DANGER.has(kind),
      onSelect: () => run(kind, row.booking),
    }));
  }

  return (
    <section className="yc-card" aria-labelledby={titleId}>
      <div className="yc-card-h">
        <div>
          <h2 className="yc-h2" id={titleId} tabIndex={-1}>
            {t('overview.bookings.title')}
          </h2>
          <p className="yc-cap">
            {t('overview.bookings.cap', {
              count: overview.bookings.total,
              people: new Intl.NumberFormat(locale).format(overview.bookings.people),
            })}
          </p>
        </div>
        <div className="yc-chips" role="group" aria-label={t('overview.bookings.filterLabel')}>
          {FILTERS.map((id) => (
            <button
              key={id}
              type="button"
              className={filter === id ? 'yc-chip yc-chip-sm is-on' : 'yc-chip yc-chip-sm'}
              aria-pressed={filter === id}
              onClick={() => setFilter(id)}
            >
              {t(`overview.bookings.filter.${id}`)}
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="yc-empty-line">
          {rows.length === 0 || filter === 'all'
            ? t('overview.bookings.empty')
            : t(`overview.bookings.emptyFilter.${filter}`)}
        </p>
      ) : (
        <div className="yc-tscroll">
          <table className="yc-tbl" aria-labelledby={titleId}>
            <thead>
              <tr>
                <th scope="col">{t('overview.bookings.column.time')}</th>
                <th scope="col">{t('overview.bookings.column.guest')}</th>
                <th scope="col" className="yc-num">
                  {t('overview.bookings.column.party')}
                </th>
                <th scope="col">{t('overview.bookings.column.table')}</th>
                <th scope="col">{t('overview.bookings.column.source')}</th>
                <th scope="col">{t('overview.bookings.column.status')}</th>
                <th scope="col">
                  <span className="yc-sr">{t('overview.bookings.column.actions')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => {
                const { booking, state } = row;
                const time = booking.localStartTime.slice(0, 5);
                const menuItems = items(row);
                const asked =
                  state === 'late' && booking.lateNudgeAtUtc
                    ? Date.parse(booking.lateNudgeAtUtc) <= now.getTime()
                      ? t('overview.bookings.nudged', {
                          time: formatTime(booking.lateNudgeAtUtc, zone, locale),
                        })
                      : t('overview.bookings.nudgeAt', {
                          time: formatTime(booking.lateNudgeAtUtc, zone, locale),
                        })
                    : null;
                return (
                  <tr key={booking.id}>
                    <td className="yc-strong">{time}</td>
                    <td>{booking.guestName}</td>
                    <td className="yc-num">{booking.partySize}</td>
                    <td>{t('approvals.table', { label: booking.tableLabel })}</td>
                    <td className="yc-muted">
                      {t(`overview.bookings.channel.${booking.channel}`)}
                    </td>
                    <td>
                      <span className={PILL[state]}>
                        <span className="yc-dot" aria-hidden="true" />
                        {state === 'late'
                          ? t('overview.bookings.status.late', {
                              count: minutesLate(booking, now),
                            })
                          : t(`overview.bookings.status.${state}`)}
                      </span>
                      {asked ? <span className="yc-bk-note">{asked}</span> : null}
                    </td>
                    <td className="yc-mcell">
                      {menuItems.length > 0 ? (
                        <RowMenu
                          id={`bk-${booking.id}`}
                          label={t('overview.bookings.menu', { name: booking.guestName, time })}
                          items={menuItems}
                          open={menu === booking.id}
                          onOpenChange={(open) => setMenu(open ? booking.id : null)}
                        />
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {/* The server lists 200 at most; a list cut short says so rather than passing for the day. */}
      {overview.todayBookingsTruncated ? (
        <p className="yc-foot">{t('overview.bookings.truncated')}</p>
      ) : null}
    </section>
  );
}

/**
 * The artboard hands the focus back to the row's ⋮ button. The row may have
 * left the filter with the move, button and all; then the card's title takes
 * the focus rather than leaving it on the page.
 */
function focusRow(id: string, titleId: string) {
  const button = document.querySelector<HTMLElement>(`[data-kebab="bk-${id}"]`);
  (button ?? document.getElementById(titleId))?.focus();
}
