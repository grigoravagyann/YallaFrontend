import type { BranchDetail, BranchReviewPage, BranchRooms } from '../../contracts/places';
import { publicBranchFixtures, publicVenueFixtures } from '../publicVenues';
import { publicRooms } from '../roomFloors';
import { invalidRequest, validationFailed } from '../problems';
import { NotFoundError, ValidationError } from '../../errors';
import { parseProblem } from '../../problem';
import { ReviewNeedsVisitError, CannotReportOwnReviewError } from '../../contracts/errors';
import { REVIEW_REPORT_REASONS, MAX_MODERATION_TEXT } from '../../contracts/reviews';
import { type DinerMockContext, URL_TAG, type MockGateway } from './context';

/** Browsing branches: search, detail, reviews, rooms, the diner's own review. */
export function branchesMethods(
  ctx: DinerMockContext,
): Pick<
  MockGateway,
  | 'listBranches'
  | 'searchBranches'
  | 'getBranchDetail'
  | 'getBranchReviews'
  | 'getBranchRooms'
  | 'getMyBranchReview'
  | 'saveMyBranchReview'
  | 'reportReview'
> {
  const {
    acceptsAppBookings,
    accounts,
    findBranch,
    floors,
    hasVisit,
    listingExtras,
    listingFor,
    listings,
    me,
    now,
    requireVerifiedPhone,
    reviewStore,
    reviewUrl,
    starCounts,
    takeaway,
    toMyReview,
    toPublicReview,
    wait,
  } = ctx;
  return {
    async listBranches(query) {
      await wait();
      return listings(query);
    },

    async searchBranches(query) {
      await wait();
      return listings(query);
    },

    async getBranchDetail(branchId, position): Promise<BranchDetail | null> {
      await wait();
      const found = findBranch(branchId);
      const listing = found ? listingFor(found.venue, found.branch, position) : null;
      const fixture = publicBranchFixtures[branchId];
      if (!listing || !fixture) return null;
      const extras = listingExtras(branchId);
      return {
        listing,
        about: extras?.about ?? publicVenueFixtures[listing.venueId]?.description ?? null,
        websiteUrl: extras?.websiteUrl ?? null,
        phoneE164: fixture.phoneE164,
        amenities: extras?.amenities ?? [],
        specialDays: [],
        openingHours: fixture.weeklyHours.flatMap((entry) =>
          entry.blocks.map((block) => ({
            day: entry.day,
            opensAt: block.opensAt,
            closesAt: block.closesAt,
            closesNextDay: block.closesAt <= block.opensAt,
          })),
        ),
        gallery: extras?.gallery ?? [],
        tableCount: floors.get(branchId)?.tables.length ?? 0,
        acceptsWebBookings: fixture.acceptsWebBookings,
        acceptsAppBookings: acceptsAppBookings(branchId),
        // The mock's branches all choose tables.
        bookingMode: 'chooseTable',
        // Newest first written, hidden reviews left out (K8).
        recentReviews: reviewStore.visible(branchId).slice(0, 3).map(toPublicReview),
        ratingCounts: starCounts(reviewStore.visible(branchId)),
        // The same rooms `getBranchRooms` serves, with live pins.
        rooms: found ? publicRooms(found.branch.rooms, floors.get(branchId)?.tables ?? []) : [],
        // Takeaway (2026-10-22): the button and the info card.
        takeaway: takeaway.publicInfo(branchId),
        asOfUtc: now().toISOString(),
      };
    },

    async getBranchReviews({ branchId, page = 1 }): Promise<BranchReviewPage | null> {
      await wait();
      const url = `${URL_TAG}/api/public/branches/${branchId}/reviews`;
      if (!Number.isInteger(page) || page < 1) {
        throw invalidRequest(url, 'page', 'The page is 1 or more.');
      }
      if (!findBranch(branchId)) return null;
      const visible = reviewStore.visible(branchId);
      const pageSize = 20;
      const count = visible.length;
      return {
        branchId,
        rating:
          count > 0
            ? Math.round((visible.reduce((s, r) => s + r.rating, 0) / count) * 10) / 10
            : null,
        reviewCount: count,
        page,
        pageSize,
        reviews: visible.slice((page - 1) * pageSize, page * pageSize).map(toPublicReview),
        ratingCounts: starCounts(visible),
      };
    },

    async getBranchRooms(branchId): Promise<BranchRooms | null> {
      await wait();
      const found = findBranch(branchId);
      if (!found) return null;
      return {
        branchId,
        asOfUtc: now().toISOString(),
        rooms: publicRooms(found.branch.rooms, floors.get(branchId)?.tables ?? []),
      };
    },

    async getMyBranchReview(branchId) {
      await wait();
      // Asked first, so a stranger is refused even for a branch nobody reviewed.
      const accountId = me();
      const review = reviewStore.mine(branchId, accountId);
      return review ? toMyReview(review) : null;
    },

    async saveMyBranchReview({ branchId, rating, text }) {
      await wait();
      const accountId = me();
      requireVerifiedPhone(reviewUrl(branchId));
      if (!findBranch(branchId)) throw new NotFoundError({ url: reviewUrl(branchId) });
      const trimmed = typeof text === 'string' ? text.trim() : '';
      if (!Number.isInteger(rating) || rating < 1 || rating > 5 || trimmed.length > 1000) {
        throw new ValidationError({
          url: reviewUrl(branchId),
          status: 422,
          problem: parseProblem({
            type: 'validation-failed',
            title: 'Validation failed',
            status: 422,
            code: 'validation-failed',
            context: {
              fields: [
                ...(Number.isInteger(rating) && rating >= 1 && rating <= 5
                  ? []
                  : [
                      {
                        field: 'rating',
                        message: 'Rating must be 1 to 5.',
                        bound: 'range',
                        min: 1,
                        max: 5,
                      },
                    ]),
                ...(trimmed.length > 1000
                  ? [
                      {
                        field: 'text',
                        message: 'At most 1000 characters.',
                        bound: 'max',
                        max: 1000,
                      },
                    ]
                  : []),
              ],
            },
          }),
        });
      }
      // K8: a first review needs a visit; revising one never does.
      if (!reviewStore.mine(branchId, accountId) && !hasVisit(accountId, branchId)) {
        throw new ReviewNeedsVisitError({ url: reviewUrl(branchId) });
      }
      // The same stars and text again change nothing, `updatedAtUtc` included.
      const saved = reviewStore.save({
        branchId,
        dinerUserId: accountId,
        displayName: accounts.profile(accountId)?.displayName ?? null,
        rating,
        text: trimmed === '' ? null : trimmed,
        atUtc: now().toISOString(),
      });
      return toMyReview(saved);
    },

    /**
     * The server's order: the body is validated, then the review is looked up
     * (a hidden one is as good as absent), then the diner's own is refused. A
     * second report by the same diner is accepted and changes nothing.
     */
    async reportReview({ reviewId, reason, note }) {
      await wait();
      const url = `${URL_TAG}/api/diner/reviews/${reviewId}/report`;
      const accountId = me();
      const trimmed = typeof note === 'string' ? note.trim() : '';
      const fields = [
        ...((REVIEW_REPORT_REASONS as readonly string[]).includes(reason)
          ? []
          : [{ field: 'reason', message: `Known reasons: ${REVIEW_REPORT_REASONS.join(', ')}.` }]),
        ...(trimmed.length > MAX_MODERATION_TEXT
          ? [
              {
                field: 'note',
                message: `At most ${MAX_MODERATION_TEXT} characters.`,
                bound: 'max',
                max: MAX_MODERATION_TEXT,
              },
            ]
          : []),
      ];
      if (fields.length > 0) throw validationFailed(url, fields);

      const review = reviewStore.find(reviewId);
      if (!review || review.hidden) throw new NotFoundError({ url });
      if (review.dinerUserId === accountId) throw new CannotReportOwnReviewError({ url });

      reviewStore.report({
        reviewId,
        dinerUserId: accountId,
        reason,
        note: trimmed === '' ? null : trimmed,
        createdAtUtc: now().toISOString(),
      });
    },
  };
}
