import { describe, expect, it } from 'vitest';
import { createStaffAuth } from '../auth/staffEndpoints';
import {
  KitchenPhoneNotAllowedError,
  PairingCodeExpiredError,
  PairingCodeInvalidError,
  PairingCodeUnusableError,
  PinLockedError,
  PinRejectedError,
} from '../contracts/errors';
import { formatPairingCode, pairingCodeFrom } from '../contracts/staffAuth';
import { fakeBackend, problemReply, type FakeRoute } from './fakeBackend.testkit';
import { createStaffHttpGateway } from './staffHttpGateway';
import type { WireStaffToday } from './staffPhoneMapping';

/**
 * The staff phone over HTTP (2026-10-24): pairing (preview, then the code and
 * the PIN), the device read's `kind` and person, the phone's own unpair, the
 * push config, subscription and switches, and a manager's Today.
 */

const BRANCH = '0b5f3c1e-0000-4000-8000-000000000001';
const PERSON = '7a1c0b2e-0000-4000-8000-000000000002';

async function caught(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected a refusal');
}

function authOver(routes: Readonly<Record<string, FakeRoute>>) {
  const backend = fakeBackend(routes);
  return { backend, auth: createStaffAuth(backend.client()) };
}

function gatewayOver(routes: Readonly<Record<string, FakeRoute>>) {
  const backend = fakeBackend(routes);
  return { backend, gateway: createStaffHttpGateway(backend.client()) };
}

const SESSION = {
  accessToken: 'access',
  renewalToken: 'renew',
  expiresInSeconds: 900,
  staffMemberId: PERSON,
  fullName: 'Aram Petrosyan',
  role: 3,
  branchId: BRANCH,
};

