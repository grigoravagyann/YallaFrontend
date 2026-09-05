import type { AuthSession } from './auth/session';
import { createApiClient } from './client';
import type { DataSource } from './config';
import type { ConsoleGateway } from './consoleGateway';
import type { UserRole } from './contracts/console';
import {
  createConsoleHttpGateway,
  createMemoryIdentityStore,
  type ConsoleIdentityStore,
} from './http/consoleHttpGateway';
import { createConsoleMockGateway } from './mocks/consoleMock';

export interface ResolveConsoleGatewayOptions {
  readonly dataSource: DataSource;
  /** Backend origin. Required for `real`; ignored for `mock`. */
  readonly baseUrl?: string | undefined;
  /** The venue-user session. Required for `real`. */
  readonly auth?: AuthSession | undefined;
  /** Where the sign-in result's display name is kept. Defaults to memory. */
  readonly identity?: ConsoleIdentityStore | undefined;
  readonly mockLatencyMs?: number | undefined;
  /**
   * Which role the *mock* reports as signed in.
   *
   * Ignored against a real backend, where the role comes from the token and
   * nothing the client sends can change it. This exists so all four tiers can
   * be walked in development without four accounts.
   */
  readonly mockRole?: UserRole | undefined;
}

/**
 * The single switch between console mock data and a real backend.
 *
 * The same shape as `resolveGateway` for the diner app, and for the same
 * reason: every console screen depends on {@link ConsoleGateway}, so pointing
 * the console at a live backend is a change here and nowhere else.
 */
export function resolveConsoleGateway(options: ResolveConsoleGatewayOptions): ConsoleGateway {
  if (options.dataSource === 'mock') {
    return createConsoleMockGateway({
      latencyMs: options.mockLatencyMs ?? 200,
      ...(options.mockRole ? { role: options.mockRole } : {}),
    });
  }

  if (!options.baseUrl || !options.auth) {
    throw new Error(
      'resolveConsoleGateway: a baseUrl and an auth session are required for the real data source.',
    );
  }

  return createConsoleHttpGateway(
    createApiClient({ baseUrl: options.baseUrl, auth: options.auth }),
    { auth: options.auth, identity: options.identity ?? createMemoryIdentityStore() },
  );
}
