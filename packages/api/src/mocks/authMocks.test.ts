import { describe, expect, it } from 'vitest';
import {
  DeviceRevokedError,
  EnrolmentCodeExpiredError,
  EnrolmentCodeSpentError,
  PinLockedError,
  PinRejectedError,
} from '../contracts/errors';
import { UnauthorizedError, ValidationError } from '../errors';
import { createConsoleMockGateway } from './consoleMock';
import { createMockRegistry } from './mockRegistry';
import { createMockStaffAuth } from './staffAuthMock';
import { MOCK_STAFF_PIN } from './staffFixture';
import { createMockVenueUserAuth } from './venueAuthMock';

/**
 * QA F13 and F15 (2026-10-16): the console mock's sign-in link went to a
 * `mock://` address nothing could open, and the mock tablet had no sign-in
 * at all — "Tap to sign out" did nothing and the enrol and PIN screens could
 * not be reached.
 */

async function caught(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => null,
    (error: unknown) => error,
  );
}

const T0 = new Date('2026-09-16T10:00:00.000Z');

describe('F15 — the sign-in link the console mock issues can be followed', () => {
  it('is a /reset-password link whose token the mock venue auth spends once', async () => {
    const registry = createMockRegistry(() => null);
    const console_ = createConsoleMockGateway({ role: 'platformAdmin', registry, now: () => T0 });
    const auth = createMockVenueUserAuth({ registry, now: () => T0 });

    const link = await console_.issueStaffSignIn({
      venueId: 'v-lumen',
      staffMemberId: 'b-lumen-north-manager',
      email: 'nare@lumen.am',
    });
    expect(link.resetLink).toMatch(/^\/reset-password#token=[a-z0-9]{32}$/u);
    const token = link.resetLink.split('#token=')[1]!;

    // Under the server's minimum: VenueUserAuthService.ResetPasswordAsync's
    // ArgumentException, whose .NET message carries the parameter, mapped to
    // 400 invalid-request naming the field.
    const short = await caught(auth.resetPassword(token, 'short'));
    expect(short).toBeInstanceOf(ValidationError);
    expect((short as ValidationError).message).toBe(
      "Password must be at least 12 characters. (Parameter 'newPassword')",
    );
    expect((short as ValidationError).field).toBe('newPassword');
    // Length is checked before the token is looked up, so a short password
    // on a bad link is the 400, not the 401.
    expect(await caught(auth.resetPassword('not-a-token', 'short'))).toBeInstanceOf(
      ValidationError,
    );

    await expect(auth.resetPassword(token, 'long enough password')).resolves.toBeUndefined();
    // Spent: the second use is the 401 the reset page reads as an invalid link,
    // with the server's reason code and sentence.
    const spent = await caught(auth.resetPassword(token, 'long enough password'));
    expect(spent).toBeInstanceOf(UnauthorizedError);
    expect((spent as UnauthorizedError).problem?.code).toBe('reset-token-invalid');
    expect((spent as UnauthorizedError).message).toBe(
      'That reset link is not valid or has expired. Ask for a new one.',
    );
    expect(await caught(auth.resetPassword('not-a-token', 'long enough password'))).toBeInstanceOf(
      UnauthorizedError,
    );
  });

  it('leaves only a hash of the token in storage, as the server keeps only a hash', async () => {
    // What a browser's localStorage would hold: the registry mirrors to it.
    const disk = new Map<string, string>();
    const storage = {
      getItem: (key: string) => disk.get(key) ?? null,
      setItem: (key: string, value: string) => void disk.set(key, value),
      removeItem: (key: string) => void disk.delete(key),
    };
    const registry = createMockRegistry(() => storage);
    const console_ = createConsoleMockGateway({ role: 'platformAdmin', registry, now: () => T0 });
    const link = await console_.issueStaffSignIn({
      venueId: 'v-lumen',
      staffMemberId: 'b-lumen-north-manager',
      email: 'nare@lumen.am',
    });
    const token = link.resetLink.split('#token=')[1]!;

    // The staff screen's own promise (staff.test.tsx): the link never reaches
    // a disk. A reload later, a fresh registry over the same disk honours it.
    expect([...disk.values()].join(' ')).not.toContain(token);
    const afterReload = createMockVenueUserAuth({
      registry: createMockRegistry(() => storage),
      now: () => T0,
    });
    await expect(afterReload.resetPassword(token, 'long enough password')).resolves.toBeUndefined();
  });

  it('expires after its day', async () => {
    const registry = createMockRegistry(() => null);
    const console_ = createConsoleMockGateway({ role: 'platformAdmin', registry, now: () => T0 });
    const link = await console_.issueStaffSignIn({
      venueId: 'v-lumen',
      staffMemberId: 'b-lumen-north-manager',
      email: 'nare@lumen.am',
    });
    const token = link.resetLink.split('#token=')[1]!;
    const later = createMockVenueUserAuth({
      registry,
      now: () => new Date(T0.getTime() + 25 * 60 * 60_000),
    });
    expect(await caught(later.resetPassword(token, 'long enough password'))).toBeInstanceOf(
      UnauthorizedError,
    );
  });
});

describe('F13 — a mock tablet enrols with a console code, signs in by PIN, and signs out', () => {
  async function enrolled() {
    const registry = createMockRegistry(() => null);
    const console_ = createConsoleMockGateway({ role: 'owner', registry, now: () => T0 });
    const auth = createMockStaffAuth({ registry, now: () => T0 });
    const { code } = await console_.createEnrolmentCode('b-lumen-north');
    const enrolment = await auth.enrol({ code, deviceId: 'dev-1', deviceName: 'Counter' });
    return { registry, console_, auth, code, enrolment };
  }

  it('redeems a code the console generated, exactly once', async () => {
    const { auth, code, enrolment } = await enrolled();
    expect(enrolment.branchId).toBe('b-lumen-north');
    expect(await auth.getDevice(enrolment.deviceToken)).toMatchObject({
      deviceName: 'Counter',
      branchName: 'Northern Avenue',
      venueName: 'Lumen Coffee',
    });
    expect(
      await caught(auth.enrol({ code, deviceId: 'dev-2', deviceName: 'Another' })),
    ).toBeInstanceOf(EnrolmentCodeSpentError);
    expect(
      await caught(auth.enrol({ code: 'NOTACODE22', deviceId: 'dev-3', deviceName: 'Nope' })),
    ).toBeInstanceOf(UnauthorizedError);
    expect(await caught(auth.getDevice('mockdev_never'))).toBeInstanceOf(DeviceRevokedError);
  });

  it('shows the branch roster the console shows, and signs a waiter in by PIN', async () => {
    const { auth, enrolment, console_ } = await enrolled();
    const roster = await auth.getRoster(enrolment.deviceToken);
    const consoleIds = new Set((await console_.listStaff('v-lumen')).map((m) => m.id));
    expect(roster.length).toBeGreaterThan(0);
    for (const entry of roster) expect(consoleIds.has(entry.staffMemberId)).toBe(true);
    // The waiter at another branch is not on this tablet.
    expect(roster.some((entry) => entry.staffMemberId === 'b-lumen-cascade-waiter-1')).toBe(false);
    // Some of the branch are on shift, so the PIN gate's grouping shows in mock mode.
    expect(roster.some((entry) => entry.onShiftNow && entry.shift !== null)).toBe(true);
    expect(roster.some((entry) => !entry.onShiftNow)).toBe(true);

    const kitchen = 'b-lumen-north-kitchen';
    expect(
      await caught(
        auth.signInWithPin(enrolment.deviceToken, { staffMemberId: kitchen, pin: '0000' }),
      ),
    ).toBeInstanceOf(PinRejectedError);
    const signedIn = await auth.signInWithPin(enrolment.deviceToken, {
      staffMemberId: kitchen,
      pin: MOCK_STAFF_PIN,
    });
    expect(signedIn.identity).toMatchObject({
      staffMemberId: kitchen,
      role: 'kitchen',
      branchId: 'b-lumen-north',
    });

    // Renewal rotates the handle; sign-out ends it.
    const renewed = await auth.renew(signedIn.tokens.renewalToken);
    expect(renewed?.identity.staffMemberId).toBe(kitchen);
    expect(await auth.renew(signedIn.tokens.renewalToken)).toBeNull();
    await auth.signOut(renewed!.tokens.renewalToken);
    expect(await auth.renew(renewed!.tokens.renewalToken)).toBeNull();
  });

  it('locks a PIN on the fifth miss in a row, and a locked person from the first', async () => {
    // StaffMember.RecordFailedPin: consecutive misses, and the one that
    // reaches AuthOptions.PinMaxAttempts (5) is itself the lockout, for
    // PinLockoutMinutes (15).
    const { auth, enrolment } = await enrolled();
    const manager = 'b-lumen-north-manager';
    for (let attempt = 0; attempt < 4; attempt += 1) {
      expect(
        await caught(
          auth.signInWithPin(enrolment.deviceToken, { staffMemberId: manager, pin: '9999' }),
        ),
      ).toBeInstanceOf(PinRejectedError);
    }
    const fifth = await caught(
      auth.signInWithPin(enrolment.deviceToken, { staffMemberId: manager, pin: '9999' }),
    );
    expect(fifth).toBeInstanceOf(PinLockedError);
    expect((fifth as PinLockedError).lockedUntilUtc).toBe('2026-09-16T10:15:00.000Z');
    expect(
      await caught(
        auth.signInWithPin(enrolment.deviceToken, { staffMemberId: manager, pin: MOCK_STAFF_PIN }),
      ),
    ).toBeInstanceOf(PinLockedError);
    // The fixture's locked-out waiter is refused even with the right PIN.
    expect(
      await caught(
        auth.signInWithPin(enrolment.deviceToken, {
          staffMemberId: 'b-lumen-north-waiter-1',
          pin: MOCK_STAFF_PIN,
        }),
      ),
    ).toBeInstanceOf(PinLockedError);
  });

  it('counts a miss only for somebody this tablet signs in, and a hit clears the count', async () => {
    const { auth, enrolment } = await enrolled();
    // Another branch's waiter does not exist as far as this tablet is
    // concerned: rejected however often, never locked.
    for (let attempt = 0; attempt < 6; attempt += 1) {
      expect(
        await caught(
          auth.signInWithPin(enrolment.deviceToken, {
            staffMemberId: 'b-lumen-cascade-kitchen',
            pin: '9999',
          }),
        ),
      ).toBeInstanceOf(PinRejectedError);
    }
    // Four misses, a hit, four more: never five in a row.
    const kitchen = 'b-lumen-north-kitchen';
    const miss = () =>
      caught(auth.signInWithPin(enrolment.deviceToken, { staffMemberId: kitchen, pin: '9999' }));
    for (let attempt = 0; attempt < 4; attempt += 1)
      expect(await miss()).toBeInstanceOf(PinRejectedError);
    await auth.signInWithPin(enrolment.deviceToken, {
      staffMemberId: kitchen,
      pin: MOCK_STAFF_PIN,
    });
    for (let attempt = 0; attempt < 4; attempt += 1)
      expect(await miss()).toBeInstanceOf(PinRejectedError);
  });

  it('calls a spent code spent even after its day, as the server checks that first', async () => {
    const { registry, code } = await enrolled();
    const later = createMockStaffAuth({
      registry,
      now: () => new Date(T0.getTime() + 25 * 60 * 60_000),
    });
    expect(
      await caught(later.enrol({ code, deviceId: 'dev-9', deviceName: 'Late' })),
    ).toBeInstanceOf(EnrolmentCodeSpentError);
  });

  it('calls an unused code past its day expired, not mistyped', async () => {
    const registry = createMockRegistry(() => null);
    const console_ = createConsoleMockGateway({ role: 'owner', registry, now: () => T0 });
    const { code } = await console_.createEnrolmentCode('b-lumen-north');
    const later = createMockStaffAuth({
      registry,
      now: () => new Date(T0.getTime() + 25 * 60 * 60_000),
    });
    expect(
      await caught(later.enrol({ code, deviceId: 'dev-9', deviceName: 'Late' })),
    ).toBeInstanceOf(EnrolmentCodeExpiredError);
  });
});
