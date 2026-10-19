import { describe, expect, it, vi } from 'vitest';
import { createAuthSession } from '../auth/session';
import { createMemoryTokenStorage } from '../auth/storage';
import { ConcurrencyConflictError, ForbiddenError } from '../errors';
import { createConsoleHttpGateway, createMemoryIdentityStore } from './consoleHttpGateway';
import { fakeBackend, problemReply, type FakeRoute } from './fakeBackend.testkit';
import type { WireBranchOverview } from './branchOverviewMapping';

/**
 * Overview over HTTP (venue-console Main artboard), on the wire the backend's
 * agent decided for `feat/venue-console-2`: `GET /api/branches/{id}/overview`,
 * and the row menu's four actions on existing routes — seat-reservation and
 * free on the table, no-show and release (outcome 2) on the booking.
 */

function gatewayOver(routes: Record<string, FakeRoute>) {
  const backend = fakeBackend(routes);
  const auth = createAuthSession({
    storage: createMemoryTokenStorage('refresh-0'),
    refreshTokens: vi.fn(),
  });
  const gateway = createConsoleHttpGateway(backend.client({ getToken: () => 'held-token' }), {
    auth,
    identity: createMemoryIdentityStore(),
  });
  return { gateway, backend };
}

const OVERVIEW: WireBranchOverview = {
  branchId: 'b-1',
  timeZoneId: 'Asia/Yerevan',
  asOfUtc: '2026-10-18T14:42:00Z',
  localDate: '2026-10-18',
  localTime: '18:42:00',
  hours: { isOpen: true, closesAt: '00:00:00', closesNextDay: true },
  bookings: {
    total: 27,
    pendingApproval: 3,
    confirmed: 14,
    late: 1,
    seated: 6,
    completed: 3,
    noShow: 1,
    cancelled: 2,
    people: 96,
  },
  inRoom: { people: 34, occupiedTables: 9, tables: 22, outOfServiceTables: 1 },
  openTabs: { count: 11, unpaidAmd: 214500 },
  revenue: { todayAmd: 486000, lastWeekAmd: 450000, lastWeekDate: '2026-10-11', changePercent: 8 },
  load: {
    capacity: 52,
    hours: [
      { hour: 18, people: 22, pendingPeople: 0 },
      { hour: 19, people: 38, pendingPeople: 6 },
    ],
  },
  todayBookings: [
    {
      id: 'r-1',
      code: 'K7Q2',
      status: 2,
      startUtc: '2026-10-18T14:30:00Z',
      endUtc: '2026-10-18T16:30:00Z',
      localStartTime: '18:30:00',
      partySize: 3,
      guestName: 'Արմեն Դ.',
      tableId: 't-5',
      tableLabel: '5',
      tableStatus: 2,
      channel: 1,
      holdExpiresAtUtc: '2026-10-18T14:45:00Z',
      lateNudgeAtUtc: '2026-10-18T14:40:00Z',
    },
    {
      id: 'r-2',
      code: 'P4M1',
      status: 7,
      startUtc: '2026-10-18T17:00:00Z',
      endUtc: '2026-10-18T19:00:00Z',
      localStartTime: '21:00:00',
      partySize: 2,
      guestName: 'Karen M.',
      tableId: 't-4',
      tableLabel: '4',
      tableStatus: 1,
      roomName: 'Սրահ',
      channel: 3,
      declinedBecause: 1,
    },
  ],
};

const TABLE_CHANGE = {
  branchId: 'b-1',
  tableId: 't-5',
  tableLabel: '5',
  fromStatus: 2,
  toStatus: 4,
  state: 4,
  atUtc: '2026-10-18T14:43:00Z',
  clientCommandId: 'c-1',
  wasReplay: false,
  warnings: [],
  affectedReservations: [],
};

