import type { TakeawaySettings } from '../../contracts/takeaway';
import {
  takeawaySettingsBody,
  takeawaySettingsFromWire,
  type WireTakeawaySettings,
} from '../takeawayMapping';
import type { ConsoleGateway } from '../../consoleGateway';
import { type ConsoleHttpContext, BRANCHES } from './context';

export function takeawayMethods(
  ctx: ConsoleHttpContext,
): Pick<ConsoleGateway, 'getTakeawaySettings' | 'saveTakeawaySettings'> {
  const { client } = ctx;
  return {
    // --- Takeaway (2026-10-22) ------------------------------------------------

    async getTakeawaySettings(branchId: string): Promise<TakeawaySettings> {
      const { data } = await client.get<WireTakeawaySettings>(
        `${BRANCHES}/${branchId}/takeaway-settings`,
      );
      return takeawaySettingsFromWire(data);
    },

    async saveTakeawaySettings({ branchId, settings }): Promise<TakeawaySettings> {
      // All five, every time. A `422 validation-failed` naming each field out
      // of bounds or off its step stays the client's `ValidationError`.
      const { data } = await client.put<WireTakeawaySettings>(
        `${BRANCHES}/${branchId}/takeaway-settings`,
        takeawaySettingsBody(settings),
      );
      return takeawaySettingsFromWire(data);
    },
  };
}
