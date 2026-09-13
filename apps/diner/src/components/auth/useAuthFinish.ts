import { useNavigation, useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';

/**
 * What the auth routes are opened with.
 *
 * The booking keys are the reservation the diner was in the middle of making
 * (see `book/[placeId]`); they are carried through untouched and handed to
 * `/reserve/confirm` once the diner is signed in. `from` says the welcome
 * screen pushed this one, so finishing has two screens to leave, not one.
 */
export type AuthRouteParams = {
  branchId?: string;
  venueId?: string;
  tableId?: string;
  slotUtc?: string;
  partySize?: string;
  requests?: string;
  from?: string;
};

/** The value of `from` when the welcome screen is underneath. */
export const FROM_WELCOME = 'welcome';

const BOOKING_KEYS = [
  'branchId',
  'venueId',
  'tableId',
  'slotUtc',
  'partySize',
  'requests',
] as const;

type BookingKey = (typeof BOOKING_KEYS)[number];

/** The booking being made, and nothing else — what `/reserve/confirm` expects. */
export function bookingParams(params: {
  readonly [K in BookingKey]?: string | undefined;
}): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of BOOKING_KEYS) {
    const value = params[key];
    if (typeof value === 'string' && value.length > 0) out[key] = value;
  }
  return out;
}

export type AuthRoute = '/auth/login' | '/auth/signup' | '/auth/code';

/**
 * The finish rule every way in shares — password log in, sign up, SMS code.
 *
 * Replace, not push: the auth steps must not sit in the back stack between the
 * table and its confirmation. Reached with no table in hand — from the
 * profile, the bookings tab — it goes back to where it came from, which is two
 * screens when the welcome screen is underneath. A stack too short for that (a
 * cold start straight into welcome → log in) has nowhere to go back to, so the
 * profile takes this screen's place.
 */
export function useAuthFinish(params: AuthRouteParams) {
  const router = useRouter();
  const navigation = useNavigation();
  const { branchId, venueId, tableId, slotUtc, partySize, requests, from } = params;
  const forward = useMemo(
    () => bookingParams({ branchId, venueId, tableId, slotUtc, partySize, requests }),
    [branchId, venueId, tableId, slotUtc, partySize, requests],
  );

  const finish = useCallback(() => {
    if (forward['tableId']) {
      router.replace({ pathname: '/reserve/confirm', params: forward });
      return;
    }
    const depth = navigation.getState()?.routes.length ?? 0;
    if (from === FROM_WELCOME) {
      if (depth >= 3) router.dismiss(2);
      else router.replace('/(tabs)/profile');
      return;
    }
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/profile');
  }, [router, navigation, forward, from]);

  /** Another way in, in this screen's place, with the same booking and `from`. */
  const switchTo = useCallback(
    (target: AuthRoute) => {
      const carried = { ...forward, ...(from === FROM_WELCOME ? { from: FROM_WELCOME } : {}) };
      router.replace({ pathname: target, params: carried });
    },
    [router, forward, from],
  );

  const leave = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/profile');
  }, [router]);

  return { forward, finish, switchTo, leave };
}
