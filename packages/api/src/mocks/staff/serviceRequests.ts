import type { ServiceRequest, AcknowledgeServiceRequestCommand } from '../../contracts/ordering';
import { NotFoundError } from '../../errors';
import type { ClaimServiceRequestCommand } from '../../contracts/activity';
import type { StaffGateway } from '../../staffGateway';
import { type StaffMockContext, iso } from './context';

/** Calls from tables: listing, answering, claiming. */
export function serviceRequestsMethods(
  ctx: StaffMockContext,
): Pick<StaffGateway, 'listServiceRequests' | 'acknowledgeServiceRequest' | 'claimServiceRequest'> {
  const { me, now, requireSession, serviceRequests, settle } = ctx;
  return {
    async listServiceRequests(): Promise<readonly ServiceRequest[]> {
      const at = now();
      return settle(
        [...serviceRequests.values()]
          .filter((request) => request.acknowledgedAtUtc === null)
          .sort((a, b) => a.requestedAtUtc.localeCompare(b.requestedAtUtc))
          .map((request) => ({
            ...request,
            waitingMinutes: Math.max(
              0,
              Math.floor((at.getTime() - new Date(request.requestedAtUtc).getTime()) / 60_000),
            ),
          })),
      );
    },

    async acknowledgeServiceRequest(
      command: AcknowledgeServiceRequestCommand,
    ): Promise<ServiceRequest> {
      requireSession(`/api/service-requests/${command.requestId}/acknowledge`);
      const request = serviceRequests.get(command.requestId);
      if (!request) {
        throw new NotFoundError({ url: `/api/service-requests/${command.requestId}` });
      }
      const acknowledged = { ...request, acknowledgedAtUtc: iso(now()) };
      serviceRequests.set(request.id, acknowledged);
      return settle(acknowledged);
    },

    async claimServiceRequest(command: ClaimServiceRequestCommand): Promise<ServiceRequest> {
      const url = `/api/branches/${command.branchId}/calls/${command.requestId}/claim`;
      requireSession(url);
      const request = serviceRequests.get(command.requestId);
      if (!request) throw new NotFoundError({ url });
      // The first claim wins; a second answers the call as it stands.
      if (request.claimedByName) return settle(request);
      const who = me();
      const claimed: ServiceRequest = {
        ...request,
        claimedByStaffMemberId: who.id,
        claimedByName: who.name,
        claimedAtUtc: iso(now()),
      };
      serviceRequests.set(request.id, claimed);
      return settle(claimed);
    },
  };
}
