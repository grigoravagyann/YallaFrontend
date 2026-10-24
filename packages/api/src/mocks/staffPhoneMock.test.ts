import { beforeEach, describe, expect, it } from 'vitest';
import { createStaffSession } from '../auth/staffSession';
import {
  KitchenPhoneNotAllowedError,
  PairingCodeExpiredError,
  PairingCodeInvalidError,
  PairingCodeUnusableError,
  PinRejectedError,
} from '../contracts/errors';
import type { StaffCredentialStorage } from '../contracts/staffAuth';
import { createMockRegistry } from './mockRegistry';
import { createMockStaffAuth } from './staffAuthMock';
import { MOCK_STAFF_PIN, fixtureStaffFor } from './staffFixture';
import { createStaffMockGateway } from './staffMock';
import { mockVenues } from './venues';

/**
 * Pairing a phone in mock mode, end to end through the real session: the
 * console mock's code (written straight into the shared registry here),
 * redeemed with the person's PIN; the phone's roster and PIN take that person
 * alone; and the device's own pushes and Today.
 */

const venue = mockVenues[0]!;
const branch = venue.branches[0]!;
const people = fixtureStaffFor(venue.id, venue.name, venue.branches);
/** Somebody at the branch with a usable PIN who may have a phone: its manager, in the fixture. */
const waiter = people.find(
  (person) =>
    person.role !== 'kitchen' &&
    person.branchId === branch.id &&
    person.isActive &&
    !person.isPinLocked,
)!;
const kitchen = people.find((person) => person.role === 'kitchen' && person.branchId === branch.id);
const now = new Date('2026-10-24T15:00:00Z');

function memoryStorage(): StaffCredentialStorage {
  const values = new Map<string, string>();
  return {
    readDeviceId: async () => values.get('deviceId') ?? null,
    writeDeviceId: async (value) => void values.set('deviceId', value),
    readDeviceToken: async () => values.get('deviceToken') ?? null,
    writeDeviceToken: async (value) => void values.set('deviceToken', value),
    clearDeviceToken: async () => void values.delete('deviceToken'),
    readRenewalToken: async () => values.get('renewal') ?? null,
    writeRenewalToken: async (value) => void values.set('renewal', value),
    clearRenewalToken: async () => void values.delete('renewal'),
  };
}

let registry = createMockRegistry(() => null);

function issue(code: string, staffMemberId: string, minutes = 10): void {
  registry.phonePairings.set(code, {
    code,
    branchId: branch.id,
    staffMemberId,
    expiresAtUtc: new Date(now.getTime() + minutes * 60_000).toISOString(),
    redeemedAtUtc: null,
    supersededAtUtc: null,
  });
}

function session() {
  return createStaffSession({
    auth: createMockStaffAuth({ registry, now: () => now }),
    storage: memoryStorage(),
    newDeviceId: () => 'browser-1',
    now: () => now.getTime(),
    scheduleIdleCheck: () => () => undefined,
  });
}

beforeEach(() => {
  registry = createMockRegistry(() => null);
});

