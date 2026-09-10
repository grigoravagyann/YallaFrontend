import { describe, expect, it } from 'vitest';
import type { components } from '../generated/schema';
import { createStaffBody, staffMember, staffSignInLink } from './staffAdminMapping';

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
