import { describe, expect, it, vi } from 'vitest';
import { createAuthSession } from '../auth/session';
import { createMemoryTokenStorage } from '../auth/storage';
import { KitchenPhoneNotAllowedError } from '../contracts/errors';
import { createConsoleHttpGateway, createMemoryIdentityStore } from './consoleHttpGateway';
import { fakeBackend, problemReply, type FakeRoute } from './fakeBackend.testkit';

/**
 * Devices and phone pairing over HTTP: `GET /api/branches/{id}/devices?kind=1|2`
 * names each item's kind and a phone's person; `POST
 * …/staff/{staffMemberId}/phone-pairings` answers the code once, and the
 * kitchen's 409 is its own error.
 */

function gatewayOver(routes: Record<string, FakeRoute>) {
  const backend = fakeBackend(routes);
  const auth = createAuthSession({
    storage: createMemoryTokenStorage('refresh-0'),
    refreshTokens: vi.fn(),
  });
  const gateway = createConsoleHttpGateway(backend.client({ getToken: () => 'held-token' }), {
    auth,
    identity: createMemoryIdentityStore(),
  });
  return { gateway, backend };
}

const DEVICES = '/api/branches/b-1/devices';
const PAIRING = '/api/branches/b-1/staff/p-1/phone-pairings';

describe('devices and phone pairing over HTTP', () => {
  it('asks for the phones by kind 2 and maps the person', async () => {
    const { gateway, backend } = gatewayOver({
      [`GET ${DEVICES}`]: {
        body: [
          {
            id: 'd-1',
            name: 'iPhone · Safari',
            branchId: 'b-1',
            enrolledAtUtc: '2026-10-24T10:00:00Z',
            lastSeenAtUtc: '2026-10-24T11:00:00Z',
            isRevoked: false,
            kind: 2,
            boundStaffMember: { id: 'p-1', fullName: 'Aram Petrosyan', role: 3 },
            platform: 2,
            browser: 1,
          },
        ],
      },
    });

    const phones = await gateway.listDevices('b-1', 'phone');
    expect(backend.requests[0]?.query.get('kind')).toBe('2');
    expect(phones).toEqual([
      {
        id: 'd-1',
        name: 'iPhone · Safari',
        branchId: 'b-1',
        enrolledAtUtc: '2026-10-24T10:00:00Z',
        lastSeenAtUtc: '2026-10-24T11:00:00Z',
        isRevoked: false,
        kind: 'phone',
        boundStaffMember: { id: 'p-1', fullName: 'Aram Petrosyan', role: 'waiter' },
        revokedAtUtc: null,
        platform: 'iphone',
        browser: 'safari',
      },
    ]);
  });

  it("reads a phone's parts by their pinned numbers, and none it does not know", async () => {
    const phone = (id: string, platform: number | null, browser: number | null) => ({
      id,
      name: 'Phone',
      branchId: 'b-1',
      enrolledAtUtc: '2026-10-24T10:00:00Z',
      isRevoked: false,
      kind: 2,
      boundStaffMember: { id: 'p-1', fullName: 'Aram Petrosyan', role: 3 },
      platform,
      browser,
    });
    const { gateway } = gatewayOver({
      [`GET ${DEVICES}`]: {
        body: [
          phone('d-1', 1, null),
          phone('d-2', 4, 6),
          phone('d-3', 7, 4),
          phone('d-4', null, null),
        ],
      },
    });

    const phones = await gateway.listDevices('b-1', 'phone');
    expect(phones.map((device) => [device.platform, device.browser])).toEqual([
      ['other', null],
      ['android', 'samsungInternet'],
      ['linux', 'firefox'],
      // Paired before the phone said them: the name is all there is.
      [null, null],
    ]);
  });

  it('asks for the tablets by kind 1, and for both with no kind', async () => {
    const { gateway, backend } = gatewayOver({
      [`GET ${DEVICES}`]: {
        body: [
          {
            id: 'd-2',
            name: 'Counter',
            branchId: 'b-1',
            enrolledAtUtc: '2026-10-24T10:00:00Z',
            isRevoked: true,
            kind: 1,
            revokedAtUtc: '2026-10-24T12:00:00Z',
          },
        ],
      },
    });

    const [tablet] = await gateway.listDevices('b-1', 'tablet');
    expect(backend.requests[0]?.query.get('kind')).toBe('1');
    expect(tablet).toMatchObject({
      kind: 'tablet',
      platform: null,
      browser: null,
      boundStaffMember: null,
      revokedAtUtc: '2026-10-24T12:00:00Z',
      lastSeenAtUtc: null,
    });

    await gateway.listDevices('b-1');
    expect(backend.requests[1]?.query.has('kind')).toBe(false);
  });

  it('answers the pairing code field for field', async () => {
    const { gateway, backend } = gatewayOver({
      [`POST ${PAIRING}`]: {
        status: 201,
        body: {
          code: 'K7Q2M-9XW4P',
          expiresAtUtc: '2026-10-24T10:10:00Z',
          pairingUrl: 'https://timetoeat.am/staff/pair#code=K7Q2M-9XW4P',
          staffMemberId: 'p-1',
          branchId: 'b-1',
        },
      },
    });

    await expect(
      gateway.createPhonePairing({ branchId: 'b-1', staffMemberId: 'p-1' }),
    ).resolves.toEqual({
      code: 'K7Q2M-9XW4P',
      expiresAtUtc: '2026-10-24T10:10:00Z',
      pairingUrl: 'https://timetoeat.am/staff/pair#code=K7Q2M-9XW4P',
      staffMemberId: 'p-1',
      branchId: 'b-1',
    });
    expect(backend.requests[0]?.method).toBe('POST');
  });

  it('turns the kitchen refusal into its own error', async () => {
    const { gateway } = gatewayOver({
      [`POST ${PAIRING}`]: problemReply(409, 'kitchen-phone-not-allowed'),
    });

    await expect(
      gateway.createPhonePairing({ branchId: 'b-1', staffMemberId: 'p-1' }),
    ).rejects.toBeInstanceOf(KitchenPhoneNotAllowedError);
  });
});
