import type {
  AffectedReservation,
  BookingWithoutTable,
  StaffFloor,
  StaffGateway,
  StaffSessionIdentity,
  TableActionResult,
} from '@yalla/api';
import { queryKeys } from '@yalla/api/react';
import type { QueryClient } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import { useCallback, useMemo, type Dispatch, type SetStateAction } from 'react';
import type { ConflictEntry, QueuedCommand } from '../commands/types';
import { useCommandQueue } from '../commands/useCommandQueue';
import type { UnresolvedTab } from '../FloorRail';
import type { BranchFormat } from '../useBranchFormat';
import { useBehindHeldNotice, useCancelReadsWhileLocked, useHeldMarks } from '../useHandover';
import type { SetNotice } from './notices';

export interface Selection {
  readonly tableId: string;
}

export interface UseFloorCommandsOptions {
  readonly identity: StaffSessionIdentity;
  readonly gateway: StaffGateway;
  readonly queryClient: QueryClient;
  readonly floor: StaffFloor | null;
  readonly paused: boolean;
  readonly format: BranchFormat;
  readonly t: TFunction;
  readonly setNotice: SetNotice;
  readonly setUnresolved: Dispatch<SetStateAction<readonly UnresolvedTab[]>>;
  readonly setAffected: Dispatch<
    SetStateAction<ReadonlyMap<string, readonly AffectedReservation[]>>
  >;
  readonly setSelection: Dispatch<SetStateAction<Selection | null>>;
}

/**
 * The command queue as the floor wires it: what a landed table action, a lost
 * race and a settled command each do to the screen, and the person whose
 * commands are sent.
 */
export function useFloorCommands({
  identity,
  gateway,
  queryClient,
  floor,
  paused,
  format,
  t,
  setNotice,
  setUnresolved,
  setAffected,
  setSelection,
}: UseFloorCommandsOptions) {
  const branchId = identity.branchId;
  const active = !paused;

  const onApplied = useCallback(
    (result: TableActionResult) => {
      // A freed table with money owed. The table is freed anyway — the diners
      // have left — and the tab surfaces here so it is not simply lost.
      if (result.outstandingDram !== null && result.outstandingDram > 0 && result.tabId) {
        const tabId = result.tabId;
        setUnresolved((current) =>
          current.some((entry) => entry.tabId === tabId)
            ? current
            : [
                ...current,
                {
                  tabId,
                  tableId: result.tableId,
                  tableLabel: result.tableLabel,
                  amountDram: result.outstandingDram!,
                },
              ],
        );
      }

      // Bookings this table still had. Kept against the table so the panel can
      // show them the next time it is opened, and never cancelled here.
      if (result.affectedReservations.length > 0) {
        setAffected((current) => new Map(current).set(result.tableId, result.affectedReservations));
      }

      // Warnings accompany a success and never block it. Surfaced after the
      // fact because the action has already happened and the waiter chose it.
      const warning = result.warnings[0];
      if (warning) {
        setNotice({
          kind: 'warning',
          text:
            // problem-codes: not-a-problem-code — a TableStateWarningCodes member
            warning.code === 'outstanding-balance' && result.outstandingDram !== null
              ? t('notice.freedWithBalance', {
                  label: result.tableLabel,
                  amount: format.dram(result.outstandingDram),
                })
              : // problem-codes: not-a-problem-code — a TableStateWarningCodes member
                warning.code === 'upcoming-reservation'
                ? t('notice.seatedOverBooking', { label: result.tableLabel })
                : warning.message,
        });
      }

      void queryClient.invalidateQueries({ queryKey: queryKeys.staffFloor(branchId) });
    },
    [branchId, format, queryClient, t, setAffected, setNotice, setUnresolved],
  );

  const onLiveRace = useCallback(
    (entry: ConflictEntry) => {
      const label = entry.observed?.tableLabel || entry.command.subject.tableLabel || '';
      // Brief and specific, and the floor redraws behind it. Not a crash
      // screen, not a retry: this is a normal Friday.
      setNotice({
        kind: 'race',
        text: entry.observed?.changedBy
          ? t('notice.raceNamed', { label, name: entry.observed.changedBy })
          : t('notice.race', { label }),
      });
      setSelection(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.staffFloor(branchId) });
    },
    [branchId, queryClient, t, setNotice, setSelection],
  );

  /**
   * A command landed. Refetch whatever list it belongs in.
   *
   * Keyed off the command rather than off a timer, so an order placed offline
   * appears in the panel the moment it actually reaches the kitchen and not a
   * poll interval later.
   */
  const onSettled = useCallback(
    (command: QueuedCommand) => {
      if (command.kind === 'placeOrder' || command.kind === 'setOrderStatus') {
        void queryClient.invalidateQueries({ queryKey: queryKeys.orderQueue(branchId) });
        if (command.subject.tabId) {
          void queryClient.invalidateQueries({
            queryKey: queryKeys.staffTab(command.subject.tabId),
          });
          void queryClient.invalidateQueries({
            queryKey: queryKeys.tabLines(command.subject.tabId),
          });
        }
      }
      if (command.kind === 'acknowledgeServiceRequest') {
        void queryClient.invalidateQueries({ queryKey: queryKeys.serviceRequests(branchId) });
      }
      // A booking made by time only seated at the table the waiter chose: it
      // has that table now. Off the door's list at once — the queue no longer
      // holds it to hide it — and the list read again.
      if (command.body.kind === 'seatReservation' && command.body.command.reservationId) {
        const seated = command.body.command.reservationId;
        queryClient.setQueryData<readonly BookingWithoutTable[]>(
          queryKeys.bookingsWithoutTable(branchId),
          (list) => (list ? list.filter((booking) => booking.id !== seated) : list),
        );
        void queryClient.invalidateQueries({ queryKey: queryKeys.bookingsWithoutTable(branchId) });
      }
    },
    [branchId, queryClient],
  );

  // Who is signed in: stamped on every command, and the person whose queued
  // commands are sent (`commands/conflictPolicy.ts`).
  const actor = useMemo(
    () => ({ staffMemberId: identity.staffMemberId, name: identity.fullName }),
    [identity.staffMemberId, identity.fullName],
  );
  const queue = useCommandQueue({
    gateway,
    floor,
    onApplied,
    onLiveRace,
    onSettled,
    enabled: active,
    actor,
  });
  const heldMarks = useHeldMarks(queue);
  useBehindHeldNotice(queue, identity.staffMemberId, (command, name) =>
    setNotice({
      kind: 'warning',
      text: t('notice.behindHeld', { label: command.subject.tableLabel ?? '', name }),
    }),
  );
  useCancelReadsWhileLocked(paused, branchId);

  return { queue, heldMarks };
}
