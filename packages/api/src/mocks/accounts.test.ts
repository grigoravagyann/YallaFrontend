import { describe, expect, it } from 'vitest';
import { SEEDED_ACCOUNT } from './accounts';
import { createMockGateway } from './mockGateway';

/**
 * The mock's accounts, matched to the server's rules.
 *
 * Every refusal here is one the brief's backend answers with, by the same
 * name, so a screen built against the mock is built against the real
 * refusals and not against a mock that says yes to everything.
 */

const FORM = {
  username: 'Grigor',
  email: 'Grigor@Example.com',
  password: 'correct horse',
  phoneE164: '+37499000001',
  displayName: 'Grigor A.',
};

async function caught(promise: Promise<unknown>): Promise<Error & Record<string, unknown>> {
  try {
    await promise;
  } catch (error) {
    return error as Error & Record<string, unknown>;
  }
  throw new Error('expected a rejection');
}

describe('booking with an unconfirmed number', () => {
  const BOOKING = {
    commandId: 'cmd-unverified-1',
    branchId: 'b-unknown',
    tableId: 't-unknown',
    slotUtc: '2030-01-01T18:00:00.000Z',
    timeZoneId: 'Asia/Yerevan',
    partySize: 2,
    guestName: 'Grigor A.',
    guestPhone: FORM.phoneE164,
    channel: 'app' as const,
  };

  it('is refused until the code confirms the number, and then goes on to the booking rules', async () => {
    const gateway = createMockGateway();
    await gateway.registerDiner(FORM);

    const refused = await caught(gateway.createBooking(BOOKING));
    expect(refused.name).toBe('PhoneNotVerifiedError');
    expect(refused['status']).toBe(403);

    const tab = await caught(gateway.openTabByBooking({ bookingCode: 'ABC123' } as never));
    expect(tab.name).toBe('PhoneNotVerifiedError');

    const challenge = await gateway.requestPhoneCode(FORM.phoneE164);
    await gateway.verifyPhoneCode({
      challengeId: challenge.challengeId,
      code: challenge.devCode ?? '123456',
    });

    // Past the gate: now the unknown branch is what answers.
    const next = await caught(gateway.createBooking({ ...BOOKING, commandId: 'cmd-unverified-2' }));
    expect(next.name).not.toBe('PhoneNotVerifiedError');
  });
});

describe('signing up', () => {
  it('creates the account, signs in, and stores the username and email lowercased', async () => {
    const gateway = createMockGateway();

    const result = await gateway.registerDiner(FORM);
    expect(result.isNewAccount).toBe(true);
    expect(result.accessToken).not.toBe('');

    const profile = await gateway.getDinerProfile();
    expect(profile).toMatchObject({
      dinerUserId: result.dinerUserId,
      username: 'grigor',
      email: 'grigor@example.com',
      displayName: 'Grigor A.',
      hasPassword: true,
      photo: null,
    });
    // Registering does not verify the number. Only the code does.
    expect(profile.phoneVerified).toBe(false);
  });

  it.each([
    ['username', { username: 'ab' }],
    ['username', { username: '_lurj' }],
    ['username', { username: 'Lurj Albert' }],
    ['email', { email: 'not-an-address' }],
    ['password', { password: 'short' }],
    ['password', { password: 'grigor@example.com' }],
    ['phoneE164', { phoneE164: '077 12 34 56' }],
    ['displayName', { displayName: '   ' }],
  ])('refuses a bad %s naming the field', async (field, change) => {
    const gateway = createMockGateway();
    const error = await caught(gateway.registerDiner({ ...FORM, ...change }));
    expect(error.name).toBe('ValidationError');
    expect(error['field']).toBe(field);
  });

  it('refuses the seeded username, email and phone each by its own 409', async () => {
    const gateway = createMockGateway();

    const username = await caught(
      gateway.registerDiner({ ...FORM, username: SEEDED_ACCOUNT.username.toUpperCase() }),
    );
    expect(username.name).toBe('UsernameTakenError');

    const email = await caught(gateway.registerDiner({ ...FORM, email: SEEDED_ACCOUNT.email }));
    expect(email.name).toBe('EmailTakenError');

    const phone = await caught(
      gateway.registerDiner({ ...FORM, phoneE164: SEEDED_ACCOUNT.phoneE164 }),
    );
    expect(phone.name).toBe('PhoneInUseError');
  });
});

