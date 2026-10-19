import { describe, expect, it } from 'vitest';
import { ReviewHiddenNoReplyError } from '../contracts/errors';
import { MAX_REVIEW_REPLY } from '../contracts/reviews';
import { ForbiddenError, NotFoundError, ValidationError } from '../errors';
import type { YallaGateway } from '../gateway';
import { SEEDED_ACCOUNT } from './accounts';
import { createConsoleMockGateway } from './consoleMock';
import { createMockGateway } from './mockGateway';
import { createMockReviewStore } from './reviewStore';

/**
 * The venue's reply under a review, in the mock (VC4 wire §1): one per
 * review, signed by whoever last wrote it, refused on a hidden review and to
 * the platform; shown on the public reviews; and the reviewer told once, in
 * the diner feed, of the first reply only.
 */

const CASCADE = 'b-lumen-cascade';
const NORTH = 'b-lumen-north';

async function caught(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => null,
    (error: unknown) => error,
  );
}

async function signInSeeded(gateway: YallaGateway): Promise<void> {
  await gateway.loginDiner({
    identifier: SEEDED_ACCOUNT.username,
    password: SEEDED_ACCOUNT.password,
  });
  const challenge = await gateway.requestPhoneCode(SEEDED_ACCOUNT.phoneE164);
  await gateway.verifyPhoneCode({ challengeId: challenge.challengeId, code: challenge.devCode! });
}

describe('a reply from the venue', () => {
  it('is written once and signed by its writer; an edit keeps it one reply, marked edited', async () => {
    const owner = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    const written = await owner.replyToReview(NORTH, 'review-seed-1', '  Thank you!  ');
    expect(written.reply).toMatchObject({ text: 'Thank you!', authorRole: 'owner', edited: false });
    expect(written.reply?.authorName).toBeTruthy();

    const edited = await owner.replyToReview(NORTH, 'review-seed-1', 'Thank you, Lilit!');
    expect(edited.reply).toMatchObject({ text: 'Thank you, Lilit!', edited: true });
    expect(edited.reply?.createdAtUtc).toBe(written.reply?.createdAtUtc);

    const listed = await owner.listVenueBranchReviews(NORTH);
    expect(listed.items.find((review) => review.reviewId === 'review-seed-1')?.reply?.text).toBe(
      'Thank you, Lilit!',
    );
  });

  it('is signed by the role that wrote it', async () => {
    const manager = createConsoleMockGateway({ latencyMs: 0, role: 'generalManager' });
    const written = await manager.replyToReview(NORTH, 'review-seed-1', 'Thank you.');
    expect(written.reply?.authorRole).toBe('generalManager');
  });

  it('can be taken down, and taking down nothing is not an error', async () => {
    const owner = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    await owner.replyToReview(NORTH, 'review-seed-1', 'Thank you.');
    expect((await owner.removeReviewReply(NORTH, 'review-seed-1')).reply).toBeNull();
    expect((await owner.removeReviewReply(NORTH, 'review-seed-1')).reply).toBeNull();
  });

  it('is refused on a hidden review, empty, too long, to the platform, and for another branch', async () => {
    const owner = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    // Hidden by Yalla.
    expect(await caught(owner.replyToReview(CASCADE, 'review-seed-4', 'Sorry.'))).toBeInstanceOf(
      ReviewHiddenNoReplyError,
    );
    const blank = await caught(owner.replyToReview(NORTH, 'review-seed-1', '   '));
    expect(blank).toBeInstanceOf(ValidationError);
    expect((blank as ValidationError).violations[0]).toMatchObject({
      field: 'text',
      bound: 'required',
    });
    const long = await caught(
      owner.replyToReview(NORTH, 'review-seed-1', 'x'.repeat(MAX_REVIEW_REPLY + 1)),
    );
    expect((long as ValidationError).violations[0]).toMatchObject({ field: 'text', bound: 'max' });
    expect(await caught(owner.replyToReview(CASCADE, 'review-seed-1', 'Hi.'))).toBeInstanceOf(
      NotFoundError,
    );

    const admin = createConsoleMockGateway({ latencyMs: 0, role: 'platformAdmin' });
    expect(await caught(admin.replyToReview(NORTH, 'review-seed-1', 'Hi.'))).toBeInstanceOf(
      ForbiddenError,
    );
  });
});

describe("the branch's review summary", () => {
  it('counts the whole branch whatever the filter, and averages the visible ones', async () => {
    const owner = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    const page = await owner.listVenueBranchReviews(NORTH, { filter: 'hidden', pageSize: 1 });
    expect(page.summary).toMatchObject({ all: 3, reported: 1, hidden: 1, visible: 2 });
    // 5 and 2 — the hidden 1 left out.
    expect(page.summary?.rating).toBe(3.5);
    expect(page.summary?.distribution).toEqual([
      { stars: 5, count: 1 },
      { stars: 4, count: 0 },
      { stars: 3, count: 0 },
      { stars: 2, count: 1 },
      { stars: 1, count: 0 },
    ]);
  });

  it('names who at the venue hid a review', async () => {
    const owner = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    const hidden = await owner.setVenueReviewVisibility(NORTH, 'review-seed-1', {
      hidden: true,
      reason: 'Spam.',
    });
    expect(hidden.hiddenByName).toBeTruthy();
    expect(hidden.hiddenByPlatform).toBe(false);
    const yalla = (await owner.listVenueBranchReviews(CASCADE, { filter: 'hidden' })).items.find(
      (review) => review.reviewId === 'review-seed-4',
    );
    expect(yalla?.hiddenByName).toBeNull();
  });
});

describe('the reviewer', () => {
  it('reads the reply under the review, and is told of the first reply once', async () => {
    const reviews = createMockReviewStore();
    const diner = createMockGateway({ reviews });
    const owner = createConsoleMockGateway({ latencyMs: 0, role: 'owner', reviews });
    await signInSeeded(diner);
    const mine = await diner.saveMyBranchReview({ branchId: NORTH, rating: 4, text: 'Nice.' });

    await owner.replyToReview(NORTH, mine.reviewId, 'Thank you!');
    await owner.replyToReview(NORTH, mine.reviewId, 'Thank you, come again!');

    const page = await diner.getBranchReviews({ branchId: NORTH });
    expect(page?.reviews.find((review) => review.reviewId === mine.reviewId)?.reply?.text).toBe(
      'Thank you, come again!',
    );
    expect((await diner.getMyBranchReview(NORTH))?.reply?.text).toBe('Thank you, come again!');
    const replied = (await diner.listNotifications()).items.filter(
      (row) => row.kind === 'review-replied',
    );
    expect(replied.map((row) => row.params['reviewId'])).toEqual([mine.reviewId]);
  });

  it('loses the unread notice when the reply is taken back', async () => {
    const reviews = createMockReviewStore();
    const diner = createMockGateway({ reviews });
    const owner = createConsoleMockGateway({ latencyMs: 0, role: 'owner', reviews });
    await signInSeeded(diner);
    const mine = await diner.saveMyBranchReview({ branchId: NORTH, rating: 4, text: 'Nice.' });

    await owner.replyToReview(NORTH, mine.reviewId, 'Thank you!');
    expect(await diner.getUnreadNotificationCount()).toBe(1);
    await owner.removeReviewReply(NORTH, mine.reviewId);
    expect(
      (await diner.listNotifications()).items.filter((row) => row.kind === 'review-replied'),
    ).toEqual([]);
  });
});
