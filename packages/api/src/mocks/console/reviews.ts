import { ForbiddenError, NotFoundError } from '../../errors';
import { validationFailed } from '../problems';
import { MAX_REVIEW_REPLY } from '../../contracts/reviews';
import { ReviewHiddenNoReplyError, ReviewHiddenByPlatformError } from '../../contracts/errors';
import type { ConsoleGateway } from '../../consoleGateway';
import { type ConsoleMockContext, URL_TAG } from './context';

/** Review moderation, for the platform and for the venue. */
export function reviewsMethods(
  ctx: ConsoleMockContext,
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
  const {
    branchName,
    currentUser,
    log,
    moderationPage,
    now,
    requireManagerAtBranch,
    reviewStore,
    role,
    toModerated,
    toVenueModerated,
    venueOfBranch,
    venues,
    visibilityReason,
    wait,
  } = ctx;
  return {
    // --- Review moderation ------------------------------------------------------

    async listPlatformBranchReviews(branchId, query = {}) {
      await wait();
      const url = `${URL_TAG}/platform/branches/${branchId}/reviews`;
      if (role !== 'platformAdmin') throw new ForbiddenError({ url });
      if (venueOfBranch(branchId) === null) throw new NotFoundError({ url });
      return moderationPage(url, branchId, query);
    },

    async dismissReviewReports(reviewId) {
      await wait();
      const url = `${URL_TAG}/platform/reviews/${reviewId}/dismiss-reports`;
      if (role !== 'platformAdmin') throw new ForbiddenError({ url });
      const review = reviewStore.find(reviewId);
      if (!review) throw new NotFoundError({ url });
      const open = reviewStore.reports(reviewId).length;
      reviewStore.dismissReports(reviewId);
      const venueId = venueOfBranch(review.branchId);
      // Idempotent, as on the server: nothing to set aside writes nothing.
      if (open > 0)
        log(
          'review.dismiss-reports',
          { type: 'BranchReview', id: reviewId, name: branchName(review.branchId) },
          venueId ? (venues.get(venueId) ?? null) : null,
        );
      return toVenueModerated(review);
    },

    async restoreReviewReports(reviewId) {
      await wait();
      const url = `${URL_TAG}/platform/reviews/${reviewId}/restore-reports`;
      if (role !== 'platformAdmin') throw new ForbiddenError({ url });
      const review = reviewStore.find(reviewId);
      if (!review) throw new NotFoundError({ url });
      reviewStore.restoreReports(reviewId);
      return toVenueModerated(review);
    },

    async removePlatformReviewReply(reviewId) {
      await wait();
      const url = `${URL_TAG}/platform/reviews/${reviewId}/reply`;
      if (role !== 'platformAdmin') throw new ForbiddenError({ url });
      const review = reviewStore.find(reviewId);
      if (!review) throw new NotFoundError({ url });
      // Idempotent, as on the server: no reply writes nothing.
      if (review.reply) {
        reviewStore.removeReply(reviewId);
        const venueId = venueOfBranch(review.branchId);
        log(
          'review.remove-reply',
          { type: 'BranchReview', id: reviewId, name: branchName(review.branchId) },
          venueId ? (venues.get(venueId) ?? null) : null,
        );
      }
      return toVenueModerated(review);
    },

    /** The platform's word is final: it can hide anything, and restore what the venue hid. */
    async setReviewVisibility(reviewId, command) {
      await wait();
      const url = `${URL_TAG}/platform/reviews/${reviewId}/visibility`;
      if (role !== 'platformAdmin') throw new ForbiddenError({ url });
      const reason = visibilityReason(url, command);
      const found = reviewStore.find(reviewId);
      if (!found) throw new NotFoundError({ url });
      const wasHidden = found.hidden;
      const changed = reviewStore.setVisibility({
        reviewId,
        hidden: command.hidden,
        reason,
        by: 'platform',
        atUtc: now().toISOString(),
      });
      const venueId = venueOfBranch(found.branchId);
      if (wasHidden !== command.hidden) {
        log(
          command.hidden ? 'review.hide' : 'review.unhide',
          { type: 'BranchReview', id: reviewId, name: branchName(found.branchId) },
          venueId ? (venues.get(venueId) ?? null) : null,
        );
      }
      return toModerated(changed);
    },

    async listVenueBranchReviews(branchId, query = {}) {
      await wait();
      const url = `${URL_TAG}/branches/${branchId}/reviews`;
      requireManagerAtBranch(branchId, url);
      return moderationPage(url, branchId, query);
    },

    async replyToReview(branchId, reviewId, text) {
      await wait();
      const url = `${URL_TAG}/branches/${branchId}/reviews/${reviewId}/reply`;
      // The venue answers as itself: the platform does not reply for it.
      if (role === 'platformAdmin') throw new ForbiddenError({ url });
      requireManagerAtBranch(branchId, url);
      const trimmed = text.trim();
      if (trimmed === '') {
        throw validationFailed(url, [
          { field: 'text', message: 'Write the reply.', bound: 'required' },
        ]);
      }
      if (trimmed.length > MAX_REVIEW_REPLY) {
        throw validationFailed(url, [
          {
            field: 'text',
            message: `The reply can be at most ${MAX_REVIEW_REPLY} characters.`,
            bound: 'max',
            max: MAX_REVIEW_REPLY,
          },
        ]);
      }
      const review = reviewStore.find(reviewId);
      if (!review || review.branchId !== branchId) throw new NotFoundError({ url });
      if (review.hidden) throw new ReviewHiddenNoReplyError({ url, reviewId });
      const author = currentUser();
      reviewStore.setReply({
        reviewId,
        text: trimmed,
        authorName: author.displayName,
        authorRole: role === 'owner' || role === 'generalManager' ? role : 'manager',
        atUtc: now().toISOString(),
      });
      return toVenueModerated(review);
    },

    async removeReviewReply(branchId, reviewId) {
      await wait();
      const url = `${URL_TAG}/branches/${branchId}/reviews/${reviewId}/reply`;
      if (role === 'platformAdmin') throw new ForbiddenError({ url });
      requireManagerAtBranch(branchId, url);
      const review = reviewStore.find(reviewId);
      if (!review || review.branchId !== branchId) throw new NotFoundError({ url });
      return toVenueModerated(reviewStore.removeReply(reviewId));
    },

    async setVenueReviewVisibility(branchId, reviewId, command) {
      await wait();
      const url = `${URL_TAG}/branches/${branchId}/reviews/${reviewId}/visibility`;
      requireManagerAtBranch(branchId, url);
      const reason = visibilityReason(url, command);
      const review = reviewStore.find(reviewId);
      if (!review || review.branchId !== branchId) throw new NotFoundError({ url });
      if (review.hiddenBy === 'platform') {
        // The platform's takedown outranks the venue's: restoring it is
        // refused, and hiding it again changes nothing.
        if (!command.hidden) throw new ReviewHiddenByPlatformError({ url, reviewId });
        return toVenueModerated(review);
      }
      return toVenueModerated(
        reviewStore.setVisibility({
          reviewId,
          hidden: command.hidden,
          reason,
          by: 'venue',
          byName: currentUser().displayName,
          atUtc: now().toISOString(),
        }),
      );
    },
  };
}
