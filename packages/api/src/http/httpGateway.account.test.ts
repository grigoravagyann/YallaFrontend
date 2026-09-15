import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAuthSession } from '../auth/session';
import { createMemoryTokenStorage } from '../auth/storage';
import { BASE_URL, fakeBackend, problemReply, type FakeRoute } from './fakeBackend.testkit';
import { createHttpGateway } from './httpGateway';

/**
 * Diner accounts over HTTP: the three doors that sign a diner in, the
 * profile, the password and the avatar.
 *
 * Coded against the brief's contract ahead of the backend, so every route,
 * body and problem code here is the one the server is being built to. The
 * schema check proves the URLs; these prove the bodies and the readings.
 */

function gatewayOver(routes: Readonly<Record<string, FakeRoute>>) {
  const backend = fakeBackend(routes);
  const auth = createAuthSession({
    storage: createMemoryTokenStorage(),
    refreshTokens: vi.fn(),
  });
  const gateway = createHttpGateway(backend.client({ auth }), { audience: 'diner', auth });
  return { gateway, backend, auth };
}

async function caught(promise: Promise<unknown>): Promise<Error & Record<string, unknown>> {
  try {
    await promise;
  } catch (error) {
    return error as Error & Record<string, unknown>;
  }
  throw new Error('expected a rejection');
}

const SIGNED_IN = {
  accessToken: 'access-1',
  refreshToken: 'refresh-1',
  expiresInSeconds: 900,
  dinerUserId: 'diner-1',
  isNewAccount: true,
};

const REGISTER = {
  username: 'Lurj',
  email: 'lurj@example.com',
  password: 'password123',
  phoneE164: '+37477123456',
  displayName: 'Lurj Albert',
};

const WIRE_PROFILE = {
  dinerUserId: 'diner-1',
  username: 'lurj',
  email: 'lurj@example.com',
  phoneE164: '+37477123456',
  phoneVerified: false,
  displayName: 'Lurj Albert',
  localeCode: 'en',
  hasPassword: true,
  photo: {
    photoId: 'p1',
    thumbnailUrl: '/api/photos/p1/thumbnail',
    cardUrl: '/api/photos/p1/card',
    fullUrl: '/api/photos/p1/full',
    width: 800,
    height: 800,
  },
};

describe('registering', () => {
  it('posts the whole form and signs the session in from the answer', async () => {
    const { gateway, backend, auth } = gatewayOver({
      'POST /api/auth/diner/register': { status: 201, body: SIGNED_IN },
    });

    const result = await gateway.registerDiner({ ...REGISTER, localeCode: 'hy' });

    expect(backend.requests[0]?.body).toEqual({ ...REGISTER, localeCode: 'hy' });
    // Anonymous: no bearer, the same as verify-code.
    expect(backend.requests[0]?.headers.get('authorization')).toBeNull();
    expect(result).toEqual(SIGNED_IN);
    expect(auth.getState()).toBe('signedIn');
    expect(auth.peekAccessToken()).toBe('access-1');
  });

  it('sends a null language rather than none, as the request shape spells it', async () => {
    const { gateway, backend } = gatewayOver({
      'POST /api/auth/diner/register': { status: 201, body: SIGNED_IN },
    });
    await gateway.registerDiner(REGISTER);
    expect(backend.requests[0]?.body).toEqual({ ...REGISTER, localeCode: null });
  });

  it.each([
    ['username-taken', 'UsernameTakenError'],
    ['email-taken', 'EmailTakenError'],
    ['phone-in-use', 'PhoneInUseError'],
  ])('reads a 409 %s as its own error, and stays signed out', async (code, name) => {
    const { gateway, auth } = gatewayOver({
      'POST /api/auth/diner/register': problemReply(409, code),
    });

    const error = await caught(gateway.registerDiner(REGISTER));

    expect(error.name).toBe(name);
    expect(error['status']).toBe(409);
    expect(auth.getState()).not.toBe('signedIn');
  });

  it('names the field a 400 blamed', async () => {
    const { gateway } = gatewayOver({
      'POST /api/auth/diner/register': problemReply(
        400,
        'validation',
        { field: 'password' },
        'A password is 8–128 characters.',
      ),
    });

    const error = await caught(gateway.registerDiner({ ...REGISTER, password: 'short' }));

    expect(error.name).toBe('ValidationError');
    expect(error['field']).toBe('password');
    expect(error.message).toBe('A password is 8–128 characters.');
  });

  it('is rate limited like asking for a code, with the wait the server gave', async () => {
    const { gateway } = gatewayOver({
      'POST /api/auth/diner/register': {
        ...problemReply(429, 'rate-limited'),
        headers: { 'retry-after': '60' },
      },
    });

    const error = await caught(gateway.registerDiner(REGISTER));

    expect(error.name).toBe('RateLimitedError');
    expect(error['retryAtUtc']).not.toBeNull();
  });
});

