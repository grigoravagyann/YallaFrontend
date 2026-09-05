import {
  resolveConsoleGateway,
  resolveGateway,
  type ConsoleGateway,
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
