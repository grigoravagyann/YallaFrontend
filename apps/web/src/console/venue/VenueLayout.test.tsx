// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import {
  createQueryClient,
  type ConsoleGateway,
  type ConsoleUser,
  type ManagedVenue,
  type components,
} from '@yalla/api';
import { GatewayProvider } from '@yalla/api/react';
import { I18nextProvider, NAMESPACES, i18next, initI18n } from '@yalla/i18n';
import { resources } from '@yalla/i18n/resources';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode, type ReactNode } from 'react';
import { BrowserRouter, MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { App as AppComponent } from '../../App';
import type * as AuthSessionModule from '../../auth/authSession';
import type * as GatewayModule from '../../data/gateway';
import type { FloorPlanEditorScreen as FloorPlanEditorScreenComponent } from './floorplan/FloorPlanEditorScreen';
import type * as VenueLayoutModule from './VenueLayout';

/**
 * The venue section as a venue user reaches it: signed in over HTTP, through
 * the real session, the real HTTP gateway and the whole `App`, with `fetch` as
 * the only double.
 *
 * An owner created with no branch of their own signed in and found "no branch"
 * on every venue tab. The live probe of 2026-09-10 (backend master 671c749, the
 * throwaway database Yalla_E2E) found why. The one read that tells the console
 * a venue's branches, `GET /api/platform/venues/{venueId}`, is
 * PlatformAdminOnly and answers 403 to every owner and every manager, while the
 * per-branch reads the screens make answer them 200. So the console never
 * learns a branch, not even for a manager whose token names one.
 *
 * `BACKEND` below is that probe, row for row, plus the one read the fix added:
 * `GET /api/venues/{venueId}/manage`, which a venue user may call and which
 * answers the branches the caller's own staff row covers — every branch for an
 * owner or a manager with no branch, the home branch alone for a manager who
 * has one. The tests assert what each of them should see.
 */

type Schemas = components['schemas'];

// --- What the probe created ----------------------------------------------------

/** The venue under test, created with its first branch. */
const V = '01a08ce0-3f44-786a-ad9d-625b58e59187';
/** "Northern Avenue", the venue's first branch. */
const B1 = '01a08ce0-3f45-7935-87e8-61c02e94dde6';
/** "Cascade", added through `POST /api/platform/venues/{id}/branches`. */
const B2 = '01a08ce0-40e8-7ec3-8b1b-437b5313cc98';
/** The first branch of an unrelated venue: the control every venue user is refused. */
const BX = '01a08ce0-4131-7b3e-8643-969440a90b49';
/**
 * A venue created with its first branch and nothing else: the exact shape of
 * the venue the bug was reported from. Its owner is `soleOwner`.
 */
const VS = '01a08ce0-5000-7000-8000-000000000001';
/** "Main Street", that venue's only branch. */
const BS = '01a08ce0-5000-7000-8000-000000000002';

type Account = 'admin' | 'owner' | 'manager' | 'managerNoBranch' | 'soleOwner';
type Caller = Account | 'anonymous';

/**
 * Every claim the probe decoded from each account's access token, except the
 * three times: `iat`, `nbf` and `exp` are re-based on now (keeping the probe's
 * 900-second lifetime) so the session does not try to refresh a token that ran
 * out after the probe did.
 *
 * Note what is absent. The owner's token has `venueId` and no `branchId`, and
 * so does the manager who was created with no branch. The claim names are the
 * backend's camelCase ones.
 */
const CLAIMS: Readonly<Record<Account, Readonly<Record<string, string>>>> = {
  admin: {
    aud: 'yalla-clients',
    iss: 'yalla',
    ytyp: '5',
    staffMemberId: '01a08cdd-9945-7b73-9146-ffda5d950db6',
    role: 'PlatformAdmin',
    sub: '01a08cdd-9945-7b73-9146-ffda5d950db6',
    jti: '01a08ce0-3e78-70b3-8579-fe79da6061bf',
  },
  owner: {
    aud: 'yalla-clients',
    iss: 'yalla',
    ytyp: '5',
    staffMemberId: '01a08ce0-41b7-7fe4-85b6-4fff079105b1',
    role: 'Owner',
    sub: '01a08ce0-41b7-7fe4-85b6-4fff079105b1',
    venueId: V,
    jti: '01a08ce0-436a-7c77-bdc9-16f7c3143db6',
  },
  manager: {
    aud: 'yalla-clients',
    iss: 'yalla',
    ytyp: '5',
    staffMemberId: '01a08ce0-43ef-7a2e-a6fd-317d5726774f',
    role: 'Manager',
    sub: '01a08ce0-43ef-7a2e-a6fd-317d5726774f',
    venueId: V,
    branchId: B2,
    jti: '01a08ce0-44cd-72b1-8c1b-42d9634cd9db',
  },
  managerNoBranch: {
    aud: 'yalla-clients',
    iss: 'yalla',
    ytyp: '5',
    staffMemberId: '01a08ce0-453f-793d-8856-473be7cea15a',
    role: 'Manager',
    sub: '01a08ce0-453f-793d-8856-473be7cea15a',
    venueId: V,
    jti: '01a08ce0-45fe-7971-b43a-98661d2b8cf1',
  },
  // Not probed: the same claims an owner created with no branch gets, for VS.
  soleOwner: {
    aud: 'yalla-clients',
    iss: 'yalla',
    ytyp: '5',
    staffMemberId: '01a08ce0-5000-7000-8000-000000000003',
    role: 'Owner',
    sub: '01a08ce0-5000-7000-8000-000000000003',
    venueId: VS,
    jti: '01a08ce0-5000-7000-8000-000000000004',
  },
};

/**
 * The sign-in response bodies the probe recorded, less the tokens.
 *
 * `role` is the wire integer (Owner 1, Manager 2, PlatformAdmin 5). None of
 * them has a `branchId`, not even the manager's: only the token carries it. The
 * email addresses are placeholders, because the probe's were random.
 */
const SIGN_IN: Readonly<
  Record<Account, { email: string; fullName: string; role: number; venueId?: string }>
> = {
  admin: { email: 'admin@e2e.local', fullName: 'Platform Administrator', role: 5 },
  owner: { email: 'owner@e2e.local', fullName: 'Probe Owner', role: 1, venueId: V },
  manager: { email: 'manager@e2e.local', fullName: 'Probe Manager', role: 2, venueId: V },
  managerNoBranch: {
    email: 'manager-venue-wide@e2e.local',
    fullName: 'Probe Manager Venue-wide',
    role: 2,
    venueId: V,
  },
  soleOwner: { email: 'sole-owner@e2e.local', fullName: 'Sole Owner', role: 1, venueId: VS },
};

/** Not anybody's password; the stub never reads it. */
const PASSWORD = 'chosen-through-the-sign-in-link';

/** Minted here with the probe's claims. The client never checks a signature. */
function accessToken(account: Account): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const iat = Math.floor(Date.now() / 1000);
  const claims = { ...CLAIMS[account], iat, nbf: iat, exp: iat + 900 };
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(claims)}.unverified`;
}

/** Who a request is from, by the bearer token's `staffMemberId`. */
function callerOf(authorization: string | null): Caller {
  const payload = authorization?.replace(/^Bearer /u, '').split('.')[1];
  if (!payload) return 'anonymous';
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
    staffMemberId?: unknown;
  };
  const accounts = Object.keys(CLAIMS) as Account[];
  return (
    accounts.find((account) => CLAIMS[account].staffMemberId === claims.staffMemberId) ??
    'anonymous'
  );
}

// --- What the backend holds for them -------------------------------------------

/** A branch as the platform read describes it, with the values the probe created it with. */
function branchSummary(branchId: string, name: string, slug: string) {
  return {
    branchId,
    venueId: V,
    name,
    slug,
    address: `${name} 5, Yerevan`,
    latitude: 40.1811,
    longitude: 44.5136,
    timeZoneId: 'Asia/Yerevan',
    floorWidth: 800,
    floorHeight: 600,
    isActive: true,
    subscriptionTier: 1,
    tableCount: 0,
  } satisfies Schemas['Yalla.Application.Platform.BranchSummary'];
}

/**
 * What `GET /api/platform/venues/{V}` answered the platform admin. The venue
 * slug is a placeholder, because the probe's was random.
 */
const VENUE_DETAIL = {
  venue: {
    venueId: V,
    name: 'Probe Cafe',
    type: 1,
    slug: 'probe-cafe',
    isActive: true,
    isSuspended: false,
    isDeleted: false,
    suspendedAtUtc: null,
    deletedAtUtc: null,
    branchCount: 2,
    tableCount: 0,
    paidBranchCount: 0,
    subscriptionTier: 1,
  },
  branches: [
    branchSummary(B1, 'Northern Avenue', 'northern-avenue'),
    branchSummary(B2, 'Cascade', 'cascade'),
  ],
} satisfies Schemas['Yalla.Application.Platform.VenueDetail'];

/**
 * What `GET /api/venues/{venueId}/manage` answers, as the backend PR defines
 * it: the venue, and the branches the *caller's staff row* covers.
 *
 * TODO(orchestrator): `satisfies Schemas['Yalla.Application.Venues.ManagedVenueView']`
 * once `schema.ts` is regenerated with the route.
 */
function managedVenue(venueId: string, name: string, slug: string, branches: readonly string[][]) {
  return {
    venueId,
    name,
    type: 1,
    slug,
    isSuspended: false,
    isDeleted: false,
    branches: branches.map(([branchId, branchName, branchSlug]) => ({
      branchId,
      venueId,
      name: branchName,
      slug: branchSlug,
      timeZoneId: 'Asia/Yerevan',
      isActive: true,
      subscriptionTier: 1,
      tableCount: 0,
    })),
  };
}

const NORTHERN = [B1, 'Northern Avenue', 'northern-avenue'];
const CASCADE = [B2, 'Cascade', 'cascade'];
const MAIN_STREET = [BS, 'Main Street', 'main-street'];

/** A branch as the probe created it: an 800 x 600 floor with nothing drawn on it yet. */
function floorPlan(branchId: string) {
  return {
    branchId,
    floorWidth: 800,
    floorHeight: 600,
    areas: [],
    tables: [],
  } satisfies Schemas['Yalla.Application.BranchSettings.FloorPlanView'];
}

// --- The backend, as the probe found it ----------------------------------------

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

/** A status and nothing else. Every refusal the probe recorded had an empty body and no problem code. */
function bare(status: number): Response {
  return new Response(null, { status, headers: { 'content-length': '0' } });
}

type Answer = (body: unknown) => Response;
type Row = Readonly<Partial<Record<Caller, Answer>>>;

const toEveryAccount = (answer: Answer): Row => ({
  admin: answer,
  owner: answer,
  manager: answer,
  managerNoBranch: answer,
  soleOwner: answer,
});

function signInAnswer(body: unknown): Response {
  const email = (body as { email?: unknown } | undefined)?.email;
  const account = (Object.keys(SIGN_IN) as Account[]).find((a) => SIGN_IN[a].email === email);
  if (!account) throw new Error(`The probe has no account for ${String(email)}.`);
  const { fullName, role, venueId } = SIGN_IN[account];
  return json(200, {
    accessToken: accessToken(account),
    refreshToken: `refresh-${account}`,
    expiresInSeconds: 900,
    staffMemberId: CLAIMS[account].staffMemberId,
    fullName,
    role,
    ...(venueId ? { venueId } : {}),
  });
}

/**
 * The backend as the live probe found it, keyed by `METHOD /path` and then by
 * who is asking. The query string is not part of the key.
 *
 * Anything not listed (a route with no row, or a caller its row has no answer
 * for) is answered 404 with an empty body, which is what the real server says
 * about a route it does not have, and `unlisted()` reports it.
 */
const BACKEND: Readonly<Record<string, Row>> = {
  'POST /api/auth/venue/sign-in': { anonymous: signInAnswer },
  // Not probed. Only the teardown calls it, and the backend documents 204, always.
  'POST /api/auth/venue/sign-out': { anonymous: () => bare(204) },

  // The only read that lists a venue's branches, and it is PlatformAdminOnly.
  [`GET /api/platform/venues/${V}`]: {
    anonymous: () => bare(401),
    admin: () => json(200, VENUE_DETAIL),
    owner: () => bare(403),
    manager: () => bare(403),
    managerNoBranch: () => bare(403),
    soleOwner: () => bare(403),
  },

  // The read the fix added. `ManagerOrAbove` + `VenueScoped`, then the
  // caller's own staff row decides which branches come back.
  [`GET /api/venues/${V}/manage`]: {
    anonymous: () => bare(401),
    admin: () => json(200, managedVenue(V, 'Probe Cafe', 'probe-cafe', [NORTHERN, CASCADE])),
    owner: () => json(200, managedVenue(V, 'Probe Cafe', 'probe-cafe', [NORTHERN, CASCADE])),
    manager: () => json(200, managedVenue(V, 'Probe Cafe', 'probe-cafe', [CASCADE])),
    managerNoBranch: () =>
      json(200, managedVenue(V, 'Probe Cafe', 'probe-cafe', [NORTHERN, CASCADE])),
    // Another venue's owner: VenueScoped says no.
    soleOwner: () => bare(403),
  },
  [`GET /api/venues/${VS}/manage`]: {
    anonymous: () => bare(401),
    admin: () => json(200, managedVenue(VS, 'Sole Cafe', 'sole-cafe', [MAIN_STREET])),
    owner: () => bare(403),
    manager: () => bare(403),
    managerNoBranch: () => bare(403),
    soleOwner: () => json(200, managedVenue(VS, 'Sole Cafe', 'sole-cafe', [MAIN_STREET])),
  },

  // The floor plan admits every venue user on either of the venue's branches...
  [`GET /api/branches/${B1}/floor-plan`]: {
    anonymous: () => bare(401),
    ...toEveryAccount(() => json(200, floorPlan(B1))),
    soleOwner: () => bare(403),
  },
  [`GET /api/branches/${B2}/floor-plan`]: {
    anonymous: () => bare(401),
    ...toEveryAccount(() => json(200, floorPlan(B2))),
    soleOwner: () => bare(403),
  },
  [`GET /api/branches/${BS}/floor-plan`]: {
    anonymous: () => bare(401),
    admin: () => json(200, floorPlan(BS)),
    owner: () => bare(403),
    manager: () => bare(403),
    managerNoBranch: () => bare(403),
    soleOwner: () => json(200, floorPlan(BS)),
  },
  // ...and refuses them on another venue's.
  [`GET /api/branches/${BX}/floor-plan`]: {
    anonymous: () => bare(401),
    admin: () => json(200, floorPlan(BX)),
    owner: () => bare(403),
    manager: () => bare(403),
    managerNoBranch: () => bare(403),
    soleOwner: () => bare(403),
  },

  // No read of a venue that venue users may call exists yet. These two are
  // 404 for everyone the probe tried.
  'GET /api/venues': toEveryAccount(() => bare(404)),
  [`GET /api/venues/${V}`]: toEveryAccount(() => bare(404)),
};

interface Exchange {
  readonly request: string;
  readonly caller: Caller;
  readonly status: number;
  readonly listed: boolean;
}

const describeExchange = (exchange: Exchange) =>
  `${exchange.request} as ${exchange.caller} -> ${exchange.status}` +
  (exchange.listed ? '' : ' (not in the probe table)');

function serveTheProbedBackend() {
  const exchanges: Exchange[] = [];
  /** A test's own answers, consulted before the probe table. */
  const overrides = new Map<string, Row>();

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      const route = `${(init.method ?? 'GET').toUpperCase()} ${url.pathname}`;
      const caller = callerOf(new Headers(init.headers).get('authorization'));
      const answer = (overrides.get(route) ?? BACKEND[route])?.[caller];
      const body = typeof init.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
      const response = answer ? answer(body) : bare(404);
      exchanges.push({
        request: `${route}${url.search}`,
        caller,
        status: response.status,
        listed: answer !== undefined,
      });
      return response;
    }),
  );

  return {
    /** Replace one route's row for the rest of this test. */
    answer: (route: string, row: Row) => overrides.set(route, row),
    /** Every `METHOD /path` asked so far, in order. */
    requests: () => exchanges.map((exchange) => exchange.request),
    /** Every status the backend gave `METHOD /path`, in order. */
    statuses: (request: string) =>
      exchanges.filter((exchange) => exchange.request === request).map((e) => e.status),
    /** Requests the probe table had no answer for. */
    unlisted: () => exchanges.filter((exchange) => !exchange.listed).map(describeExchange),
    /** For failure messages: everything the console asked, and what it was told. */
    log: () =>
      ['The console asked the backend:', ...exchanges.map((e) => `  ${describeExchange(e)}`)].join(
        '\n',
      ),
  };
}

// --- Harness -------------------------------------------------------------------

let App: typeof AppComponent;
let auth: typeof AuthSessionModule;
let gateways: typeof GatewayModule;
let FloorPlanEditorScreen: typeof FloorPlanEditorScreenComponent;
let venueLayout: typeof VenueLayoutModule;
let backend: ReturnType<typeof serveTheProbedBackend>;

beforeAll(async () => {
  vi.stubEnv('VITE_DATA_SOURCE', 'real');
  vi.stubEnv('VITE_API_URL', 'http://localhost:5086');
  await initI18n({
    resources,
    deviceLocales: ['en'],
    namespaces: NAMESPACES,
    defaultNamespace: 'admin',
  });
  ({ App } = await import('../../App'));
  auth = await import('../../auth/authSession');
  gateways = await import('../../data/gateway');
  ({ FloorPlanEditorScreen } = await import('./floorplan/FloorPlanEditorScreen'));
  venueLayout = await import('./VenueLayout');
});

beforeEach(() => {
  backend = serveTheProbedBackend();
  // jsdom has no ResizeObserver, and the floor plan editor measures its canvas with one.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(async () => {
  cleanup();
  // Before the stub goes, so the revoke is answered here and never leaves the process.
  await auth.signOut();
  vi.unstubAllGlobals();
});

/**
 * The providers `bootstrap.tsx` renders, around the given tree. Against a real
 * backend `consoleGatewayFor` ignores its role argument: the role is the token's.
 */
function inProviders(
  children: ReactNode,
  consoleGateway?: ConsoleGateway,
  client = createQueryClient({ mutationNetworkMode: 'online' }),
) {
  return (
    <StrictMode>
      <I18nextProvider i18n={i18next}>
        <QueryClientProvider client={client}>
          <GatewayProvider
            gateway={gateways.staffGateway}
            consoleGateway={consoleGateway ?? gateways.consoleGatewayFor('owner')}
            staffGateway={gateways.staffDataGateway}
          >
            {children}
          </GatewayProvider>
        </QueryClientProvider>
      </I18nextProvider>
    </StrictMode>
  );
}

/** The sign-in form's own call: the sign-in response's identity, then the token pair. */
async function signInAs(account: Account) {
  await auth.signIn(SIGN_IN[account].email, PASSWORD);
}

/**
 * `client` is the app's `QueryClient` where a test needs the one thing
 * `bootstrap.tsx` has and a fresh render does not: a cache that outlives a
 * sign-out.
 */
function openTheConsoleAt(path: string, client?: QueryClient) {
  window.history.replaceState(null, '', path);
  return render(
    inProviders(
      <BrowserRouter>
        <App />
      </BrowserRouter>,
      undefined,
      client,
    ),
  );
}

/**
 * The layout alone, over the signed-in session, with a probe where a screen
 * would be: it prints what the outlet hands down.
 */
function openTheLayoutWithAProbe(user: ConsoleUser, consoleGateway?: ConsoleGateway) {
  const { VenueLayout, useVenueOutlet } = venueLayout;
  function Probe() {
    return <pre data-testid="outlet">{JSON.stringify(useVenueOutlet())}</pre>;
  }
  return render(
    inProviders(
      <MemoryRouter initialEntries={['/venue']}>
        <Routes>
          <Route path="/venue" element={<VenueLayout user={user} />}>
            <Route index element={<Probe />} />
          </Route>
        </Routes>
      </MemoryRouter>,
      consoleGateway,
    ),
  );
}

/** What the probe printed, once the layout has handed something down. */
async function outletContext(): Promise<Record<string, unknown>> {
  return waitFor(() => {
    const probe = screen.queryByTestId('outlet');
    expect(probe, backend.log()).not.toBeNull();
    return JSON.parse(probe!.textContent ?? '{}') as Record<string, unknown>;
  }, SETTLE);
}

/** The floor plan screen alone, handed a branch the way `VenueLayout` hands one down. */
function openTheFloorPlanScreenWith(branchId: string | null) {
  const context = {
    branchId,
    timeZoneId: 'Asia/Yerevan',
    branchCount: branchId ? 2 : 0,
    canRollUpVenue: false,
  };
  return render(
    inProviders(
      <MemoryRouter initialEntries={['/venue/floorplan']}>
        <Routes>
          <Route path="/venue" element={<Outlet context={context} />}>
            <Route path="floorplan" element={<FloorPlanEditorScreen />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    ),
  );
}

/** The floor plan screen's words for a user with no branch, from the en locale. */
const NO_BRANCH = 'This account has no branch to draw a plan for.';
/** The editor's header once a plan with nothing on it has loaded. */
const EMPTY_PLAN_LOADED = /^0 tables across 0 areas/u;
/** The notice for a read the server refused, from the en locale. */
const FORBIDDEN = 'Your account cannot see this.';
/** Long enough for every stubbed answer to land, so a failure below is the settled state. */
const SETTLE = { timeout: 3000 } as const;

/** Anything under the platform tier, which no venue user may call. */
const platformRequests = () => backend.requests().filter((r) => r.includes('/api/platform/'));

// --- The bug -------------------------------------------------------------------

describe('an owner created with no branch, in a venue with two', () => {
  it('lands on one of its branches, can switch to the other, and the floor plan loads', async () => {
    await signInAs('owner');
    openTheConsoleAt('/venue/floorplan');

    const switcher = await waitFor(() => {
      const found = screen.queryByLabelText(/^Branch$/u);
      expect(found, `There is no branch switcher.\n${backend.log()}`).toBeInstanceOf(
        HTMLSelectElement,
      );
      return found as HTMLSelectElement;
    }, SETTLE);
    expect([...switcher.options].map((option) => option.textContent).sort()).toEqual([
      'Cascade',
      'Northern Avenue',
    ]);
    const selected = switcher.value;
    expect([B1, B2]).toContain(selected);

    await waitFor(
      () => expect(screen.queryByText(EMPTY_PLAN_LOADED), backend.log()).not.toBeNull(),
      SETTLE,
    );
    expect(screen.queryByText(NO_BRANCH)).toBeNull();
    expect(backend.statuses(`GET /api/branches/${selected}/floor-plan`)).toContain(200);

    const other = selected === B1 ? B2 : B1;
    fireEvent.change(switcher, { target: { value: other } });
    await waitFor(
      () =>
        expect(backend.statuses(`GET /api/branches/${other}/floor-plan`), backend.log()).toContain(
          200,
        ),
      SETTLE,
    );
    expect(screen.queryByText(NO_BRANCH)).toBeNull();

    expect(backend.unlisted()).toEqual([]);
    // `unlisted()` cannot catch this: the platform row is listed, with its 403.
    expect(platformRequests()).toEqual([]);
  });
});

describe('a manager whose token names their branch', () => {
  it('lands on that branch, and the floor plan loads for it', async () => {
    await signInAs('manager');
    openTheConsoleAt('/venue/floorplan');

    await waitFor(
      () =>
        expect(
          backend.statuses(`GET /api/branches/${B2}/floor-plan`),
          `The floor plan was never loaded for the manager's branch.\n${backend.log()}`,
        ).toContain(200),
      SETTLE,
    );
    await waitFor(
      () => expect(screen.queryByText(EMPTY_PLAN_LOADED), backend.log()).not.toBeNull(),
      SETTLE,
    );
    expect(screen.queryByText(NO_BRANCH)).toBeNull();
    // The header names the branch being worked on.
    expect(screen.queryAllByText('Cascade')).not.toHaveLength(0);
    // And only that branch: the console shows a branch manager their own.
    expect(screen.queryByLabelText(/^Branch$/u)).toBeNull();

    expect(backend.unlisted()).toEqual([]);
    expect(platformRequests()).toEqual([]);
  });
});

