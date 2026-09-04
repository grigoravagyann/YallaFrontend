import {
  resolveConsoleGateway,
  resolveGateway,
  type ConsoleGateway,
  type UserRole,
  type YallaGateway,
} from '@yalla/api';

/** Vite exposes only `VITE_`-prefixed variables to the client bundle. */
const baseUrl = import.meta.env['VITE_API_BASE_URL'] as string | undefined;

/**
 * The console's data source.
 *
 * A function rather than a constant because the dev role switcher has to be
 * able to ask for a differently-scoped mock. Against a real backend the role
 * argument is ignored entirely — `resolveConsoleGateway` drops it — so this
 * cannot become a way for the client to claim a role it was not granted.
 */
export function consoleGatewayFor(role: UserRole): ConsoleGateway {
  return resolveConsoleGateway({
    baseUrl,
    mockLatencyMs: 200,
    mockRole: role,
  });
}

/**
 * The diner-side gateway, used by the staff floor screen for the floor plan
 * itself. Same interface the phone uses, same data, one renderer.
 */
export const dinerGateway: YallaGateway = resolveGateway({ baseUrl, mockLatencyMs: 200 });

export const usingMockData = !baseUrl?.trim();