describe('logging in', () => {
  it('sends the identifier and password and signs the session in', async () => {
    const { gateway, backend, auth } = gatewayOver({
      'POST /api/auth/diner/login': { body: { ...SIGNED_IN, isNewAccount: false } },
    });

    const result = await gateway.loginDiner({ identifier: 'lurj', password: 'password123' });

    expect(backend.requests[0]?.body).toEqual({
      identifier: 'lurj',
      password: 'password123',
      localeCode: null,
    });
    expect(backend.requests[0]?.headers.get('authorization')).toBeNull();
    expect(result.isNewAccount).toBe(false);
    expect(auth.getState()).toBe('signedIn');
  });

  it('reads 401 invalid-credentials as a wrong password, not a lost session', async () => {
    const { gateway, auth } = gatewayOver({
      'POST /api/auth/diner/login': problemReply(401, 'invalid-credentials'),
    });

    const error = await caught(gateway.loginDiner({ identifier: 'lurj', password: 'nope' }));

    expect(error.name).toBe('InvalidCredentialsError');
    expect(error.name).not.toBe('UnauthorizedError');
    expect(auth.getState()).not.toBe('signedIn');
  });

  it('reads 429 as too many attempts', async () => {
    const { gateway } = gatewayOver({
      'POST /api/auth/diner/login': problemReply(429, 'too-many-attempts'),
    });

    const error = await caught(gateway.loginDiner({ identifier: 'lurj', password: 'nope' }));

    expect(error.name).toBe('TooManyAttemptsError');
  });
});

describe('the profile', () => {
  it('reads /me under the session and makes the avatar links absolute', async () => {
    const { gateway, backend, auth } = gatewayOver({
      'GET /api/diner/me': { body: WIRE_PROFILE },
    });
    await auth.signIn({ accessToken: 'held', refreshToken: 'r', expiresInSeconds: 900 });

    const profile = await gateway.getDinerProfile();

    expect(backend.requests[0]?.headers.get('authorization')).toBe('Bearer held');
    expect(profile).toMatchObject({
      dinerUserId: 'diner-1',
      username: 'lurj',
      phoneVerified: false,
      hasPassword: true,
    });
    expect(profile.photo?.cardUrl).toBe(`${BASE_URL}/api/photos/p1/card`);
    expect(profile.photo?.thumbnailUrl).toBe(`${BASE_URL}/api/photos/p1/thumbnail`);
  });

  it('reports absent optionals as null, and no photo as null', async () => {
    const { gateway } = gatewayOver({
      'GET /api/diner/me': {
        body: {
          dinerUserId: 'diner-2',
          phoneE164: '+37477000000',
          phoneVerified: true,
          localeCode: 'hy',
          hasPassword: false,
        },
      },
    });

    const profile = await gateway.getDinerProfile();

    expect(profile).toEqual({
      dinerUserId: 'diner-2',
      username: null,
      email: null,
      phoneE164: '+37477000000',
      phoneVerified: true,
      displayName: null,
      localeCode: 'hy',
      hasPassword: false,
      photo: null,
    });
  });

  it('puts only the fields given, so an absent one is left alone', async () => {
    const { gateway, backend } = gatewayOver({
      'PUT /api/diner/me': { body: { ...WIRE_PROFILE, displayName: 'L. Albert' } },
    });

    const profile = await gateway.updateDinerProfile({ displayName: 'L. Albert' });

    expect(backend.requests[0]?.body).toEqual({ displayName: 'L. Albert' });
    expect(profile.displayName).toBe('L. Albert');
  });

  it('reads a taken username on update as the same error as on sign-up', async () => {
    const { gateway } = gatewayOver({
      'PUT /api/diner/me': problemReply(409, 'username-taken'),
    });

    const error = await caught(gateway.updateDinerProfile({ username: 'taken' }));

    expect(error.name).toBe('UsernameTakenError');
  });
});

