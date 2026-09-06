import { ApiClient } from '../client';
import { createConsoleMockGateway } from '../mocks/consoleMock';
import { createConsoleHttpGateway } from '../http/consoleHttpGateway';
import { createHttpGateway } from '../http/httpGateway';
import { createMockGateway } from '../mocks/mockGateway';
import { createStaffHttpGateway } from '../http/staffHttpGateway';
import { createStaffMockGateway } from '../mocks/staffMock';
import { createMemoryIdentityStore } from '../http/consoleHttpGateway';
import type { AuthSession } from '../auth/session';
import type { YallaGateway } from '../gateway';
import type { ContractCapability, ContractSubject } from './subject';
import { tomorrowEvening } from './subject';

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
 * a contract run lives for seconds and signs in once, so the whole rotation
 * story is deliberately absent rather than reimplemented badly.
 */
function staticSession(token: string | null): AuthSession {
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
 * A gateway that refuses everything, used as the HTTP gateway's `fallback`.
 *
 * `createHttpGateway` takes a fallback for the methods not yet wired to HTTP,
 * and in the app that fallback is the mock. For a contract run that would be a
 * quiet disaster: a contract could exercise the fallback, pass against the mock
 * a second time, and report the two implementations as agreeing — which is the
 * exact failure this whole suite exists to make impossible.
 *
 * So the live run's fallback throws. A contract that reaches it fails loudly
 * and names the method, and the honest fix is to wire that method to HTTP or to
 * declare the capability unsupported.
 */
function refusingFallback(): YallaGateway {
  return new Proxy({} as YallaGateway, {
    get(_target, property) {
      return () => {
        throw new Error(
          `The contract suite reached the HTTP gateway's mock fallback for "${String(property)}". ` +
            'That would test the mock twice and report the two implementations as agreeing. ' +
            'Wire the method to HTTP, or declare its capability unsupported on the subject.',
        );
      };
    },
  });
}

const MOCK_BRANCH = 'b-lumen-north';
const MOCK_ZONE = 'Asia/Yerevan';

export function mockSubject(): ContractSubject {
  const gateway = createMockGateway({ latencyMs: 0, simulateJoiners: false });

  return {
    name: 'mock adapter',
    gateway,
    staff: createStaffMockGateway(),
    console: createConsoleMockGateway({ latencyMs: 0 }),
    fixtures: {
      branchId: MOCK_BRANCH,
      timeZoneId: MOCK_ZONE,
      tomorrowEveningUtc: tomorrowEvening(MOCK_ZONE),
    },
    // The mock supports everything by construction. If it ever cannot satisfy
    // a contract the answer is to fix the mock, never to declare a gap here.
    unsupported: () => null,
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
  /** A venue-user token, when one could be obtained. Console reads need it. */
  readonly venueToken: string | null;
}

/**
 * The real client, pointed at a live backend.
 *
 * What it cannot authenticate for, it declares. Tabs and table state need a
 * staff device enrolled with a PIN, and reservations need a verified diner —
 * neither of which a bare backend container has until something seeds them. A
 * declared gap prints in the test name and has to be accounted for in the
 * report; a silent skip is how a live run ends up covering a third of the
 * surface while looking complete.
 */
export function httpSubject(options: HttpSubjectOptions): ContractSubject {
  const anonymous = new ApiClient({ baseUrl: options.baseUrl });

  const authorised = new ApiClient({
    baseUrl: options.baseUrl,
    ...(options.venueToken ? { getToken: async () => options.venueToken } : {}),
  });

  const needsStaffDevice = 'no staff device is enrolled on this backend';
  const needsDiner = 'no verified diner session on this backend';
  const needsVenueToken = 'no venue-user token — set YALLA_CONTRACT_VENUE_EMAIL/PASSWORD';

  const gaps: Partial<Record<ContractCapability, string>> = {
    tabs: needsStaffDevice,
    tableState: needsStaffDevice,
    reservations: needsDiner,
    ...(options.venueToken ? {} : { reports: needsVenueToken, menu: needsVenueToken }),
  };

  return {
    name: 'HTTP client',
    // Availability and the diner menu are anonymous — browsing needs no
    // account — which is why the flagship contract runs live with no setup.
    gateway: createHttpGateway(anonymous, { audience: 'diner', fallback: refusingFallback() }),
    staff: createStaffHttpGateway(authorised),
    console: createConsoleHttpGateway(authorised, {
      auth: staticSession(options.venueToken),
      identity: createMemoryIdentityStore(),
    }),
    fixtures: {
      branchId: options.branchId,
      timeZoneId: options.timeZoneId,
      tomorrowEveningUtc: tomorrowEvening(options.timeZoneId),
    },
    unsupported: (capability) => gaps[capability] ?? null,
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
  /*
   * `MenuItemCompleteness.Rule` tests `item.Allergens != null`, and its own
   * documentation explains why a null check is the whole test:
   *
   * > every one of these fields goes through `Guard.OptionalText`, which trims
   * > and returns null for whitespace, so a stored empty string cannot exist
   *
   * A stored empty string does exist. The seeded "Sold Out Tea" has
   * `allergens: ""`, which is not null, so the item passes the completeness
   * rule and is published — and a diner is shown a dish with an empty allergen
   * list, which is the exact outcome that class says the requirement exists to
   * prevent. The fix belongs on the server: either the guard is being bypassed
   * on the write path that produced this row, or the rule needs to treat blank
   * as absent.
   */
  'menu.allergensRequired':
    'backend publishes a menu item with an empty allergens string — MenuItemCompleteness ' +
    'checks for null and a blank one is reaching the diner menu',
};
