import {
  ForbiddenError,
  NetworkError,
  ServerError,
  TimeoutError,
  type DinerTabView,
} from '@yalla/api';
import { describe, expect, it } from 'vitest';
import { orderFailureKind, orderingBlock } from './ordering';

const me: DinerTabView['me'] = {
  participantId: 'p1',
  displayName: 'Ani',
  role: 'guest',
  status: 'approved',
  canOrder: true,
  canOrderNow: true,
  canPay: false,
  canSeeTableTotal: true,
  joinedAtUtc: '2026-09-06T09:00:00Z',
};

describe('who may order', () => {
  it('lets somebody order when the server says they can', () => {
    expect(orderingBlock({ status: 'open', me })).toBeNull();
  });

  it('stops a pending joiner, and says it is the host they are waiting for', () => {
    expect(
      orderingBlock({
        status: 'open',
        me: { ...me, status: 'pendingApproval', canOrderNow: false },
      }),
    ).toBe('pending');
  });

  it('stops a guest the host set to not order', () => {
    expect(
      orderingBlock({ status: 'open', me: { ...me, canOrder: false, canOrderNow: false } }),
    ).toBe('notAllowed');
  });

  it('stops everybody once the bill has been asked for', () => {
    expect(orderingBlock({ status: 'closing', me: { ...me, canOrderNow: false } })).toBe('closing');
  });
});

describe('a send that failed', () => {
  const url = 'https://api.test/api/tabs/t1/orders';

  it('says "could not tell" after a timeout, which may have come after the kitchen got it', () => {
    expect(orderFailureKind(new TimeoutError({ url, timeoutMs: 15_000 }), true)).toBe('uncertain');
  });

  it('says the same after a server error', () => {
    expect(orderFailureKind(new ServerError({ status: 502, url }), true)).toBe('uncertain');
  });

  it('says "not placed" only when the phone knew it was offline', () => {
    expect(orderFailureKind(new NetworkError({ url }), false)).toBe('offline');
    expect(orderFailureKind(new NetworkError({ url }), true)).toBe('uncertain');
  });

  it('reads a 403 as the ordering rule, to be explained from the tab', () => {
    expect(orderFailureKind(new ForbiddenError({ url }), true)).toBe('forbidden');
  });
});
