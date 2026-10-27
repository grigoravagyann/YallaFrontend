import { describe, expect, it } from 'vitest';
import {
  FeatureNotEnabledError,
  TabsNotEnabledError,
  blockedFeature,
  isFeatureNotEnabled,
} from '../contracts/errors';
import { ApiError, ConcurrencyConflictError, isConcurrencyConflict } from '../errors';
import { fakeBackend } from './fakeBackend.testkit';
import { createStaffHttpGateway } from './staffHttpGateway';
import { createHttpGateway } from './httpGateway';

const BRANCH = '0b5f3c1e-0000-4000-8000-000000000001';

function refusal(feature: number) {
  return {
    status: 409,
    headers: { 'content-type': 'application/problem+json' },
    body: {
      type: 'https://yalla.am/problems/feature-not-enabled',
      title: 'Feature not enabled for this branch',
      status: 409,
      detail: 'The platform has not allowed this feature at the branch.',
      code: 'feature-not-enabled',
      traceId: 'trace-1',
      context: { feature, branchId: BRANCH },
    },
  };
}

/**
 * `feature-not-enabled` (2026-10-27): whatever route answers it, the client
 * reads one class naming the feature, so every surface can say "not enabled
 * here" rather than "something changed, refresh".
 */
describe('a feature the platform has not allowed', () => {
  it('arrives as FeatureNotEnabledError naming the feature and the branch', async () => {
    const backend = fakeBackend({
      [`GET /api/branches/${BRANCH}/takeaway-orders`]: refusal(4),
    });
    const gateway = createStaffHttpGateway(backend.client());

    const caught = await gateway
      .listTakeawayOrders(BRANCH)
      .then(() => null)
      .catch((error: unknown) => error);

    expect(caught).toBeInstanceOf(FeatureNotEnabledError);
    expect((caught as FeatureNotEnabledError).feature).toBe('takeaway');
    expect((caught as FeatureNotEnabledError).branchId).toBe(BRANCH);
    // Still a 409 to everything that already reads one as "not now".
    expect(isConcurrencyConflict(caught)).toBe(true);
    expect(blockedFeature(caught)).toBe('takeaway');
  });

  it('is recognised under the older and the generic classes too', () => {
    expect(blockedFeature(new TabsNotEnabledError({ url: '/x' }))).toBe('tableService');
    const generic = new ApiError('x', {
      status: 409,
      url: '/x',
      problem: {
        type: '',
        title: '',
        status: 409,
        detail: '',
        code: 'feature-not-enabled',
        traceId: '',
        context: { feature: 7, branchId: BRANCH },
      },
    });
    expect(blockedFeature(generic)).toBe('reviews');
    expect(isFeatureNotEnabled(new ConcurrencyConflictError({ url: '/x' }))).toBe(false);
    expect(blockedFeature(new Error('x'))).toBeUndefined();
  });

  it('reads a feature this client does not know yet as unnamed, not as one of the ten', () => {
    const error = new FeatureNotEnabledError({
      url: '/x',
      problem: {
        type: '',
        title: '',
        status: 409,
        detail: '',
        code: 'feature-not-enabled',
        traceId: '',
        context: { feature: 11, branchId: BRANCH },
      },
    });
    expect(error.feature).toBeNull();
    expect(isFeatureNotEnabled(error)).toBe(true);
  });

  it("is not read as a gateway's own 409 first: a review report stays feature-off", async () => {
    const backend = fakeBackend({
      'POST /api/diner/reviews/r-1/report': refusal(7),
    });
    const gateway = createHttpGateway(backend.client(), { audience: 'diner' });
    const caught = await gateway
      .reportReview({ reviewId: 'r-1', reason: 'spam', note: null })
      .then(() => null)
      .catch((error: unknown) => error);
    expect(caught).toBeInstanceOf(FeatureNotEnabledError);
    expect(blockedFeature(caught)).toBe('reviews');
  });
});
