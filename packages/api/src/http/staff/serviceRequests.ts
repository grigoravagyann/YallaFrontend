import type { AcknowledgeServiceRequestCommand, ServiceRequest } from '../../contracts/ordering';
import type { components } from '../../generated/schema';
import type { StaffGateway } from '../../staffGateway';
import { serviceRequest } from '../staffMapping';
import type { StaffHttpContext } from './context';

type Schemas = components['schemas'];

export function serviceRequestsMethods(
  ctx: StaffHttpContext,
): Pick<StaffGateway, 'listServiceRequests' | 'acknowledgeServiceRequest' | 'claimServiceRequest'> {
  const { client } = ctx;
  return {
    // --- Service requests ---------------------------------------------------

    async listServiceRequests(branchId): Promise<readonly ServiceRequest[]> {
      const { data } = await client.get<Schemas['Yalla.Application.Ordering.ServiceRequestView'][]>(
        `/api/branches/${branchId}/service-requests`,
      );
      return (data ?? []).map(serviceRequest);
    },

    /**
     * No body: the route takes none. Acknowledging is idempotent on the server
     * (a second tap, or the offline queue sending it again, is a no-op that
     * answers the request as it stands), so `clientCommandId` stays on the
     * client - it is the queue's own key for the command, not the server's.
     */
    async acknowledgeServiceRequest(
      command: AcknowledgeServiceRequestCommand,
    ): Promise<ServiceRequest> {
      const { data } = await client.post<Schemas['Yalla.Application.Ordering.ServiceRequestView']>(
        `/api/service-requests/${command.requestId}/acknowledge`,
      );
      return serviceRequest(data);
    },

    async claimServiceRequest(command): Promise<ServiceRequest> {
      const { data } = await client.post<Schemas['Yalla.Application.Ordering.ServiceRequestView']>(
        `/api/branches/${command.branchId}/calls/${command.requestId}/claim`,
      );
      return serviceRequest(data);
    },
  };
}
