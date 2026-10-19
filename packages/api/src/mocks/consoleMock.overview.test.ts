import { describe, expect, it } from 'vitest';
import { overviewRowState, type BranchOverview } from '../contracts/branchOverview';
import { ConcurrencyConflictError, ForbiddenError } from '../errors';
import { newCommandId } from '../ids';
import { createConsoleMockGateway } from './consoleMock';

/**
 * Overview in the mock (VC2 wire, revision 2): one list of the service day's
 * bookings that every number on the screen is worked out from — cancelled
 * ones counted, never listed — and the row menu's four actions moving a
 * booking the way their routes do, with the server's refusals: a booking
 * somebody already moved, a table somebody else sits at, another branch's
 * manager, and a repeat of the same command answered as a replay.
 */

/** Sunday 18 October 2026, 18:42 in Yerevan: an evening in full swing. */
const EVENING = new Date('2026-10-18T14:42:00Z');
const BRANCH = 'b-lumen-north';

function gatewayAt(role: 'owner' | 'manager' | 'generalManager' = 'owner') {
  return createConsoleMockGateway({ latencyMs: 0, role, now: () => EVENING });
}

type State = ReturnType<typeof overviewRowState>;

function of(overview: BranchOverview, state: State) {
  return overview.todayBookings.filter((row) => overviewRowState(row, EVENING) === state);
}

function rowIn(overview: BranchOverview, state: State) {
  return of(overview, state)[0]!;
}

describe('the console mock — a branch overview', () => {
  it("is the service day's, at the branch: every row on it, in start order, none cancelled", async () => {
    const overview = await gatewayAt().getBranchOverview(BRANCH);

    expect(overview.localDate).toBe('2026-10-18');
    expect(overview.serviceDate).toBe('2026-10-18');
    expect(overview.localTime).toBe('18:42:00');
    expect(overview.timeZoneId).toBe('Asia/Yerevan');
    const starts = overview.todayBookings.map((booking) => booking.startUtc);
    expect(starts).toEqual([...starts].sort());
    const states = new Set(overview.todayBookings.map((row) => overviewRowState(row, EVENING)));
    for (const state of [
      'seated',
      'late',
      'confirmed',
      'completed',
      'pending',
      'changeRequested',
    ]) {
      expect(states.has(state as State)).toBe(true);
    }
    // The diner's cancellation is counted, not listed.
    expect(states.has('cancelled')).toBe(false);
    expect(overview.bookings.cancelled).toBe(1);
    for (const row of overview.todayBookings) expect(row.localDate).toBe('2026-10-18');
  });

  it('counts by status from the same list the table shows, a waiting change as confirmed', async () => {
    const overview = await gatewayAt().getBranchOverview(BRANCH);
    const count = (state: State) => of(overview, state).length;

    expect(overview.bookings.seated).toBe(count('seated'));
    expect(overview.bookings.late).toBe(count('late'));
    expect(overview.bookings.confirmed).toBe(
      count('confirmed') + count('late') + count('changeRequested'),
    );
    expect(overview.bookings.pendingChanges).toBe(count('changeRequested'));
    expect(overview.bookings.pendingApproval).toBe(count('pending'));
    expect(overview.bookings.total).toBe(overview.todayBookings.length);
    expect(overview.bookings.people).toBe(
      overview.todayBookings
        .filter((row) => overviewRowState(row, EVENING) !== 'noShow')
        .reduce((sum, row) => sum + row.partySize, 0),
    );
  });

  it('says the nudge went out only once its time has passed, and only on a confirmed booking', async () => {
    const overview = await gatewayAt().getBranchOverview(BRANCH);
    const late = rowIn(overview, 'late');
    expect(late.lateNudgeAtUtc).not.toBeNull();
    expect(late.lateNudgeSent).toBe(Date.parse(late.lateNudgeAtUtc!) <= EVENING.getTime());
    for (const row of overview.todayBookings.filter((entry) => entry.status !== 'confirmed')) {
      expect(row.lateNudgeAtUtc).toBeNull();
      expect(row.holdExpiresAtUtc).toBeNull();
    }
  });

  it('draws contiguous hours under the seats in service, and counts from the first opening', async () => {
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
    expect(Date.parse(overview.revenue.sinceUtc)).toBeLessThanOrEqual(EVENING.getTime());
  });
});

