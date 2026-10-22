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
import { persistMockGateway, type MockJournalStorage } from './mocks/persistence';

/**
 * Keep the mock world across a full page load (QA F2).
 *
 * `key` names the world; `storage` is where it is kept — the caller passes
 * `browserMockStorage()` for the browser's `localStorage` — and absent or
 * `null` keeps it in memory, which is what every test wants. The resolvers do
 * not reach for `localStorage` themselves: the public branch page imports
 * `resolveGateway`, and that page's bundle may not name a storage API at all
 * (`apps/web/src/productionBundle.test.ts`).
 */
export interface MockPersistence {
  readonly key: string;
  readonly storage?: MockJournalStorage | null | undefined;
}

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
  /**
   * Mock only: Northern Avenue takes pre-orders (the gata excluded) and a
   * pending booking carries one (2026-10-21). See `ConsoleMockOptions.seedPreOrders`.
   */
  readonly mockPreOrders?: boolean | undefined;
  /**
   * Mock only: Northern Avenue takes takeaway orders, its matnakash eggs
   * hall-only (2026-10-22). See `ConsoleMockOptions.seedTakeaway`.
   */
  readonly mockTakeaway?: boolean | undefined;
  /** Mock only: keep the world across a reload. See {@link MockPersistence}. */
  readonly persist?: MockPersistence | undefined;
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
    const role = {
      ...(options.mockRole ? { role: options.mockRole } : {}),
      ...(options.mockPreOrders ? { seedPreOrders: true } : {}),
      ...(options.mockTakeaway ? { seedTakeaway: true } : {}),
    };
    if (options.persist) {
      return persistMockGateway<ConsoleGateway>({
        key: options.persist.key,
        storage: options.persist.storage ?? null,
        latencyMs: options.mockLatencyMs ?? 200,
        // The menu report is deliberately the slow one; see the mock.
        slow: { getMenuReport: 3 },
        create: (inner) => createConsoleMockGateway({ now: inner.now, latencyMs: 0, ...role }),
      });
    }
    return createConsoleMockGateway({
      latencyMs: options.mockLatencyMs ?? 200,
      ...role,
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
