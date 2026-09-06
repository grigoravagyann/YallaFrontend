import { describe, expect, it } from 'vitest';
import { assignableRoles, canChooseBranch, canEditStaff, type StaffMember } from './staff';

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

  it('offers an owner manager as well', () => {
    expect(assignableRoles('owner')).toEqual(['manager', 'waiter', 'kitchen']);
  });

  it('never offers anybody their own role', () => {
    // The rule that stops a manager minting a peer, and an owner minting a
    // second owner nobody agreed to.
    expect(assignableRoles('manager')).not.toContain('manager');
    expect(assignableRoles('owner')).not.toContain('owner');
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

  it('stops a manager touching another manager', () => {
    expect(canEditStaff({ id: 's-mgr', role: 'manager' }, someone({ role: 'manager' }))).toBe(
      false,
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
