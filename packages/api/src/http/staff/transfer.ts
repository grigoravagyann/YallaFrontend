import type { TabTransferResult, TabTransferTarget } from '../../contracts/activity';
import {
  tabTransferFromWire,
  transferTargetsFromWire,
  type WireTableTransferResult,
  type WireTransferTableRequest,
  type WireTransferTargetsView,
} from '../activityMapping';
import type { StaffGateway } from '../../staffGateway';
import type { StaffHttpContext } from './context';

export function transferMethods(
  ctx: StaffHttpContext,
): Pick<StaffGateway, 'transferTab' | 'listTransferTargets'> {
  const { client } = ctx;
  return {
    async transferTab(command): Promise<TabTransferResult> {
      const { data } = await client.post<WireTableTransferResult>(
        `/api/tabs/${command.tabId}/transfer`,
        {
          toStaffMemberId: command.toStaffMemberId,
          clientCommandId: command.clientCommandId,
        } satisfies WireTransferTableRequest,
      );
      return tabTransferFromWire(data, command);
    },

    async listTransferTargets(tabId: string): Promise<readonly TabTransferTarget[]> {
      const { data } = await client.get<WireTransferTargetsView>(
        `/api/tabs/${tabId}/transfer-targets`,
      );
      return transferTargetsFromWire(data);
    },
  };
}
