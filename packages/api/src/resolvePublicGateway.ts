import { createApiClient } from './client';
import type { DataSource } from './config';
import type { YallaGateway } from './gateway';
import { createPublicHttpGateway } from './http/publicHttpGateway';
import { createPublicMockGateway } from './mocks/publicMock';
import type { PublicGateway } from './publicGateway';

export interface ResolvePublicGatewayOptions {
  readonly dataSource: DataSource;
  /** Backend origin. Required for `real`; ignored for `mock`. */
  readonly baseUrl?: string | undefined;
  /**
   * The diner gateway this page shares a world with.
   *
   * Required for both data sources, and for different reasons. Against the real
   * backend it is what the page reads the floor, the availability and the menu
   * from — the endpoints that already exist. Against the mock it is the *state*
   * the public reads are derived from, so the free-table count moves when a
   * booking is made and the manage-booking link finds the booking the
   * confirmation screen just created.
   */
  readonly gateway: YallaGateway;
  readonly mockLatencyMs?: number | undefined;
}

/**
 * The one switch between the public page's mock and the real backend.
 *
 * Deliberately never falls back from real to mock. A page that quietly served
 * an invented free-table count for a real venue would be indistinguishable from
 * one that worked, on the screen a stranger judges the whole product by, and
 * the venue would find out when four people arrived for two tables.
 */
export function resolvePublicGateway(options: ResolvePublicGatewayOptions): PublicGateway {
  if (options.dataSource === 'mock') {
    return createPublicMockGateway({
      gateway: options.gateway,
      latencyMs: options.mockLatencyMs ?? 250,
    });
  }

  if (!options.baseUrl) {
    throw new Error('resolvePublicGateway: a baseUrl is required for the real data source.');
  }

  return createPublicHttpGateway(createApiClient({ baseUrl: options.baseUrl }));
}
