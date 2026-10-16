import { describe, expect, it } from 'vitest';
import {
  assignableRoles,
  branchBindingFor,
  canChooseBranch,
  canEditStaff,
  canIssueSignIn,
  canSetStaffPin,
  isAdminRole,
  outranks,
  type StaffMember,
} from './staff';

/**
 * The general manager, and the branch manager `manager` now means.
 *
 * The server's `StaffRoleRules` after GeneralManager = 6: PlatformAdmin above
 * Owner above GeneralManager above Manager (a branch manager) above Waiter and
 * Kitchen. A general manager adds branch managers and floor staff at any
 * branch, never an owner or a peer; a branch manager adds floor staff at their
 * own branch only, which the staff service checks from the stored rows.
 */

const someone = (over: Partial<StaffMember> = {}): StaffMember => ({
  id: 's-1',
  venueId: 'v-1',
  branchId: 'b-1',
  fullName: 'Nare Petrosyan',
  phone: '+37411000000',
  role: 'waiter',
  isActive: true,
  email: null,
  hasPasswordSignIn: false,
  isPinLocked: false,
  ...over,
});

describe('who adds whom, with a general manager in the table', () => {
  it('mirrors MayAssign for every actor, in rank order', () => {
    const table: Record<string, readonly string[]> = {
      platformAdmin: ['owner', 'generalManager', 'manager', 'waiter', 'kitchen'],
      owner: ['owner', 'generalManager', 'manager', 'waiter', 'kitchen'],
      generalManager: ['manager', 'waiter', 'kitchen'],
      manager: ['waiter', 'kitchen'],
      waiter: [],
      kitchen: [],
    };
    for (const [actor, roles] of Object.entries(table)) {
      expect(assignableRoles(actor as never), actor).toEqual(roles);
    }
  });

  it('ranks a general manager between the owner and a branch manager', () => {
    expect(outranks('owner', 'generalManager')).toBe(true);
    expect(outranks('generalManager', 'manager')).toBe(true);
    expect(outranks('generalManager', 'generalManager')).toBe(false);
    expect(outranks('manager', 'generalManager')).toBe(false);
  });

  it('gives a general manager the admin panel, as an owner and a branch manager have it', () => {
    expect(isAdminRole('generalManager')).toBe(true);
    expect(isAdminRole('manager')).toBe(true);
    expect(isAdminRole('waiter')).toBe(false);
  });
});

describe('editing, with the branch a branch manager holds', () => {
  const gm = { id: 's-gm', role: 'generalManager', branchId: null } as const;
  const bm = { id: 's-bm', role: 'manager', branchId: 'b-1' } as const;

  it('lets a general manager edit branch managers and floor staff at any branch', () => {
    expect(canEditStaff(gm, someone({ role: 'manager', branchId: 'b-2' }))).toBe(true);
    expect(canEditStaff(gm, someone({ role: 'kitchen', branchId: 'b-3' }))).toBe(true);
    expect(canEditStaff(gm, someone({ role: 'generalManager', branchId: null }))).toBe(false);
    expect(canEditStaff(gm, someone({ role: 'owner', branchId: null }))).toBe(false);
  });

  it('keeps a branch manager to the people of their own branch', () => {
    expect(canEditStaff(bm, someone({ role: 'waiter', branchId: 'b-1' }))).toBe(true);
    expect(canEditStaff(bm, someone({ role: 'waiter', branchId: 'b-2' }))).toBe(false);
    expect(canEditStaff(bm, someone({ role: 'waiter', branchId: null }))).toBe(false);
    expect(canSetStaffPin(bm, someone({ role: 'kitchen', branchId: 'b-2' }))).toBe(false);
    expect(canSetStaffPin(bm, someone({ role: 'kitchen', branchId: 'b-1' }))).toBe(true);
  });

  it('lets an owner issue a general manager a sign-in, and a general manager a branch manager one', () => {
    const owner = { id: 's-owner', role: 'owner' } as const;
    expect(canIssueSignIn(owner, someone({ role: 'generalManager', branchId: null }))).toBe(true);
    expect(canIssueSignIn(gm, someone({ role: 'manager' }))).toBe(true);
    expect(canIssueSignIn(gm, someone({ id: 's-other', role: 'generalManager' }))).toBe(false);
  });
});

describe('where each role works', () => {
  it('binds a branch manager to one branch and a general manager to none', () => {
    expect(branchBindingFor('manager')).toBe('required');
    expect(branchBindingFor('generalManager')).toBe('venueWide');
    expect(branchBindingFor('owner')).toBe('either');
    expect(branchBindingFor('waiter')).toBe('either');
    expect(branchBindingFor('kitchen')).toBe('either');
  });

  it('lets a general manager choose the branch, like an owner', () => {
    expect(canChooseBranch('generalManager')).toBe(true);
    expect(canChooseBranch('manager')).toBe(false);
  });
});
