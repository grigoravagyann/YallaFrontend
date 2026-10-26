import type { TabAwaitingAdmission } from '../../contracts/admission';
import { admissionRefusal, tabAwaitingAdmissionFromWire } from '../admissionMapping';
import type { StaffTab } from '../../contracts/ordering';
import type { components } from '../../generated/schema';
import type { StaffGateway } from '../../staffGateway';
import { staffTabFromView } from '../staffMapping';
import type { StaffHttpContext } from './context';

type Schemas = components['schemas'];

export function admissionMethods(
  ctx: StaffHttpContext,
): Pick<StaffGateway, 'listTabsAwaitingAdmission' | 'admitTab' | 'rejectTab'> {
  const { client } = ctx;
  return {
    // --- Tables waiting to be let in ---------------------------------------

    async listTabsAwaitingAdmission(branchId): Promise<readonly TabAwaitingAdmission[]> {
      // Oldest first, as the server orders it; kept as sent.
      const { data } = await client.get<
        Schemas['Yalla.Application.Tabs.TabAwaitingAdmissionView'][]
      >(`/api/branches/${branchId}/tabs/awaiting-admission`);
      return (data ?? []).map(tabAwaitingAdmissionFromWire);
    },

    async admitTab({ tabId, clientCommandId }): Promise<StaffTab> {
      try {
        const { data } = await client.post<Schemas['Yalla.Application.Tabs.TabStaffView']>(
          `/api/tabs/${tabId}/admit`,
          { clientCommandId },
        );
        return staffTabFromView(data, client.baseUrl);
      } catch (error) {
        throw admissionRefusal(error, tabId) ?? error;
      }
    },

    async rejectTab({ tabId, clientCommandId, reason }): Promise<StaffTab> {
      try {
        const { data } = await client.post<Schemas['Yalla.Application.Tabs.TabStaffView']>(
          `/api/tabs/${tabId}/reject`,
          { clientCommandId, reason: reason?.trim() ? reason.trim() : null },
        );
        return staffTabFromView(data, client.baseUrl);
      } catch (error) {
        // `table-state-conflict` passes through as the client's own
        // `ConcurrencyConflictError`: the floor is read again either way.
        throw admissionRefusal(error, tabId) ?? error;
      }
    },
  };
}
