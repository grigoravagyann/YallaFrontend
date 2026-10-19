import { describe, expect, it, vi } from 'vitest';
import { createAuthSession } from '../auth/session';
import { createMemoryTokenStorage } from '../auth/storage';
import { ReviewHiddenNoReplyError } from '../contracts/errors';
import { createConsoleHttpGateway, createMemoryIdentityStore } from './consoleHttpGateway';
import { fakeBackend, problemReply, type FakeRoute } from './fakeBackend.testkit';

/**
 * Review replies over HTTP (VC4 wire §1): the reply and who hid a review on
 * the console list, the branch summary beside it, and the reply written,
 * changed and taken down. The API leaves a null property out, so an absent
 * reply, name or rating reads as null.
 */

function gatewayOver(routes: Record<string, FakeRoute>) {
  const backend = fakeBackend(routes);
  const auth = createAuthSession({
    storage: createMemoryTokenStorage('refresh-0'),
    refreshTokens: vi.fn(),
  });
  const gateway = createConsoleHttpGateway(backend.client({ getToken: () => 'held-token' }), {
    auth,
    identity: createMemoryIdentityStore(),
  });
  return { gateway, backend };
}

const REVIEW = {
  reviewId: 'r-1',
  branchId: 'b-1',
  rating: 3,
  text: 'Slow on a Friday.',
  authorName: 'Arthur',
  createdAtUtc: '2026-10-15T18:00:00Z',
  updatedAtUtc: '2026-10-15T18:00:00Z',
  hidden: false,
  hiddenByPlatform: false,
  reportCount: 0,
};

const REPLY = {
  text: 'Thank you, Arthur.',
  authorName: 'Aram Hakobyan',
  authorRole: 1,
  createdAtUtc: '2026-10-16T09:00:00Z',
  updatedAtUtc: '2026-10-16T09:30:00Z',
  edited: true,
};

describe('the console review list', () => {
  it('carries the reply, who hid a review, and the summary of the whole branch', async () => {
    const { gateway } = gatewayOver({
      'GET /api/branches/b-1/reviews': {
        body: {
          items: [
            { ...REVIEW, reply: REPLY },
            {
              ...REVIEW,
              reviewId: 'r-2',
              hidden: true,
              hiddenReason: 'Spam.',
              hiddenAtUtc: '2026-10-13T10:00:00Z',
              hiddenByName: 'Lilit Sargsyan',
            },
          ],
          total: 2,
          page: 1,
          pageSize: 20,
          summary: {
            all: 7,
            reported: 2,
            hidden: 2,
            visible: 5,
            rating: 4.7,
            ratingChange30Days: 0.1,
            distribution: [
              { stars: 5, count: 3 },
              { stars: 3, count: 1 },
              { stars: 1, count: 1 },
            ],
          },
        },
      },
    });

    const page = await gateway.listVenueBranchReviews('b-1');

    expect(page.items[0]?.reply).toEqual({
      text: 'Thank you, Arthur.',
      authorName: 'Aram Hakobyan',
      authorRole: 'owner',
      createdAtUtc: '2026-10-16T09:00:00Z',
      updatedAtUtc: '2026-10-16T09:30:00Z',
      edited: true,
    });
    expect(page.items[0]?.hiddenByName).toBeNull();
    expect(page.items[1]).toMatchObject({ reply: null, hiddenByName: 'Lilit Sargsyan' });
    expect(page.summary).toEqual({
      all: 7,
      reported: 2,
      hidden: 2,
      visible: 5,
      rating: 4.7,
      ratingChange30Days: 0.1,
      distribution: [
        { stars: 5, count: 3 },
        { stars: 4, count: 0 },
        { stars: 3, count: 1 },
        { stars: 2, count: 0 },
        { stars: 1, count: 1 },
      ],
    });
  });

  it('reads an omitted rating and change as null, and a server with no summary as none', async () => {
    const { gateway } = gatewayOver({
      'GET /api/branches/b-1/reviews': {
        body: { items: [], total: 0, page: 1, pageSize: 20, summary: { all: 0, visible: 0 } },
      },
      'GET /api/platform/branches/b-1/reviews': {
        body: { items: [], total: 0, page: 1, pageSize: 20 },
      },
    });
    const venue = await gateway.listVenueBranchReviews('b-1');
    expect(venue.summary).toMatchObject({ rating: null, ratingChange30Days: null });
    expect((await gateway.listPlatformBranchReviews('b-1')).summary).toBeNull();
  });
});

describe('a reply', () => {
  it('is written with a PUT of its text, and taken down with a DELETE', async () => {
    const { gateway, backend } = gatewayOver({
      'PUT /api/branches/b-1/reviews/r-1/reply': { body: { ...REVIEW, reply: REPLY } },
      'DELETE /api/branches/b-1/reviews/r-1/reply': { body: REVIEW },
    });

    const written = await gateway.replyToReview('b-1', 'r-1', 'Thank you, Arthur.');
    expect(backend.requests[0]?.body).toEqual({ text: 'Thank you, Arthur.' });
    expect(written.reply?.text).toBe('Thank you, Arthur.');

    const removed = await gateway.removeReviewReply('b-1', 'r-1');
    expect(backend.requests[1]?.method).toBe('DELETE');
    expect(removed.reply).toBeNull();
  });

  it('on a hidden review is refused as such', async () => {
    const { gateway } = gatewayOver({
      'PUT /api/branches/b-1/reviews/r-1/reply': problemReply(409, 'conflicting-state'),
    });
    await expect(gateway.replyToReview('b-1', 'r-1', 'Hi.')).rejects.toBeInstanceOf(
      ReviewHiddenNoReplyError,
    );
  });
});
