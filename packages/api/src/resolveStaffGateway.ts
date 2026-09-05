import type { AuthSession } from './auth/session';
import { createApiClient } from './client';
import type { DataSource } from './config';
import { createStaffHttpGateway } from './http/staffHttpGateway';
import { createStaffMockGateway } from './mocks/staffMock';
import type { StaffGateway } from './staffGateway';

export interface ResolveStaffGatewayOptions {
  readonly dataSource: DataSource;
  /** Backend origin. Required for `real`; ignored for `mock`. */
  readonly baseUrl?: string | undefined;
  /** The venue-user session. Required for `real`. */
  readonly auth?: AuthSession | undefined;
  readonly mockLatencyMs?: number | undefined;
  /** Mock only: tables whose next transition loses a race. See the mock. */
  readonly mockRaceOnTables?: readonly string[] | undefined;
}

/**
 * The single switch between the mock service and a real backend.
 *
 * Same shape as the other two resolvers, and for the same reason: every counter
 * screen depends on {@link StaffGateway}, so pointing the tablet at a live
 * backend is a change here and nowhere else.
 *
 * There is deliberately **no** automatic fallback from real to mock. A tablet
 * that quietly starts inventing orders when the backend is unreachable is the
 * single worst failure this screen has, and it would look like everything
 * working. Unreachable is reported as unreachable.
 */
export function resolveStaffGateway(options: ResolveStaffGatewayOptions): StaffGateway {
  if (options.dataSource === 'mock') {
    return createStaffMockGateway({
      latencyMs: options.mockLatencyMs ?? 200,
      ...(options.mockRaceOnTables ? { raceOnTables: options.mockRaceOnTables } : {}),
    });
  }

  if (!options.baseUrl || !options.auth) {
    throw new Error(
      'resolveStaffGateway: a baseUrl and an auth session are required for the real data source.',
    );
  }

  return createStaffHttpGateway(createApiClient({ baseUrl: options.baseUrl, auth: options.auth }));
}
