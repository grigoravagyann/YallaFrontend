import { ApiClient } from '../client';
import { createDinerAuth } from '../auth/endpoints';
import { createAuthSession, type AuthSession } from '../auth/session';
import { createMemoryTokenStorage } from '../auth/storage';
import { PhoneInUseError } from '../contracts/errors';
import type { YallaGateway } from '../gateway';
import { createConsoleHttpGateway, createMemoryIdentityStore } from '../http/consoleHttpGateway';
import { createHttpGateway } from '../http/httpGateway';
import { createStaffHttpGateway } from '../http/staffHttpGateway';
import { createConsoleMockGateway } from '../mocks/consoleMock';
import { createMockGateway } from '../mocks/mockGateway';
import { createMockReviewStore } from '../mocks/reviewStore';
import { createStaffMockGateway } from '../mocks/staffMock';

import type { ContractCapability, ContractDiner, ContractSubject } from './subject';
import { randomToken, randomUuid, testPhone, tomorrowEvening } from './subject';

/**
 * The two implementations the contract suite is run against.
 *
 * One suite, run twice. The mock run is the fast one that keeps `pnpm test`
 * offline; the HTTP run is the one that makes the mock run mean anything, and
 * it is deliberately possible to notice when it has not happened.
 */

/**
 * A session that holds one token and never refreshes.
 *
 * The console gateway takes an `AuthSession` because the app's does refresh;
 * a contract run lives for minutes and signs in once, so the whole rotation
 * story is deliberately absent rather than reimplemented badly.
 */
export function staticSession(token: string | null): AuthSession {
  return {
    restore: async () => (token ? 'signedIn' : 'signedOut'),
    getAccessToken: async () => token,
    refresh: async () => token,
    peekAccessToken: () => token,
    signIn: async () => {},
    signOut: async () => {},
    getState: () => (token ? 'signedIn' : 'signedOut'),
    subscribe: () => () => {},
  };
}

/**
 * Register a diner, confirm the number by code, and hand back the signed-in
 * gateway — the same three calls the app's sign-up screen makes, through the
 * interface under test.
 *
 * Every account is new: a random username, an address on the reserved `.test`
 * domain, and a number in the `+37491000xxx` test range, tried again when a
 * previous run against the same database already holds it.
 */
export async function signUpDiner(gateway: YallaGateway): Promise<ContractDiner> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const tag = randomToken(10);
    const phoneE164 = testPhone();
    const password = `contract-${randomToken(16)}`;

    let dinerUserId: string;
    try {
      const result = await gateway.registerDiner({
        username: `contract.${tag}`,
        email: `contract.${tag}@yalla.test`,
        password,
        phoneE164,
        displayName: 'Contract Diner',
        localeCode: 'en',
      });
      dinerUserId = result.dinerUserId;
    } catch (error) {
      if (error instanceof PhoneInUseError) continue;
      throw error;
    }

    const challenge = await gateway.requestPhoneCode(phoneE164);
    if (!challenge.devCode) {
      throw new Error(
        'No development code came back from request-code. The contract run needs the backend ' +
          'in Development, the one environment that returns it.',
      );
    }
    await gateway.verifyPhoneCode({ challengeId: challenge.challengeId, code: challenge.devCode });

    return { gateway, dinerUserId, phoneE164, password };
  }
  throw new Error('Eight test numbers in a row already had accounts on this backend.');
}

const MOCK_BRANCH = 'b-lumen-north';
const MOCK_ZONE = 'Asia/Yerevan';

/**
 * The mock's two declared gaps, both about bytes and pixels it does not hold.
 *
 * Nothing else is excused: the uploads, the gallery, the cover, the pins and
 * their refusals all run against the mock with the same assertions as the live
 * backend.
 */
const MOCK_GAPS: Partial<Record<ContractCapability, string>> = {
  photoBytes: 'the mock stores no image bytes to serve',
  photoMarkers:
    "the mock's diner world keeps no photo positions, so the console mock's pins never reach its markers",
};

export function mockSubject(): ContractSubject {
  // One review store for every mock in the world, as the server has one table:
  // what a diner reports here is what the console mock moderates.
  const reviews = createMockReviewStore({ seed: true });
  const diner = () => createMockGateway({ latencyMs: 0, simulateJoiners: false, reviews });

  return {
    name: 'mock adapter',
    gateway: diner(),
    staff: createStaffMockGateway(),
    console: createConsoleMockGateway({ latencyMs: 0, reviews }),
    managerConsole: createConsoleMockGateway({
      latencyMs: 0,
      role: 'manager',
      managerBranch: 'home',
      reviews,
    }),
    fixtures: {
      branchId: MOCK_BRANCH,
      timeZoneId: MOCK_ZONE,
      tomorrowEveningUtc: tomorrowEvening(MOCK_ZONE),
    },
    // A gateway per diner, as a phone per diner: the mock remembers who is
    // signed in on the instance, the way a session remembers it on a device.
    newDiner: () => signUpDiner(diner()),
    fetchPhoto: () => Promise.reject(new Error(MOCK_GAPS.photoBytes)),
    unsupported: (capability) => MOCK_GAPS[capability] ?? null,
  };
}

