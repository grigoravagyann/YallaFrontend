import { describe, expect, it } from 'vitest';
import {
  assignableRoles,
  canChooseBranch,
  canEditStaff,
  canIssueSignIn,
  outranks,
  type StaffMember,
} from './staff';

/**
 * Who may create whom, derived rather than validated.
 *
 * The rule is the server's and the UI has to *match* it, not approximate it.
 * That is why this is a function the picker is built from instead of a filter
 * applied to a full list: an option that is rendered and then refused reads as
 * a broken product, and one that is hidden by CSS is still in the DOM for
 * anybody who looks.
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

describe('the role picker', () => {
  it('offers a manager only the roles below them', () => {
    expect(assignableRoles('manager')).toEqual(['waiter', 'kitchen']);
  });

  it('offers an owner a co-owner as well as everyone below', () => {
    // The server's MayAssign(Owner, Owner) is true: a co-owner is a normal
    // thing for a family business. This list used to be the stricter of the
    // two, and an owner could not hand the venue to a partner.
    expect(assignableRoles('owner')).toEqual(['owner', 'manager', 'waiter', 'kitchen']);
  });

  it('mirrors the server table exactly, every actor against every role', () => {
    // StaffRoleRules.MayAssign, case for case.
    const table: Record<string, readonly string[]> = {
      platformAdmin: ['owner', 'manager', 'waiter', 'kitchen'],
      owner: ['owner', 'manager', 'waiter', 'kitchen'],
      manager: ['waiter', 'kitchen'],
      waiter: [],
      kitchen: [],
    };
    for (const [actor, roles] of Object.entries(table)) {
      expect(assignableRoles(actor as never)).toEqual(roles);
    }
  });

  it('never offers a manager a peer', () => {
    // The one rank that may not mint its own: MayAssign(Manager, Manager) is
    // false, so a manager cannot promote a waiter to a peer.
    expect(assignableRoles('manager')).not.toContain('manager');
  });

  it('never offers platform admin from inside a venue', () => {
    // A platform admin has no venue and no branch. Creating one here is a
    // category error, not a permission question.
    for (const actor of ['owner', 'manager', 'platformAdmin'] as const) {
      expect(assignableRoles(actor)).not.toContain('platformAdmin' as never);
    }
  });

  it('offers floor staff nothing, because they do not reach this screen', () => {
    expect(assignableRoles('waiter')).toEqual([]);
    expect(assignableRoles('kitchen')).toEqual([]);
  });
});

describe('editing somebody', () => {
  it('lets an owner edit a manager and a manager edit a waiter', () => {
    expect(canEditStaff({ id: 's-owner', role: 'owner' }, someone({ role: 'manager' }))).toBe(true);
    expect(canEditStaff({ id: 's-mgr', role: 'manager' }, someone({ role: 'waiter' }))).toBe(true);
  });

  it('stops a manager touching another manager, and lets an owner edit a co-owner', () => {
    // MayManage is the MayAssign table: you may touch the people you could
    // have created. An owner could create an owner, so an owner may edit one.
    expect(canEditStaff({ id: 's-mgr', role: 'manager' }, someone({ role: 'manager' }))).toBe(
      false,
    );
    expect(canEditStaff({ id: 's-mgr', role: 'manager' }, someone({ role: 'owner' }))).toBe(false);
    expect(canEditStaff({ id: 's-owner', role: 'owner' }, someone({ role: 'owner' }))).toBe(true);
    expect(canEditStaff({ id: 's-pa', role: 'platformAdmin' }, someone({ role: 'owner' }))).toBe(
      true,
    );
  });

  it('stops anybody editing themselves', () => {
    /*
     * The rule that keeps a venue out of its own lockout: an owner who could
     * demote themselves could remove the last owner-level account and leave
     * nobody able to put it back.
     */
    const self = someone({ id: 's-owner', role: 'manager' });
    expect(canEditStaff({ id: 's-owner', role: 'owner' }, self)).toBe(false);
    // Even now that an owner may edit an owner: self is refused by identity,
    // not by rank.
    expect(
      canEditStaff({ id: 's-owner', role: 'owner' }, someone({ id: 's-owner', role: 'owner' })),
    ).toBe(false);
  });
});

describe('issuing a sign-in', () => {
  it('needs the actor strictly above the subject, unlike editing', () => {
    /*
     * The server's Outranks, not MayManage: a sign-in is the whole account, so
     * an owner may edit a co-owner but may not take over their sign-in. Only a
     * platform admin repairs an owner.
     */
    expect(outranks('owner', 'owner')).toBe(false);
    expect(outranks('owner', 'manager')).toBe(true);
    expect(outranks('platformAdmin', 'owner')).toBe(true);
    expect(outranks('manager', 'manager')).toBe(false);
    expect(outranks('manager', 'waiter')).toBe(true);

    const owner = { id: 's-owner', role: 'owner' } as const;
    expect(canIssueSignIn(owner, someone({ role: 'owner' }))).toBe(false);
    expect(canIssueSignIn(owner, someone({ role: 'manager' }))).toBe(true);
    expect(canIssueSignIn({ id: 's-pa', role: 'platformAdmin' }, someone({ role: 'owner' }))).toBe(
      true,
    );
  });

  it('is never offered for oneself, a PIN-only role, or a deactivated person', () => {
    const owner = { id: 's-owner', role: 'owner' } as const;
    expect(canIssueSignIn(owner, someone({ id: 's-owner', role: 'manager' }))).toBe(false);
    expect(canIssueSignIn(owner, someone({ role: 'waiter' }))).toBe(false);
    expect(canIssueSignIn(owner, someone({ role: 'manager', isActive: false }))).toBe(false);
  });
});

describe('the branch field', () => {
  it('is a choice for an owner and a fact for a manager', () => {
    // A manager holds one branch and everyone they create works at it, so the
    // control is not rendered at all — one option invites a search for others.
    expect(canChooseBranch('owner')).toBe(true);
    expect(canChooseBranch('platformAdmin')).toBe(true);
    expect(canChooseBranch('manager')).toBe(false);
  });
});
