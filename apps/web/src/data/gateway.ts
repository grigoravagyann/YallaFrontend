import {
  resolveConsoleGateway,
  resolveGateway,
  resolveStaffGateway,
  type ConsoleGateway,
  type StaffGateway,
  type UserRole,
  type YallaGateway,
} from '@yalla/api';
import { authSession, identityStore } from '../auth/authSession';
import { readConfig } from '../config';
import { staffSession } from '../staff/auth/staffSession';
import { mockPersistence } from './mockWorld';

const config = readConfig();

export const usingMockData = config.dataSource === 'mock';

const realConsole: ConsoleGateway | null = config.api
  ? resolveConsoleGateway({
      dataSource: 'real',
      baseUrl: config.api.baseUrl,
      auth: authSession,
      identity: identityStore,
    })
  : null;

/** One mock per role, so a suspension made as an owner is still there after a re-render. */
const mockConsoles = new Map<UserRole, ConsoleGateway>();

/**
 * The console's data source.
 *
 * A function rather than a constant because the dev role switcher has to be
 * able to ask for a differently-scoped mock. Against a real backend the role
 * argument is ignored entirely — the role comes out of the token — so this
 * cannot become a way for the client to claim a role it was not granted.
 */
export function consoleGatewayFor(role: UserRole): ConsoleGateway {
  if (realConsole) return realConsole;

  let mock = mockConsoles.get(role);
  if (!mock) {
    mock = resolveConsoleGateway({
      dataSource: 'mock',
      mockLatencyMs: 200,
      mockRole: role,
      // Mock only: Northern Avenue takes pre-orders, and a pending booking has one.
      mockPreOrders: import.meta.env.MODE !== 'test',
      // Mock only: Northern Avenue takes takeaway, the matnakash eggs hall-only.
      mockTakeaway: import.meta.env.MODE !== 'test',
      persist: mockPersistence(`console.${role}`),
    });
    mockConsoles.set(role, mock);
  }
  return mock;
}

/**
 * The floor, for the staff screen.
 *
 * The same `YallaGateway` the phone uses — same read model, same renderer, so a
 * diner and a waiter cannot disagree about where table 7 is — in its staff
 * audience, which reads the richer staff-only floor endpoint with the venue
 * user's token.
 */
/**
 * The console reads a manager's phone makes on `/staff` (staff phone, the
 * Today artboard) — today's overview of the branch — with the phone's own
 * PIN session, not the console user's: `GET /api/branches/{id}/overview` is
 * `ManagerOrAbove` and branch-scoped, which a manager's PIN session passes.
 * Nothing else of the console is reached this way.
 *
 * The mock has one console world per role, so it is the console's own mock.
 */
const realStaffConsole: ConsoleGateway | null =
  config.api && staffSession
    ? resolveConsoleGateway({
        dataSource: 'real',
        baseUrl: config.api.baseUrl,
        auth: staffSession,
      })
    : null;

export function staffOverviewGateway(role: UserRole): Pick<ConsoleGateway, 'getBranchOverview'> {
  return realStaffConsole ?? consoleGatewayFor(role);
}

export const staffGateway: YallaGateway = resolveGateway({
  dataSource: config.dataSource,
  baseUrl: config.api?.baseUrl,
  auth: authSession,
  audience: 'staff',
  mockLatencyMs: 200,
  persist: mockPersistence('diner.staff'),
});

/**
 * The counter screen's data source.
 *
 * A third gateway rather than more methods on the two above, because the split
 * is a permission boundary: nothing in the diner's bundle should be able to
 * void a line, and nothing in the owner's admin panel should be able to seat a
 * table.
 *
 * There is deliberately no fallback to the mock when the backend is
 * unreachable. A tablet that quietly starts inventing orders and balances would
 * look exactly like one that is working, on the screen where that costs the
 * most.
 */
export const staffDataGateway: StaffGateway = resolveStaffGateway({
  dataSource: config.dataSource,
  baseUrl: config.api?.baseUrl,
  // The tablet's own session, not the console user's. A waiter has no venue
  // account, and a counter screen holding an owner's token would be a shared
  // login with a floor plan attached.
  auth: staffSession ?? authSession,
  mockLatencyMs: 200,
  mockRaceOnTables: devRaceTables(),
  mockChurnOnTables: devChurnTables(),
  // Mock only: an earlier-guest request and a promised free-by on the floor,
  // so booking times can be walked. Never in tests, which read the plain room.
  mockBookingTimes: import.meta.env.MODE !== 'test',
  // Mock only: a busy kitchen pass — late tickets, notes, one from the app.
  mockKitchen: import.meta.env.MODE !== 'test',
  // Mock only: tables waiting for a waiter to let them in.
  mockUnverifiedGuests: import.meta.env.MODE !== 'test',
  // Mock only: pre-orders on the rail (one on the way, one to call, one sent
  // and held in the kitchen) and one still to come.
  mockPreOrders: import.meta.env.MODE !== 'test',
  // Mock only: takeaway at the counter — one to answer, one being prepared,
  // two ready (one long enough for "No-show"), one handed over.
  mockTakeaway: import.meta.env.MODE !== 'test',
  persist: mockPersistence('staff'),
});

/**
 * `?race=t4,t5` in development: the next transition on those tables is refused
 * as though another waiter got there first.
 *
 * One device cannot race itself, so this is the only way to walk the live-race
 * message and the conflict list in a browser. Gated twice — a development build
 * *and* mock data — so it cannot exist in anything a venue installs, and it is
 * ignored entirely against a real backend, where the server decides who won.
 */
function devRaceTables(): readonly string[] | undefined {
  return devTables('race');
}

/**
 * `?churn=t4` in development: the table's row version moves without its status
 * moving, as though a whole other party had been seated and had left.
 *
 * The one conflict a status check cannot catch, and therefore the only way to
 * walk the second half of the conflict list's copy from one device. Gated
 * exactly as `?race=` is.
 */
function devChurnTables(): readonly string[] | undefined {
  return devTables('churn');
}

function devTables(param: 'race' | 'churn'): readonly string[] | undefined {
  if (!import.meta.env.DEV || !usingMockData || typeof window === 'undefined') return undefined;
  const raw = new URLSearchParams(window.location.search).get(param);
  const tables = raw
    ?.split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return tables && tables.length > 0 ? tables : undefined;
}
