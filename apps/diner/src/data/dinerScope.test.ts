import type { DinerProfileView } from '@yalla/api';
import { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useSession } from '../stores/session';
import { myReviewKey, resetDinerQueriesOnSessionChange } from './dinerScope';

/**
 * One phone, two diners. Whatever the first one's orders and review were, the
 * second must never see them — nor post the first one's words under their name.
 */

function profileOf(dinerUserId: string, phoneE164: string): DinerProfileView {
  return {
    dinerUserId,
    username: null,
    email: null,
    phoneE164,
    phoneVerified: true,
    displayName: null,
    localeCode: 'en',
    hasPassword: true,
    photo: null,
  } as DinerProfileView;
}

const ORDERS = ['dinerOrders', 'list'] as const;

let queryClient: QueryClient;
let stop: () => void = () => undefined;

beforeEach(() => {
  queryClient = new QueryClient();
  useSession.setState({
    signedIn: false,
    profile: null,
    phoneE164: null,
    guestName: null,
    email: null,
  });
});

afterEach(() => {
  stop();
  queryClient.clear();
});

describe('per-diner answers when the session changes hands', () => {
  it('forgets orders and the review on sign-out, and keeps the public place data', () => {
    useSession.setState({ signedIn: true });
    stop = resetDinerQueriesOnSessionChange(queryClient);
    queryClient.setQueryData(ORDERS, [{ id: 'order-of-a' }]);
    queryClient.setQueryData(myReviewKey('b1'), { rating: 5, text: 'A wrote this' });
    queryClient.setQueryData(['places', 'detail', 'b1'], { id: 'b1' });

    useSession.getState().clear();

    expect(queryClient.getQueryData(ORDERS)).toBeUndefined();
    expect(queryClient.getQueryData(myReviewKey('b1'))).toBeUndefined();
    expect(queryClient.getQueryData(['places', 'detail', 'b1'])).toEqual({ id: 'b1' });
  });

  it('forgets an answer cached while signed out once somebody signs in', () => {
    stop = resetDinerQueriesOnSessionChange(queryClient);
    queryClient.setQueryData(ORDERS, []);

    useSession.getState().setVerified({ phoneE164: '+37491000001' });

    expect(queryClient.getQueryData(ORDERS)).toBeUndefined();
  });

  it('forgets them when a different account signs in over the last one', () => {
    useSession.setState({ signedIn: true });
    stop = resetDinerQueriesOnSessionChange(queryClient);
    useSession.getState().setProfile(profileOf('diner-a', '+37491000001'));
    queryClient.setQueryData(myReviewKey('b1'), { rating: 5, text: "A's words" });

    // `signInWith`'s order: the new number first, then the new profile.
    useSession.getState().setVerified({ phoneE164: '+37491000002' });
    useSession.getState().setProfile(profileOf('diner-b', '+37491000002'));

    expect(queryClient.getQueryData(myReviewKey('b1'))).toBeUndefined();
  });

  it('keeps them while the same diner is simply re-read', () => {
    useSession.setState({ signedIn: true });
    stop = resetDinerQueriesOnSessionChange(queryClient);
    useSession.getState().setProfile(profileOf('diner-a', '+37491000001'));
    queryClient.setQueryData(ORDERS, [{ id: 'order-of-a' }]);

    useSession.getState().setProfile(profileOf('diner-a', '+37491000001'));

    expect(queryClient.getQueryData(ORDERS)).toEqual([{ id: 'order-of-a' }]);
  });
});
