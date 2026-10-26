import type { ConsoleBooking } from '../../contracts/approvals';
import type { components } from '../../generated/schema';
import type { StaffGateway } from '../../staffGateway';
import type { WireReservationWithApproval } from '../approvalMapping';
import { awaitingApprovalFromWire, type WireAwaitingApproval } from '../awaitingApprovalMapping';
import { consoleBookingFromWire } from '../consoleMapping';
import { cancelledByBlockRefusal, withRefusal } from '../guestRecordMapping';
import type { StaffHttpContext } from './context';

type Schemas = components['schemas'];

export function approvalsMethods(
  ctx: StaffHttpContext,
): Pick<StaffGateway, 'listAwaitingApproval' | 'approveReservation' | 'rejectReservation'> {
  const { client } = ctx;
  return {
    // --- Bookings waiting for the floor ------------------------------------

    async listAwaitingApproval(branchId) {
      // The server orders the list, soonest-closing window first; kept as sent.
      const { data } = await client.get<WireAwaitingApproval[]>(
        `/api/branches/${branchId}/reservations/awaiting`,
      );
      return (data ?? []).map(awaitingApprovalFromWire);
    },

    async approveReservation({ reservationId }): Promise<ConsoleBooking> {
      // The empty decision body, as the console sends it: the route binds a
      // JSON document. The 409s — decided already, or too late — pass through
      // as the client's own `ConcurrencyConflictError`, code intact.
      // Cancelled by its guest's no-show block meanwhile: said as that (wire §0a).
      const { data } = await withRefusal(
        client.post<WireReservationWithApproval>(
          `/api/reservations/${reservationId}/approve`,
          {} satisfies Schemas['Yalla.Api.Endpoints.DecideReservationRequest'],
        ),
        cancelledByBlockRefusal,
      );
      return consoleBookingFromWire(data);
    },

    async rejectReservation({ reservationId, reason }): Promise<ConsoleBooking> {
      const { data } = await withRefusal(
        client.post<WireReservationWithApproval>(`/api/reservations/${reservationId}/reject`, {
          reason: reason ?? null,
        } satisfies Schemas['Yalla.Api.Endpoints.DecideReservationRequest']),
        cancelledByBlockRefusal,
      );
      return consoleBookingFromWire(data);
    },
  };
}
