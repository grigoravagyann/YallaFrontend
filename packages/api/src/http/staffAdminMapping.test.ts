import { describe, expect, it } from 'vitest';
import type { components } from '../generated/schema';
import {
  createStaffBody,
  staffMember,
  staffRole,
  staffRoleCode,
  staffSignInLink,
  updateStaffBody,
} from './staffAdminMapping';

type Schemas = components['schemas'];

const wireLink = (
  over: Partial<Schemas['Yalla.Application.Staff.StaffSignInLink']> = {},
): Schemas['Yalla.Application.Staff.StaffSignInLink'] => ({
  staffMemberId: '0192a1b2-7c3d-7e4f-8a5b-6c7d8e9f0a1b',
  email: 'nare@lumen.am',
  resetLink: 'https://console.example/reset-password#token=abc',
  expiresAtUtc: '2026-09-11T09:00:00Z',
  replacedExistingSignIn: false,
  ...over,
});

describe('a sign-in link off the wire', () => {
  it('carries every field across under its own name', () => {
    // The one copy of a live credential goes through here. A renamed wire
    // member must fail in this file, not as `undefined` in the dialog.
    const link = staffSignInLink(wireLink({ replacedExistingSignIn: true }));
    expect(link).toEqual({
      staffMemberId: '0192a1b2-7c3d-7e4f-8a5b-6c7d8e9f0a1b',
      email: 'nare@lumen.am',
      resetLink: 'https://console.example/reset-password#token=abc',
      expiresAtUtc: '2026-09-11T09:00:00Z',
      replacedExistingSignIn: true,
    });
  });
});

describe('a staff member off the wire', () => {
  it('keeps the address and the password flag apart', () => {
    // Email set, password absent, is the "awaiting password" state a fresh
    // sign-in leaves somebody in; collapsing the two would hide it.
    const member = staffMember({
      id: 's1',
      venueId: 'v1',
      branchId: null,
      fullName: 'Nare Petrosyan',
      phone: '+37477200000',
      role: 2,
      isActive: true,
      email: 'nare@lumen.am',
      hasPasswordSignIn: false,
      isPinLocked: false,
    });
    expect(member.email).toBe('nare@lumen.am');
    expect(member.hasPasswordSignIn).toBe(false);
    expect(member.role).toBe('manager');
  });
});

describe('the create body', () => {
  it('sends no email key when the input has none', () => {
    // The server refuses an email without a password; the console never
    // sends one on create, so the key must be absent rather than null.
    const body = createStaffBody({
      fullName: 'Marine Sahakyan',
      phone: '+37477123456',
      role: 'manager',
      pin: '2941',
      branchId: null,
    });
    expect(body).not.toHaveProperty('email');
    expect(body).not.toHaveProperty('password');
  });
});

describe('the general manager on the wire', () => {
  // TODO(schema): `StaffRole.GeneralManager = 6` is typed locally until the
  // generated union carries it.
  it('reads 6 as a general manager and writes a general manager as 6', () => {
    expect(staffRole(6)).toBe('generalManager');
    expect(staffRoleCode('generalManager')).toBe(6);
    // `manager` keeps 2: it is the branch manager now, under the same number.
    expect(staffRole(2)).toBe('manager');
    expect(staffRoleCode('manager')).toBe(2);
  });

  it('sends the code in the create and the patch bodies', () => {
    const body = createStaffBody({
      fullName: 'Hasmik Karapetyan',
      phone: '+37477209090',
      role: 'generalManager',
      pin: '5307',
      branchId: null,
    });
    expect(body.role).toBe(6);
    expect(updateStaffBody({ role: 'generalManager' })).toEqual({ role: 6 });
  });
});
