import { describe, expect, it, vi } from 'vitest';
import { createAuthSession } from '../auth/session';
import { createMemoryTokenStorage } from '../auth/storage';
import { createConsoleHttpGateway, createMemoryIdentityStore } from './consoleHttpGateway';
import { fakeBackend, type FakeRoute } from './fakeBackend.testkit';

/**
 * The platform's reviews page (Reviews artboard) over HTTP: the list by
 * filter with how often each review was reported, and "Dismiss reports" —
 * `POST /api/platform/reviews/{id}/dismiss-reports`, being built with the
 * console redesign.
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
  reviewId: 'rv-1',
  branchId: 'b-1',
  rating: 1,
  text: 'Call my manager.',
  authorName: 'Anna P.',
  dinerUserId: 'd-1',
  createdAtUtc: '2026-10-18T09:00:00Z',
  updatedAtUtc: '2026-10-18T09:00:00Z',
  hidden: false,
  hiddenByPlatform: false,
  reportCount: 3,
  lastReportedAtUtc: '2026-10-18T10:00:00Z',
};

describe("the platform's review list over HTTP", () => {
  it('asks for one filter and reads how often each review was reported', async () => {
    const { gateway, backend } = gatewayOver({
      'GET /api/platform/branches/b-1/reviews': {
        body: {
          items: [REVIEW],
          page: 1,
          pageSize: 20,
          total: 1,
          summary: {
            all: 1,
            reported: 1,
            hidden: 0,
            visible: 1,
            rating: 1,
            ratingChange30Days: null,
            distribution: [5, 4, 3, 2, 1].map((stars) => ({ stars, count: stars === 1 ? 1 : 0 })),
          },
        },
      },
    });
    const page = await gateway.listPlatformBranchReviews('b-1', { filter: 'reported' });
    expect(backend.requests[0]?.query.get('filter')).toBe('reported');
    expect(page.items[0]).toMatchObject({
      reportCount: 3,
      lastReportedAtUtc: REVIEW.lastReportedAtUtc,
    });
  });
});

describe('dismissing the reports on a review over HTTP', () => {
  it('posts the dismiss route and answers with the review, reports cleared', async () => {
    const { gateway, backend } = gatewayOver({
      'POST /api/platform/reviews/rv-1/dismiss-reports': {
        body: { ...REVIEW, reportCount: 0, lastReportedAtUtc: null },
      },
    });
    const review = await gateway.dismissReviewReports('rv-1');
    expect(backend.requests[0]?.method).toBe('POST');
    expect(backend.requests[0]?.body).toBeUndefined();
    expect(review).toMatchObject({ reviewId: 'rv-1', reportCount: 0, hidden: false });
  });
});
