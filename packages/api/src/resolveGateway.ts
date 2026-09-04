import { createApiClient, type TokenGetter } from './client';
import { resolveApiConfig } from './config';
import type { YallaGateway } from './gateway';
import { createHttpGateway } from './http/httpGateway';
import { createMockGateway } from './mocks/mockGateway';

export interface ResolveGatewayOptions {
  /** Backend origin. When absent or blank, the mock gateway is used. */
  readonly baseUrl?: string | undefined;
  /** Force the mock even if a base url is configured, e.g. for a demo build. */
  readonly forceMock?: boolean | undefined;
  readonly getToken?: TokenGetter | undefined;
  /** Simulated latency for the mock, so loading states are visible. */
  readonly mockLatencyMs?: number | undefined;
  /**
   * Make the next booking attempt lose the race, so the 409 path can be walked
   * without a second device. Mock only; ignored against a real backend.
   */
  readonly simulateTableTaken?: boolean | undefined;
}

/**
 * The single switch between mock data and a real backend.
 *
 * This is the only module that knows which one is in play. Every screen depends
 * on {@link YallaGateway}, so pointing the app at a live backend is a change
 * here and nowhere else.
 */
export function resolveGateway(options: ResolveGatewayOptions = {}): YallaGateway {
  const configured = options.baseUrl?.trim();

  if (options.forceMock || !configured) {
    return createMockGateway({
      latencyMs: options.mockLatencyMs ?? 250,
      simulateTableTaken: options.simulateTableTaken ?? false,
    });
  }

  const config = resolveApiConfig(configured);
  return createHttpGateway(
    createApiClient({ baseUrl: config.baseUrl, getToken: options.getToken }),
  );
}

/** True when {@link resolveGateway} would hand back the mock. */
export function isUsingMockData(options: ResolveGatewayOptions = {}): boolean {
  return Boolean(options.forceMock) || !options.baseUrl?.trim();
}
