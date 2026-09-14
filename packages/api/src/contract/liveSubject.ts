import { ApiClient } from '../client';
import { createVenueUserAuth } from '../auth/endpoints';
import { createStaffAuth } from '../auth/staffEndpoints';
import type { StaffMember } from '../contracts/staff';
import type { components } from '../generated/schema';
import { createConsoleHttpGateway, createMemoryIdentityStore } from '../http/consoleHttpGateway';
import { createHttpGateway } from '../http/httpGateway';

import { installFetchBackedXhr } from './fetchXhr';
import type { ContractSubject } from './subject';
import { randomUuid } from './subject';
import { httpSubject, staticSession } from './subjects';

type Schemas = components['schemas'];

/** The development seed's venue and branch, preferred when the backend has several. */
const SEED_VENUE_SLUG = 'yalla-demo';
const SEED_BRANCH_SLUG = 'yerevan-centre';
const SEED_WAITER = 'Aram Waiter';
const SEED_MANAGER = 'Nune Manager';

function env(name: string): string | null {
  const value = (globalThis.process?.env?.[name] ?? '').trim();
  return value === '' ? null : value;
}

/** Four to eight digits is the server's rule; six, fresh per run, never printed. */
function randomPin(): string {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return String(bytes[0]! % 1_000_000).padStart(6, '0');
}

/**
 * Everything the live run acts as, signed in once before the first suite.
 *
 * 1. **The branch**, discovered through the public catalogue — the development
 *    seed's when it is there — because a container's seed makes new ids on
 *    every boot and a configured guid would fail for a reason unrelated to
 *    any contract.
 * 2. **A platform admin**, from `YALLA_CONTRACT_ADMIN_EMAIL` and
 *    `YALLA_CONTRACT_ADMIN_PASSWORD` (the backend's `PlatformAdmin:*`
 *    settings). Read from the environment only; never logged.
 * 3. **A waiter and a manager on a tablet**, the way a venue sets one up: the
 *    admin mints an enrolment code, the tablet redeems it, the admin sets each
 *    person a PIN, and each taps it in — `devices/enrolment-codes`, then
 *    `auth/staff/enrol`, then `staff/{id}/pin`, then `auth/staff/pin`.
 *
 * Diners are made per suite by `newDiner` — register, request-code with the
 * `developmentCode` Development returns, verify-code.
 *
 * A missing credential, a missing seeded person or a seeded branch with no menu
 * fails here, naming what is missing, rather than turning part of the live run
 * into skips. The live subject declares no gaps, and CI fails on any live test
 * that skipped.
 */
