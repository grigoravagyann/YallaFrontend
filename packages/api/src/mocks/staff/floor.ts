import type {
  StaffFloor,
  StaffTableDetail,
  TableActionCommand,
  TableActionResult,
  TableWarning,
  AffectedReservation,
} from '../../contracts/service';
import {
  NotFoundError,
  ValidationError,
  ConcurrencyConflictError,
  InvalidTransitionError,
} from '../../errors';
import type { FloorChangePage } from '../../contracts/ordering';
import type {
  ReleaseReservationCommand,
  ReservationReleaseResult,
  UndoNoShowCommand,
  UndoNoShowResult,
} from '../../staffGateway';
import { ReservationNotStartedError, NoShowUndoWindowClosedError } from '../../contracts/errors';
import { NO_SHOW_BLOCK, noShowUndoableUntil } from '../../contracts/guestRecord';
import type { StaffGateway } from '../../staffGateway';
import {
  type StaffMockContext,
  iso,
  RESERVATION_WARNING_MINUTES,
  TRANSITIONS,
  versionToken,
} from './context';

/** The floor: its read, table actions, the change stream, releasing a booking and undoing a no-show. */
export function floorMethods(
  ctx: StaffMockContext,
): Pick<
  StaffGateway,
  'getFloor' | 'applyTableAction' | 'getFloorChanges' | 'releaseReservation' | 'undoNoShow'