describe('the console mock — the row menu', () => {
  const command = (row: { id: string; tableId: string }) => ({
    branchId: BRANCH,
    reservationId: row.id,
    tableId: row.tableId,
    clientCommandId: newCommandId(),
  });

  it('seats a late booking, and the counts move with it', async () => {
    const gateway = gatewayAt();
    const before = await gateway.getBranchOverview(BRANCH);
    const late = rowIn(before, 'late');

    const result = await gateway.actOnBooking({ ...command(late), kind: 'seat' });
    expect(result).toMatchObject({
      kind: 'seat',
      reservationId: late.id,
      status: 'seated',
      wasReplay: false,
      tableFreed: false,
    });

    const after = await gateway.getBranchOverview(BRANCH);
    expect(after.todayBookings.find((row) => row.id === late.id)!.status).toBe('seated');
    expect(after.bookings.seated).toBe(before.bookings.seated + 1);
    expect(after.bookings.late).toBe(before.bookings.late - 1);
  });

  it('marks a late booking a no-show, freeing the table held for it, and only once', async () => {
    const gateway = gatewayAt();
    const late = rowIn(await gateway.getBranchOverview(BRANCH), 'late');
    const first = command(late);

    const result = await gateway.actOnBooking({ ...first, kind: 'noShow' });
    expect(result).toMatchObject({ status: 'noShow', tableFreed: true });
    const after = await gateway.getBranchOverview(BRANCH);
    expect(after.todayBookings.find((row) => row.id === late.id)!.status).toBe('noShow');
    expect(after.bookings.noShow).toBe(1);

    // Released already: any repeat is the first answer again, whatever it asked for.
    expect(await gateway.actOnBooking({ ...first, kind: 'noShow' })).toMatchObject({
      wasReplay: true,
      status: 'noShow',
    });
    expect(await gateway.actOnBooking({ ...command(late), kind: 'cancel' })).toMatchObject({
      wasReplay: true,
      status: 'noShow',
      tableFreed: false,
    });
    // Seating it now is refused: it is not confirmed any more.
    const refusal = await gateway
      .actOnBooking({ ...command(late), kind: 'seat' })
      .catch((error: unknown) => error);
    expect((refusal as ConcurrencyConflictError).code).toBe('conflicting-state');
  });

  it('cancels an upcoming booking for the venue, which is counted and no longer listed', async () => {
    const gateway = gatewayAt();
    const before = await gateway.getBranchOverview(BRANCH);
    const upcoming = rowIn(before, 'confirmed');

    expect(await gateway.actOnBooking({ ...command(upcoming), kind: 'cancel' })).toMatchObject({
      status: 'cancelledByVenue',
    });
    const after = await gateway.getBranchOverview(BRANCH);
    expect(after.todayBookings.some((entry) => entry.id === upcoming.id)).toBe(false);
    expect(after.bookings.cancelled).toBe(before.bookings.cancelled + 1);
    expect(after.bookings.noShow).toBe(0);
  });

  it('finishes a seated sitting, and refuses a table nobody sits at', async () => {
    const gateway = gatewayAt();
    const seated = rowIn(await gateway.getBranchOverview(BRANCH), 'seated');

    expect(await gateway.actOnBooking({ ...command(seated), kind: 'finish' })).toMatchObject({
      status: 'completed',
      tableFreed: true,
    });
    const after = await gateway.getBranchOverview(BRANCH);
    expect(after.todayBookings.find((row) => row.id === seated.id)!.status).toBe('completed');

    // Its table is empty now: there is no sitting of theirs to end.
    const refusal = await gateway
      .actOnBooking({ ...command(seated), kind: 'finish' })
      .catch((error: unknown) => error);
    expect((refusal as ConcurrencyConflictError).code).toBe('table-sitting-changed');
  });

  it("never ends another party's sitting from a stale row", async () => {
    const gateway = gatewayAt();
    const before = await gateway.getBranchOverview(BRANCH);
    const seated = rowIn(before, 'seated');
    const upcoming = rowIn(before, 'confirmed');
    // The upcoming party is seated at the table the first party has just left.
    await gateway.actOnBooking({ ...command(seated), kind: 'finish' });
    await gateway.actOnBooking({
      ...command(upcoming),
      tableId: seated.tableId,
      kind: 'seat',
    });

    // The first party's row, read before all that, still says "seated" there.
    const refusal = await gateway
      .actOnBooking({ ...command(seated), kind: 'finish' })
      .catch((error: unknown) => error);
    expect(refusal).toBeInstanceOf(ConcurrencyConflictError);
    expect((refusal as ConcurrencyConflictError).code).toBe('table-sitting-changed');
  });

  it('refuses to seat a party at a table somebody else sits at', async () => {
    const gateway = gatewayAt();
    const before = await gateway.getBranchOverview(BRANCH);
    const seated = rowIn(before, 'seated');
    const late = rowIn(before, 'late');

    const refusal = await gateway
      .actOnBooking({ ...command(late), tableId: seated.tableId, kind: 'seat' })
      .catch((error: unknown) => error);
    expect((refusal as ConcurrencyConflictError).code).toBe('table-state-conflict');
  });

  it('refuses every action on a booking whose change waits for an answer', async () => {
    const gateway = gatewayAt();
    const changing = rowIn(await gateway.getBranchOverview(BRANCH), 'changeRequested');
    for (const kind of ['seat', 'noShow', 'cancel'] as const) {
      const refusal = await gateway
        .actOnBooking({ ...command(changing), kind })
        .catch((error: unknown) => error);
      expect((refusal as ConcurrencyConflictError).code).toBe('conflicting-state');
    }
  });

  it('lists a request as waiting, and drops it once it is declined', async () => {
    const gateway = gatewayAt();
    const pending = await gateway.listPendingReservations(BRANCH);
    const tonight = pending.find((booking) => booking.awaitingApprovalBecause === 'shortNotice')!;

    const before = await gateway.getBranchOverview(BRANCH);
    const row = before.todayBookings.find((entry) => entry.id === tonight.id)!;
    expect(overviewRowState(row, EVENING)).toBe('pending');

    await gateway.rejectReservation({ reservationId: tonight.id });
    const after = await gateway.getBranchOverview(BRANCH);
    expect(after.todayBookings.some((entry) => entry.id === tonight.id)).toBe(false);
    expect(after.bookings.pendingApproval).toBe(before.bookings.pendingApproval - 1);
    expect(after.bookings.cancelled).toBe(before.bookings.cancelled + 1);
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