describe('a manager created with no branch', () => {
  it('sees every branch of the venue, with the switcher', async () => {
    await signInAs('managerNoBranch');
    openTheConsoleAt('/venue/floorplan');

    const switcher = await waitFor(() => {
      const found = screen.queryByLabelText(/^Branch$/u);
      expect(found, `There is no branch switcher.\n${backend.log()}`).toBeInstanceOf(
        HTMLSelectElement,
      );
      return found as HTMLSelectElement;
    }, SETTLE);
    expect([...switcher.options].map((option) => option.textContent).sort()).toEqual([
      'Cascade',
      'Northern Avenue',
    ]);
    await waitFor(
      () => expect(screen.queryByText(EMPTY_PLAN_LOADED), backend.log()).not.toBeNull(),
      SETTLE,
    );
    expect(screen.queryByText(NO_BRANCH)).toBeNull();

    expect(backend.unlisted()).toEqual([]);
    expect(platformRequests()).toEqual([]);
  });
});

describe('an owner whose venue has exactly one branch', () => {
  // The venue the bug was reported from: created with its first branch, and
  // the owner added with no branch of their own.
  it('lands on that branch with the plan loaded, and gets no switcher', async () => {
    await signInAs('soleOwner');
    openTheConsoleAt('/venue/floorplan');

    await waitFor(
      () =>
        expect(
          backend.statuses(`GET /api/branches/${BS}/floor-plan`),
          `The floor plan was never loaded for the only branch.\n${backend.log()}`,
        ).toContain(200),
      SETTLE,
    );
    await waitFor(
      () => expect(screen.queryByText(EMPTY_PLAN_LOADED), backend.log()).not.toBeNull(),
      SETTLE,
    );
    expect(screen.queryByText(NO_BRANCH)).toBeNull();
    // Named in the header, as a fact rather than a control with one option.
    expect(screen.queryAllByText('Main Street')).not.toHaveLength(0);
    expect(screen.queryByLabelText(/^Branch$/u)).toBeNull();

    expect(backend.unlisted()).toEqual([]);
    expect(platformRequests()).toEqual([]);
  });
});

