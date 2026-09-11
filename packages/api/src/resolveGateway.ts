import type { AuthSession } from './auth/session';
import { createApiClient } from './client';
import type { DataSource } from './config';
import type { YallaGateway } from './gateway';
import { createHttpGateway, type GatewayAudience } from './http/httpGateway';
import { createMockGateway } from './mocks/mockGateway';

export interface ResolveGatewayOptions {
  /** `real` (the default) or `mock`. Read from the app's data-source flag. */
  readonly dataSource: DataSource;
  /** Backend origin. Required for `real`; ignored for `mock`. */
  readonly baseUrl?: string | undefined;
  /** The diner session. Required for `real`. */
  readonly auth?: AuthSession | undefined;
  readonly audience?: GatewayAudience | undefined;
  /** Simulated latency for the mock, so loading states are visible. */
  readonly mockLatencyMs?: number | undefined;
  /**
   * Make the next booking attempt lose the race, so the 409 path can be walked
   * without a second device. Mock only; ignored against a real backend.
   */
  readonly simulateTableTaken?: boolean | undefined;
  /** This install's device id, for opening and joining tabs. Real only. */
  readonly deviceId?: (() => Promise<string>) | undefined;
}

/**
 * The single switch between mock data and a real backend.
 *
 * This is the only module that knows which one is in play. Every screen depends
 * on {@link YallaGateway}, so pointing the app at a live backend is a change
 * here and nowhere else.
 *
 * Both implementations stay, selected by a flag that defaults to real. A
 * second developer can build screens with no backend running, and when a
 * screen misbehaves, flipping to mock says instantly whether the bug is in the
 * UI or the API.
 */
export function resolveGateway(options: ResolveGatewayOptions): YallaGateway {
  if (options.dataSource === 'mock') {
    return createMockGateway({
      latencyMs: options.mockLatencyMs ?? 250,
      simulateTableTaken: options.simulateTableTaken ?? false,
    });
  }

  if (!options.baseUrl) {
    throw new Error('resolveGateway: a baseUrl is required for the real data source.');
  }

  // Every method is real. There is no mock fallback any more: a real data
  // source that quietly answered bookings and tabs from memory is how no
  // reservation and no tab ever reached the backend.
  return createHttpGateway(createApiClient({ baseUrl: options.baseUrl, auth: options.auth }), {
    audience: options.audience ?? 'diner',
    auth: options.auth,
    deviceId: options.deviceId,
  });
}
