import { createAuthSession, createMemoryTokenStorage } from '@yalla/api';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSession, type DinerProfile, type ProfileStorage } from '../stores/session';
import { restoreDinerSession } from './restore';

function memoryProfile(initial: DinerProfile): ProfileStorage {
  let value = initial;
  return {
    read: () => Promise.resolve(value),
    write: (next) => {
      value = next;
      return Promise.resolve();
    },
  };
}

beforeEach(() => {
  useSession.setState({ signedIn: false, phoneE164: null, guestName: null });
});

describe('a returning diner', () => {
  it('counts as signed in when the keychain still holds a refresh token', async () => {
    const auth = createAuthSession({
      storage: createMemoryTokenStorage('refresh-0'),
      refreshTokens: vi.fn(),
    });

    await restoreDinerSession({
      auth,
      profile: memoryProfile({ phoneE164: '+37477123456', guestName: 'Ani' }),
    });

    expect(useSession.getState().signedIn).toBe(true);
    // And comes back with the number and name the booking needs.
    expect(useSession.getState().phoneE164).toBe('+37477123456');
    expect(useSession.getState().guestName).toBe('Ani');
  });

  it('is not signed in with nothing in the keychain', async () => {
    const auth = createAuthSession({
      storage: createMemoryTokenStorage(),
      refreshTokens: vi.fn(),
    });

    await restoreDinerSession({
      auth,
      profile: memoryProfile({ phoneE164: null, guestName: null }),
    });

    expect(useSession.getState().signedIn).toBe(false);
  });
});
