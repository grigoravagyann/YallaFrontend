import {
  createConsoleMockGateway,
  createQueryClient,
  type ConsoleGateway,
  type ReportQuery,
} from '@yalla/api';
import { GatewayProvider } from '@yalla/api/react';
import { I18nextProvider, i18next, initI18n } from '@yalla/i18n';
import { NAMESPACES, resources } from '@yalla/i18n/resources';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';

/**
 * The console's providers, with the real console mock behind them.
 *
 * The real mock rather than a hand-written stub, for the same reason the public
 * page's harness uses the real one: the report generator, the menu it names
 * items from and the CSV writer all live in `@yalla/api`, and a stub would let
 * the screen and the data source drift apart exactly where these tests claim
 * they cannot.
 *
 * Not a `.test.tsx`, so nothing imports it into a bundle — `productionBundle`
 * would notice if it did.
 */

export interface ConsoleHarness {
  readonly gateway: ConsoleGateway;
  readonly queryClient: QueryClient;
  readonly wrap: (children: ReactNode, path?: string) => ReactNode;
}

/**
 * The whole resource map, unlike the public page's narrow one.
 *
 * The console renders `admin`, and this screen is the most prose-heavy thing in
 * it. Half of what these tests assert is that a *particular sentence* appears —
 * the over-policy reading, the empty-range wording — and a stub returning key
 * paths would make every one of those assertions pass against a blank screen.
 */
let ready: Promise<unknown> | null = null;

export function initConsoleTestI18n(): Promise<unknown> {
  ready ??= initI18n({
    resources,
    deviceLocales: ['en'],
    namespaces: NAMESPACES,
    defaultNamespace: 'admin',
  });
  return ready;
}

export function createConsoleHarness(
  options: { readonly gateway?: ConsoleGateway } = {},
): ConsoleHarness {
  const gateway = options.gateway ?? createConsoleMockGateway({ latencyMs: 0 });
  // Retry off: a deliberate failure should be one attempt, not four, and the
  // section-fails-independently test would otherwise take seconds to settle.
  const queryClient = createQueryClient({ retry: false, mutationNetworkMode: 'always' });

  const wrap = (children: ReactNode, path = '/venue/reports'): ReactNode => (
    <I18nextProvider i18n={i18next}>
      <QueryClientProvider client={queryClient}>
        <GatewayProvider consoleGateway={gateway}>
          <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>
        </GatewayProvider>
      </QueryClientProvider>
    </I18nextProvider>
  );

  return { gateway, queryClient, wrap };
}

/**
 * A gateway whose report methods can be individually broken or watched.
 *
 * Built by wrapping the real mock rather than replacing it, so a method nobody
 * overrides still answers with the real fixture shapes.
 */
export function instrumentedGateway(
  overrides: {
    readonly failing?: readonly ('occupancy' | 'reservations' | 'revenue' | 'menu' | 'staff')[];
    readonly onQuery?: (section: string, query: ReportQuery) => void;
  } = {},
): ConsoleGateway {
  const base = createConsoleMockGateway({ latencyMs: 0 });
  const failing = new Set(overrides.failing ?? []);

  function guard<T>(
    section: 'occupancy' | 'reservations' | 'revenue' | 'menu' | 'staff',
    run: (query: ReportQuery) => Promise<T>,
  ) {
    return async (query: ReportQuery): Promise<T> => {
      overrides.onQuery?.(section, query);
      if (failing.has(section)) throw new Error(`${section} report is down`);
      return run(query);
    };
  }

  return {
    ...base,
    getOccupancyReport: guard('occupancy', (q) => base.getOccupancyReport(q)),
    getReservationReport: guard('reservations', (q) => base.getReservationReport(q)),
    getRevenueReport: guard('revenue', (q) => base.getRevenueReport(q)),
    getMenuReport: guard('menu', (q) => base.getMenuReport(q)),
    getStaffReport: guard('staff', (q) => base.getStaffReport(q)),
  };
}