describe('when the venue read is refused', () => {
  it('says so, and does not tell the owner they have no branch', async () => {
    // The frontend deployed ahead of the backend, or a token for a venue this
    // one is not: either way the answer is a refusal, and a refusal must read
    // as one. "No branch" is a statement about the venue, and it is false.
    backend.answer(`GET /api/venues/${V}/manage`, {
      anonymous: () => bare(401),
      ...toEveryAccount(() => bare(403)),
    });
    await signInAs('owner');
    openTheConsoleAt('/venue/floorplan');

    await waitFor(
      () =>
        expect(
          screen.queryByText(FORBIDDEN),
          `The refusal notice was not shown.
${backend.log()}`,
        ).not.toBeNull(),
      SETTLE,
    );
    expect(screen.queryByText(NO_BRANCH)).toBeNull();
    expect(screen.queryByLabelText(/^Branch$/u)).toBeNull();
    // Nothing was asked for a branch nobody was told about.
    expect(backend.requests().filter((r) => r.includes('/floor-plan'))).toEqual([]);
    expect(platformRequests()).toEqual([]);
  });
});

describe('one browser tab, one person after another', () => {
  it("shows the next person to sign in their own branches, not the last person's", async () => {
    /*
     * The app's `QueryClient` is a module singleton (`bootstrap.tsx`) that
     * outlives a sign-out, and the managed-venue key is per venue, not per
     * caller. So the cache must be dropped when the session ends: otherwise a
     * branch manager who signs in after the owner, within `staleTime.reference`,
     * is handed the owner's answer — every branch, and a switcher — which is
     * the "a manager with a home branch sees only that branch" rule, broken.
     */
    const client = createQueryClient({ mutationNetworkMode: 'online' });

    await signInAs('owner');
    const asOwner = openTheConsoleAt('/venue/floorplan', client);
    await waitFor(
      () =>
        expect(screen.queryByLabelText(/^Branch$/u), backend.log()).toBeInstanceOf(
          HTMLSelectElement,
        ),
      SETTLE,
    );

    // Through the real session, so the app's own sign-out listener runs.
    await auth.signOut();
    asOwner.unmount();

    await signInAs('manager');
    openTheConsoleAt('/venue/floorplan', client);
    await waitFor(
      () =>
        expect(
          backend.statuses(`GET /api/branches/${B2}/floor-plan`),
          `The floor plan was never loaded for the manager's branch.
${backend.log()}`,
        ).toContain(200),
      SETTLE,
    );
    await waitFor(
      () => expect(screen.queryByText(EMPTY_PLAN_LOADED), backend.log()).not.toBeNull(),
      SETTLE,
    );
    expect(
      screen.queryByLabelText(/^Branch$/u),
      `The owner's branch list survived the sign-out.
${backend.log()}`,
    ).toBeNull();
    expect(screen.queryAllByText('Northern Avenue')).toHaveLength(0);
    expect(backend.statuses(`GET /api/venues/${V}/manage`)).toEqual([200, 200]);
  });

  it('shows the next person their own branches when the last session ended with nobody listening', async () => {
    /*
     * The sign-out listener above lives in the console's router. A session
     * can end while it is not mounted — the owner signs out from the
     * password page a sign-in link opens, which sits outside the console's
     * router on purpose, or a refresh is rejected there — and then nothing
     * has dropped the console's cache. The next person reaches the sign-in
     * form and signs in, and *that* path has to forget the last person's
     * data too, rather than trusting a sign-out event to have done it.
     */
    const client = createQueryClient({ mutationNetworkMode: 'online' });

    await signInAs('owner');
    const asOwner = openTheConsoleAt('/venue/floorplan', client);
    await waitFor(
      () =>
        expect(screen.queryByLabelText(/^Branch$/u), backend.log()).toBeInstanceOf(
          HTMLSelectElement,
        ),
      SETTLE,
    );

    // The owner opens a colleague's sign-in link and signs out from the
    // password page to clear the way. That page is outside the console's
    // router, so the console's listener is not mounted when the session ends.
    asOwner.unmount();
    const atTheLink = openTheConsoleAt('/reset-password#token=somebody-elses-link', client);
    fireEvent.click(await screen.findByRole('button', { name: /^Sign out$/u }, SETTLE));
    await waitFor(() => expect(screen.queryByLabelText(/^Email$/u)).toBeNull(), SETTLE);
    atTheLink.unmount();

    // The manager arrives at the console, is sent to the form, and signs in
    // through it — the sign-in route's own path, not the session directly.
    openTheConsoleAt('/venue/floorplan', client);
    await waitFor(() => expect(screen.queryByLabelText(/^Email$/u)).not.toBeNull(), SETTLE);
    fireEvent.change(screen.getByLabelText(/^Email$/u), {
      target: { value: SIGN_IN.manager.email },
    });
    fireEvent.change(screen.getByLabelText(/^Password$/u), { target: { value: PASSWORD } });
    fireEvent.click(screen.getByRole('button', { name: /^Sign in$/u }));

    await waitFor(
      () =>
        expect(
          backend.statuses(`GET /api/branches/${B2}/floor-plan`),
          `The floor plan was never loaded for the manager's branch.
${backend.log()}`,
        ).toContain(200),
      SETTLE,
    );
    // Signed in and past the form, on the manager's own answer.
    await screen.findByRole('navigation', { name: 'Yalla console' }, SETTLE);
    await waitFor(
      () => expect(backend.statuses(`GET /api/venues/${V}/manage`), backend.log()).toHaveLength(2),
      SETTLE,
    );
    expect(
      screen.queryByLabelText(/^Branch$/u),
      `The owner's branch list survived into the manager's sign-in.
${backend.log()}`,
    ).toBeNull();
    expect(screen.queryAllByText('Northern Avenue')).toHaveLength(0);
    expect(backend.statuses(`GET /api/venues/${V}/manage`)).toEqual([200, 200]);
  });
});

