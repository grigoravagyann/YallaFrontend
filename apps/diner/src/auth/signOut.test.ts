import {
  createAuthSession,
  createMemoryTokenStorage,
  type AuthSession,
  type DinerProfileView,
} from '@yalla/api';
import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { accountKeys } from '../data/accountQueries';
import { myReviewKey } from '../data/dinerScope';
import { useSession } from '../stores/session';
import { signOut } from './signOut';

/**
 * One way out of the account, whatever the server does. The phone is handed to
 * somebody else afterwards: none of the last diner's answers may greet them,
 * and the refresh token must be gone from the store.
 */

const PROFILE = {
  dinerUserId: 'diner-a',
  username: 'anahit',
  email: 'anahit@example.test',
  phoneE164: '+37491000123',
  phoneVerified: true,
  displayName: 'Anahit Sargsyan',
  localeCode: 'en',
  hasPassword: true,
  photo: null,
} as DinerProfileView;

/** Every per-diner key the app has, and one public one that must survive. */
const DINER_KEYS = [
  ['dinerOrders', 'list'],
  myReviewKey('b1'),
  ['favorites', 'list'],
  ['notifications', 'feed'],
  ['notifications', 'unread'],
  accountKeys.profile,
] as const;
const PUBLIC_KEY = ['places', 'detail', 'b1'] as const;

let queryClient: QueryClient;

function seed(): void {
  for (const key of DINER_KEYS) queryClient.setQueryData(key, { of: 'diner-a' });
  queryClient.setQueryData(PUBLIC_KEY, { id: 'b1' });
  useSession.setState({ signedIn: true, profile: PROFILE, phoneE164: PROFILE.phoneE164 });
}

function expectSignedOut(): void {
  for (const key of DINER_KEYS) expect(queryClient.getQueryData(key)).toBeUndefined();
  expect(queryClient.getQueryData(PUBLIC_KEY)).toEqual({ id: 'b1' });
  expect(useSession.getState().signedIn).toBe(false);
  expect(useSession.getState().profile).toBeNull();
}

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  useSession.setState({ signedIn: false, profile: null, phoneE164: null, guestName: null });
});

describe('signOut', () => {
  it('clears the token store, the account and every per-diner answer', async () => {
    const storage = createMemoryTokenStorage('refresh-token-of-a');
    const revoke = vi.fn(() => Promise.resolve());
    const auth = createAuthSession({
      storage,
      refreshTokens: () => Promise.reject(new Error('unused')),
      revoke,
    });
    await auth.restore();
    seed();

    await signOut(queryClient, auth);

    expect(revoke).toHaveBeenCalledWith('refresh-token-of-a');
    expect(await storage.read()).toBeNull();
    expectSignedOut();
  });

  it('still clears the token store when the server cannot be reached', async () => {
    const storage = createMemoryTokenStorage('refresh-token-of-a');
    const auth = createAuthSession({
      storage,
      refreshTokens: () => Promise.reject(new Error('unused')),
      revoke: () => Promise.reject(new Error('offline')),
    });
    await auth.restore();
    seed();

    await signOut(queryClient, auth);

    expect(await storage.read()).toBeNull();
    expectSignedOut();
  });

  it('signs the phone out locally even when the session itself rejects', async () => {
    const auth = {
      signOut: vi.fn(() => Promise.reject(new Error('keychain unavailable'))),
    } as unknown as AuthSession;
    seed();

    await expect(signOut(queryClient, auth)).resolves.toBeUndefined();

    expect(auth.signOut).toHaveBeenCalledTimes(1);
    expectSignedOut();
  });

  it('keeps the remembered number and name as prefill, not as a session', async () => {
    const auth = { signOut: () => Promise.resolve() } as unknown as AuthSession;
    seed();
    useSession.setState({ guestName: 'Anahit' });

    await signOut(queryClient, auth);

    expect(useSession.getState().phoneE164).toBe('+37491000123');
    expect(useSession.getState().guestName).toBe('Anahit');
  });
});
