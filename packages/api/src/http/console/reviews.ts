import type { ConsoleGateway } from '../../consoleGateway';
import {
  ReviewHiddenByPlatformError,
  ReviewHiddenNoReplyError,
  isFeatureNotEnabled,
} from '../../contracts/errors';
import { ApiError, ForbiddenError } from '../../errors';
import type { components } from '../../generated/schema';
import {
  moderatedReviewFromWire,
  reviewPageFromWire,
  venueReviewFromWire,
  type WireModeratedReview,
} from '../consoleMapping';
import { type ConsoleHttpContext, PLATFORM, BRANCHES } from './context';

type Schemas = components['schemas'];

/** Both moderation lists page by 20, the public reviews route's size. */
const REVIEW_PAGE_SIZE = 20;

/** `Yalla.Domain.Enums.StaffRole.PlatformAdmin` on the wire. */
const PLATFORM_ADMIN_ROLE_CODE = 5;

/** The role a `StaffPermissionException` 403 says was needed, when it says one. */
function requiredRoleOf(error: ApiError): number | undefined {
  const context = error.problem?.context as { requiredRole?: unknown } | undefined;
  return typeof context?.requiredRole === 'number' ? context.requiredRole : undefined;
}

export function reviewsMethods(
  ctx: ConsoleHttpContext,
): Pick<
  ConsoleGateway,
  | 'listPlatformBranchReviews'
  | 'dismissReviewReports'
  | 'restoreReviewReports'
  | 'removePlatformReviewReply'
  | 'setReviewVisibility'
  | 'listVenueBranchReviews'
  | 'replyToReview'
  | 'removeReviewReply'
  | 'setVenueReviewVisibility'
> {
  const { client } = ctx;
  return {
    // --- Review moderation ------------------------------------------------------

    async listPlatformBranchReviews(branchId, query = {}) {
      const { data } = await client.get<Schemas['Yalla.Application.Reviews.ModeratedReviewPage']>(
        `${PLATFORM}/branches/${branchId}/reviews`,
        {
          query: {
            page: query.page ?? 1,
            pageSize: query.pageSize ?? REVIEW_PAGE_SIZE,
            filter: query.filter ?? 'all',
          },
        },
      );
      return reviewPageFromWire(data);
    },

    async dismissReviewReports(reviewId) {
      const { data } = await client.post<WireModeratedReview>(
        `${PLATFORM}/reviews/${reviewId}/dismiss-reports`,
      );
      return venueReviewFromWire(data);
    },

    async restoreReviewReports(reviewId) {
      const { data } = await client.post<WireModeratedReview>(
        `${PLATFORM}/reviews/${reviewId}/restore-reports`,
      );
      return venueReviewFromWire(data);
    },

    async removePlatformReviewReply(reviewId) {
      const { data } = await client.delete<WireModeratedReview>(
        `${PLATFORM}/reviews/${reviewId}/reply`,
      );
      return venueReviewFromWire(data);
    },

    async setReviewVisibility(reviewId, command) {
      const { data } = await client.put<WireModeratedReview>(
        `${PLATFORM}/reviews/${reviewId}/visibility`,
        { hidden: command.hidden, reason: command.reason },
      );
      return moderatedReviewFromWire(data);
    },

    async listVenueBranchReviews(branchId, query = {}) {
      const { data } = await client.get<Schemas['Yalla.Application.Reviews.ModeratedReviewPage']>(
        `${BRANCHES}/${branchId}/reviews`,
        {
          query: {
            page: query.page ?? 1,
            pageSize: query.pageSize ?? REVIEW_PAGE_SIZE,
            filter: query.filter ?? 'all',
          },
        },
      );
      return reviewPageFromWire(data);
    },

    async replyToReview(branchId, reviewId, text) {
      try {
        const { data } = await client.put<WireModeratedReview>(
          `${BRANCHES}/${branchId}/reviews/${reviewId}/reply`,
          { text },
        );
        return venueReviewFromWire(data);
      } catch (error) {
        if (!isFeatureNotEnabled(error) && error instanceof ApiError && error.status === 409) {
          throw new ReviewHiddenNoReplyError({
            url: error.url,
            requestId: error.requestId,
            reviewId,
          });
        }
        throw error;
      }
    },

    async removeReviewReply(branchId, reviewId) {
      const { data } = await client.delete<WireModeratedReview>(
        `${BRANCHES}/${branchId}/reviews/${reviewId}/reply`,
      );
      return venueReviewFromWire(data);
    },

    async setVenueReviewVisibility(branchId, reviewId, command) {
      try {
        const { data } = await client.put<WireModeratedReview>(
          `${BRANCHES}/${branchId}/reviews/${reviewId}/visibility`,
          { hidden: command.hidden, reason: command.reason },
        );
        return venueReviewFromWire(data);
      } catch (error) {
        /*
         * Restoring a review the platform hid is refused with a 403 whose
         * `context.requiredRole` is PlatformAdmin. Other 403s on the same route
         * name another role, e.g. Manager, when the staff guard finds this person
         * moved, demoted or deactivated after the token was issued. Those stay a
         * `ForbiddenError`, as does any 403 on a hide.
         */
        if (
          error instanceof ForbiddenError &&
          !command.hidden &&
          requiredRoleOf(error) === PLATFORM_ADMIN_ROLE_CODE
        ) {
          throw new ReviewHiddenByPlatformError({
            url: error.url,
            requestId: error.requestId,
            reviewId,
          });
        }
        throw error;
      }
    },
  };
}
