import { describe, expect, it } from 'vitest';
import { DeviceRevokedError } from '../contracts/errors';
import type { StaffMember } from '../contracts/staff';
import { fixtureStaffFor } from './staffFixture';
import { createStaffRosterMock, mockRosterShiftsAround, mockStaffRoster } from './staffRosterMock';

function member(
  overrides: Partial<StaffMember> & Pick<StaffMember, 'id' | 'fullName'>,
): StaffMember {
  return {
    venueId: 'v1',
    branchId: 'b1',
    phone: '+37477000000',
    role: 'waiter',
    isActive: true,
    email: null,
    hasPasswordSignIn: false,
    isPinLocked: false,
    ...overrides,
  };
}

const staff: StaffMember[] = [
  member({ id: 'zara', fullName: 'Zara Here' }),
  member({ id: 'anna', fullName: 'Anna Everywhere', branchId: null, role: 'owner' }),
  member({ id: 'gone', fullName: 'Gone Deactivated', isActive: false }),
  member({ id: 'other-branch', fullName: 'Other Branch', branchId: 'b2' }),
  member({ id: 'other-venue', fullName: 'Other Venue', venueId: 'v2', branchId: null }),
  member({ id: 'kit', fullName: 'Kara Kitchen', role: 'kitchen' }),
];

describe('the mock branch roster', () => {
  it('lists active people of the same venue whose branch is null or the device branch, by name', () => {
    const roster = mockStaffRoster(staff, { venueId: 'v1', branchId: 'b1' });
    expect(roster.map((entry) => entry.staffMemberId)).toEqual(['anna', 'kit', 'zara']);
    expect(roster[0]).toEqual({
      staffMemberId: 'anna',
      fullName: 'Anna Everywhere',
      role: 'owner',
      onShiftNow: false,
      shift: null,
    });
  });

  it('answers for the enrolled device, and refuses a token it does not know like /device does', async () => {
    const mock = createStaffRosterMock({
      staff,
      devices: [{ deviceToken: 'tablet-b2', venueId: 'v1', branchId: 'b2' }],
    });

    const roster = await mock.getRoster('tablet-b2');
    expect(roster.map((entry) => entry.staffMemberId)).toEqual(['anna', 'other-branch']);
    await expect(mock.getRoster('never-enrolled')).rejects.toBeInstanceOf(DeviceRevokedError);
  });
});

describe('a branch tablet with general and branch managers on it', () => {
  it("lists the branch's own people and the venue-wide owner and general manager", () => {
    // The fixture as the console and the tablet mocks share it.
    const people = fixtureStaffFor('v-lumen', 'Lumen Coffee', [
      { id: 'b-lumen-north', name: 'Northern Avenue' },
      { id: 'b-lumen-cascade', name: 'Cascade' },
    ]);
    const roster = mockStaffRoster(people, { venueId: 'v-lumen', branchId: 'b-lumen-north' });
    const roles = new Map(roster.map((entry) => [entry.staffMemberId, entry.role]));

    expect(roles.get('v-lumen-owner')).toBe('owner');
    expect(roles.get('v-lumen-general-manager')).toBe('generalManager');
    expect(roles.get('b-lumen-north-manager')).toBe('manager');
    // Another branch's manager is another tablet's.
    expect(roles.has('b-lumen-cascade-manager')).toBe(false);
  });
});

/**
 * Who is on shift, as the backend reads it (FT2 wire): this branch's working
 * shifts in its zone, the one running now first, else the next one later
 * today; nothing for another day or another branch, and nobody left out.
 */