describe('the password', () => {
  it('sends only the new one for an account that has none yet', async () => {
    const { gateway, backend } = gatewayOver({
      'PUT /api/diner/me/password': { status: 204 },
    });

    await gateway.setDinerPassword({ newPassword: 'password123' });

    expect(backend.requests[0]?.body).toEqual({ newPassword: 'password123' });
  });

  it('sends the current one when given, and reads a wrong one as invalid credentials', async () => {
    const { gateway, backend } = gatewayOver({
      'PUT /api/diner/me/password': problemReply(401, 'invalid-credentials'),
    });

    const error = await caught(
      gateway.setDinerPassword({ currentPassword: 'old', newPassword: 'password123' }),
    );

    expect(backend.requests[0]?.body).toEqual({
      currentPassword: 'old',
      newPassword: 'password123',
    });
    expect(error.name).toBe('InvalidCredentialsError');
  });

  it('keeps the diner signed in: the next read refreshes past session-revoked and succeeds', async () => {
    // The server moves the session generation on and keeps the refresh tokens,
    // so the old access token is refused and a refreshed one is not.
    let profileReads = 0;
    const backend = fakeBackend({
      'PUT /api/diner/me/password': { status: 204 },
      'GET /api/diner/me': (request) => {
        profileReads += 1;
        return request.headers.get('authorization') === 'Bearer access-2'
          ? { body: WIRE_PROFILE }
          : problemReply(401, 'session-revoked');
      },
    });
    const refreshTokens = vi.fn(async () => ({
      accessToken: 'access-2',
      refreshToken: 'refresh-2',
      expiresInSeconds: 900,
    }));
    const revoke = vi.fn(async () => undefined);
    const auth = createAuthSession({
      storage: createMemoryTokenStorage('refresh-1'),
      refreshTokens,
      revoke,
    });
    await auth.signIn({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresInSeconds: 900,
    });
    const gateway = createHttpGateway(backend.client({ auth }), { audience: 'diner', auth });

    await gateway.setDinerPassword({ currentPassword: 'old one', newPassword: 'password123' });
    const profile = await gateway.getDinerProfile();

    expect(profile.dinerUserId).toBe('diner-1');
    expect(profileReads).toBe(2);
    expect(refreshTokens).toHaveBeenCalledTimes(1);
    expect(refreshTokens).toHaveBeenCalledWith('refresh-1');
    expect(revoke).not.toHaveBeenCalled();
    expect(auth.getState()).toBe('signedIn');
  });
});

describe('the avatar', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts one multipart `file` part from a Blob, with no JSON content type', async () => {
    const { gateway, backend } = gatewayOver({
      'POST /api/diner/me/photo': { status: 201, body: WIRE_PROFILE.photo },
    });
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'me.jpg', { type: 'image/jpeg' });

    const photo = await gateway.uploadDinerPhoto(file);

    const request = backend.requests[0];
    expect(request?.body).toBeUndefined();
    expect(request?.headers.get('content-type')).toBeNull();
    const part = request?.form?.get('file');
    expect(part).toBeInstanceOf(Blob);
    expect((part as File).name).toBe('me.jpg');
    expect([...(request?.form?.keys() ?? [])]).toEqual(['file']);
    expect(photo.cardUrl).toBe(`${BASE_URL}/api/photos/p1/card`);
  });

  it("appends React Native's { uri, name, type } as the part itself", async () => {
    // Node's FormData stringifies anything that is not a Blob; React Native's
    // reads the file at `uri`. Stand in for the native one to see what it is
    // handed, which is the whole contract on that platform.
    const appended: unknown[] = [];
    vi.stubGlobal(
      'FormData',
      class {
        append(name: string, value: unknown) {
          appended.push([name, value]);
        }
      },
    );
    const { gateway } = gatewayOver({
      'POST /api/diner/me/photo': { status: 201, body: WIRE_PROFILE.photo },
    });
    const native = { uri: 'file:///tmp/me.jpg', name: 'me.jpg', type: 'image/jpeg' };

    await gateway.uploadDinerPhoto(native);

    expect(appended).toEqual([['file', native]]);
  });

  it('reads the 409 as the same unsupported-image refusal a menu photo gets', async () => {
    const { gateway } = gatewayOver({
      'POST /api/diner/me/photo': problemReply(
        409,
        'unsupported-image',
        { detectedFormat: 'heic' },
        'That file is a HEIC, not a JPEG.',
      ),
    });

    const error = await caught(gateway.uploadDinerPhoto(new Blob(['x'])));

    expect(error.name).toBe('UnsupportedImageError');
    expect(error['reason']).toBe('format');
    expect(error['detectedFormat']).toBe('heic');
  });

  it('deletes the photo with no body', async () => {
    const { gateway, backend } = gatewayOver({
      'DELETE /api/diner/me/photo': { status: 204 },
    });

    await gateway.removeDinerPhoto();

    expect(backend.requests[0]?.method).toBe('DELETE');
    expect(backend.requests[0]?.body).toBeUndefined();
  });
});
