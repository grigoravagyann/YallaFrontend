import { describe, expect, it } from 'vitest';
import { overviewRowState, type BranchOverview } from '../contracts/branchOverview';
import { ConcurrencyConflictError, ForbiddenError } from '../errors';
import { createConsoleMockGateway } from './consoleMock';

/**
 * Overview in the mock: one list of today's bookings that every number on the
 * screen is worked out from, and the row menu's four actions moving a booking
 * the way their routes do — with the server's refusals for a booking somebody
 * already moved and for another branch's manager.
 */

/** Sunday 18 October 2026, 18:42 in Yerevan: an evening in full swing. */
const EVENING = new Date('2026-10-18T14:42:00Z');
const BRANCH = 'b-lumen-north';

function gatewayAt(role: 'owner' | 'manager' | 'generalManager' = 'owner') {
  return createConsoleMockGateway({ latencyMs: 0, role, now: () => EVENING });
}

const shown = (overview: BranchOverview) =>
  overview.todayBookings.filter((booking) => overviewRowState(booking, EVENING) !== 'declined');

function rowIn(overview: BranchOverview, state: ReturnType<typeof overviewRowState>) {
  return overview.todayBookings.find((booking) => overviewRowState(booking, EVENING) === state)!;
}

describe('the console mock — a branch overview', () => {
  it("is today's, at the branch: every row is on its day, in start order", async () => {
    const overview = await gatewayAt().getBranchOverview(BRANCH);

    expect(overview.localDate).toBe('2026-10-18');
    expect(overview.localTime).toBe('18:42:00');
    expect(overview.timeZoneId).toBe('Asia/Yerevan');
    const starts = overview.todayBookings.map((booking) => booking.startUtc);
    expect(starts).toEqual([...starts].sort());
    // Two seated, one late, some to come, one finished, one the diner called off.
    const states = new Set(overview.todayBookings.map((row) => overviewRowState(row, EVENING)));
    for (const state of ['seated', 'late', 'confirmed', 'completed', 'cancelled', 'pending']) {
      expect(states.has(state as never)).toBe(true);
    }
  });

  it('counts by status from the same list the table shows', async () => {
    const overview = await gatewayAt().getBranchOverview(BRANCH);
    const rows = shown(overview);
    const of = (state: string) => rows.filter((row) => overviewRowState(row, EVENING) === state);

    expect(overview.bookings.seated).toBe(of('seated').length);
    expect(overview.bookings.late).toBe(of('late').length);
    expect(overview.bookings.confirmed).toBe(of('confirmed').length + of('late').length);
    expect(overview.bookings.pendingApproval).toBe(of('pending').length);
    expect(overview.bookings.cancelled).toBe(of('cancelled').length);
    expect(overview.bookings.total).toBe(rows.length - of('cancelled').length);
    expect(overview.bookings.people).toBe(
      rows
        .filter((row) =>
          ['pending', 'confirmed', 'late', 'seated', 'completed'].includes(
            overviewRowState(row, EVENING),
          ),
        )
        .reduce((sum, row) => sum + row.partySize, 0),
    );
  });

  it('draws contiguous hours under a capacity of the active seats, and people in the room', async () => {
    const gateway = gatewayAt();
    const overview = await gateway.getBranchOverview(BRANCH);
    const plan = await gateway.getFloorPlan(BRANCH);

    expect(overview.load.capacity).toBe(
      plan.tables
        .filter((table) => table.isActive && table.status !== 'outOfService')
        .reduce((sum, table) => sum + table.seats, 0),
    );
    const hours = overview.load.hours.map((hour) => hour.hour);
    expect(hours.length).toBeGreaterThan(3);
    hours.forEach((hour, index) => index > 0 && expect(hour).toBe(hours[index - 1]! + 1));
    expect(overview.inRoom.people).toBeGreaterThanOrEqual(
      of(overview, 'seated').reduce((sum, row) => sum + row.partySize, 0),
    );
    expect(overview.inRoom.tables).toBe(plan.tables.filter((table) => table.isActive).length);
    expect(overview.revenue.changePercent).not.toBeNull();
  });
});

function of(overview: BranchOverview, state: ReturnType<typeof overviewRowState>) {
  return overview.todayBookings.filter((row) => overviewRowState(row, EVENING) === state);
}

