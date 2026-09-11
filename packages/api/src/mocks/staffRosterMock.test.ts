import { describe, expect, it } from 'vitest';
import { DeviceRevokedError } from '../contracts/errors';
import type { StaffMember } from '../contracts/staff';
import { createStaffRosterMock, mockStaffRoster } from './staffRosterMock';

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