> {
  const {
    FLOOR_BRANCH,
    applied,
    changes,
    churning,
    conversations,
    derive,
    id,
    label,
    now,
    plan,
    preOrderBook,
    preconditionFailed,
    pushEvent,
    racing,
    record,
    releasedCommands,
    requireSession,
    reservations,
    seatPreOrderParty,
    serverOf,
    settle,
    tables,
    tabs,
    totalsFor,
    unreadOnTable,
  } = ctx;
  return {
    async getFloor(requested): Promise<StaffFloor | null> {
      requireSession('/api/branches/floor');
      if (!requested) return settle(null);
      ctx.branchId = requested;
      ctx.floorAdopted = true;
      const at = now();

      const details: StaffTableDetail[] = [];
      const drawn = plan.tables.map((table) => {
        const state = tables.get(table.id);
        if (!state) return table;
        state.derived = derive(state, at);
        details.push({
          tableId: table.id,
          label: table.label,
          seats: table.seats,
          physicalStatus: state.physicalStatus,
          currentSessionId: state.sessionId,
          seatedAtUtc: state.seatedAtUtc,
          partySize: state.partySize,
          nextReservationId: state.nextReservationId,
          nextReservationStartUtc: state.nextReservationStartUtc,
          nextReservationPartySize: state.nextReservationPartySize,
          freeUntilUtc: state.freeUntilUtc,
          openTabId: state.tabId,
          rowVersion: versionToken(table.id, state.version),
          nextReservationPromisedFreeByUtc: state.nextReservationPromisedFreeByUtc,
          sittingPromisedFreeByUtc: state.sittingPromisedFreeByUtc,
          nextReservationPhoneUnverified:
            (state.nextReservationId
              ? reservations.get(state.nextReservationId)?.phoneUnverified
              : undefined) === true,
          nextReservationGuestConfirmedOnWayAtUtc: state.nextReservationId
            ? preOrderBook.onMyWayAt(state.nextReservationId)
            : null,
          // "I'm coming" (2026-10-22): the next booking's lateness and the venue's last ask.
          nextReservationGuestRunningLateMinutes: state.nextReservationId
            ? (preOrderBook.runningLateOf(state.nextReservationId)?.minutes ?? null)
            : null,
          nextReservationStaffAskedOnMyWayAtUtc: state.nextReservationId
            ? preOrderBook.staffAskedAt(state.nextReservationId)
            : null,
          openTabAwaitingAdmission:
            state.tabId !== null && tabs.get(state.tabId)?.admission.status === 'awaiting',
          // Wire §0a: the next booking's guest, while it is still to come.
          nextReservationGuestRecord: state.nextReservationId
            ? (reservations.get(state.nextReservationId)?.guestRecord ?? null)
            : null,
          sittingGuestRecord: null,
          // Guest messages (2026-10-23): the tile's badges, only when there are some.
          ...unreadOnTable(state),
          // Table ownership (2026-10-24): the tab's waiter.
          ...(serverOf(state.tabId)
            ? {
                serverStaffMemberId: serverOf(state.tabId)!.id,
                serverName: serverOf(state.tabId)!.name,
              }
            : {}),
        });
        return {
          ...table,
          state: state.derived,
          occupiedSinceUtc: state.seatedAtUtc,
          nextReservationStartUtc: state.nextReservationStartUtc,
        };
      });

      return settle({
        plan: { ...plan, branchId: ctx.branchId, tables: drawn },
        details,
        lastSequence: ctx.sequence,
        asOfUtc: iso(at),
        // Guest messages (2026-10-23): the Messages tab's badge and the rail's section.
        messages: conversations.floor(FLOOR_BRANCH),
      });
    },

    async applyTableAction(command: TableActionCommand): Promise<TableActionResult> {
      requireSession(`/api/branches/${ctx.branchId}/tables/${command.tableId}`);
      const at = now();

      // The idempotency log first, exactly as the server does it: a repeated
      // command id replays the original answer and changes nothing.
      const previous = applied.get(command.clientCommandId);
      if (previous) return settle({ ...previous, wasReplay: true });

      const state = tables.get(command.tableId);
      if (!state) {
        throw new NotFoundError({
          url: `/api/branches/${ctx.branchId}/tables/${command.tableId}`,
        });
      }

      // A command that says it waited in a queue must say what it expected
      // (`TableStateService.RequirePrecondition`, a 400 on the server). Without
      // this the mock let a resend that broke the rule through, and the
      // tablet's "…anyway" shipped failing against the real API (FT4 review B1).
      if (command.queued && !command.precondition) {
        throw new ValidationError({
          url: `/api/branches/${ctx.branchId}/tables/${command.tableId}`,
          status: 400,
          problem: {
            type: 'about:blank',
            title: 'Invalid request',
            status: 400,
            detail: 'A queued command must carry the status it expected the table to be in.',
            code: 'invalid-request',
            traceId: 'mock',
            context: { field: 'expectedFromStatus' },
          },
        });
      }

      // The table went out and came back while this sat in the queue. Staged
      // before the precondition check, because that is where it happens: the
      // status is unchanged and only the version says so.
      if (churning.has(command.tableId)) {
        churning.delete(command.tableId);
        state.version += 1;
      }

      const transition = TRANSITIONS[command.kind];
      const from = state.physicalStatus;

      // Somebody else got there first. Fired once, before the legality check,
      // because a real race does not care whether the move would have been
      // legal in the world the waiter was looking at.
      if (racing.has(command.tableId)) {
        racing.delete(command.tableId);
        throw new ConcurrencyConflictError({
          url: `/api/branches/${ctx.branchId}/tables/${command.tableId}`,
          problem: {
            code: 'table-state-conflict',
            status: 409,
            title: 'Table already changed',
            detail: `Table ${label(command.tableId)} was changed by someone else.`,
            type: '',
            traceId: '',
            instance: null,
            errors: null,
            context: {
              tableId: command.tableId,
              tableLabel: label(command.tableId),
              attemptedFromStatus: from,
              currentStatus: 'occupied',
              currentSessionId: id('session'),
              changedByName: 'Aram',
            },
          },
        });
      }

      // Both halves, checked separately and reported separately. The server
      // does exactly this, and the difference is the only thing that can tell a
      // waiter their command landed on a sitting that has already ended.
      if (command.precondition) {
        if (command.precondition.expectedFromStatus !== from) {
          throw preconditionFailed(state, command, 1);
        }
        if (
          command.precondition.rowVersion !== null &&
          command.precondition.rowVersion !== versionToken(command.tableId, state.version)
        ) {
          throw preconditionFailed(state, command, 2);
        }
      }

      if (!transition.from.includes(from)) {
        const url = `/api/branches/${ctx.branchId}/tables/${command.tableId}`;
        // Two different refusals, and the difference is what the screen needs.
        // A seat action on a table someone else took is a race; marking an
        // occupied table out of service is simply not a legal move.
        const isRace = from === 'occupied' || from === 'held';
        if (isRace) {
          throw new ConcurrencyConflictError({
            url,
            problem: {
              code: 'table-state-conflict',
              status: 409,
              title: 'Table already changed',
              detail: `Table ${label(command.tableId)} is now ${from}.`,
              type: '',
              traceId: '',
              instance: null,
              errors: null,
              context: {
                tableId: command.tableId,
                tableLabel: label(command.tableId),
                attemptedFromStatus: transition.from[0] ?? 'free',
                currentStatus: from,
                currentSessionId: state.sessionId,
                changedByName: 'Aram',
              },
            },
          });
        }
        throw new InvalidTransitionError({
          url,
          problem: {
            code: 'invalid-table-transition',
            status: 422,
            title: 'Not a legal transition',
            detail: `Cannot ${command.kind} a table that is ${from}.`,
            type: '',
            traceId: '',
            instance: null,
            errors: null,
            context: { currentStatus: from, allowed: [] },
          },
        });
      }

      const warnings: TableWarning[] = [];
      const affected: AffectedReservation[] = [];
      let outstanding: number | null = null;

      if (transition.to === 'occupied' && state.nextReservationStartUtc) {
        const minutes = (new Date(state.nextReservationStartUtc).getTime() - at.getTime()) / 60_000;
        if (minutes > -120 && minutes < RESERVATION_WARNING_MINUTES) {
          warnings.push({
            code: 'upcoming-reservation',
            message: `Table ${label(command.tableId)} is booked at ${state.nextReservationStartUtc}`,
          });
        }
      }

      // A broken table strands whoever booked it. The list is what the panel
      // shows so somebody can phone them; nothing is cancelled automatically.
      if (command.kind === 'outOfService') {
        for (const reservation of reservations.values()) {
          if (reservation.tableId !== command.tableId || reservation.released) continue;
          const local = new Date(reservation.startUtc);
          affected.push({
            reservationId: reservation.id,
            code: reservation.code,
            guestName: reservation.guestName,
            guestPhone: reservation.guestPhone,
            partySize: reservation.partySize,
            startUtc: reservation.startUtc,
            localDate: local.toISOString().slice(0, 10),
            localStartTime: local.toISOString().slice(11, 19),
          });
        }
      }

      if (command.kind === 'freeTable' && state.tabId) {
        const tab = tabs.get(state.tabId);
        const remaining = tab ? totalsFor(tab).remainingDram : 0;
        if (remaining > 0) {
          outstanding = remaining;
          warnings.push({
            code: 'outstanding-balance',
            message: `${remaining} dram still owed on table ${label(command.tableId)}`,
          });
        } else if (tab) {
          tab.status = 'closed';
          tab.closedAtUtc = iso(at);
          pushEvent(tab, 'tabClosed', at);
        }
      }

      state.physicalStatus = transition.to;
      state.version += 1;

      // The booking this seats, when it seats one: its held pre-order joins the tab.
      const seating =
        transition.to === 'occupied'
          ? (command.reservationId ??
            (command.kind === 'seatReservation' ? state.nextReservationId : null))
          : null;
      if (transition.to === 'occupied') {
        state.sessionId = id('session');
        state.seatedAtUtc = iso(at);
        state.partySize = command.partySize ?? null;
        if (command.kind === 'seatReservation' || command.reservationId) {
          state.nextReservationId = null;
          state.nextReservationStartUtc = null;
        }
        // A party the waiter sat down has no tab until somebody scans or the
        // waiter starts one — the real backend's behaviour too.
      } else if (command.kind === 'freeTable') {
        state.sessionId = null;
        state.seatedAtUtc = null;
        state.partySize = null;
        // The tab id survives a free with money owed: that tab is exactly what
        // the "needs resolving" list is for, and losing the id would lose it.
        if (outstanding === null) state.tabId = null;
      }

      state.derived = derive(state, at);
      record(state, from, at);
      if (seating) seatPreOrderParty(seating, state, at);

      const result: TableActionResult = {
        branchId: ctx.branchId,
        tableId: command.tableId,
        tableLabel: label(command.tableId),
        fromStatus: from,
        toStatus: state.physicalStatus,
        state: state.derived,
        tableSessionId: state.sessionId,
        reservationId: command.reservationId ?? null,
        tabId: state.tabId,
        nextReservationStartUtc: state.nextReservationStartUtc,
        freeUntilUtc: state.freeUntilUtc,
        atUtc: iso(at),
        clientCommandId: command.clientCommandId,
        wasReplay: false,
        outstandingDram: outstanding,
        warnings,
        affectedReservations: affected,
      };

      applied.set(command.clientCommandId, result);
      return settle(result);
    },

    async getFloorChanges({ afterSequence }): Promise<FloorChangePage> {
      const page = changes.filter((change) => change.sequence > afterSequence);
      return settle({
        branchId: ctx.branchId,
        lastSequence: ctx.sequence,
        hasMore: false,
        changes: page,
      });
    },

    async releaseReservation(
      command: ReleaseReservationCommand,
    ): Promise<ReservationReleaseResult> {
      const replay = releasedCommands.get(command.clientCommandId);
      if (replay) return settle({ ...replay, wasReplay: true });

      const reservation = reservations.get(command.reservationId);
      if (!reservation) {
        throw new NotFoundError({ url: `/api/reservations/${command.reservationId}` });
      }

      // The server's rule (FT2 wire): no no-show before the booking's start,
      // and nothing changes when it is refused.
      if (command.outcome === 'noShow' && Date.parse(reservation.startUtc) > now().getTime()) {
        throw new ReservationNotStartedError({
          url: `/api/reservations/${reservation.id}/release`,
          reservationId: reservation.id,
          startUtc: reservation.startUtc,
        });
      }

      reservations.set(reservation.id, {
        ...reservation,
        released: true,
        releasedAs: command.outcome,
      });

      const state = tables.get(reservation.tableId);
      let freed = false;
      if (state && state.physicalStatus === 'held') {
        const from = state.physicalStatus;
        state.physicalStatus = 'free';
        state.version += 1;
        state.derived = derive(state, now());
        record(state, from, now());
        freed = true;
      }
      if (state && state.nextReservationId === reservation.id) {
        state.nextReservationId = null;
        state.nextReservationStartUtc = null;
        state.version += 1;
      }

      const result: ReservationReleaseResult = {
        reservationId: reservation.id,
        outcome: command.outcome,
        // Stated by the server rather than inferred from the button, so the
        // confirmation can say which one actually happened.
        countsTowardNoShowThreshold: command.outcome === 'noShow',
        tableId: reservation.tableId,
        tableLabel: label(reservation.tableId),
        tableFreed: freed,
        wasReplay: false,
        // The third no-show in three days blocks the guest for a week (wire §0a).
        guestBlockedUntilUtc:
          command.outcome === 'noShow' &&
          reservation.guestRecord &&
          (reservation.recentNoShows ?? 0) + 1 >= NO_SHOW_BLOCK.threshold
            ? new Date(now().getTime() + NO_SHOW_BLOCK.blockDays * 24 * 3_600_000).toISOString()
            : null,
      };
      releasedCommands.set(command.clientCommandId, result);
      return settle(result);
    },

    /**
     * The server's undo (review round): a no-show, until 05:00 the next
     * morning, is confirmed again; one already undone answers as it stands;
     * anything else is `conflicting-state`. The table is left as it is.
     */
    async undoNoShow(command: UndoNoShowCommand): Promise<UndoNoShowResult> {
      const url = `/api/reservations/${command.reservationId}/undo-no-show`;
      const reservation = reservations.get(command.reservationId);
      if (!reservation) throw new NotFoundError({ url });
      const answer = (status: UndoNoShowResult['status']): UndoNoShowResult => ({
        reservationId: reservation.id,
        status,
        tableId: reservation.tableId,
        tableLabel: label(reservation.tableId),
      });
      if (!reservation.released) return settle(answer('confirmed'));
      if (reservation.releasedAs !== 'noShow') {
        throw new ConcurrencyConflictError({
          url,
          problem: {
            type: '',
            title: 'Conflict',
            status: 409,
            detail: `${reservation.code} is not a no-show.`,
            code: 'conflicting-state',
            traceId: 'mock',
          },
        });
      }
      const until = noShowUndoableUntil(reservation.startUtc, plan.timeZoneId);
      if (now().getTime() > until.getTime()) {
        throw new NoShowUndoWindowClosedError({ url, undoableUntilUtc: until.toISOString() });
      }
      const { releasedAs: _undone, ...kept } = reservation;
      reservations.set(reservation.id, { ...kept, released: false });
      return settle(answer('confirmed'));
    },
  };
}