export async function resolveLiveSubject(baseUrl: string): Promise<ContractSubject> {
  installFetchBackedXhr();
  const anonymous = new ApiClient({ baseUrl });

  // --- 1. The branch --------------------------------------------------------------
  const { data: cards } = await anonymous.get<
    Schemas['Yalla.Application.Public.PublicVenueCard'][]
  >('/api/public/venues', { skipAuth: true });
  const card = cards.find((entry) => entry.venueSlug === SEED_VENUE_SLUG) ?? cards[0];
  const branchCard =
    card?.branches.find((entry) => entry.branchSlug === SEED_BRANCH_SLUG) ?? card?.branches[0];
  if (!branchCard) {
    throw new Error(
      `No published venue at ${baseUrl}. Start the backend with DevSeed__Enabled=true so the ` +
        'contract run has a branch to ask about.',
    );
  }
  const branchId = branchCard.branchId;

  const detail = await createHttpGateway(anonymous, { audience: 'diner' }).getBranchDetail(
    branchId,
  );
  if (!detail) throw new Error(`The public branch ${branchId} has no detail page.`);
  const venueId = detail.listing.venueId;

  // --- 2. The platform admin ------------------------------------------------------
  const email = env('YALLA_CONTRACT_ADMIN_EMAIL') ?? env('YALLA_CONTRACT_VENUE_EMAIL');
  const password = env('YALLA_CONTRACT_ADMIN_PASSWORD') ?? env('YALLA_CONTRACT_VENUE_PASSWORD');
  if (!email || !password) {
    throw new Error(
      'YALLA_CONTRACT_BASE_URL is set, so the live run needs a platform admin: set ' +
        "YALLA_CONTRACT_ADMIN_EMAIL and YALLA_CONTRACT_ADMIN_PASSWORD to the backend's " +
        'PlatformAdmin:Email and PlatformAdmin:Password.',
    );
  }

  let adminToken: string;
  try {
    const { tokens, identity } = await createVenueUserAuth(anonymous).signIn(email, password);
    if (identity.role !== 'platformAdmin') {
      throw new Error('The YALLA_CONTRACT_ADMIN_* account signed in, but not as a platform admin.');
    }
    adminToken = tokens.accessToken;
  } catch (error) {
    // The cause carries the URL and the server's answer, never what was sent.
    const status = (error as { status?: unknown }).status;
    throw new Error(
      `The platform admin sign-in failed${typeof status === 'number' ? ` (HTTP ${status})` : ''}: ` +
        "check YALLA_CONTRACT_ADMIN_EMAIL/PASSWORD against the backend's PlatformAdmin settings.",
      { cause: error },
    );
  }

  const admin = createConsoleHttpGateway(
    new ApiClient({ baseUrl, getToken: async () => adminToken }),
    { auth: staticSession(adminToken), identity: createMemoryIdentityStore() },
  );

  // --- 3. A waiter and a manager on an enrolled tablet ------------------------------
  const people = await admin.listStaff(venueId);
  const atBranch = (member: StaffMember, role: StaffMember['role']) =>
    member.isActive && member.role === role && member.branchId === branchId;
  const waiter =
    people.find((member) => atBranch(member, 'waiter') && member.fullName === SEED_WAITER) ??
    people.find((member) => atBranch(member, 'waiter'));
  const manager =
    people.find((member) => atBranch(member, 'manager') && member.fullName === SEED_MANAGER) ??
    people.find((member) => atBranch(member, 'manager'));
  if (!waiter || !manager) {
    throw new Error(
      `Branch ${branchId} has no active ${waiter ? 'manager' : 'waiter'} of its own. The ` +
        'development seed creates "Aram Waiter" and "Nune Manager"; start the backend with DevSeed on.',
    );
  }

  const pin = randomPin();
  await admin.setStaffPin({ venueId, staffMemberId: waiter.id, pin });
  await admin.setStaffPin({ venueId, staffMemberId: manager.id, pin });

  const { code } = await admin.createEnrolmentCode(branchId);
  const staffAuth = createStaffAuth(anonymous);
  const tablet = await staffAuth.enrol({
    code,
    deviceId: randomUuid(),
    deviceName: 'Contract run',
  });
  const waiterSession = await staffAuth.signInWithPin(tablet.deviceToken, {
    staffMemberId: waiter.id,
    pin,
  });
  const managerSession = await staffAuth.signInWithPin(tablet.deviceToken, {
    staffMemberId: manager.id,
    pin,
  });

  // --- 4. A menu to compare ---------------------------------------------------------
  // Read raw and anonymously, as the diner app reads it — not through the console
  // gateway under test. Asked through that gateway, a mapping that dropped every
  // item turned the whole menu contract into a skip, and CI stayed green.
  const { data: menu } = await anonymous.get<Schemas['Yalla.Application.Menus.BranchMenuView']>(
    `/api/branches/${branchId}/menu`,
    { skipAuth: true },
  );
  if (!menu.categories.some((category) => category.items.length > 0)) {
    throw new Error(
      `GET /api/branches/${branchId}/menu has no items. The development seed gives the demo ` +
        'branch a menu; start the backend with DevSeed on, so the menu contract has something to compare.',
    );
  }

  return httpSubject({
    baseUrl,
    branchId,
    timeZoneId: detail.listing.timeZoneId,
    adminToken,
    managerToken: managerSession.tokens.accessToken,
    waiterToken: waiterSession.tokens.accessToken,
  });
}