describe('logging in', () => {
  it('takes the seeded username or email, either case', async () => {
    const gateway = createMockGateway();

    const byName = await gateway.loginDiner({ identifier: 'LURJ', password: 'password123' });
    expect(byName.isNewAccount).toBe(false);
    expect(byName.dinerUserId).toBe(SEEDED_ACCOUNT.id);

    const byEmail = await gateway.loginDiner({
      identifier: 'Lurj@Example.com',
      password: 'password123',
    });
    expect(byEmail.dinerUserId).toBe(SEEDED_ACCOUNT.id);

    await expect(gateway.getDinerProfile()).resolves.toMatchObject({
      displayName: 'Lurj Albert',
      photo: { photoId: expect.stringContaining('avatar-lurj') },
    });
  });

  it('answers a wrong password and an unknown name identically', async () => {
    const gateway = createMockGateway();
    const wrong = await caught(gateway.loginDiner({ identifier: 'lurj', password: 'nope' }));
    const unknown = await caught(gateway.loginDiner({ identifier: 'nobody', password: 'nope' }));
    expect(wrong.name).toBe('InvalidCredentialsError');
    expect(unknown.name).toBe('InvalidCredentialsError');
    expect(wrong.message).toBe(unknown.message);
  });

  it('refuses an SMS-only account that has no password the same way', async () => {
    const gateway = createMockGateway();
    const challenge = await gateway.requestPhoneCode('+37499000002');
    await gateway.verifyPhoneCode({ challengeId: challenge.challengeId, code: '123456' });
    const profile = await gateway.getDinerProfile();
    expect(profile.hasPassword).toBe(false);

    const error = await caught(gateway.loginDiner({ identifier: profile.phoneE164, password: '' }));
    expect(error.name).toBe('InvalidCredentialsError');
  });

  it('burns an identifier after ten misses in fifteen minutes, and forgets old ones', async () => {
    let clock = Date.parse('2026-09-13T10:00:00Z');
    const gateway = createMockGateway({ now: () => new Date(clock) });

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const error = await caught(gateway.loginDiner({ identifier: 'lurj', password: 'nope' }));
      expect(error.name).toBe('InvalidCredentialsError');
    }
    // The eleventh is refused before the password is even looked at.
    const locked = await caught(
      gateway.loginDiner({ identifier: 'lurj', password: 'password123' }),
    );
    expect(locked.name).toBe('TooManyAttemptsError');

    clock += 15 * 60_000 + 1;
    await expect(
      gateway.loginDiner({ identifier: 'lurj', password: 'password123' }),
    ).resolves.toMatchObject({ dinerUserId: SEEDED_ACCOUNT.id });
  });

  it('answers /me with 401 before anybody signed in', async () => {
    const gateway = createMockGateway();
    const error = await caught(gateway.getDinerProfile());
    expect(error.name).toBe('UnauthorizedError');
  });
});

describe('the profile', () => {
  it('changes only the fields given', async () => {
    const gateway = createMockGateway();
    await gateway.loginDiner({ identifier: 'lurj', password: 'password123' });

    const profile = await gateway.updateDinerProfile({ displayName: 'L. Albert' });

    expect(profile.displayName).toBe('L. Albert');
    expect(profile.username).toBe('lurj');
    expect(profile.email).toBe('lurj@example.com');
  });

  it('refuses a username somebody else has, and changes nothing when it does', async () => {
    const gateway = createMockGateway();
    await gateway.registerDiner(FORM);

    const error = await caught(
      gateway.updateDinerProfile({ displayName: 'Changed', username: 'lurj' }),
    );

    expect(error.name).toBe('UsernameTakenError');
    await expect(gateway.getDinerProfile()).resolves.toMatchObject({ displayName: 'Grigor A.' });
  });

  it('lets an account keep its own username', async () => {
    const gateway = createMockGateway();
    await gateway.loginDiner({ identifier: 'lurj', password: 'password123' });
    await expect(gateway.updateDinerProfile({ username: 'LURJ' })).resolves.toMatchObject({
      username: 'lurj',
    });
  });
});