describe('pairing a phone', () => {
  it('previews the code anonymously and names the person, role and place', async () => {
    const { auth, backend } = authOver({
      'POST /api/auth/staff/phone-pair/preview': {
        body: {
          staffMemberId: PERSON,
          fullName: 'Aram Petrosyan',
          role: 3,
          branchId: BRANCH,
          branchName: 'Centre',
          venueName: 'Lava',
          expiresAtUtc: '2026-10-24T18:10:00Z',
        },
      },
    });
    const preview = await auth.previewPhonePairing('K7Q2M9XW4P');
    expect(preview).toEqual({
      staffMemberId: PERSON,
      fullName: 'Aram Petrosyan',
      role: 'waiter',
      branchId: BRANCH,
      branchName: 'Centre',
      venueName: 'Lava',
      expiresAtUtc: '2026-10-24T18:10:00Z',
    });
    expect(backend.requests[0]!.body).toEqual({ code: 'K7Q2M9XW4P' });
    expect(backend.requests[0]!.headers.get('authorization')).toBeNull();
  });

  it.each([
    [problemReply(401, 'pairing-code-invalid'), PairingCodeInvalidError],
    [problemReply(401, 'pairing-code-expired'), PairingCodeExpiredError],
    [problemReply(409, 'conflicting-state'), PairingCodeUnusableError],
    [problemReply(409, 'kitchen-phone-not-allowed'), KitchenPhoneNotAllowedError],
  ])('reads the preview refusal %#', async (reply, type) => {
    const { auth } = authOver({ 'POST /api/auth/staff/phone-pair/preview': reply });
    expect(await caught(auth.previewPhonePairing('K7Q2M9XW4P'))).toBeInstanceOf(type);
  });

  it('pairs with the code, the PIN, this browser and its name, and signs the person in', async () => {
    const { auth, backend } = authOver({
      'POST /api/auth/staff/phone-pair': {
        body: {
          device: {
            deviceId: 'dev-1',
            deviceName: 'iPhone · Safari',
            branchId: BRANCH,
            deviceToken: 'device-token',
            expiresAtUtc: '2027-10-24T00:00:00Z',
          },
          session: SESSION,
        },
      },
    });
    const paired = await auth.pairPhone({
      code: 'K7Q2M9XW4P',
      pin: '1234',
      clientDeviceId: 'client-1',
      deviceName: 'iPhone · Safari',
    });
    expect(backend.requests[0]!.body).toEqual({
      code: 'K7Q2M9XW4P',
      pin: '1234',
      clientDeviceId: 'client-1',
      deviceName: 'iPhone · Safari',
    });
    expect(paired.device.deviceToken).toBe('device-token');
    expect(paired.session.identity).toEqual({
      staffMemberId: PERSON,
      fullName: 'Aram Petrosyan',
      role: 'waiter',
      branchId: BRANCH,
    });
  });

  it('tells a wrong PIN and a lockout from a dead code', async () => {
    const wrong = authOver({ 'POST /api/auth/staff/phone-pair': problemReply(401, 'pin-invalid') });
    expect(
      await caught(
        wrong.auth.pairPhone({ code: 'K', pin: '0000', clientDeviceId: 'c', deviceName: 'n' }),
      ),
    ).toBeInstanceOf(PinRejectedError);

    const locked = authOver({
      'POST /api/auth/staff/phone-pair': problemReply(403, 'account-locked', {
        lockedUntilUtc: '2026-10-24T18:30:00Z',
      }),
    });
    const lockout = await caught(
      locked.auth.pairPhone({ code: 'K', pin: '0000', clientDeviceId: 'c', deviceName: 'n' }),
    );
    expect(lockout).toBeInstanceOf(PinLockedError);
    expect((lockout as PinLockedError).lockedUntilUtc).toBe('2026-10-24T18:30:00Z');

    const used = authOver({
      'POST /api/auth/staff/phone-pair': problemReply(409, 'conflicting-state'),
    });
    expect(
      await caught(
        used.auth.pairPhone({ code: 'K', pin: '1234', clientDeviceId: 'c', deviceName: 'n' }),
      ),
    ).toBeInstanceOf(PairingCodeUnusableError);
  });

  it('reads a phone off the device read: its kind and its person', async () => {
    const { auth } = authOver({
      'GET /api/auth/staff/device': {
        body: {
          deviceId: 'dev-1',
          clientDeviceId: 'browser-1',
          deviceName: 'iPhone · Safari',
          branchId: BRANCH,
          branchName: 'Centre',
          venueName: 'Lava',
          enrolledAtUtc: '2026-10-24T18:00:00Z',
          kind: 2,
          boundStaffMember: { id: PERSON, fullName: 'Aram Petrosyan', role: 3 },
        },
      },
    });
    const device = await auth.getDevice('device-token');
    expect(device.kind).toBe('phone');
    expect(device.boundStaffMember).toEqual({
      id: PERSON,
      fullName: 'Aram Petrosyan',
      role: 'waiter',
    });
  });

  it('reads the code out of a pairing URL, a pasted code or nothing', () => {
    expect(pairingCodeFrom('https://shurj.am/staff/pair#code=K7Q2M-9XW4P')).toBe('K7Q2M9XW4P');
    expect(pairingCodeFrom('https://shurj.am/staff/pair?code=k7q2m9xw4p')).toBe('K7Q2M9XW4P');
    expect(pairingCodeFrom(' k7q2m-9xw4p ')).toBe('K7Q2M9XW4P');
    // Another site's QR, or a menu's: not a code.
    expect(pairingCodeFrom('https://example.com/menu')).toBeNull();
    expect(pairingCodeFrom('K7Q2M')).toBeNull();
    expect(formatPairingCode('K7Q2M9XW4P')).toBe('K7Q2M-9XW4P');
  });
});

