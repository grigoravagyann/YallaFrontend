import { describe, expect, it } from 'vitest';
import { ForbiddenError, NotFoundError } from '../errors';
import { createConsoleMockGateway } from './consoleMock';

/**
 * The platform's reviews in the mock: the list by filter, reported reviews
 * with their counts, and "Dismiss reports", which clears the reports and
 * leaves the review where it was.
 */

async function caught(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => null,
    (error: unknown) => error,
  );
}

describe("the console mock — the platform's review list", () => {
  it('filters as the venue list does, and says how often each was reported', async () => {
    const admin = createConsoleMockGateway({ latencyMs: 0 });
    const reported = await admin.listPlatformBranchReviews('b-lumen-north', { filter: 'reported' });
    expect(reported.items.length).toBeGreaterThan(0);
    for (const review of reported.items) expect(review.reportCount).toBeGreaterThan(0);

    const hidden = await admin.listPlatformBranchReviews('b-lumen-north', { filter: 'hidden' });
    for (const review of hidden.items) expect(review.hidden).toBe(true);

    const all = await admin.listPlatformBranchReviews('b-lumen-north');
    expect(all.total).toBeGreaterThanOrEqual(reported.total);
  });
});

describe("the console mock — dismissing a review's reports", () => {
  it('clears the reports and keeps the review as it was', async () => {
    const admin = createConsoleMockGateway({ latencyMs: 0 });
    const [first] = (await admin.listPlatformBranchReviews('b-lumen-north', { filter: 'reported' }))
      .items;
    const dismissed = await admin.dismissReviewReports(first!.reviewId);
    expect(dismissed).toMatchObject({
      reviewId: first!.reviewId,
      reportCount: 0,
      lastReportedAtUtc: null,
      hidden: first!.hidden,
    });
    const after = await admin.listPlatformBranchReviews('b-lumen-north', { filter: 'reported' });
    expect(after.items.map((review) => review.reviewId)).not.toContain(first!.reviewId);
  });

  it('is the platform admin’s, and only for a review that exists', async () => {
    const owner = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    expect(await caught(owner.dismissReviewReports('review-seed-1'))).toBeInstanceOf(
      ForbiddenError,
    );
    const admin = createConsoleMockGateway({ latencyMs: 0 });
    expect(await caught(admin.dismissReviewReports('no-such-review'))).toBeInstanceOf(
      NotFoundError,
    );
  });
});
