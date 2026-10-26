import { describe, expect, it, vi } from 'vitest';
import { createAuthSession } from '../auth/session';
import { createMemoryTokenStorage } from '../auth/storage';
import { OPEN_ENDED_BUCKET } from '../contracts/reports';
import { createConsoleMockGateway } from '../mocks/consoleMock';
import { createConsoleHttpGateway, createMemoryIdentityStore } from './consoleHttpGateway';
import { fakeBackend, type FakeRoute } from './fakeBackend.testkit';

/**
 * The reports' phase-5 fields (VC5 wire §2): closed bills compared and the
 * previous period day by day on revenue; guests by kind and table turnover on
 * occupancy.
 */

function gatewayOver(routes: Record<string, FakeRoute>) {
  const backend = fakeBackend(routes);
  const auth = createAuthSession({
    storage: createMemoryTokenStorage('refresh-0'),
    refreshTokens: vi.fn(),
  });
  return createConsoleHttpGateway(backend.client({ getToken: () => 'held-token' }), {
    auth,
    identity: createMemoryIdentityStore(),
  });
}

const scope = {
  branchIds: ['b-1'],
  range: { fromLocalDate: '2026-10-12', toLocalDate: '2026-10-13', days: 2 },
  timeZoneId: 'Asia/Yerevan',
};
const none = { value: 0 };
const query = { branchId: 'b-1', from: '2026-10-12', to: '2026-10-13' };

function revenue(extra: Record<string, unknown> = {}) {
  return {
    scope,
    totalAmd: { value: 300, previous: 200, changeFraction: 0.5 },
    serviceChargeAmd: none,
    averageTabAmd: none,
    averagePerHeadAmd: none,
    byDay: [
      { localDate: '2026-10-12', revenueAmd: 100, tabs: 1, takeawayAmd: 0, takeawayOrders: 0 },
      { localDate: '2026-10-13', revenueAmd: 200, tabs: 2, takeawayAmd: 0, takeawayOrders: 0 },
    ],
    byHour: [],
    cashAmd: none,
    inAppAmd: none,
    adjustments: [],
    adjustmentsTotalAmd: none,
    tabs: none,
    previousByDay: [],
    cardAmd: none,
    hallAmd: none,
    takeawayAmd: none,
    takeawayOrders: none,
    takeawayNotCollected: none,
    ...extra,
  };
}

function occupancy(extra: Record<string, unknown> = {}) {
  return {
    scope,
    sessions: none,
    byHour: [],
    byWeekday: [],
    turnTime: {
      policyTurnTimeMinutes: 120,
      buckets: [],
      overPolicyFraction: 0,
      closedSessions: 0,
    },
    seatsFilled: none,
    seatsAvailable: 0,
    walkIns: none,
    fromReservations: none,
    walkInGuests: none,
    reservationGuests: none,
    turnsPerTable: none,
    activeTables: 0,
    ...extra,
  };
}

describe('the phase-5 report fields over HTTP', () => {
  it('reads closed bills and the previous period, day by day', async () => {
    const gateway = gatewayOver({
      'GET /api/branches/b-1/reports/revenue': {
        body: revenue({
          tabs: { value: 3, previous: 4, changeFraction: -0.25 },
          previousByDay: [
            { localDate: '2026-10-10', revenueAmd: 50, tabs: 1, takeawayAmd: 0, takeawayOrders: 0 },
            {
              localDate: '2026-10-11',
              revenueAmd: 150,
              tabs: 3,
              takeawayAmd: 0,
              takeawayOrders: 0,
            },
          ],
        }),
      },
    });
    const report = await gateway.getRevenueReport(query);
    expect(report.tabs).toEqual({ value: 3, previous: 4, changeFraction: -0.25 });
    expect(report.previousByDay.map((day) => day.revenueAmd)).toEqual([50, 150]);
  });

  it('reads guests by kind and the table turnover', async () => {
    const gateway = gatewayOver({
      'GET /api/branches/b-1/reports/occupancy': {
        body: occupancy({
          walkInGuests: { value: 40 },
          reservationGuests: { value: 60, previous: 50, changeFraction: 0.2 },
          turnsPerTable: { value: 3.1, previous: 3.1, changeFraction: 0 },
          activeTables: 12,
        }),
      },
    });
    const report = await gateway.getOccupancyReport(query);
    expect(report.walkInGuests).toEqual({ value: 40, previous: null, changeFraction: null });
    expect(report.reservationGuests.previous).toBe(50);
    expect(report.turnsPerTable.value).toBe(3.1);
    expect(report.activeTables).toBe(12);
  });
});

describe('the mock reports, as the VC5 server answers', () => {
  const gateway = createConsoleMockGateway({ latencyMs: 0 });
  const week = { branchId: 'b-lumen-north', from: '2026-08-31', to: '2026-09-06' };

  it('answers every day of the range and of the period before, pair by pair', async () => {
    const report = await gateway.getRevenueReport(week);
    expect(report.byDay.map((day) => day.localDate)).toEqual([
      '2026-08-31',
      '2026-09-01',
      '2026-09-02',
      '2026-09-03',
      '2026-09-04',
      '2026-09-05',
      '2026-09-06',
    ]);
    expect(report.previousByDay?.[0]?.localDate).toBe('2026-08-24');
    expect(report.previousByDay).toHaveLength(7);
    expect(report.tabs?.value).toBe(report.byDay.reduce((total, day) => total + day.tabs, 0));
  });

  it("buckets lead and turn times the server's way, the last one open-ended", async () => {
    const bookings = await gateway.getReservationReport(week);
    expect(bookings.leadTime.map((bucket) => bucket.upToHours)).toEqual([
      2,
      6,
      24,
      72,
      168,
      OPEN_ENDED_BUCKET,
    ]);
    const room = await gateway.getOccupancyReport(week);
    expect(room.turnTime.buckets.map((bucket) => bucket.upToMinutes)).toEqual([
      60,
      90,
      120,
      150,
      180,
      210,
      240,
      OPEN_ENDED_BUCKET,
    ]);
    expect(room.turnsPerTable?.value).toBeGreaterThan(0);
  });
});
