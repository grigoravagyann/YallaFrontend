import type { ConsoleGateway } from '../../consoleGateway';
import type { WeeklyHours } from '../../contracts/branchSettings';
import { OverlappingHoursError } from '../../contracts/errors';
import { ApiError } from '../../errors';
import type { components } from '../../generated/schema';
import {
  hoursBlocks,
  overlappingDaysFromMessage,
  specialDaysListFromWire,
  specialDaysSavedFromWire,
  specialDaysToWire,
  weeklyHours,
} from '../venueSettingsMapping';
import { type ConsoleHttpContext, BRANCHES } from './context';

type Schemas = components['schemas'];
type WireHours = Schemas['Yalla.Application.BranchSettings.OpeningHoursView'];
type WireSpecialDays = Schemas['Yalla.Application.BranchSettings.SpecialOpeningDaysView'];
type WireSpecialDaysResult =
  Schemas['Yalla.Application.BranchSettings.SpecialOpeningDaysChangeResult'];

export function hoursMethods(
  ctx: ConsoleHttpContext,
): Pick<
  ConsoleGateway,
  'getOpeningHours' | 'replaceOpeningHours' | 'getSpecialDays' | 'replaceSpecialDays'
> {
  const { client } = ctx;
  return {
    // --- Opening hours ------------------------------------------------------------

    async getOpeningHours(branchId: string): Promise<WeeklyHours> {
      const { data } = await client.get<WireHours[]>(`${BRANCHES}/${branchId}/opening-hours`);
      return weeklyHours(data ?? []);
    },

    async replaceOpeningHours({ branchId, week }): Promise<WeeklyHours> {
      try {
        const { data } = await client.put<WireHours[]>(
          `${BRANCHES}/${branchId}/opening-hours`,
          hoursBlocks(week),
        );
        return weeklyHours(data ?? []);
      } catch (error) {
        if (error instanceof ApiError && error.status === 400) {
          const detail = error.problem?.detail ?? error.message;
          throw new OverlappingHoursError({
            url: error.url,
            days: overlappingDaysFromMessage(detail),
            detail,
            requestId: error.requestId,
          });
        }
        throw error;
      }
    },

    async getSpecialDays(branchId: string) {
      const { data } = await client.get<WireSpecialDays>(
        `${BRANCHES}/${branchId}/opening-hours/exceptions`,
      );
      return specialDaysListFromWire(data);
    },

    async replaceSpecialDays({ branchId, expectedVersion, days }) {
      // A 409 `concurrent-update` is the client's ConcurrencyConflictError
      // and a 422 `validation-failed` its ValidationError, already.
      const { data } = await client.put<WireSpecialDaysResult>(
        `${BRANCHES}/${branchId}/opening-hours/exceptions`,
        {
          expectedVersion,
          days: specialDaysToWire(days),
        } satisfies Schemas['Yalla.Application.BranchSettings.ReplaceSpecialOpeningDaysCommand'],
      );
      return specialDaysSavedFromWire(data);
    },
  };
}
