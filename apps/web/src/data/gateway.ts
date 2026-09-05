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
    mock = resolveConsoleGateway({ dataSource: 'mock', mockLatencyMs: 200, mockRole: role });
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
export const staffGateway: YallaGateway = resolveGateway({
  dataSource: config.dataSource,
  baseUrl: config.api?.baseUrl,
  auth: authSession,
  audience: 'staff',
  mockLatencyMs: 200,
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
  auth: authSession,
  mockLatencyMs: 200,
  mockRaceOnTables: devRaceTables(),
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
  if (!import.meta.env.DEV || !usingMockData || typeof window === 'undefined') return undefined;
  const raw = new URLSearchParams(window.location.search).get('race');
  const tables = raw
    ?.split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return tables && tables.length > 0 ? tables : undefined;
}
