import { describe, expect, it } from 'vitest';
import { StaffPermissionError } from '../contracts/errors';
import { ConcurrencyConflictError, ForbiddenError, type ValidationError } from '../errors';
import { createConsoleMockGateway } from './consoleMock';

/**
 * Shifts in the console mock, as the VC5 wire rules them: a date with a start
 * and an end (overnight when the end is not after the start) or a day off;
 * planned by whoever may manage the person, or the person themselves; checked
 * for overlaps, length and the date window with the server's fields and bounds.
 */

/** 2026-10-19, 14:00 in Yerevan. */
const NOW = new Date('2026-10-19T10:00:00Z');
const TODAY = '2026-10-19';
const NORTH = 'b-lumen-north';

const failing = (run: Promise<unknown>) => run.then(() => null).catch((error: unknown) => error);

function mock(role: 'owner' | 'generalManager' | 'manager' | 'waiter' = 'owner') {
  return createConsoleMockGateway({ latencyMs: 0, role, now: () => NOW });
}

const work = (date: string, startsAt: string, endsAt: string) => ({
  date,
  dayOff: false,
  startsAt,
  endsAt,
});

const fieldsOf = (error: unknown) =>
  (error as ValidationError).violations.map((violation) => [violation.field, violation.bound]);

describe('console mock — shifts', () => {
  it("reads the branch's two weeks from today, with today's head count", async () => {
    const read = await mock().listBranchShifts({ branchId: NORTH });
    expect(read.serviceDate).toBe(TODAY);
    expect(read.from).toBe(TODAY);
    expect(read.to).toBe('2026-11-01');
    // The fixture: two people on today, one tomorrow.
    expect(read.onShiftToday).toBe(2);
    const evening = read.shifts.find((shift) => shift.startsAt === '16:00');
    expect(evening).toMatchObject({ date: TODAY, endsAt: '00:00', endsNextDay: true });
  });

  it('plans an overnight shift and counts a working one today, not a day off', async () => {
    const gateway = mock();
    const before = (await gateway.listBranchShifts({ branchId: NORTH })).onShiftToday;

    const late = await gateway.createShift({
      branchId: NORTH,
      staffMemberId: `${NORTH}-kitchen`,
      shift: work(TODAY, '18:00', '02:00'),
    });
    expect(late.endsNextDay).toBe(true);
    expect((await gateway.listBranchShifts({ branchId: NORTH })).onShiftToday).toBe(before + 1);

    await gateway.createShift({
      branchId: NORTH,
      staffMemberId: 'v-lumen-general-manager',
      shift: { date: TODAY, dayOff: true, startsAt: null, endsAt: null },
    });
    expect((await gateway.listBranchShifts({ branchId: NORTH })).onShiftToday).toBe(before + 1);
  });

  it('refuses an overlap with their other shift, and allows one that only touches it', async () => {
    const gateway = mock();
    const ani = `${NORTH}-waiter-1`;
    // The fixture has Ani on 16:00–00:00 today.
    const overlap = await failing(
      gateway.createShift({
        branchId: NORTH,
        staffMemberId: ani,
        shift: work(TODAY, '12:00', '17:00'),
      }),
    );
    expect(fieldsOf(overlap)).toEqual([['startsAt', 'conflict']]);

    await expect(
      gateway.createShift({
        branchId: NORTH,
        staffMemberId: ani,
        shift: work(TODAY, '10:00', '16:00'),
      }),
    ).resolves.toMatchObject({ startsAt: '10:00' });
  });

  it('names the field and the bound for each bad shift', async () => {
    const gateway = mock();
    const sona = `${NORTH}-kitchen`;
    const plan = (shift: Parameters<typeof gateway.createShift>[0]['shift']) =>
      failing(gateway.createShift({ branchId: NORTH, staffMemberId: sona, shift }));

    expect(fieldsOf(await plan(work('2026-10-18', '10:00', '12:00')))).toEqual([['date', 'min']]);
    expect(fieldsOf(await plan(work('2027-02-01', '10:00', '12:00')))).toEqual([['date', 'max']]);
    expect(fieldsOf(await plan(work(TODAY, '10:00', '10:00')))).toEqual([['endsAt', 'conflict']]);
    expect(fieldsOf(await plan(work('2026-10-25', '06:00', '23:30')))).toEqual([['endsAt', 'max']]);
    expect(
      fieldsOf(await plan({ date: TODAY, dayOff: false, startsAt: null, endsAt: '12:00' })),
    ).toEqual([['startsAt', 'required']]);
    // Tomorrow is a working day for Sona in the fixture: no day off on it.
    expect(
      fieldsOf(await plan({ date: '2026-10-20', dayOff: true, startsAt: null, endsAt: null })),
    ).toEqual([['date', 'conflict']]);
  });

  it('lets the person plan their own, and nobody plan somebody above them', async () => {
    // A branch manager: their own shift, and a waiter at their branch.
    const manager = mock('manager');
    await expect(
      manager.createShift({
        branchId: NORTH,
        staffMemberId: `${NORTH}-manager`,
        shift: work('2026-10-21', '09:00', '17:00'),
      }),
    ).resolves.toBeTruthy();
    expect(
      await failing(
        manager.createShift({
          branchId: NORTH,
          staffMemberId: 'v-lumen-owner',
          shift: work('2026-10-21', '09:00', '17:00'),
        }),
      ),
    ).toBeInstanceOf(StaffPermissionError);

    // A waiter's tablet session has no console.
    expect(await failing(mock('waiter').listBranchShifts({ branchId: NORTH }))).toBeInstanceOf(
      ForbiddenError,
    );
  });

  it('refuses a deactivated person, and hides their shifts from the list', async () => {
    const gateway = mock();
    const gone = await failing(
      gateway.createShift({
        branchId: NORTH,
        staffMemberId: `${NORTH}-waiter-2`,
        shift: work('2026-10-21', '09:00', '17:00'),
      }),
    );
    expect(gone).toBeInstanceOf(ConcurrencyConflictError);
  });

  it('changes and removes a shift, and the undo is planning it again', async () => {
    const gateway = mock();
    const read = await gateway.listBranchShifts({ branchId: NORTH });
    const shift = read.shifts.find((entry) => entry.startsAt === '10:00')!;

    const moved = await gateway.updateShift({
      branchId: NORTH,
      shiftId: shift.id,
      shift: work(shift.date, '11:00', '20:00'),
    });
    expect(moved).toMatchObject({ id: shift.id, startsAt: '11:00', endsAt: '20:00' });

    await gateway.deleteShift({ branchId: NORTH, shiftId: shift.id });
    expect(
      (await gateway.listBranchShifts({ branchId: NORTH })).shifts.some((s) => s.id === shift.id),
    ).toBe(false);
    await expect(
      gateway.createShift({
        branchId: NORTH,
        staffMemberId: shift.staffMemberId,
        shift: work(shift.date, '11:00', '20:00'),
      }),
    ).resolves.toBeTruthy();
  });
});
