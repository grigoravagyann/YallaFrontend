import {
  CannotReportOwnReviewError,
  ReviewNeedsVisitError,
  PhoneNotVerifiedError,
} from '../../contracts/errors';
import { ApiError, ForbiddenError, NotFoundError } from '../../errors';
import type { YallaGateway } from '../../gateway';
import type { components } from '../../generated/schema';
import type {
  BranchDetail,
  BranchListing,
  BranchReviewPage,
  BranchRooms,
  MyBranchReview,
} from '../../contracts/places';
import {
  branchDetailFromWire,
  branchListingFromWire,
  myReviewFromWire,
  reviewPageFromWire,
  branchRoomsFromWire,
  type WireBranchDetail,
  type WireBranchListing,
  type WireDinerReview,
  type WireReviewPage,
  type WireRooms,
} from '../placesMapping';
import { ProblemCodes } from '../../generated/problemCodes';
import { type DinerHttpContext, branchQuery, noteOrNull } from './context';

type Schemas = components['schemas'];

export function branchesMethods(
  ctx: DinerHttpContext,
): Pick<
  YallaGateway,
  | 'listBranches'
  | 'searchBranches'
  | 'getBranchDetail'
  | 'getBranchReviews'
  | 'getBranchRooms'
  | 'getMyBranchReview'
  | 'saveMyBranchReview'
  | 'reportReview'
> {
  const { client } = ctx;
  return {
    // --- Places ---------------------------------------------------------------
    //
    // All anonymous reads except the diner's own review. Photo links arrive
    // root-relative and leave absolute, resolved against this client's origin.

    async listBranches(query): Promise<readonly BranchListing[]> {
      const { data } = await client.get<WireBranchListing[]>('/api/public/branches', {
        skipAuth: true,
        query: branchQuery(query),
      });
      return (data ?? []).map((wire) => branchListingFromWire(wire, client.baseUrl));
    },

    async searchBranches(query): Promise<readonly BranchListing[]> {
      const { data } = await client.get<WireBranchListing[]>('/api/public/branches/search', {
        skipAuth: true,
        query: branchQuery(query),
      });
      return (data ?? []).map((wire) => branchListingFromWire(wire, client.baseUrl));
    },

    async getBranchDetail(branchId, position): Promise<BranchDetail | null> {
      try {
        const { data } = await client.get<WireBranchDetail>(
          `/api/public/branches/${encodeURIComponent(branchId)}`,
          { skipAuth: true, query: branchQuery({ position }) },
        );
        return branchDetailFromWire(data, client.baseUrl);
      } catch (error) {
        if (error instanceof NotFoundError) return null;
        throw error;
      }
    },

    async getBranchReviews({ branchId, page }): Promise<BranchReviewPage | null> {
      try {
        const { data } = await client.get<WireReviewPage>(
          `/api/public/branches/${encodeURIComponent(branchId)}/reviews`,
          { skipAuth: true, query: { page: page ?? 1 } },
        );
        return reviewPageFromWire(data);
      } catch (error) {
        if (error instanceof NotFoundError) return null;
        throw error;
      }
    },

    async getBranchRooms(branchId): Promise<BranchRooms | null> {
      try {
        const { data } = await client.get<WireRooms>(
          `/api/public/branches/${encodeURIComponent(branchId)}/rooms`,
          { skipAuth: true },
        );
        return branchRoomsFromWire(data, client.baseUrl);
      } catch (error) {
        if (error instanceof NotFoundError) return null;
        throw error;
      }
    },

    /** `GET /api/diner/branches/{id}/review`. A 404 is "not written yet". */
    async getMyBranchReview(branchId): Promise<MyBranchReview | null> {
      try {
        const { data } = await client.get<WireDinerReview>(
          `/api/diner/branches/${encodeURIComponent(branchId)}/review`,
        );
        return myReviewFromWire(data);
      } catch (error) {
        if (error instanceof NotFoundError) return null;
        throw error;
      }
    },

    /**
     * `PUT /api/diner/branches/{id}/review` — the upsert, so a first review and
     * a revision are one call and a retry after a lost response cannot 409.
     */
    async saveMyBranchReview({ branchId, rating, text }): Promise<MyBranchReview> {
      try {
        const trimmed = typeof text === 'string' ? text.trim() : '';
        const { data } = await client.put<WireDinerReview>(
          `/api/diner/branches/${encodeURIComponent(branchId)}/review`,
          { rating, text: trimmed === '' ? null : trimmed },
        );
        return myReviewFromWire(data);
      } catch (error) {
        if (
          error instanceof ForbiddenError &&
          error.problem?.code === ProblemCodes.PhoneNotVerified
        ) {
          throw new PhoneNotVerifiedError({ url: error.url, requestId: error.requestId });
        }
        if (
          error instanceof ForbiddenError &&
          error.problem?.code === ProblemCodes.ReviewNeedsVisit
        ) {
          throw new ReviewNeedsVisitError({ url: error.url, requestId: error.requestId });
        }
        throw error;
      }
    },

    /**
     * `POST /api/diner/reviews/{reviewId}/report`. The one 409 the route has is
     * the diner's own review; a repeat report answers 204 like the first.
     */
    async reportReview({ reviewId, reason, note }): Promise<void> {
      try {
        await client.post(`/api/diner/reviews/${encodeURIComponent(reviewId)}/report`, {
          reason,
          note: noteOrNull(note),
        } satisfies Schemas['Yalla.Application.Diners.ReportReviewCommand']);
      } catch (error) {
        if (error instanceof ApiError && error.status === 409) {
          throw new CannotReportOwnReviewError({ url: error.url, requestId: error.requestId });
        }
        throw error;
      }
    },
  };
}
