import { describe, expect, it } from 'vitest';
import { KitchenPhoneNotAllowedError } from '../contracts/errors';
import { ForbiddenError, NotFoundError } from '../errors';
import { createConsoleMockGateway } from './consoleMock';
import { createMockRegistry } from './mockRegistry';

/**
 * Personal phones on the console mock (`docs/auth.md`, "Personal phones"):
 * the device list narrows by kind, a pairing code is ten minutes and one use
 * and supersedes the person's earlier one, the kitchen has no phone, and a
 * phone the mock staff app paired (in the shared registry) is listed and can
 * be unpaired.
 */

const BRANCH = 'b-lumen-cascade';
const failing = (run: Promise<unknown>) => run.then(() => null).catch((error: unknown) => error);

describe('console mock — personal phones', () => {
  it('lists tablets and phones apart, and both without a kind', async () => {
    const gateway = createConsoleMockGateway({
      role: 'owner',
      registry: createMockRegistry(() => null),
    });
    const tablets = await gateway.listDevices(BRANCH, 'tablet');
    const phones = await gateway.listDevices(BRANCH, 'phone');
    const all = await gateway.listDevices(BRANCH);

    expect(tablets.every((device) => device.kind === 'tablet')).toBe(true);
    expect(phones.length).toBeGreaterThan(0);
    expect(phones.every((device) => device.kind === 'phone' && device.boundStaffMember)).toBe(true);
    expect(all).toHaveLength(tablets.length + phones.length);
  });

  it('issues a ten-minute code with the pairing URL, and a newer one supersedes it', async () => {
    const registry = createMockRegistry(() => null);
    const gateway = createConsoleMockGateway({ role: 'owner', registry });
    const before = Date.now();
    const first = await gateway.createPhonePairing({
      branchId: BRANCH,
      staffMemberId: `${BRANCH}-waiter-1`,
    });

    expect(first.code).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/u);
    expect(first.pairingUrl.endsWith(`/staff/pair#code=${first.code}`)).toBe(true);
    const lifetime = Date.parse(first.expiresAtUtc) - before;
    expect(lifetime).toBeGreaterThan(9 * 60_000);
    expect(lifetime).toBeLessThanOrEqual(10 * 60_000 + 1_000);

    await gateway.createPhonePairing({ branchId: BRANCH, staffMemberId: `${BRANCH}-waiter-1` });
    const stored = registry.phonePairings.get(first.code.replace('-', ''));
    expect(stored?.supersededAtUtc).not.toBeNull();
    expect(
      registry.phonePairings.values().filter((code) => code.supersededAtUtc === null),
    ).toHaveLength(1);
  });

  it('refuses the kitchen, a stranger, and a branch manager at a sibling branch', async () => {
    const owner = createConsoleMockGateway({
      role: 'owner',
      registry: createMockRegistry(() => null),
    });
    expect(
      await failing(
        owner.createPhonePairing({ branchId: BRANCH, staffMemberId: `${BRANCH}-kitchen` }),
      ),
    ).toBeInstanceOf(KitchenPhoneNotAllowedError);
    expect(
      await failing(owner.createPhonePairing({ branchId: BRANCH, staffMemberId: 'nobody' })),
    ).toBeInstanceOf(NotFoundError);

    const bm = createConsoleMockGateway({
      role: 'manager',
      registry: createMockRegistry(() => null),
    });
    expect(
      await failing(
        bm.createPhonePairing({ branchId: BRANCH, staffMemberId: `${BRANCH}-waiter-1` }),
      ),
    ).toBeInstanceOf(ForbiddenError);
  });

  it('lists a phone the staff app paired, and unpairs it in the registry', async () => {
    const registry = createMockRegistry(() => null);
    registry.devices.set('mockdev_phone-1', {
      deviceToken: 'mockdev_phone-1',
      deviceId: 'phone-1',
      deviceName: 'Android · Chrome',
      branchId: BRANCH,
      enrolledAtUtc: '2026-10-24T10:00:00Z',
      revokedAtUtc: null,
      kind: 'phone',
      boundStaffMemberId: `${BRANCH}-waiter-2`,
      lastSeenAtUtc: '2026-10-24T11:00:00Z',
    });
    const gateway = createConsoleMockGateway({ role: 'owner', registry });

    const phone = (await gateway.listDevices(BRANCH, 'phone')).find((d) => d.id === 'phone-1');
    expect(phone).toMatchObject({
      name: 'Android · Chrome',
      isRevoked: false,
      lastSeenAtUtc: '2026-10-24T11:00:00Z',
      boundStaffMember: { id: `${BRANCH}-waiter-2`, role: 'waiter' },
    });

    await gateway.revokeDevice({ branchId: BRANCH, deviceId: 'phone-1' });
    expect(registry.devices.get('mockdev_phone-1')?.revokedAtUtc).not.toBeNull();
    const after = (await gateway.listDevices(BRANCH, 'phone')).find((d) => d.id === 'phone-1');
    expect(after?.isRevoked).toBe(true);
  });
});