const RELEASE = {
  reservation: { id: 'r-1' },
  outcome: 1,
  countsTowardNoShowThreshold: true,
  tableId: 't-5',
  tableLabel: '5',
  tableFreed: true,
  tableStatus: 1,
  wasReplay: false,
};

describe('the overview over HTTP', () => {
  it("reads a branch's today, with every absent field as null", async () => {
    const { gateway, backend } = gatewayOver({
      'GET /api/branches/b-1/overview': { body: OVERVIEW },
    });
    const overview = await gateway.getBranchOverview('b-1');

    expect(backend.requests[0]?.method).toBe('GET');
    expect(overview.hours).toEqual({
      isOpen: true,
      closesAt: '00:00:00',
      closesNextDay: true,
      opensAt: null,
    });
    expect(overview.bookings.total).toBe(27);
    expect(overview.inRoom).toEqual({
      people: 34,
      occupiedTables: 9,
      tables: 22,
      outOfServiceTables: 1,
    });
    expect(overview.openTabs).toEqual({ count: 11, unpaidAmd: 214500 });
    expect(overview.revenue.changePercent).toBe(8);
    expect(overview.load).toEqual({
      capacity: 52,
      hours: [
        { hour: 18, people: 22, pendingPeople: 0 },
        { hour: 19, people: 38, pendingPeople: 6 },
      ],
    });
    expect(overview.todayBookings).toEqual([
      {
        id: 'r-1',
        code: 'K7Q2',
        status: 'confirmed',
        startUtc: '2026-10-18T14:30:00Z',
        endUtc: '2026-10-18T16:30:00Z',
        localStartTime: '18:30:00',
        partySize: 3,
        guestName: 'Արմեն Դ.',
        tableId: 't-5',
        tableLabel: '5',
        tableStatus: 'held',
        roomName: null,
        channel: 'app',
        declinedBecause: null,
        holdExpiresAtUtc: '2026-10-18T14:45:00Z',
        lateNudgeAtUtc: '2026-10-18T14:40:00Z',
      },
      expect.objectContaining({
        id: 'r-2',
        status: 'cancelledByVenue',
        roomName: 'Սրահ',
        channel: 'staff',
        declinedBecause: 'staffDeclined',
        holdExpiresAtUtc: null,
        lateNudgeAtUtc: null,
      }),
    ]);
  });

  it('reads a closed branch, no comparison and an empty day', async () => {
    const { gateway } = gatewayOver({
      'GET /api/branches/b-1/overview': {
        body: {
          ...OVERVIEW,
          hours: { isOpen: false, opensAt: '12:00:00' },
          revenue: { todayAmd: 0, lastWeekAmd: 0, lastWeekDate: '2026-10-11' },
          load: { capacity: 52 },
          todayBookings: undefined,
        },
      },
    });
    const overview = await gateway.getBranchOverview('b-1');
    expect(overview.hours).toEqual({
      isOpen: false,
      closesAt: null,
      closesNextDay: false,
      opensAt: '12:00:00',
    });
    expect(overview.revenue.changePercent).toBeNull();
    expect(overview.load.hours).toEqual([]);
    expect(overview.todayBookings).toEqual([]);
  });

  it('reads the service day, a cut list and the grace minutes, and defaults them for an older server', async () => {
    const late = gatewayOver({
      'GET /api/branches/b-1/overview': {
        body: {
          ...OVERVIEW,
          localDate: '2026-10-19',
          localTime: '00:40:00',
          serviceDate: '2026-10-18',
          todayBookingsTruncated: true,
          graceMinutes: 15,
          load: { capacity: 52, hours: [{ hour: 24, people: 4, pendingPeople: 0 }] },
        },
      },
    });
    const overnight = await late.gateway.getBranchOverview('b-1');
    expect(overnight.serviceDate).toBe('2026-10-18');
    expect(overnight.localDate).toBe('2026-10-19');
    expect(overnight.todayBookingsTruncated).toBe(true);
    expect(overnight.graceMinutes).toBe(15);
    expect(overnight.load.hours[0]!.hour).toBe(24);

    const older = gatewayOver({ 'GET /api/branches/b-1/overview': { body: OVERVIEW } });
    const plain = await older.gateway.getBranchOverview('b-1');
    expect(plain.serviceDate).toBe('2026-10-18');
    expect(plain.todayBookingsTruncated).toBe(false);
    expect(plain.graceMinutes).toBeNull();
  });

  it("passes a manager's refusal for another branch through as a 403", async () => {
    const { gateway } = gatewayOver({
      'GET /api/branches/b-2/overview': problemReply(403, 'forbidden'),
    });
    await expect(gateway.getBranchOverview('b-2')).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('the row menu over HTTP', () => {
  const command = {
    branchId: 'b-1',
    reservationId: 'r-1',
    tableId: 't-5',
    clientCommandId: '6f1c2a40-1b8e-4c1a-9d43-2f6c7f0b9e11',
  } as const;

  it('seats the booking at its table, live and with the booking named', async () => {
    const { gateway, backend } = gatewayOver({
      'POST /api/branches/b-1/tables/t-5/seat-reservation': { body: TABLE_CHANGE },
    });
    const result = await gateway.actOnBooking({ ...command, kind: 'seat' });
    expect(backend.requests[0]?.body).toEqual({
      clientCommandId: command.clientCommandId,
      queued: false,
      reservationId: 'r-1',
    });
    expect(result).toEqual({
      kind: 'seat',
      reservationId: 'r-1',
      tableLabel: '5',
      tableFreed: false,
      outstandingDram: null,
    });
  });

  it('finishes a sitting by freeing its table, with what is still owed', async () => {
    const { gateway, backend } = gatewayOver({
      'POST /api/branches/b-1/tables/t-5/free': {
        body: { ...TABLE_CHANGE, fromStatus: 4, toStatus: 1, state: 1, outstandingAmd: 12500 },
      },
    });
    const result = await gateway.actOnBooking({ ...command, kind: 'finish' });
    expect(backend.requests[0]?.body).toEqual({
      clientCommandId: command.clientCommandId,
      queued: false,
    });
    expect(result).toMatchObject({ kind: 'finish', tableFreed: true, outstandingDram: 12500 });
  });

  it('marks a no-show on its own route, which counts against the diner', async () => {
    const { gateway, backend } = gatewayOver({
      'POST /api/reservations/r-1/no-show': { body: RELEASE },
    });
    const result = await gateway.actOnBooking({ ...command, kind: 'noShow' });
    expect(backend.requests[0]?.body).toEqual({ clientCommandId: command.clientCommandId });
    expect(result).toEqual({
      kind: 'noShow',
      reservationId: 'r-1',
      tableLabel: '5',
      tableFreed: true,
      outstandingDram: null,
    });
  });

  it('cancels for the venue as a release with outcome 2, which does not count as a no-show', async () => {
    const { gateway, backend } = gatewayOver({
      'POST /api/reservations/r-1/release': {
        body: { ...RELEASE, outcome: 2, countsTowardNoShowThreshold: false, tableFreed: false },
      },
    });
    const result = await gateway.actOnBooking({ ...command, kind: 'cancel' });
    expect(backend.requests[0]?.body).toEqual({
      clientCommandId: command.clientCommandId,
      outcome: 2,
    });
    expect(result).toMatchObject({ kind: 'cancel', tableFreed: false });
  });

  it('passes a booking somebody else already moved through as a 409, code intact', async () => {
    const { gateway } = gatewayOver({
      'POST /api/reservations/r-1/no-show': problemReply(409, 'conflicting-state'),
    });
    const error = await gateway.actOnBooking({ ...command, kind: 'noShow' }).catch((e) => e);
    expect(error).toBeInstanceOf(ConcurrencyConflictError);
    expect((error as ConcurrencyConflictError).code).toBe('conflicting-state');
  });
});
