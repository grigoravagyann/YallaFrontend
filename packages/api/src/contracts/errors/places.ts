/**
 * Refusals of a diner's reviews and favourites.
 *
 * Part of `contracts/errors`; import from there (or `@yalla/api`), not from here.
 */
import { ApiError } from '../../errors';
import type { RefusalOptions } from './shared';

/**
 * A first review needs a visit — `review-needs-visit`, 403 (K8).
 *
 * A seated or completed booking at the branch, or a place on one of its tabs,
 * within the last 180 days. Revising a review the diner already wrote is never
 * refused this way.
 */
export class ReviewNeedsVisitError extends ApiError {
  constructor(options: RefusalOptions) {
    super('Reviews are for places you have visited.', { status: 403, ...options });
    this.name = 'ReviewNeedsVisitError';
  }
}

/** A diner reporting their own review — `conflicting-state`, 409 (addendum, K8 extension). */
export class CannotReportOwnReviewError extends ApiError {
  constructor(options: RefusalOptions) {
    super('You cannot report your own review.', { status: 409, ...options });
    this.name = 'CannotReportOwnReviewError';
  }
}

/** The account already has the most favourites it may keep — `conflicting-state`, 409 (K11). */
export class TooManyFavoritesError extends ApiError {
  readonly max: number;

  constructor(options: RefusalOptions & { max: number }) {
    super(`At most ${options.max} places can be saved.`, {
      status: 409,
      url: options.url,
      requestId: options.requestId,
    });
    this.name = 'TooManyFavoritesError';
    this.max = options.max;
  }
}
