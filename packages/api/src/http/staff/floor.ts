import { floorMessagesFromWire } from '../messagesMapping';
import { asNotStarted } from '../../contracts/errors';
import type {
  StaffFloor,
  TableActionCommand,
  TableActionKind,
  TableActionResult,
} from '../../contracts/service';
import type { FloorChangePage } from '../../contracts/ordering';
import { NotFoundError } from '../../errors';
import type { components } from '../../generated/schema';
import type {
  ReleaseReservationCommand,
  UndoNoShowResult,
  ReservationReleaseResult,
  StaffGateway,
} from '../../staffGateway';
import { undoNoShowRefusal, withRefusal } from '../guestRecordMapping';
import { reservationStatus } from '../dinerMapping';
import { floorFromState } from '../mapping';
import { floorChangePage, staffFloorDetails, tableActionResult } from '../staffMapping';
import type { StaffHttpContext } from './context';

type Schemas = components['schemas'];

/** The path segment each action posts to. One place, so none can drift. */
const ACTION_PATHS: Readonly<Record<TableActionKind, string>> = {
  seatWalkIn: 'seat-walk-in',
  seatReservation: 'seat-reservation',
  seatHeldParty: 'seat-held-party',
  hold: 'hold',
  releaseHold: 'release-hold',
  freeTable: 'free',
  outOfService: 'out-of-service',
  returnToService: 'return-to-service',
};

/** The wire's `TableStatus`, for a precondition. Inverse of `tableStatus`. */
const STATUS_CODE: Readonly<Record<string, 1 | 2 | 4 | 5>> = {
  free: 1,
  held: 2,
  occupied: 4,
  outOfService: 5,
};

/** `Yalla.Application.Reservations.ReleaseOutcome`: 1 NoShow, 2 GuestCancelled. */
const RELEASE_OUTCOME: Readonly<Record<'noShow' | 'guestCancelled', 1 | 2>> = {
  noShow: 1,
  guestCancelled: 2,
};

export function floorMethods(
  ctx: StaffHttpContext,
): Pick<
  StaffGateway,
  'getFloor' | 'applyTableAction' | 'getFloorChanges' | 'releaseReservation' | 'undoNoShow'
> {
  const { client } = ctx;
  return {
    // --- The floor ----------------------------------------------------------

    async getFloor(branchId): Promise<StaffFloor | null> {
      try {
        const { data } = await client.get<Schemas['Yalla.Application.Floor.BranchFloorState']>(
          `/api/branches/${branchId}/tables/floor`,
        );
        const messages = floorMessagesFromWire(data.messages);
        return {
          plan: floorFromState(data),
          details: staffFloorDetails(data),
          lastSequence: data.maxSequence,
          asOfUtc: data.asOfUtc,
          // Guest messages (2026-10-23): the badge and the rail, when the server says.
          ...(messages ? { messages } : {}),
        };
      } catch (error) {
        if (error instanceof NotFoundError) return null;
        throw error;
      }
    },

    async applyTableAction(command: TableActionCommand): Promise<TableActionResult> {
      const path = `/api/branches/${command.branchId}/tables/${command.tableId}/${
        ACTION_PATHS[command.kind]
      }`;

      // Each endpoint takes only the fields its own command needs. Sending a
      // party size to `release-hold` would be rejected by model binding, so the
      // body is assembled per action rather than spread wholesale.
      const body: Record<string, unknown> = {
        clientCommandId: command.clientCommandId,
        queued: command.queued ?? false,
      };

      // Both halves of the precondition, together. Status alone would let a
      // queued command land on a table that went occupied and back to free
      // while it waited — a sitting that has already ended.
      if (command.precondition) {
        body['expectedFromStatus'] = STATUS_CODE[command.precondition.expectedFromStatus];
        if (command.precondition.rowVersion !== null) {
          body['expectedRowVersion'] = command.precondition.rowVersion;
        }
      }

      if (command.reason !== undefined) body['reason'] = command.reason;
      if (command.kind === 'seatWalkIn' || command.kind === 'seatHeldParty') {
        body['partySize'] = command.partySize;
      }
      if (command.kind === 'seatReservation') {
        body['reservationId'] = command.reservationId;
        if (command.partySize !== undefined) body['partySize'] = command.partySize;
      }
      if (command.kind === 'seatHeldParty' && command.reservationId !== undefined) {
        body['reservationId'] = command.reservationId;
      }

      const { data } = await client.post<
        Schemas['Yalla.Application.Tables.TableStateChangeResult']
      >(path, body);
      return tableActionResult(data);
    },

    async getFloorChanges({ branchId, afterSequence }): Promise<FloorChangePage> {
      const { data } = await client.get<Schemas['Yalla.Application.Floor.BranchChangePage']>(
        `/api/branches/${branchId}/tables/changes`,
        { query: { afterSequence } },
      );
      return floorChangePage(data);
    },

    async releaseReservation(
      command: ReleaseReservationCommand,
    ): Promise<ReservationReleaseResult> {
      const { data } = await client
        .post<Schemas['Yalla.Application.Reservations.ReservationReleaseResult']>(
          `/api/reservations/${command.reservationId}/release`,
          {
            clientCommandId: command.clientCommandId,
            outcome: RELEASE_OUTCOME[command.outcome],
            ...(command.reason ? { reason: command.reason } : {}),
          } satisfies Schemas['Yalla.Api.Endpoints.ReleaseReservationRequest'],
        )
        // A no-show before the booking's start: the panel says when it is due.
        .catch((error: unknown) => {
          throw asNotStarted(error);
        });

      return {
        reservationId: data.reservation.id,
        outcome: data.outcome === 1 ? 'noShow' : 'guestCancelled',
        countsTowardNoShowThreshold: data.countsTowardNoShowThreshold,
        // Absent for a booking made by time only that nobody seated (backend
        // 601c00b), ahead of the generated schema, which still says string.
        tableId: (data.tableId as string | null | undefined) ?? null,
        tableLabel: (data.tableLabel as string | null | undefined) ?? null,
        tableFreed: data.tableFreed,
        wasReplay: data.wasReplay,
        // Wire §0a: only when this no-show blocked its guest.
        guestBlockedUntilUtc: data.guestBlockedUntilUtc ?? null,
      };
    },

    async undoNoShow({ reservationId, clientCommandId, reason }): Promise<UndoNoShowResult> {
      // The booking as it now stands: confirmed again, or as it was when
      // already undone.
      const { data } = await withRefusal(
        client.post<Schemas['Yalla.Application.Reservations.ReservationView']>(
          `/api/reservations/${reservationId}/undo-no-show`,
          {
            clientCommandId,
            ...(reason?.trim() ? { reason: reason.trim() } : {}),
          } satisfies Schemas['Yalla.Api.Endpoints.UndoNoShowRequest'],
        ),
        undoNoShowRefusal,
      );
      return {
        reservationId: data.id,
        status: reservationStatus(data.status),
        tableId: data.tableId ?? null,
        tableLabel: data.tableLabel ?? null,
      };
    },
  };
}