describe('the console mock — the row menu', () => {
  const command = (row: { id: string; tableId: string }) => ({
    branchId: BRANCH,
    reservationId: row.id,
    tableId: row.tableId,
    clientCommandId: '6f1c2a40-1b8e-4c1a-9d43-2f6c7f0b9e11',
  });

  it('seats a late booking, and the counts move with it', async () => {
    const gateway = gatewayAt();
    const before = await gateway.getBranchOverview(BRANCH);
    const late = rowIn(before, 'late');

    const result = await gateway.actOnBooking({ ...command(late), kind: 'seat' });
    expect(result).toMatchObject({ kind: 'seat', reservationId: late.id, tableFreed: false });

    const after = await gateway.getBranchOverview(BRANCH);
    expect(after.todayBookings.find((row) => row.id === late.id)!.status).toBe('seated');
    expect(after.bookings.seated).toBe(before.bookings.seated + 1);
    expect(after.bookings.late).toBe(before.bookings.late - 1);
  });

  it('marks a late booking a no-show, freeing the table held for it, and only once', async () => {
    const gateway = gatewayAt();
    const late = rowIn(await gateway.getBranchOverview(BRANCH), 'late');

    const result = await gateway.actOnBooking({ ...command(late), kind: 'noShow' });
    expect(result.tableFreed).toBe(true);
    const after = await gateway.getBranchOverview(BRANCH);
    expect(after.todayBookings.find((row) => row.id === late.id)!.status).toBe('noShow');
    expect(after.bookings.noShow).toBe(1);

    await expect(gateway.actOnBooking({ ...command(late), kind: 'noShow' })).rejects.toBeInstanceOf(
      ConcurrencyConflictError,
    );
  });

  it('cancels an upcoming booking for the venue, which is not a no-show', async () => {
    const gateway = gatewayAt();
    const upcoming = rowIn(await gateway.getBranchOverview(BRANCH), 'confirmed');

    await gateway.actOnBooking({ ...command(upcoming), kind: 'cancel' });
    const after = await gateway.getBranchOverview(BRANCH);
    const row = after.todayBookings.find((entry) => entry.id === upcoming.id)!;
    expect(row.status).toBe('cancelledByVenue');
    // Still listed: the venue called it off, it was not a request declined.
    expect(row.declinedBecause).toBeNull();
    expect(after.bookings.noShow).toBe(0);
  });

  it('finishes a seated sitting, and refuses to finish one nobody sits at', async () => {
    const gateway = gatewayAt();
    const before = await gateway.getBranchOverview(BRANCH);
    const seated = rowIn(before, 'seated');

    expect(await gateway.actOnBooking({ ...command(seated), kind: 'finish' })).toMatchObject({
      tableFreed: true,
    });
    const after = await gateway.getBranchOverview(BRANCH);
    expect(after.todayBookings.find((row) => row.id === seated.id)!.status).toBe('completed');

    const upcoming = rowIn(after, 'confirmed');
    await expect(
      gateway.actOnBooking({ ...command(upcoming), kind: 'finish' }),
    ).rejects.toBeInstanceOf(ConcurrencyConflictError);
  });

  it('lists a request as waiting, and takes it off once it is declined', async () => {
    const gateway = gatewayAt();
    const pending = await gateway.listPendingReservations(BRANCH);
    const tonight = pending.find((booking) => booking.awaitingApprovalBecause === 'shortNotice')!;

    const before = await gateway.getBranchOverview(BRANCH);
    expect(
      overviewRowState(
        before.todayBookings.find((row) => row.id === tonight.id)!,
        EVENING,
      ),
    ).toBe('pending');

    await gateway.rejectReservation({ reservationId: tonight.id });
    const after = await gateway.getBranchOverview(BRANCH);
    expect(
      overviewRowState(
        after.todayBookings.find((row) => row.id === tonight.id)!,
        EVENING,
      ),
    ).toBe('declined');
    expect(after.bookings.pendingApproval).toBe(before.bookings.pendingApproval - 1);
  });

  it("refuses a branch manager another branch's overview and its bookings", async () => {
    const owner = gatewayAt();
    const other = rowIn(await owner.getBranchOverview('b-lumen-cascade'), 'late');
    const manager = gatewayAt('manager');

    await expect(manager.getBranchOverview('b-lumen-cascade')).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(
      manager.actOnBooking({ ...command(other), branchId: 'b-lumen-cascade', kind: 'seat' }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    // Their own branch answers.
    expect((await manager.getBranchOverview(BRANCH)).branchId).toBe(BRANCH);
  });
});
