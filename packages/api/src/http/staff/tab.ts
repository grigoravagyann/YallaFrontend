import type { ReassignHostCommand, StaffTab, TabLine } from '../../contracts/ordering';
import { NotFoundError } from '../../errors';
import type { components } from '../../generated/schema';
import type { StaffGateway } from '../../staffGateway';
import { staffTabFromView, tabLinesFromOrders } from '../staffMapping';
import { type StaffHttpContext, rethrow } from './context';

type Schemas = components['schemas'];

export function tabMethods(
  ctx: StaffHttpContext,
): Pick<
  StaffGateway,
  'getStaffTab' | 'getTabLines' | 'openTabForStaff' | 'beginClosing' | 'reassignHost'
> {
  const { client, branchOrders } = ctx;
  return {
    // --- The tab ------------------------------------------------------------

    async getStaffTab(tabId): Promise<StaffTab | null> {
      try {
        const { data } = await client.get<Schemas['Yalla.Application.Tabs.TabStaffView']>(
          `/api/tabs/${tabId}/participants`,
        );
        return staffTabFromView(data, client.baseUrl);
      } catch (error) {
        if (error instanceof NotFoundError) return null;
        throw error;
      }
    },

    async getTabLines({ branchId, tabId }): Promise<readonly TabLine[]> {
      // Outstanding, then the two statuses the default read leaves out. In
      // parallel: three sequential branch reads is a visible pause on a panel a
      // waiter opens mid-conversation.
      const [outstanding, served, voided] = await Promise.all([
        branchOrders(branchId),
        branchOrders(branchId, 'served'),
        branchOrders(branchId, 'voided'),
      ]);
      return tabLinesFromOrders([...outstanding, ...served, ...voided], tabId);
    },

    async openTabForStaff({ branchId, tableId, clientCommandId }): Promise<StaffTab> {
      try {
        const { data } = await client.post<Schemas['Yalla.Application.Tabs.TabStaffView']>(
          `/api/branches/${branchId}/tables/${tableId}/open-tab`,
          { clientCommandId },
        );
        return staffTabFromView(data, client.baseUrl);
      } catch (error) {
        rethrow(error);
      }
    },

    async beginClosing({ tabId, clientCommandId }): Promise<StaffTab> {
      const { data } = await client.post<Schemas['Yalla.Application.Tabs.TabStaffView']>(
        `/api/tabs/${tabId}/closing`,
        { clientCommandId },
      );
      return staffTabFromView(data, client.baseUrl);
    },

    async reassignHost(command: ReassignHostCommand): Promise<StaffTab> {
      const { data } = await client.post<Schemas['Yalla.Application.Tabs.TabStaffView']>(
        `/api/tabs/${command.tabId}/reassign-host`,
        /*
         * `ReassignHostRequest` declares `newHostParticipantId` and nothing
         * else. The `clientCommandId` this used to send was dropped on the floor
         * by the serialiser, so the idempotency it implied was never real.
         */
        { newHostParticipantId: command.newHostParticipantId },
      );
      return staffTabFromView(data, client.baseUrl);
    },
  };
}
