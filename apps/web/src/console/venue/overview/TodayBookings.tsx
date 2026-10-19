import {
  minutesLate,
  newCommandId,
  overviewRowState,
  type BranchOverview,
  type ConsoleBookingActionCommand,
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
import { TOAST_UNDO_MS, useToast } from '../../ui/toast';
import { bookingActionFailureText } from './bookingActionFailure';

type Filter = 'next' | 'seated' | 'all';
const FILTERS: readonly Filter[] = ['next', 'seated', 'all'];

/** Each row state's pill (Main artboard's `stMap`). */
const PILL: Readonly<Record<OverviewRowState, string>> = {
  pending: 'yc-pill yc-pill-amber',
  changeRequested: 'yc-pill yc-pill-amber',
  confirmed: 'yc-pill yc-pill-blue',
  late: 'yc-pill yc-pill-red',
  seated: 'yc-pill yc-pill-green',
  completed: 'yc-pill yc-pill-grey',
  noShow: 'yc-pill yc-pill-grey',
  cancelled: 'yc-pill yc-pill-grey',
  unknown: 'yc-pill yc-pill-grey',
};

/**
 * What the ⋮ menu offers for each state, in the artboard's order. Nothing for
 * the rest: a change waiting for an answer is answered in the approvals card,
 * and a status this build does not know is not acted on.
 */
const ACTIONS: Readonly<Partial<Record<OverviewRowState, readonly ConsoleBookingActionKind[]>>> = {
  late: ['seat', 'noShow'],
  confirmed: ['seat', 'cancel'],
  seated: ['finish'],
};

const DANGER: ReadonlySet<ConsoleBookingActionKind> = new Set(['noShow', 'cancel']);

/** Held for the length of the undo toast before they are sent: they tell the guest. */
const UNDOABLE: ReadonlySet<ConsoleBookingActionKind> = new Set(['noShow', 'cancel']);

/** How a held action shows on its row until it is sent. */
const HELD_STATE: Readonly<Partial<Record<ConsoleBookingActionKind, OverviewRowState>>> = {
  noShow: 'noShow',
  cancel: 'cancelled',
};

/** A status as its pill words it, for "already done" on a replay. */
const STATUS_STATE: Readonly<Partial<Record<ReservationStatusCode, OverviewRowState>>> = {
  seated: 'seated',
  completed: 'completed',
  noShow: 'noShow',
  cancelledByVenue: 'cancelled',
  cancelledByDiner: 'cancelled',
};

interface Row {
  readonly booking: OverviewBooking;
  readonly state: OverviewRowState;
}

interface Held {
  readonly command: ConsoleBookingActionCommand;
  readonly booking: OverviewBooking;
  readonly timer: number;
}

/**
 * Today's bookings, with the Main artboard's three filters — still to come,
 * in the room now, all of them — and a ⋮ menu per row.
 *
 * - **Still to come** is everything not seated and not over: waiting,
 *   confirmed (a change waiting for an answer included), late. **In the room
 *   now** is the seated parties and the late ones, the two a person on the
 *   floor is looking at.
 * - **Seat and finish act at once.** Finishing names the booking, so a row
 *   read before somebody else's party sat down can never end theirs.
 * - **A no-show and a cancellation wait for their undo.** Both tell the guest
 *   and cannot be taken back on the server, so the request is held for as long
 *   as the toast offers Undo (HANDOFF section 4: every destructive action has
 *   one), then sent — and the toast after says it was. Nothing held is lost:
 *   leaving the page, switching branch or hiding the tab sends it at once.
 * - **A no-show is offered once the policy's grace is up**; before that a
 *   late party may still walk in, and their table is still held for them.
 * - **Each row is busy on its own**: one row's request never stops another's.
 * - **A refusal is said in the console's words** (`bookingActionFailure.ts`),
 *   never the server's English, and the list is read again.
 * - **No "are they coming?"**: the app asks the guest by itself and the
 *   backend has no manual nudge (VC2 wire), so a late row says when the app
 *   asked, once it has.
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
  /** Rows with a request in flight. */
  const [busy, setBusy] = useState<ReadonlySet<string>>(() => new Set());
  /** Rows whose no-show or cancellation waits for its undo, by the action held. */
  const [held, setHeld] = useState<ReadonlyMap<string, ConsoleBookingActionKind>>(() => new Map());
  const holding = useRef(new Map<string, Held>());
  const mounted = useRef(true);
  /** A row an action just moved: its focus is settled once the list shows the move. */
  const moved = useRef<{ id: string; status: ReservationStatusCode } | null>(null);
  const zone = overview.timeZoneId as TimeZone;

  // After every render: the one that shows the move hands the focus back.
  useEffect(() => {
    const done = moved.current;
    if (!done) return;
    const row = overview.todayBookings.find((booking) => booking.id === done.id);
    if (row && row.status !== done.status) return;
    moved.current = null;
    focusRow(done.id, titleId);
  });

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // The latest `commit`, for the listeners below, which outlive a render.
  const commitLatest = useRef<(id: string) => void>(() => undefined);

  // What is held is sent, never dropped: when the page is left (this unmounts),
  // the branch switches, the tab is hidden or the page goes away.
  useEffect(() => {
    const flush = () => {
      for (const id of [...holding.current.keys()]) commitLatest.current(id);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [branchId]);

  const rows: Row[] = overview.todayBookings.map((booking) => ({
    booking,
    state: overviewRowState(booking, now),
  }));
  // A held row stays where it is until it is sent: it is not gone yet.
  const shown = rows.filter(({ state }) =>
    filter === 'seated'
      ? state === 'seated' || state === 'late'
      : filter === 'next'
        ? state === 'pending' ||
          state === 'changeRequested' ||
          state === 'confirmed' ||
          state === 'late'
        : true,
  );

  const statusWord = (state: OverviewRowState | undefined) =>
    state && state !== 'late' ? t(`overview.bookings.status.${state}`) : '';

  function said(result: ConsoleBookingActionResult, booking: OverviewBooking): string {
    const name = booking.guestName;
    // A repeat of a command that already landed: say what it is, which for a
    // release may not be what this click asked for.
    if (result.wasReplay) {
      return t('overview.bookings.done.replay', {
        name,
        status: statusWord(STATUS_STATE[result.status]),
      });
    }
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

  function refusal(error: unknown): string {
    return bookingActionFailureText(error, {
      moved: t('overview.bookings.refused.moved'),
      tableTaken: t('overview.bookings.refused.tableTaken'),
      sittingChanged: t('overview.bookings.refused.sittingChanged'),
      tableCannot: t('overview.bookings.refused.tableCannot'),
      forbidden: t('overview.bookings.refused.forbidden'),
      gone: t('overview.bookings.refused.gone'),
      offline: t('overview.bookings.refused.offline'),
      generic: t('overview.bookings.refused.generic'),
    });
  }

  const mark = (id: string, on: boolean) =>
    setBusy((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const release = (id: string) =>
    setHeld((current) => {
      const next = new Map(current);
      next.delete(id);
      return next;
    });

  async function send(command: ConsoleBookingActionCommand, booking: OverviewBooking) {
    if (mounted.current) mark(booking.id, true);
    try {
      const result = await action.mutateAsync(command);
      // Said even after the page was left: the toast is the shell's.
      toast.say(said(result, booking));
      if (mounted.current && !UNDOABLE.has(command.kind)) {
        moved.current = { id: booking.id, status: result.status };
      }
    } catch (error) {
      toast.say(refusal(error), { tone: 'error' });
    } finally {
      if (mounted.current) {
        mark(booking.id, false);
        release(booking.id);
      }
    }
  }

  function commit(id: string) {
    const entry = holding.current.get(id);
    if (!entry) return;
    window.clearTimeout(entry.timer);
    holding.current.delete(id);
    void send(entry.command, entry.booking);
  }

  function undo(id: string) {
    const entry = holding.current.get(id);
    if (!entry) return;
    window.clearTimeout(entry.timer);
    holding.current.delete(id);
    release(id);
    toast.say(t('overview.bookings.undone', { name: entry.booking.guestName }));
    window.setTimeout(() => focusRow(id, titleId), 0);
  }

  useEffect(() => {
    commitLatest.current = commit;
  });

  function run(kind: ConsoleBookingActionKind, booking: OverviewBooking) {
    if (busy.has(booking.id) || holding.current.has(booking.id)) return;
    const command: ConsoleBookingActionCommand = {
      kind,
      branchId,
      reservationId: booking.id,
      tableId: booking.tableId,
      clientCommandId: newCommandId(),
    };
    if (UNDOABLE.has(kind)) {
      const timer = window.setTimeout(() => commit(booking.id), TOAST_UNDO_MS);
      holding.current.set(booking.id, { command, booking, timer });
      setHeld((current) => new Map(current).set(booking.id, kind));
      toast.say(t(`overview.bookings.held.${kind}`, { name: booking.guestName }), {
        undo: () => undo(booking.id),
        focusUndo: true,
        fallbackFocus: () => document.getElementById(titleId),
      });
      return;
    }
    // Back to the row's own button at once, so the focus is not left on the
    // menu that just closed; again once the row has moved (above).
    window.setTimeout(() => focusRow(booking.id, titleId), 0);
    void send(command, booking);
  }

  function items(row: Row): RowMenuItem[] {
    const kinds = (ACTIONS[row.state] ?? []).filter(
      // A no-show only once the grace is up: until then the table is still theirs.
      (kind) => kind !== 'noShow' || minutesLate(row.booking, now) >= overview.graceMinutes,
    );
    return kinds.map((kind) => ({
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
                const { booking } = row;
                const heldKind = held.get(booking.id);
                const state = (heldKind && HELD_STATE[heldKind]) ?? row.state;
                const clock = booking.localStartTime.slice(0, 5);
                // After midnight of the service day, the start is tomorrow's.
                const time =
                  booking.localDate !== overview.serviceDate
                    ? t('overview.load.nextDay', { hour: clock })
                    : clock;
                const isBusy = busy.has(booking.id);
                const isHeld = held.has(booking.id);
                const menuItems = isBusy || isHeld ? [] : items(row);
                const note = isHeld
                  ? t('overview.bookings.heldNote')
                  : state === 'changeRequested'
                    ? t('overview.bookings.changeNote')
                    : state === 'late' && booking.lateNudgeAtUtc && booking.lateNudgeSent !== null
                      ? t(
                          booking.lateNudgeSent
                            ? 'overview.bookings.nudged'
                            : 'overview.bookings.nudgeAt',
                          {
                            time: formatTime(booking.lateNudgeAtUtc, zone, locale),
                          },
                        )
                      : null;
                return (
                  <tr key={booking.id} aria-busy={isBusy || undefined}>
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
                      {note ? <span className="yc-bk-note">{note}</span> : null}
                    </td>
                    <td className="yc-mcell">
                      {isBusy ? (
                        <span
                          className="yc-spin yc-bk-spin"
                          role="status"
                          aria-label={t('saving')}
                        />
                      ) : menuItems.length > 0 ? (
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
