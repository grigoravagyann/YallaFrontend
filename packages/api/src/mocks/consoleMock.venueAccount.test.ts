import { describe, expect, it } from 'vitest';
import type { UserRole } from '../contracts/console';
import { ForbiddenError, ValidationError } from '../errors';
import { createConsoleMockGateway, MOCK_VENUE_PASSWORD } from './consoleMock';

/**
 * My account against the mock (venue-console Account artboard), which has to
 * answer as the server does (VC1 wire): only an owner, a general manager or a
 * branch manager has one; the name is theirs to change and the email is not;
 * a password change is one 422 naming every field and ends the other
 * sign-ins; "sign out everywhere else" says how many it ended.
 */

const NOW = new Date('2026-10-19T10:30:00Z');

function mock(role: UserRole = 'owner') {
  return createConsoleMockGateway({ latencyMs: 0, role, now: () => NOW });
}

async function caught(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => null,
    (error: unknown) => error,
  );
}

describe('my account', () => {
  it('is the signed-in staff member: their name, email, role, venue and branch', async () => {
    for (const role of ['owner', 'generalManager', 'manager'] as const) {
      const gateway = mock(role);
      const user = await gateway.getCurrentUser();
      const me = await gateway.getVenueProfile();
      expect(me).toMatchObject({
        staffMemberId: user.id,
        fullName: user.displayName,
        role,
        venueId: user.scope.venueId,
        branchId: role === 'manager' ? user.scope.branchIds[0] : null,
      });
      expect(me.email).toMatch(/@/u);
    }
  });

  it('is refused to the platform admin, who has Settings, and to the floor roles', async () => {
    for (const role of ['platformAdmin', 'waiter', 'kitchen'] as const) {
      expect(await caught(mock(role).getVenueProfile())).toBeInstanceOf(ForbiddenError);
    }
  });

  it("renames them trimmed, and their signed-in name and staff row follow — nobody else's", async () => {
    for (const role of ['owner', 'generalManager', 'manager'] as const) {
      const gateway = mock(role);
      const before = await gateway.getVenueProfile();
      const others = (await gateway.listStaff(before.venueId)).filter(
        (member) => member.id !== before.staffMemberId,
      );
      const after = await gateway.updateVenueProfile({ fullName: `  Renamed ${role} ` });
      expect(after).toEqual({ ...before, fullName: `Renamed ${role}` });
      expect((await gateway.getCurrentUser()).displayName).toBe(`Renamed ${role}`);
      expect((await gateway.getVenueProfile()).fullName).toBe(`Renamed ${role}`);
      const staff = await gateway.listStaff(before.venueId);
      expect(staff.find((member) => member.id === before.staffMemberId)?.fullName).toBe(
        `Renamed ${role}`,
      );
      expect(staff.filter((member) => member.id !== before.staffMemberId)).toEqual(others);
      // The venue's platform view still names its owner by the owner's own name.
      if (role !== 'owner') {
        const owner = staff.find((member) => member.role === 'owner');
        expect(owner?.fullName).not.toBe(`Renamed ${role}`);
      }
    }
  });

  it('refuses a blank name and a long one, naming the field', async () => {
    const blank = await caught(mock().updateVenueProfile({ fullName: '   ' }));
    expect(blank).toBeInstanceOf(ValidationError);
    expect((blank as ValidationError).violations[0]).toMatchObject({
      field: 'fullName',
      bound: 'required',
    });
    const long = await caught(mock().updateVenueProfile({ fullName: 'a'.repeat(201) }));
    expect((long as ValidationError).violations[0]).toMatchObject({
      field: 'fullName',
      bound: 'max',
      max: 200,
    });
  });

  it('refuses a wrong current password and a short new one in one answer', async () => {
    const error = await caught(
      mock().changeVenuePassword({ currentPassword: 'not-it', newPassword: 'short' }),
    );
    expect(error).toBeInstanceOf(ValidationError);
    expect(
      (error as ValidationError).violations.map((violation) => [violation.field, violation.bound]),
    ).toEqual([
      ['currentPassword', 'conflict'],
      ['newPassword', 'min'],
    ]);
  });

  it('changes the password and ends every other sign-in, keeping this one', async () => {
    const gateway = mock('manager');
    expect((await gateway.listVenueSessions()).length).toBeGreaterThan(1);
    await expect(
      gateway.changeVenuePassword({
        currentPassword: MOCK_VENUE_PASSWORD,
        newPassword: 'a-new-password-1234',
      }),
    ).resolves.toEqual({ sessionRenewed: true });
    const sessions = await gateway.listVenueSessions();
    expect(sessions.map((session) => session.isCurrent)).toEqual([true]);
    // The old password is no longer the current one.
    expect(
      await caught(
        gateway.changeVenuePassword({
          currentPassword: MOCK_VENUE_PASSWORD,
          newPassword: 'another-password-5678',
        }),
      ),
    ).toBeInstanceOf(ValidationError);
  });
});

describe('where they are signed in', () => {
  it('lists this sign-in first, then the others most recently active first', async () => {
    const sessions = await mock().listVenueSessions();
    expect(sessions[0]?.isCurrent).toBe(true);
    expect(sessions.filter((session) => session.isCurrent)).toHaveLength(1);
    const others = sessions.slice(1).map((session) => session.lastActiveAtUtc);
    expect(others).toEqual([...others].sort().reverse());
  });

  it('signs out everywhere else, says how many, and a second time ends none', async () => {
    const gateway = mock();
    const before = await gateway.listVenueSessions();
    expect(await gateway.signOutOtherVenueSessions()).toEqual({
      endedSessions: before.length - 1,
    });
    expect((await gateway.listVenueSessions()).map((session) => session.isCurrent)).toEqual([true]);
    expect(await gateway.signOutOtherVenueSessions()).toEqual({ endedSessions: 0 });
  });

  it('is refused to the platform admin', async () => {
    expect(await caught(mock('platformAdmin').listVenueSessions())).toBeInstanceOf(ForbiddenError);
  });
});
