import {
  newCommandId,
  noShowUndoableUntil,
  ReservationNotStartedError,
  tableDetail,
  TableNotSeatedError,
  type AffectedReservation,
  type BookingWithoutTable,
  type OrderQueueEntry,
  type OrderStatus,
  type ReleaseOutcome,
  type StaffFloor,
  type TableActionKind,
} from '@yalla/api';
import { queryKeys, useOpenTabForStaff, useReleaseReservation } from '@yalla/api/react';
import type { QueryClient } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type { NewCommand } from '../commands/types';
import type { CommandQueue } from '../commands/useCommandQueue';
import type { MarkedNoShow, UndoOutcome } from '../UndoNoShowNotice';
import type { BranchFormat } from '../useBranchFormat';
import { actedNotice, type SetNotice } from './notices';
import type { Selection } from './useFloorCommands';

/** The table key an unresolved tab is filed under. Never a real table id. */
export const UNRESOLVED_KEY = '__unresolved__';

/** Which overlay is up over the floor. */
export type FloorOverlay = 'none' | 'conflicts' | 'order' | 'tab';

export interface UseTableActionsOptions {
  readonly branchId: string;
  readonly floor: StaffFloor | null;
  readonly plan: StaffFloor['plan'] | null;
  readonly queue: CommandQueue;
  readonly selection: Selection | null;
  readonly selectedTabId: string | null;
  readonly timeZoneId: string;
  readonly format: BranchFormat;
  readonly queryClient: QueryClient;
  readonly t: TFunction;
  readonly setNotice: SetNotice;
  readonly setSelection: Dispatch<SetStateAction<Selection | null>>;
  readonly setUnresolvedTabId: Dispatch<SetStateAction<string | null>>;
  readonly setOverlayTabId: Dispatch<SetStateAction<string | null>>;
  readonly setActiveTableId: Dispatch<SetStateAction<string | null>>;
  readonly setCashFirst: Dispatch<SetStateAction<boolean>>;
  readonly setOverlay: Dispatch<SetStateAction<FloorOverlay>>;
  readonly setMarkedNoShows: Dispatch<SetStateAction<readonly MarkedNoShow[]>>;
  readonly setAffected: Dispatch<
    SetStateAction<ReadonlyMap<string, readonly AffectedReservation[]>>
  >;
}

/**
 * What the table panel and the rail do to a table: a table action through the
 * queue, letting a booking go, a tab for a party that will not scan, a kitchen
 * ticket moved on, an unresolved tab opened, a no-show's undo answered.
 */
