import { createApiClient, type TokenGetter } from './client';
import { resolveApiConfig } from './config';
import type { ConsoleGateway } from './consoleGateway';
import type { UserRole } from './contracts/console';
import { createConsoleHttpGateway } from './http/consoleHttpGateway';
import { createConsoleMockGateway } from './mocks/consoleMock';

export interface ResolveConsoleGatewayOptions {
  /** Backend origin. When absent or blank, the mock gateway is used. */
  readonly baseUrl?: string | undefined;
  readonly forceMock?: boolean | undefined;
  readonly getToken?: TokenGetter | undefined;
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
export function resolveConsoleGateway(options: ResolveConsoleGatewayOptions = {}): ConsoleGateway {
  const configured = options.baseUrl?.trim();

  if (options.forceMock || !configured) {
    return createConsoleMockGateway({
      latencyMs: options.mockLatencyMs ?? 200,
      ...(options.mockRole ? { role: options.mockRole } : {}),
    });
  }

  const config = resolveApiConfig(configured);
  return createConsoleHttpGateway(
    createApiClient({ baseUrl: config.baseUrl, getToken: options.getToken }),
  );
}
