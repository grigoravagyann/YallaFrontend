import {
  createMockGateway,
  createPublicMockGateway,
  createQueryClient,
  type PublicGateway,
  type YallaGateway,
} from '@yalla/api';
import { GatewayProvider } from '@yalla/api/react';
import { I18nextProvider, i18next, initI18n } from '@yalla/i18n';
import { PUBLIC_NAMESPACES, publicResources } from '@yalla/i18n/public';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';

/**
 * The public page's providers, assembled the way `bootstrapPublic` assembles
 * them — with the real mock gateways rather than hand-written fakes.
 *
 * Using the real mocks is the point. `createPublicMockGateway` is composed over
 * `createMockGateway` and shares its world, so a booking made in a test is
 * visible to the manage-booking link in the same test, the free-table count
 * moves when a table is taken, and a 409 arrives with a genuinely refreshed
 * floor attached. A hand-rolled stub would let every one of those go quietly
 * out of step with the shapes the page is typed against.
 *
 * Not a `.test.ts` file and not imported by anything the app ships, so it never
 * reaches a bundle — `bundle.test.ts` would notice if it did.
 */

export interface Harness {
  readonly gateway: YallaGateway;
  readonly publicGateway: PublicGateway;
  readonly queryClient: QueryClient;
  /**
   * Wrap a tree in the page's providers, at `path`.
   *
   * The path is an argument here rather than an option on the harness so a test
   * can make a booking in the world *and then* open its own manage link, which
   * is the flow that matters and which two separate harnesses could not
   * express: two harnesses are two worlds, and the link from one would be dead
   * in the other.
   */
  readonly wrap: (children: ReactNode, path?: string) => ReactNode;
}

/**
 * Load the real translation bundles once per process.
 *
 * The real ones, not a `{}` stub: half of what these tests assert is that the
 * page says a *particular sentence* — "not available", the taken-table line,
 * the confirmed title — and a stub that returned key paths would make every one
 * of those assertions pass against an empty page.
 */
let ready: Promise<unknown> | null = null;

export function initTestI18n(): Promise<unknown> {
  ready ??= initI18n({
    resources: publicResources,
    deviceLocales: ['en'],
    namespaces: PUBLIC_NAMESPACES,
    defaultNamespace: 'public',
  });
  return ready;
}

export interface HarnessOptions {
  /** Force the next booking attempt to lose the race, for the 409 path. */
  readonly simulateTableTaken?: boolean;
}

export function createHarness(options: HarnessOptions = {}): Harness {
  const gateway = createMockGateway({
    latencyMs: 0,
    simulateTableTaken: options.simulateTableTaken ?? false,
    // Off: a guest wandering onto a tab mid-test is a timer firing inside an
    // assertion, which is a flake and never a finding.
    simulateJoiners: false,
  });
  const publicGateway = createPublicMockGateway({ gateway });
  // Retry off, so a deliberate failure is one attempt and not four.
  const queryClient = createQueryClient({ retry: false, mutationNetworkMode: 'always' });

  const wrap = (children: ReactNode, path = '/'): ReactNode => (
    <I18nextProvider i18n={i18next}>
      <QueryClientProvider client={queryClient}>
        <GatewayProvider gateway={gateway} publicGateway={publicGateway}>
          <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>
        </GatewayProvider>
      </QueryClientProvider>
    </I18nextProvider>
  );

  return { gateway, publicGateway, queryClient, wrap };
}

/**
 * An `IntersectionObserver` that never intersects.
 *
 * jsdom has none, and the room's loader fails *open* without one — which is
 * right in a browser (an old browser should see the room, not a permanent
 * placeholder) and wrong in a test, where it would pull `react-native-web` and
 * `react-native-svg` into every render. This stub reproduces the real state
 * these tests care about: the room is below the fold and has not been scrolled
 * to, so the renderer has not been fetched.
 */
export function stubIntersectionObserverAsNeverVisible(): void {
  class NeverIntersecting {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
    takeRecords(): [] {
      return [];
    }
    readonly root = null;
    readonly rootMargin = '';
    readonly thresholds: readonly number[] = [];
  }

  Object.defineProperty(globalThis, 'IntersectionObserver', {
    writable: true,
    configurable: true,
    value: NeverIntersecting,
  });
}