describe('pairing a phone (mock)', () => {
  it('previews, pairs with the PIN, signs the person in, and knows it is their phone', async () => {
    issue('K7Q2M9XW4P', waiter.id);
    const phone = session();
    await phone.restore();

    const preview = await phone.previewPairing('k7q2m-9xw4p');
    expect(preview).toMatchObject({ staffMemberId: waiter.id, branchId: branch.id });

    const device = await phone.pairPhone({
      code: 'K7Q2M9XW4P',
      pin: MOCK_STAFF_PIN,
      deviceName: 'iPhone · Safari',
    });
    expect(phone.getSnapshot().state).toBe('signedIn');
    expect(phone.getSnapshot().identity?.staffMemberId).toBe(waiter.id);
    expect(device.kind).toBe('phone');
    expect(device.boundStaffMember?.id).toBe(waiter.id);
    expect(registry.devices.values()[0]).toMatchObject({
      kind: 'phone',
      boundStaffMemberId: waiter.id,
      deviceName: 'iPhone · Safari',
    });

    // Its roster is its person alone, and its PIN takes nobody else's.
    const roster = await phone.roster();
    expect(roster.map((entry) => entry.staffMemberId)).toEqual([waiter.id]);
    await phone.lock('signedOut');
    const someoneElse = people.find(
      (person) => person.id !== waiter.id && person.branchId === branch.id,
    )!;
    await expect(
      phone.signInWithPin({ staffMemberId: someoneElse.id, pin: MOCK_STAFF_PIN }),
    ).rejects.toBeInstanceOf(PinRejectedError);
    await phone.signInWithPin({ staffMemberId: waiter.id, pin: MOCK_STAFF_PIN });
    expect(phone.getSnapshot().state).toBe('signedIn');
  });

  it('keeps the code usable after a wrong PIN, and spends it on the right one', async () => {
    issue('K7Q2M9XW4P', waiter.id);
    const phone = session();
    await phone.restore();
    await expect(
      phone.pairPhone({ code: 'K7Q2M9XW4P', pin: '0000', deviceName: 'n' }),
    ).rejects.toBeInstanceOf(PinRejectedError);
    await phone.pairPhone({ code: 'K7Q2M9XW4P', pin: MOCK_STAFF_PIN, deviceName: 'n' });
    await expect(phone.previewPairing('K7Q2M9XW4P')).rejects.toBeInstanceOf(
      PairingCodeUnusableError,
    );
  });

  it('refuses an unknown code, an expired one and a kitchen one', async () => {
    const phone = session();
    await expect(phone.previewPairing('ZZZZZZZZZZ')).rejects.toBeInstanceOf(
      PairingCodeInvalidError,
    );
    issue('K7Q2M9XW4P', waiter.id, -1);
    await expect(phone.previewPairing('K7Q2M9XW4P')).rejects.toBeInstanceOf(
      PairingCodeExpiredError,
    );
    if (kitchen) {
      issue('H7KQ2MXP9D', kitchen.id);
      await expect(phone.previewPairing('H7KQ2MXP9D')).rejects.toBeInstanceOf(
        KitchenPhoneNotAllowedError,
      );
    }
  });

  it('forgets the device after unpairing, back to unenrolled', async () => {
    issue('K7Q2M9XW4P', waiter.id);
    const phone = session();
    await phone.restore();
    await phone.pairPhone({ code: 'K7Q2M9XW4P', pin: MOCK_STAFF_PIN, deviceName: 'n' });
    await phone.forgetDevice();
    expect(phone.getSnapshot()).toMatchObject({
      state: 'unenrolled',
      device: null,
      identity: null,
    });
  });
});

describe("the device's pushes and Today (mock gateway)", () => {
  it('starts with the defaults and keeps what is saved', async () => {
    const gateway = createStaffMockGateway({ branchId: branch.id });
    const first = await gateway.getNotificationSettings();
    expect(first).toMatchObject({
      approvals: true,
      kitchenReady: false,
      onlyDuringShift: true,
      subscribed: false,
      isDefault: true,
    });
    await gateway.savePushSubscription({
      endpoint: 'https://fcm.googleapis.com/fcm/send/x',
      keys: { p256dh: 'p', auth: 'a' },
    });
    const saved = await gateway.saveNotificationSettings({
      ...first,
      kitchenReady: true,
      locale: 'ru',
    });
    expect(saved).toMatchObject({
      kitchenReady: true,
      locale: 'ru',
      subscribed: true,
      isDefault: false,
    });
    expect((await gateway.getPushConfig()).enabled).toBe(true);
  });

  it('reads Today for the floor and offers the venue’s branches', async () => {
    const gateway = createStaffMockGateway({ branchId: branch.id, now: () => now });
    const today = await gateway.getToday();
    expect(today.branchId).toBe(branch.id);
    expect(today.branches.map((one) => one.branchId)).toContain(branch.id);
    expect(today.revenue.totalAmd).toBe(today.revenue.hallAmd + today.revenue.takeawayAmd);
    expect(today.guests.total).toBe(today.guests.withBooking + today.guests.walkIn);
    expect(today.room.tables).toBeGreaterThan(0);
    const other = venue.branches[1];
    if (other) expect((await gateway.getToday(other.id)).branchId).toBe(other.id);
  });
});
