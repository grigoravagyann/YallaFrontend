import {
  type AwaitingApproval,
  waitsOnEarlierGuestInApp,
  type ConsoleBooking,
} from '../../contracts/approvals';
import { localDateAndTime } from '../approvalWindow';
import type { StaffGateway } from '../../staffGateway';
import { type StaffMockContext, iso } from './context';

/** Bookings waiting for the floor's answer. */
export function approvalsMethods(
  ctx: StaffMockContext,
): Pick<StaffGateway, 'listAwaitingApproval' | 'approveReservation' | 'rejectReservation'> {
  const { awaiting, decideAwaiting, label, now, plan, settle, sweepAwaiting, tables } = ctx;
  return {
    async listAwaitingApproval(requested): Promise<readonly AwaitingApproval[]> {
      if (requested) ctx.branchId = requested;
      const at = now();
      sweepAwaiting(at);
      const listed = [...awaiting.values()]
        .filter(
          (request) =>
            request.status === 'pendingApproval' &&
            request.arrivesAtUtc <= iso(at) &&
            // Waiting on the guest before's own answer: theirs, not on this list.
            !waitsOnEarlierGuestInApp(request.because, request.awaitsEarlierGuestAnswer),
        )
        // The server's order: those with a deadline, soonest deadline first,
        // then those with none, by start.
        .sort((a, b) => {
          if (a.approvalExpiresAtUtc !== null && b.approvalExpiresAtUtc !== null) {
            return (
              a.approvalExpiresAtUtc.localeCompare(b.approvalExpiresAtUtc) ||
              a.startUtc.localeCompare(b.startUtc)
            );
          }
          if (a.approvalExpiresAtUtc !== null) return -1;
          if (b.approvalExpiresAtUtc !== null) return 1;
          return a.startUtc.localeCompare(b.startUtc);
        })
        .map((request): AwaitingApproval => {
          const table = plan.tables.find((candidate) => candidate.id === request.tableId);
          const state = tables.get(request.tableId);
          return {
            id: request.id,
            code: request.code,
            branchId: ctx.branchId,
            guestName: request.guestName,
            guestPhone: request.guestPhone,
            partySize: request.partySize,
            tableId: request.tableId,
            tableLabel: label(request.tableId),
            roomName: table?.floorAreaName ?? null,
            startUtc: request.startUtc,
            ...localDateAndTime(request.startUtc, plan.timeZoneId),
            timeZoneId: plan.timeZoneId,
            note: request.note,
            phoneUnverified: request.phoneUnverified === true,
            guestRecord: request.guestRecord ?? null,
            approvalExpiresAtUtc: request.approvalExpiresAtUtc,
            because: request.because,
            promisedFreeByUtc: request.promisedFreeByUtc ?? null,
            earlierGuestFreeByUtc: request.earlierGuestFreeByUtc ?? null,
            previousBooking: request.previousBooking,
            nextBooking: request.nextBooking,
            currentSitting:
              state?.physicalStatus === 'occupied' && state.seatedAtUtc
                ? { sinceUtc: state.seatedAtUtc, partySize: state.partySize }
                : null,
          };
        });
      return settle(listed);
    },

    async approveReservation(command): Promise<ConsoleBooking> {
      return settle(decideAwaiting(command, true));
    },

    async rejectReservation(command): Promise<ConsoleBooking> {
      return settle(decideAwaiting(command, false));
    },
  };
}
