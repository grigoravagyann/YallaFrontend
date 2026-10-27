import type { ConsoleGateway } from '../../consoleGateway';
import { BranchNotReadyError } from '../../contracts/errors';
import { ApiError } from '../../errors';
import { ProblemCodes } from '../../generated/problemCodes';
import type { components } from '../../generated/schema';
import { problemContext } from '../../problem';
import { branchFeaturesToWire } from '../branchFeatureMapping';
import { venueDetailFromWire } from '../consoleMapping';
import { type ConsoleHttpContext, PLATFORM } from './context';

type Schemas = components['schemas'];

/**
 * `branch-not-ready` names the branch whose menu refused table service — on
 * the venue route, which one of several — and the dishes it lacks. The other
 * refusals (422 `validation-failed` on `features`, the 409 for open tabs or a
 * deleted venue) arrive as the client typed them.
 */
function featuresRefusal(error: unknown, fallbackBranchId: string | null): unknown {
  if (error instanceof ApiError && error.code === ProblemCodes.BranchNotReady) {
    const context = problemContext(error.problem, ProblemCodes.BranchNotReady);
    return new BranchNotReadyError({
      url: error.url,
      requestId: error.requestId,
      branchId: typeof context.branchId === 'string' ? context.branchId : (fallbackBranchId ?? ''),
      incompleteMenuItemCount:
        typeof context.incompleteMenuItemCount === 'number' ? context.incompleteMenuItemCount : 0,
    });
  }
  return error;
}

/** The platform admin's feature switches: one branch, or every branch of a venue at once. */
export function branchFeaturesMethods(
  ctx: ConsoleHttpContext,
): Pick<ConsoleGateway, 'setBranchFeatures' | 'applyVenueFeatures'> {
  const { client, venueDetail, photoLink } = ctx;
  return {
    async setBranchFeatures({ branchId, features }) {
      let venueId: string;
      try {
        const { data } = await client.put<Schemas['Yalla.Application.Platform.BranchSummary']>(
          `${PLATFORM}/branches/${branchId}/features`,
          { features: branchFeaturesToWire(features) },
        );
        venueId = data.venueId;
      } catch (error) {
        throw featuresRefusal(error, branchId);
      }
      // The route answers with the branch, not the venue the console caches:
      // re-read it so the screen replaces rather than patches.
      return venueDetail(`${PLATFORM}/venues/${venueId}`);
    },

    async applyVenueFeatures({ venueId, features }) {
      try {
        const { data } = await client.put<Schemas['Yalla.Application.Platform.VenueDetail']>(
          `${PLATFORM}/venues/${venueId}/features`,
          { features: branchFeaturesToWire(features) },
        );
        return venueDetailFromWire(data, photoLink);
      } catch (error) {
        throw featuresRefusal(error, null);
      }
    },
  };
}
