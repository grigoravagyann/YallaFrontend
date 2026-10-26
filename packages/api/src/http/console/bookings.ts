import type { ConsoleGateway } from '../../consoleGateway';
import { asNotStarted } from '../../contracts/errors';
import type { components } from '../../generated/schema';
import { consoleBookingFromWire } from '../consoleMapping';
import { branchOverviewFromWire, type WireBranchOverview } from '../branchOverviewMapping';
import { STATUS_AFTER } from '../../contracts/branchOverview';
import { reservationStatus } from '../dinerMapping';
import { cancelledByBlockRefusal, undoNoShowRefusal, withRefusal } from '../guestRecordMapping';
import { tableActionResult } from '../staffMapping';
import { type ConsoleHttpContext, BRANCHES, RESERVATIONS } from './context';

type Schemas = components['schemas'];
type WireReservation = components['schemas']['Yalla.Application.Reservations.ReservationView'];
type WireDecision = components['schemas']['Yalla.Api.Endpoints.DecideReservationRequest'];

export function bookingsMethods(
  ctx: ConsoleHttpContext,
): Pick<
  ConsoleGateway,
  | 'listPendingReservations'
  | 'approveReservation'
  | 'rejectReservation'
  | 'getBranchOverview'
  | 'actOnBooking'
> {
  const { client } = ctx;
  return {
    // --- Bookings waiting for approval ------------------------------------------

    async listPendingReservations(branchId: string) {
      // `status` is the server's `ReservationStatus` number: 1 is
      // PendingApproval. The server caps the list at 200 and sorts it by the
      // branch's own day and start time; the order is kept, not re-sorted.
      const { data } = await client.get<WireReservation[]>(`${BRANCHES}/${branchId}/reservations`, {
        query: { status: 1 },
      });
      return data.map(consoleBookingFromWire);
    },

    async approveReservation({ reservationId }) {
      // The body is the decision request with nothing in it: `reason` is
      // recorded on a rejection only. Sent rather than omitted so the route
      // sees a JSON document, which is what its nullable parameter is bound
      // from. The 403 and the 409 pass through as the client's own errors,
      // carrying the server's sentence as `message`.
      const { data } = await withRefusal(
        client.post<WireReservation>(
          `${RESERVATIONS}/${reservationId}/approve`,
          {} satisfies WireDecision,
        ),
        cancelledByBlockRefusal,
      );
      return consoleBookingFromWire(data);
    },

    async rejectReservation({ reservationId, reason }) {
      const { data } = await withRefusal(
        client.post<WireReservation>(`${RESERVATIONS}/${reservationId}/reject`, {
          reason: reason ?? null,
        } satisfies WireDecision),
        cancelledByBlockRefusal,
      );
      return consoleBookingFromWire(data);
    },

    // --- Overview -----------------------------------------------------------------

    async getBranchOverview(branchId) {
      const { data } = await client.get<WireBranchOverview>(`${BRANCHES}/${branchId}/overview`);
      return branchOverviewFromWire(data);
    },

    async actOnBooking({ kind, branchId, reservationId, tableId, clientCommandId }) {
      // The four are existing routes the console token may call (VC2 wire,
      // section 2): two table transitions and two releases. Each takes only its
      // own fields. A click is never `queued`, and carries no precondition:
      // the console reads no table version to send back.
      const table = `${BRANCHES}/${branchId}/tables/${tableId}`;
      type TableChange = Schemas['Yalla.Application.Tables.TableStateChangeResult'];
      type Release = Schemas['Yalla.Application.Reservations.ReservationReleaseResult'];
      const fromTable = (data: TableChange) => {
        const result = tableActionResult(data);
        return {
          kind,
          reservationId,
          status: STATUS_AFTER[kind],
          wasReplay: result.wasReplay,
          tableLabel: result.tableLabel,
          tableFreed: result.toStatus === 'free',
          outstandingDram: result.outstandingDram,
        };
      };
      // The booking as the release left it: on a replay, what it was released
      // as the first time — a no-show clicked after a cancellation stays cancelled.
      const fromRelease = (data: Release) => ({
        kind,
        reservationId,
        status: reservationStatus(data.reservation.status),
        wasReplay: data.wasReplay,
        tableLabel: data.tableLabel,
        tableFreed: data.tableFreed,
        outstandingDram: null,
        // Wire §0a: only when this no-show blocked its guest.
        guestBlockedUntilUtc: data.guestBlockedUntilUtc ?? null,
      });

      switch (kind) {
        case 'seat': {
          const { data } = await client.post<TableChange>(`${table}/seat-reservation`, {
            clientCommandId,
            queued: false,
            reservationId,
          } satisfies Schemas['Yalla.Api.Endpoints.SeatReservationRequest']);
          return fromTable(data);
        }
        case 'finish': {
          // Names the booking whose sitting ends, so a row read before
          // somebody else sat down can never end theirs: 409
          // `table-sitting-changed` (VC2 wire 2.1).
          const { data } = await client.post<TableChange>(`${table}/free`, {
            clientCommandId,
            queued: false,
            reservationId,
          } satisfies Schemas['Yalla.Api.Endpoints.FreeTableRequest']);
          return fromTable(data);
        }
        case 'noShow': {
          // Counts against the diner, as on the floor tablet.
          const { data } = await client
            .post<Release>(`${RESERVATIONS}/${reservationId}/no-show`, {
              clientCommandId,
            } satisfies Schemas['Yalla.Api.Endpoints.MarkNoShowRequest'])
            // Before the booking's start nobody can have failed to come.
            .catch((error: unknown) => {
              throw asNotStarted(error);
            });
          return fromRelease(data);
        }
        case 'cancel': {
          // Outcome 2, CancelledByVenue: called off by the venue, which does
          // not count as a no-show, and the diner is told.
          const { data } = await client.post<Release>(`${RESERVATIONS}/${reservationId}/release`, {
            clientCommandId,
            outcome: 2,
          } satisfies Schemas['Yalla.Api.Endpoints.ReleaseReservationRequest']);
          return fromRelease(data);
        }
        case 'undoNoShow': {
          // A no-show marked by mistake, until 05:00 the next morning: the
          // booking back, confirmed.
          const { data } = await withRefusal(
            client.post<Schemas['Yalla.Application.Reservations.ReservationView']>(
              `${RESERVATIONS}/${reservationId}/undo-no-show`,
              { clientCommandId } satisfies Schemas['Yalla.Api.Endpoints.UndoNoShowRequest'],
            ),
            undoNoShowRefusal,
          );
          return {
            kind,
            reservationId,
            status: reservationStatus(data.status),
            wasReplay: false,
            tableLabel: data.tableLabel,
            tableFreed: false,
            outstandingDram: null,
          };
        }
      }
    },
  };
}