describe('what the layout hands down', () => {
  it('lets an owner with two branches roll reports up to the venue', async () => {
    await signInAs('owner');
    const user = await gateways.consoleGatewayFor('owner').getCurrentUser();
    openTheLayoutWithAProbe(user);

    const context = await outletContext();
    expect(context).toMatchObject({ branchCount: 2, canRollUpVenue: true });
    expect([B1, B2]).toContain(context['branchId']);
  });

  it('gives a manager with no branch every branch and no rollup', async () => {
    // The server allows the venue-wide rollup to an owner or the platform
    // admin only; offering it to a manager would be offering a 403.
    await signInAs('managerNoBranch');
    const user = await gateways.consoleGatewayFor('manager').getCurrentUser();
    openTheLayoutWithAProbe(user);

    const context = await outletContext();
    expect(context).toMatchObject({ branchCount: 2, canRollUpVenue: false });
  });

  it('gives a sole-branch owner no rollup either', async () => {
    await signInAs('soleOwner');
    const user = await gateways.consoleGatewayFor('owner').getCurrentUser();
    openTheLayoutWithAProbe(user);

    expect(await outletContext()).toMatchObject({
      branchId: BS,
      branchCount: 1,
      canRollUpVenue: false,
    });
  });

  it('takes the branch list from the venue read even when the token names no branch', async () => {
    /*
     * The second cause on its own. Here the venue read succeeds by
     * construction — a gateway whose venue reads both answer two branches —
     * and the only thing left to go wrong is the token: an owner's carries no
     * `branchId`, so `scope.branchIds` is empty. A layout that intersects the
     * list with that claim shows nothing, with the venue read answering 200.
     */
    await signInAs('owner');
    const real = gateways.consoleGatewayFor('owner');
    const user = await real.getCurrentUser();
    expect(user.scope.branchIds, 'the owner token must carry no branch').toEqual([]);

    const two: ManagedVenue = {
      id: V,
      name: 'Probe Cafe',
      slug: 'probe-cafe',
      type: 'cafe',
      status: 'active',
      branches: [B1, B2].map((id, index) => ({
        id,
        venueId: V,
        name: index === 0 ? 'Northern Avenue' : 'Cascade',
        slug: index === 0 ? 'northern-avenue' : 'cascade',
        timeZoneId: 'Asia/Yerevan',
        isActive: true,
        tableCount: 0,
        subscriptionTier: 'free' as const,
        openTabCount: null,
      })),
    };
    const answering: ConsoleGateway = {
      ...real,
      getVenue: async () => ({
        ...two,
        branchCount: 2,
        tableCount: 0,
        subscriptionTier: 'free',
        createdAtUtc: null,
        suspendedAtUtc: null,
        staff: null,
      }),
      getManagedVenue: async () => two,
    };
    openTheLayoutWithAProbe(user, answering);

    const switcher = await waitFor(() => {
      const found = screen.queryByLabelText(/^Branch$/u);
      expect(
        found,
        'The venue read answered two branches and the layout shows none.',
      ).toBeInstanceOf(HTMLSelectElement);
      return found as HTMLSelectElement;
    }, SETTLE);
    expect([...switcher.options].map((option) => option.textContent).sort()).toEqual([
      'Cascade',
      'Northern Avenue',
    ]);
    expect(await outletContext()).toMatchObject({ branchId: B1, branchCount: 2 });
  });
});

