import type { AuthSession } from './auth/session';
import { createApiClient } from './client';
import type { DataSource } from './config';
import { createStaffHttpGateway } from './http/staffHttpGateway';
import { persistMockGateway } from './mocks/persistence';
import { createStaffMockGateway } from './mocks/staffMock';
import type { MockPersistence } from './resolveConsoleGateway';
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
  /**
   * Mock only: tables whose row version churns before the next transition.
   *
   * The other half of the conflict story. A race is a status that changed; this
   * is a status that did not, on a table that has been through a whole other
   * party — the case only the version can catch.
   */
  readonly mockChurnOnTables?: readonly string[] | undefined;
  /** Mock only: keep the world across a reload (QA F2). */
  readonly persist?: MockPersistence | undefined;
  /**
   * Mock only: an earlier-guest request and a promise to free a table on the
   * floor, so booking times can be walked. See `StaffMockOptions.seedBookingTimes`.
   */
  readonly mockBookingTimes?: boolean | undefined;
  /** Mock only: a busy kitchen pass. See `StaffMockOptions.seedKitchen`. */
  readonly mockKitchen?: boolean | undefined;
  /**
   * Mock only: two tables a scan seated with no verified number, waiting to be
   * let in. See `StaffMockOptions.seedUnverifiedGuests`.
   */
  readonly mockUnverifiedGuests?: boolean | undefined;
  /**
   * Mock only: pre-order cards on the rail and a held ticket in the kitchen
   * (2026-10-21). See `StaffMockOptions.seedPreOrders`.
   */
  readonly mockPreOrders?: boolean | undefined;
  /**
   * Mock only: takeaway orders at the counter — one to answer, one being
   * prepared, two ready, one handed over (2026-10-22). See
   * `StaffMockOptions.seedTakeaway`.
   */
  readonly mockTakeaway?: boolean | undefined;
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
    const shared = {
      ...(options.mockRaceOnTables ? { raceOnTables: options.mockRaceOnTables } : {}),
      ...(options.mockChurnOnTables ? { churnOnTables: options.mockChurnOnTables } : {}),
      ...(options.mockBookingTimes ? { seedBookingTimes: true } : {}),
      ...(options.mockKitchen ? { seedKitchen: true } : {}),
      ...(options.mockUnverifiedGuests ? { seedUnverifiedGuests: true } : {}),
      ...(options.mockPreOrders ? { seedPreOrders: true } : {}),
      ...(options.mockTakeaway ? { seedTakeaway: true } : {}),
    };
    if (options.persist) {
      return persistMockGateway<StaffGateway>({
        key: options.persist.key,
        storage: options.persist.storage ?? null,
        latencyMs: options.mockLatencyMs ?? 200,
        create: (inner) => createStaffMockGateway({ now: inner.now, latencyMs: 0, ...shared }),
      });
    }
    return createStaffMockGateway({ latencyMs: options.mockLatencyMs ?? 200, ...shared });
  }

  if (!options.baseUrl || !options.auth) {
    throw new Error(
      'resolveStaffGateway: a baseUrl and an auth session are required for the real data source.',
    );
  }

  return createStaffHttpGateway(createApiClient({ baseUrl: options.baseUrl, auth: options.auth }));
}
