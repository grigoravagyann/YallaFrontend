import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSecureProfileStorage } from './profileStorage.web';
import { createSecureTokenStorage } from './tokenStorage.web';

/**
 * The diner web build is a QA target, not a product surface. A release build
 * keeps the thirty-day refresh token, the number, the name and the email in
 * memory only; a development build may keep them in `localStorage` so a reload
 * does not mean logging in again.
 */

const PROFILE = { phoneE164: '+37491000123', guestName: 'Anahit', email: 'anahit@example.test' };

let local: {
  getItem: ReturnType<typeof vi.fn>;
  setItem: ReturnType<typeof vi.fn>;
  removeItem: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  local = { getItem: vi.fn(() => null), setItem: vi.fn(), removeItem: vi.fn() };
  vi.stubGlobal('localStorage', local);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('a release build (__DEV__ false)', () => {
  beforeEach(() => vi.stubGlobal('__DEV__', false));

  it('never writes the refresh token to localStorage, and still holds it for the page', async () => {
    const tokens = createSecureTokenStorage();

    await tokens.write('refresh-token-of-a');
    expect(await tokens.read()).toBe('refresh-token-of-a');
    await tokens.clear();
    expect(await tokens.read()).toBeNull();

    expect(local.setItem).not.toHaveBeenCalled();
    expect(local.getItem).not.toHaveBeenCalled();
  });

  it('never writes the profile to localStorage', async () => {
    const profiles = createSecureProfileStorage();

    await profiles.write(PROFILE);
    expect(await profiles.read()).toEqual(PROFILE);

    expect(local.setItem).not.toHaveBeenCalled();
  });

  it('counts a runtime with no __DEV__ at all as a release build', async () => {
    vi.stubGlobal('__DEV__', undefined);
    await createSecureTokenStorage().write('t');
    await createSecureProfileStorage().write(PROFILE);

    expect(local.setItem).not.toHaveBeenCalled();
  });
});

describe('a development build (__DEV__ true)', () => {
  beforeEach(() => vi.stubGlobal('__DEV__', true));

  it('keeps the token and the profile across reloads in localStorage', async () => {
    await createSecureTokenStorage().write('refresh-token-of-a');
    await createSecureProfileStorage().write(PROFILE);

    expect(local.setItem).toHaveBeenCalledWith('yalla.diner.refreshToken', 'refresh-token-of-a');
    expect(local.setItem).toHaveBeenCalledWith('yalla.diner.profile', JSON.stringify(PROFILE));
  });
});