// --- Controls ------------------------------------------------------------------

/*
 * These pass on today's code, and they are why a failure above can be read as
 * the bug rather than the harness. Once a branch reaches the floor plan screen,
 * the stubbed answer renders as a loaded plan, and the no-branch sentence is
 * the one this file looks for. The stubbed venue body also carries both
 * branches through the real mapping.
 */
describe('the harness (controls, green today)', () => {
  it('shows the loaded plan when a branch reaches the floor plan screen, and the no-branch text when none does', async () => {
    await signInAs('owner');

    const withBranch = openTheFloorPlanScreenWith(B1);
    await waitFor(
      () => expect(screen.queryByText(EMPTY_PLAN_LOADED), backend.log()).not.toBeNull(),
      SETTLE,
    );
    expect(screen.queryByText(NO_BRANCH)).toBeNull();
    expect(backend.statuses(`GET /api/branches/${B1}/floor-plan`)).toContain(200);
    withBranch.unmount();

    openTheFloorPlanScreenWith(null);
    expect(screen.getByText(NO_BRANCH)).toBeTruthy();
  });

  it('maps the platform venue body to both branches, for the one caller that route admits', async () => {
    await signInAs('admin');

    const venue = await gateways.consoleGatewayFor('platformAdmin').getVenue(V);

    expect(venue?.branches.map((branch) => [branch.id, branch.name, branch.timeZoneId])).toEqual([
      [B1, 'Northern Avenue', 'Asia/Yerevan'],
      [B2, 'Cascade', 'Asia/Yerevan'],
    ]);
    expect(backend.statuses(`GET /api/platform/venues/${V}`)).toEqual([200]);
  });
});