export function useTableActions({
  branchId,
  floor,
  plan,
  queue,
  selection,
  selectedTabId,
  timeZoneId,
  format,
  queryClient,
  t,
  setNotice,
  setSelection,
  setUnresolvedTabId,
  setOverlayTabId,
  setActiveTableId,
  setCashFirst,
  setOverlay,
  setMarkedNoShows,
  setAffected,
}: UseTableActionsOptions) {
  const releaseReservation = useReleaseReservation(branchId);
  const openTabForStaff = useOpenTabForStaff();

  /**
   * An unresolved tab has no table any more — it was freed — but the money is
   * still owed, so the panel has to be openable from the tab id alone. Filed
   * under a key that cannot collide with a real table id.
   */
  const settleUnresolved = useCallback(
    (tabId: string) => {
      setUnresolvedTabId(tabId);
      setOverlayTabId(tabId);
      setActiveTableId(UNRESOLVED_KEY);
      setCashFirst(false);
      setOverlay('tab');
    },
    [setActiveTableId, setCashFirst, setOverlay, setOverlayTabId, setUnresolvedTabId],
  );

  const act = useCallback(
    (kind: TableActionKind, input?: { partySize?: number }) => {
      if (!branchId || !selection) return;
      const detail = tableDetail(floor, selection.tableId);
      const table = plan?.tables.find((candidate) => candidate.id === selection.tableId);

      // One id per tap, reused on every retry. Generated here and nowhere else.
      const clientCommandId = newCommandId();

      // The precondition is the status the table will be in once everything
      // already queued for it has been applied — not the status the server last
      // reported, which a queued seat may already have superseded.
      const expected = queue.projected(selection.tableId) ?? detail?.physicalStatus ?? 'free';

      /**
       * The version is only sent when the queue has nothing else pending for
       * this table.
       *
       * A version captured from the floor describes the table *before* the
       * commands ahead of this one land, and each of those changes it. Sending
       * it would refuse a chain the waiter deliberately built — seat, then free
       * — as though the table had been used by somebody else. The status
       * projection above handles the chain; the version guards the case it
       * cannot, which is the single unqueued tap.
       */
      const chained = queue.projected(selection.tableId) !== (detail?.physicalStatus ?? null);
      const rowVersion = chained ? null : (detail?.rowVersion ?? null);

      const command: NewCommand = {
        id: clientCommandId,
        scope: selection.tableId,
        precondition: { expectedFromStatus: expected, rowVersion },
        subject: {
          tableId: selection.tableId,
          tableLabel: table?.label ?? null,
          tabId: selectedTabId,
        },
        body: {
          kind,
          command: {
            kind,
            branchId,
            tableId: selection.tableId,
            clientCommandId,
            ...(input?.partySize !== undefined ? { partySize: input.partySize } : {}),
            ...(kind === 'seatHeldParty' && detail?.nextReservationId
              ? { reservationId: detail.nextReservationId }
              : {}),
            ...(kind === 'seatReservation' && detail?.nextReservationId
              ? { reservationId: detail.nextReservationId }
              : {}),
          },
        },
      };

      queue.enqueue(command);
      queue.sync();
      setSelection(null);

      const label = table?.label ?? '';
      const done = actedNotice(
        t,
        kind,
        label,
        input?.partySize ?? detail?.nextReservationPartySize,
      );
      if (done) {
        setNotice({
          kind: 'info',
          // Offline it is on the tablet, not on the server: said, so nobody
          // expects the kitchen or the other tablet to know yet.
          text: queue.online ? done : t('notice.acted.queued', { text: done }),
          acted: true,
        });
      }
    },
    [branchId, floor, plan, queue, selection, selectedTabId, t, setNotice, setSelection],
  );

  /**
   * A booking made by time only, seated at the table the waiter chose
   * (2026-10-29): `seat-reservation` on that table with the booking's id,
   * through the queue like any seat, and the server gives the booking that
   * table. The precondition is the chosen table's, as for a tap on its panel.
   */
  const seatBooking = useCallback(
    (booking: BookingWithoutTable, tableId: string) => {
      if (!branchId) return;
      const detail = tableDetail(floor, tableId);
      const table = plan?.tables.find((candidate) => candidate.id === tableId);
      const clientCommandId = newCommandId();
      const expected = queue.projected(tableId) ?? detail?.physicalStatus ?? 'free';
      const chained = queue.projected(tableId) !== (detail?.physicalStatus ?? null);
      const rowVersion = chained ? null : (detail?.rowVersion ?? null);

      queue.enqueue({
        id: clientCommandId,
        scope: tableId,
        precondition: { expectedFromStatus: expected, rowVersion },
        subject: { tableId, tableLabel: table?.label ?? null, tabId: null },
        body: {
          kind: 'seatReservation',
          command: {
            kind: 'seatReservation',
            branchId,
            tableId,
            clientCommandId,
            reservationId: booking.id,
            partySize: booking.partySize,
          },
        },
      });
      queue.sync();

      const done = t('notice.acted.seated', {
        label: table?.label ?? '',
        count: booking.partySize,
      });
      setNotice({
        kind: 'info',
        text: queue.online ? done : t('notice.acted.queued', { text: done }),
        acted: true,
      });
    },
    [branchId, floor, plan, queue, t, setNotice],
  );

  /** An undo answered: said in the notice, and off the rail once nothing is left to undo. */
  const undoSettled = useCallback(
    (reservationId: string, outcome: UndoOutcome) => {
      setNotice({ kind: outcome.kind, text: outcome.text });
      if (outcome.settled) {
        setMarkedNoShows((current) =>
          current.filter((entry) => entry.reservationId !== reservationId),
        );
      }
    },
    [setMarkedNoShows, setNotice],
  );

  const release = useCallback(
    (reservationId: string, outcome: ReleaseOutcome) => {
      // When the booking was due, read before the release takes it off the floor.
      const startUtc =
        floor?.details.find((detail) => detail.nextReservationId === reservationId)
          ?.nextReservationStartUtc ?? null;
      releaseReservation.mutate(
        { reservationId, outcome, clientCommandId: newCommandId() },
        {
          onSuccess: (result) => {
            // A no-show marked by mistake can be undone until 05:00 the next
            // morning: offered while that holds on this clock, and the server
            // has the last word. Not on a replay's other outcome.
            const undoableUntil =
              result.outcome === 'noShow' && startUtc !== null
                ? noShowUndoableUntil(startUtc, timeZoneId)
                : null;
            const undoable =
              result.outcome === 'noShow' &&
              (undoableUntil === null || Date.now() < undoableUntil.getTime());
            if (undoable && undoableUntil) {
              const marked: MarkedNoShow = {
                reservationId: result.reservationId,
                tableLabel: result.tableLabel,
                undoableUntilUtc: undoableUntil.toISOString(),
              };
              setMarkedNoShows((current) => [
                ...current.filter((entry) => entry.reservationId !== marked.reservationId),
                marked,
              ]);
            }
            setNotice({
              kind: 'info',
              // The server says whether it counted, rather than the button
              // being trusted to remember which one it was.
              text: [
                result.countsTowardNoShowThreshold
                  ? t('notice.releasedNoShow', { label: result.tableLabel })
                  : t('notice.releasedCancelled', { label: result.tableLabel }),
                // This no-show was the guest's third in three days (wire §0a).
                ...(result.guestBlockedUntilUtc
                  ? [
                      t('notice.guestBlocked', {
                        date: format.dayAndTime(result.guestBlockedUntilUtc).date,
                        time: format.time(result.guestBlockedUntilUtc),
                      }),
                    ]
                  : []),
              ].join(' '),
              ...(undoable
                ? { undo: { reservationId: result.reservationId, tableLabel: result.tableLabel } }
                : {}),
            });
            setAffected((current) => {
              const next = new Map(current);
              for (const [tableId, bookings] of current) {
                next.set(
                  tableId,
                  bookings.filter((booking) => booking.reservationId !== reservationId),
                );
              }
              return next;
            });
          },
          onError: (error) => {
            // Refused, so nothing changed: the panel's "let go" was optimistic
            // and goes with it, and the floor shows the table as it is.
            setSelection(null);
            if (error instanceof ReservationNotStartedError) {
              // Only a booking whose time has come can be a no-show; the hold
              // stays. Said with the time it is due (FT2 wire).
              const label =
                floor?.plan.tables.find(
                  (table) => tableDetail(floor, table.id)?.nextReservationId === reservationId,
                )?.label ?? '';
              setNotice({
                kind: 'warning',
                text: t('notice.releaseNotDue', {
                  label,
                  time: error.startUtc ? format.time(error.startUtc) : '—',
                }),
              });
              return;
            }
            setNotice({ kind: 'info', text: t('notice.releaseFailed') });
          },
        },
      );
    },
    [
      floor,
      format,
      releaseReservation,
      t,
      timeZoneId,
      setAffected,
      setMarkedNoShows,
      setNotice,
      setSelection,
    ],
  );

  /**
   * A tab for the party that is not going to scan. The panel stays open: once
   * the floor refetch lands it shows "Take an order" in place of this button.
   */
  const startTab = useCallback(
    (tableId: string) => {
      if (!branchId) return;
      const tableLabel = floor?.plan.tables.find((table) => table.id === tableId)?.label ?? '';
      openTabForStaff.mutate(
        { branchId, tableId, clientCommandId: newCommandId() },
        {
          onSuccess: () =>
            setNotice({ kind: 'info', text: t('notice.tabStarted', { label: tableLabel }) }),
          onError: (error) =>
            setNotice({
              kind: 'info',
              text:
                error instanceof TableNotSeatedError
                  ? t('notice.tabNotSeated', { label: tableLabel })
                  : t('notice.startTabFailed'),
            }),
        },
      );
    },
    [branchId, floor, openTabForStaff, t, setNotice],
  );

  const advanceOrder = useCallback(
    (order: OrderQueueEntry, next: OrderStatus) => {
      const clientCommandId = newCommandId();
      queue.enqueue({
        id: clientCommandId,
        // A held pre-order ticket has no tab yet: its own id keeps its moves in order.
        scope: order.tabId ?? order.orderId,
        precondition: null,
        // `KitchenOrderView` carries no table id. The label is what the rail
        // shows and what a conflict entry needs; a lookup by label could name
        // the wrong table, so there is deliberately no id here.
        subject: { tableId: null, tableLabel: order.tableLabel, tabId: order.tabId },
        body: {
          kind: 'setOrderStatus',
          command: { orderId: order.orderId, status: next, clientCommandId },
        },
      });
      queue.sync();
      void queryClient.invalidateQueries({ queryKey: queryKeys.orderQueue(branchId) });
      if (next === 'served') {
        setNotice({
          kind: 'info',
          text: t('rail.ready.servedNotice', { label: order.tableLabel }),
        });
      }
      if (next === 'ready') {
        setNotice({
          kind: 'info',
          text: t(queue.online ? 'kitchen.readyNotice' : 'kitchen.readyQueued', {
            label: order.tableLabel,
          }),
        });
      }
    },
    [branchId, queryClient, queue, t, setNotice],
  );

  return {
    releaseReservation,
    openTabForStaff,
    settleUnresolved,
    act,
    seatBooking,
    undoSettled,
    release,
    startTab,
    advanceOrder,
  };
}