describe('the password', () => {
  it('is set without a current one by an SMS-made account, then changed with it', async () => {
    const gateway = createMockGateway();
    const challenge = await gateway.requestPhoneCode('+37499000003');
    await gateway.verifyPhoneCode({ challengeId: challenge.challengeId, code: '123456' });

    await gateway.setDinerPassword({ newPassword: 'first one!' });
    await expect(gateway.getDinerProfile()).resolves.toMatchObject({ hasPassword: true });

    const wrong = await caught(
      gateway.setDinerPassword({ currentPassword: 'not it', newPassword: 'second one' }),
    );
    expect(wrong.name).toBe('InvalidCredentialsError');

    const missing = await caught(gateway.setDinerPassword({ newPassword: 'second one' }));
    expect(missing.name).toBe('InvalidCredentialsError');

    await gateway.setDinerPassword({ currentPassword: 'first one!', newPassword: 'second one' });
  });

  it('holds the new one to the same rule as sign-up', async () => {
    const gateway = createMockGateway();
    await gateway.loginDiner({ identifier: 'lurj', password: 'password123' });
    const error = await caught(
      gateway.setDinerPassword({ currentPassword: 'password123', newPassword: 'lurj@example.com' }),
    );
    expect(error.name).toBe('ValidationError');
    expect(error['field']).toBe('newPassword');
  });
});

describe('the avatar', () => {
  it('takes a native file or a Blob, and comes off again', async () => {
    const gateway = createMockGateway();
    await gateway.registerDiner(FORM);

    const fromPhone = await gateway.uploadDinerPhoto({
      uri: 'file:///me.jpg',
      name: 'me.jpg',
      type: 'image/jpeg',
    });
    expect(fromPhone.cardUrl).toMatch(/^\/api\/photos\/.+\/card$/u);
    await expect(gateway.getDinerProfile()).resolves.toMatchObject({ photo: fromPhone });

    const fromWeb = await gateway.uploadDinerPhoto(new Blob(['x']));
    expect(fromWeb.photoId).not.toBe(fromPhone.photoId);

    await gateway.removeDinerPhoto();
    await expect(gateway.getDinerProfile()).resolves.toMatchObject({ photo: null });
    // Idempotent, as the server is.
    await expect(gateway.removeDinerPhoto()).resolves.toBeUndefined();
  });
});

describe('passing the code with an account already', () => {
  it('marks a registered number verified and signs that account in — no second row', async () => {
    const gateway = createMockGateway();
    const registered = await gateway.registerDiner(FORM);
    await expect(gateway.getDinerProfile()).resolves.toMatchObject({ phoneVerified: false });

    const challenge = await gateway.requestPhoneCode(FORM.phoneE164);
    const verified = await gateway.verifyPhoneCode({
      challengeId: challenge.challengeId,
      code: '123456',
    });
    expect(verified.phoneE164).toBe(FORM.phoneE164);

    const profile = await gateway.getDinerProfile();
    expect(profile.dinerUserId).toBe(registered.dinerUserId);
    expect(profile.phoneVerified).toBe(true);
    expect(profile.username).toBe('grigor');
  });

  it('still creates an account for a number nobody registered', async () => {
    const gateway = createMockGateway();
    const challenge = await gateway.requestPhoneCode('+37499000004');
    await gateway.verifyPhoneCode({ challengeId: challenge.challengeId, code: '123456' });

    await expect(gateway.getDinerProfile()).resolves.toMatchObject({
      phoneE164: '+37499000004',
      phoneVerified: true,
      username: null,
      hasPassword: false,
    });
  });
});
