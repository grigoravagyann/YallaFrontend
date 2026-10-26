import type { PreOrderSettings } from '../../contracts/preOrder';
import {
  preOrderSettingsBody,
  preOrderSettingsFromWire,
  type WirePreOrderSettings,
} from '../preOrderMapping';
import type { ConsoleGateway } from '../../consoleGateway';
import { type ConsoleHttpContext, BRANCHES } from './context';

export function preOrdersMethods(
  ctx: ConsoleHttpContext,
): Pick<ConsoleGateway, 'getPreOrderSettings' | 'savePreOrderSettings'> {
  const { client } = ctx;
  return {
    // --- Pre-orders (2026-10-21) ----------------------------------------------

    async getPreOrderSettings(branchId: string): Promise<PreOrderSettings> {
      const { data } = await client.get<WirePreOrderSettings>(
        `${BRANCHES}/${branchId}/pre-order-settings`,
      );
      return preOrderSettingsFromWire(data);
    },

    async savePreOrderSettings({ branchId, settings }): Promise<PreOrderSettings> {
      // A `422 validation-failed` naming `minutesBefore` or
      // `excludedMenuItemIds` stays the client's `ValidationError`.
      const { data } = await client.put<WirePreOrderSettings>(
        `${BRANCHES}/${branchId}/pre-order-settings`,
        preOrderSettingsBody(settings),
      );
      return preOrderSettingsFromWire(data);
    },
  };
}
