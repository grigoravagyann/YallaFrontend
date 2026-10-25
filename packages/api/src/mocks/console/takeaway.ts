import { type TakeawaySettings, takeawaySettingsViolations } from '../../contracts/takeaway';
import { validationFailed } from '../problems';
import type { ConsoleGateway } from '../../consoleGateway';
import { type ConsoleMockContext, URL_TAG } from './context';

/** The branch's takeaway settings. */
export function takeawayMethods(
  ctx: ConsoleMockContext,
): Pick<ConsoleGateway, 'getTakeawaySettings' | 'saveTakeawaySettings'> {
  const { requireManagerAtBranch, takeawaySettings, takeawaySettingsOf, wait } = ctx;
  return {
    // --- Takeaway (2026-10-22) ------------------------------------------------

    async getTakeawaySettings(branchId): Promise<TakeawaySettings> {
      await wait();
      requireManagerAtBranch(branchId, `${URL_TAG}/branches/${branchId}/takeaway-settings`);
      return takeawaySettingsOf(branchId);
    },

    async saveTakeawaySettings({ branchId, settings }): Promise<TakeawaySettings> {
      await wait();
      const url = `${URL_TAG}/branches/${branchId}/takeaway-settings`;
      requireManagerAtBranch(branchId, url);
      // Every field out of bounds or off its step named, nothing saved.
      const violations = takeawaySettingsViolations(settings);
      if (violations.length > 0) {
        throw validationFailed(
          url,
          violations.map((violation) => ({
            field: violation.field,
            message: violation.message,
            ...(violation.bound !== undefined ? { bound: violation.bound } : {}),
            ...(violation.min !== undefined ? { min: violation.min } : {}),
            ...(violation.max !== undefined ? { max: violation.max } : {}),
          })),
        );
      }
      takeawaySettings.set(branchId, {
        enabled: settings.enabled,
        autoAccept: settings.autoAccept,
        prepMinutes: settings.prepMinutes,
        lastOrderMinutes: settings.lastOrderMinutes,
        maxInProgress: settings.maxInProgress,
      });
      return takeawaySettingsOf(branchId);
    },
  };
}