describe('the mock roster with shifts', () => {
  // 18:30 in Yerevan (UTC+4).
  const now = new Date('2026-10-19T14:30:00Z');
  const device = { venueId: 'v1', branchId: 'b1' };
  const shift = (
    staffMemberId: string,
    startsAtUtc: string,
    endsAtUtc: string,
    branchId = 'b1',
  ) => ({ staffMemberId, branchId, startsAtUtc, endsAtUtc });

  it('reports the running shift, in the branch wall clock, and the overnight end', () => {
    const roster = mockStaffRoster(staff, device, {
      now,
      timeZone: 'Asia/Yerevan',
      shifts: [shift('zara', '2026-10-19T14:00:00Z', '2026-10-19T22:00:00Z')],
    });
    expect(roster.find((entry) => entry.staffMemberId === 'zara')).toMatchObject({
      onShiftNow: true,
      shift: {
        startsAt: '18:00',
        endsAt: '02:00',
        endsNextDay: true,
        startsAtUtc: '2026-10-19T14:00:00Z',
        endsAtUtc: '2026-10-19T22:00:00Z',
      },
    });
  });

  it('reports the next one within twelve hours when none is running, and nothing further or elsewhere', () => {
    const roster = mockStaffRoster(staff, device, {
      now,
      timeZone: 'Asia/Yerevan',
      shifts: [
        // Over already.
        shift('zara', '2026-10-19T06:00:00Z', '2026-10-19T10:00:00Z'),
        // Later today, at 20:00 and at 19:00: the earlier wins.
        shift('zara', '2026-10-19T16:00:00Z', '2026-10-19T19:00:00Z'),
        shift('zara', '2026-10-19T15:00:00Z', '2026-10-19T15:30:00Z'),
        // Tomorrow at 10:00: fifteen and a half hours away.
        shift('kit', '2026-10-20T06:00:00Z', '2026-10-20T14:00:00Z'),
        // Running, at another branch.
        shift('anna', '2026-10-19T14:00:00Z', '2026-10-19T18:00:00Z', 'b2'),
      ],
    });
    const by = new Map(roster.map((entry) => [entry.staffMemberId, entry]));

    expect(by.get('zara')).toMatchObject({
      onShiftNow: false,
      shift: { startsAt: '19:00', endsAt: '19:30', endsNextDay: false },
    });
    expect(by.get('kit')).toMatchObject({ onShiftNow: false, shift: null });
    expect(by.get('anna')).toMatchObject({ onShiftNow: false, shift: null });
    // Shifts never narrow the list.
    expect(roster.map((entry) => entry.staffMemberId)).toEqual(['anna', 'kit', 'zara']);
  });

  it('looks twelve hours ahead for the next shift, across midnight', () => {
    // 23:50 in Yerevan.
    const late = new Date('2026-10-19T19:50:00Z');
    const read = (startsAtUtc: string, endsAtUtc: string) =>
      mockStaffRoster(staff, device, {
        now: late,
        timeZone: 'Asia/Yerevan',
        shifts: [shift('zara', startsAtUtc, endsAtUtc)],
      }).find((entry) => entry.staffMemberId === 'zara');

    // Tomorrow's 00:10 is twenty minutes away.
    expect(read('2026-10-19T20:10:00Z', '2026-10-20T04:00:00Z')).toMatchObject({
      onShiftNow: false,
      shift: { startsAt: '00:10', endsAt: '08:00', endsNextDay: false },
    });
    // Exactly twelve hours ahead counts; twelve hours and ten minutes does not.
    expect(read('2026-10-20T07:50:00Z', '2026-10-20T15:00:00Z')?.shift?.startsAt).toBe('11:50');
    expect(read('2026-10-20T08:00:00Z', '2026-10-20T15:00:00Z')?.shift).toBeNull();
  });

  it('seeds some of the branch on shift around any time of day, and nobody venue-wide', () => {
    for (const at of ['2026-10-19T02:00:00Z', '2026-10-19T14:30:00Z', '2026-10-19T19:59:00Z']) {
      const when = new Date(at);
      const shifts = mockRosterShiftsAround(staff, 'b1', when);
      const roster = mockStaffRoster(staff, device, {
        now: when,
        timeZone: 'Asia/Yerevan',
        shifts,
      });
      expect(roster.some((entry) => entry.onShiftNow)).toBe(true);
      expect(roster.some((entry) => !entry.onShiftNow)).toBe(true);
      expect(shifts.map((entry) => entry.staffMemberId)).not.toContain('anna');
    }
  });
});