describe('the phone itself', () => {
  it('unpairs itself', async () => {
    const { gateway, backend } = gatewayOver({ 'POST /api/staff/device/unpair': { status: 204 } });
    await gateway.unpairOwnPhone();
    expect(backend.requests.map((request) => `${request.method} ${request.path}`)).toEqual([
      'POST /api/staff/device/unpair',
    ]);
  });

  it('reads the push config, and treats a key-less "enabled" as off', async () => {
    const on = gatewayOver({
      'GET /api/staff/push-config': { body: { enabled: true, publicKey: 'BKey' } },
    });
    expect(await on.gateway.getPushConfig()).toEqual({ enabled: true, publicKey: 'BKey' });
    const off = gatewayOver({ 'GET /api/staff/push-config': { body: { enabled: false } } });
    expect(await off.gateway.getPushConfig()).toEqual({ enabled: false, publicKey: null });
  });

  it('stores and forgets the subscription, as the browser gives it', async () => {
    const { gateway, backend } = gatewayOver({
      'PUT /api/staff/device/push-subscription': { status: 204 },
      'DELETE /api/staff/device/push-subscription': { status: 204 },
    });
    await gateway.savePushSubscription({
      endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
      keys: { p256dh: 'p', auth: 'a' },
    });
    await gateway.deletePushSubscription();
    expect(backend.requests[0]!.body).toEqual({
      endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
      keys: { p256dh: 'p', auth: 'a' },
    });
    expect(backend.requests[1]!.method).toBe('DELETE');
  });

  it('saves all six switches and the language, and answers the settings', async () => {
    const settings = {
      approvals: true,
      guestMessages: false,
      tableCalls: true,
      takeaway: true,
      kitchenReady: false,
      onlyDuringShift: true,
      locale: 'ru',
      subscribed: true,
      isDefault: false,
    };
    const { gateway, backend } = gatewayOver({
      'PUT /api/staff/device/notification-preferences': { body: settings },
      'GET /api/staff/device/notification-preferences': {
        body: { ...settings, locale: null, isDefault: true },
      },
    });
    const saved = await gateway.saveNotificationSettings({
      approvals: true,
      guestMessages: false,
      tableCalls: true,
      takeaway: true,
      kitchenReady: false,
      onlyDuringShift: true,
      locale: 'ru',
    });
    expect(backend.requests[0]!.body).toEqual({
      approvals: true,
      guestMessages: false,
      tableCalls: true,
      takeaway: true,
      kitchenReady: false,
      onlyDuringShift: true,
      locale: 'ru',
    });
    expect(saved).toEqual(settings);
    expect((await gateway.getNotificationSettings()).locale).toBeNull();
  });
});

describe("a manager's Today", () => {
  const wire: WireStaffToday = {
    branchId: BRANCH,
    branchName: 'Centre',
    venueName: 'Lava',
    timeZoneId: 'Asia/Yerevan',
    asOfUtc: '2026-10-24T14:34:00Z',
    serviceDate: '2026-10-24',
    localTime: '18:34:00',
    branches: [
      { branchId: BRANCH, name: 'Centre' },
      { branchId: 'other', name: 'Arabkir' },
    ],
    revenue: {
      totalAmd: 412_000,
      hallAmd: 368_000,
      takeawayAmd: 44_000,
      takeawayOrders: 6,
      sinceUtc: '2026-10-24T07:00:00Z',
    },
    guests: { total: 96, withBooking: 78, walkIn: 18 },
    bookings: { total: 34, came: 21, expected: 11, late: 1, noShow: 2, pendingApproval: 1 },
    room: { occupiedTables: 8, tables: 14, people: 31 },
    needsYou: {
      pendingApprovals: 1,
      oldestApprovalRequestedAtUtc: '2026-10-24T14:20:00Z',
      soonestApprovalDeadlineUtc: '2026-10-24T14:46:00Z',
      unansweredMessages: 1,
    },
    shifts: [
      {
        staffMemberId: PERSON,
        fullName: 'Aram Petrosyan',
        role: 3,
        startsAt: '16:00:00',
        endsAt: '00:00:00',
        endsNextDay: true,
        startsAtUtc: '2026-10-24T12:00:00Z',
        endsAtUtc: '2026-10-24T20:00:00Z',
        onShiftNow: true,
        signedIn: true,
      },
    ],
  };

  it('reads the session branch, or the one asked for', async () => {
    const { gateway, backend } = gatewayOver({ 'GET /api/staff/today': { body: wire } });
    const today = await gateway.getToday();
    await gateway.getToday('other');
    expect(backend.requests[0]!.query.get('branchId')).toBeNull();
    expect(backend.requests[1]!.query.get('branchId')).toBe('other');
    expect(today.localTime).toBe('18:34');
    expect(today.revenue.hallAmd).toBe(368_000);
    expect(today.guests).toEqual({ total: 96, withBooking: 78, walkIn: 18 });
    expect(today.needsYou.oldestUnansweredMessageAtUtc).toBeNull();
    expect(today.shifts[0]).toMatchObject({
      role: 'waiter',
      startsAt: '16:00',
      endsAt: '00:00',
      signedIn: true,
    });
    expect(today.branches).toHaveLength(2);
  });
});