/**
 * The base URL of a live backend, or null when the HTTP run is switched off.
 *
 * Behind an environment flag so `pnpm test` stays fast and offline, and wired
 * into CI as its own job against a backend container — because a contract suite
 * that only ever runs against the mock is the problem, not the fix.
 */
export function contractBackendUrl(): string | null {
  const url = (globalThis.process?.env?.['YALLA_CONTRACT_BASE_URL'] ?? '').trim();
  return url === '' ? null : url;
}

export interface HttpSubjectOptions {
  readonly baseUrl: string;
  /** The seeded branch to ask about, discovered from `/api/public/venues`. */
  readonly branchId: string;
  readonly timeZoneId: string;
  /** A platform admin's admin-panel token. */
  readonly adminToken: string;
  /** A PIN session of a manager whose home branch is `branchId`. */
  readonly managerToken: string;
  /** A PIN session of a waiter at `branchId`. */
  readonly waiterToken: string;
  /**
   * What the backend's *data* cannot exercise, found by `resolveLiveSubject`
   * and printed in the test names. Never a credential or a person: those fail
   * the run at start-up instead.
   */
  readonly gaps?: Partial<Record<ContractCapability, string>> | undefined;
}

/** A diner's own phone: its own client, session and device id. */
function httpDinerGateway(baseUrl: string): YallaGateway {
  const dinerAuth = createDinerAuth(new ApiClient({ baseUrl }));
  const session = createAuthSession({
    storage: createMemoryTokenStorage(),
    refreshTokens: (refreshToken) => dinerAuth.refreshTokens(refreshToken),
  });
  const deviceId = randomUuid();
  return createHttpGateway(new ApiClient({ baseUrl, auth: session }), {
    audience: 'diner',
    auth: session,
    dinerAuth,
    deviceId: async () => deviceId,
  });
}

/**
 * The real client, pointed at a live backend, with every identity the suites
 * act as already signed in by `resolveLiveSubject`.
 *
 * With a backend URL set the run either has the platform admin, the staff
 * sessions and a way to make diners, or it fails at start-up saying which is
 * missing. The only gaps it declares are about seeded data (`gaps`).
 */
export function httpSubject(options: HttpSubjectOptions): ContractSubject {
  const { baseUrl } = options;
  const anonymous = new ApiClient({ baseUrl });
  const browseDevice = randomUuid();

  const consoleAs = (token: string) =>
    createConsoleHttpGateway(new ApiClient({ baseUrl, getToken: async () => token }), {
      auth: staticSession(token),
      identity: createMemoryIdentityStore(),
    });

  return {
    name: 'HTTP client',
    gateway: createHttpGateway(anonymous, {
      audience: 'diner',
      deviceId: async () => browseDevice,
    }),
    staff: createStaffHttpGateway(
      new ApiClient({ baseUrl, getToken: async () => options.waiterToken }),
    ),
    console: consoleAs(options.adminToken),
    managerConsole: consoleAs(options.managerToken),
    fixtures: {
      branchId: options.branchId,
      timeZoneId: options.timeZoneId,
      tomorrowEveningUtc: tomorrowEvening(options.timeZoneId),
    },
    newDiner: () => signUpDiner(httpDinerGateway(baseUrl)),
    fetchPhoto: async (url) => {
      const response = await fetch(new URL(url, baseUrl));
      await response.arrayBuffer();
      return { status: response.status, contentType: response.headers.get('content-type') ?? '' };
    },
    unsupported: (capability) => options.gaps?.[capability] ?? null,
    knownDefect: (contract) => LIVE_DEFECTS[contract] ?? null,
  };
}

/**
 * Contracts the live backend currently violates.
 *
 * Reported rather than worked around, and asserted to fail so the entry cannot
 * outlive the bug.
 */
const LIVE_DEFECTS: Readonly<Record<string, string>> = {
  // Empty. `menu.allergensRequired` was retired: the backend stores menu text
  // through `Guard.OptionalText`, which turns blank into null, so a blank
  // allergens string cannot reach the diner menu through the API. The row that
  // suggested otherwise ("Sold Out Tea") was inserted by hand with SQL into a
  // local database, around the guard; the allergens contract asserts for real.
};
