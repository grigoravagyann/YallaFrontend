import { describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '../client';
import { DeviceRevokedError } from '../contracts/errors';
import type { StaffCredentialStorage } from '../contracts/staffAuth';
import { UnauthorizedError } from '../errors';
import { createStaffAuth, type StaffAuth } from './staffEndpoints';
import { createStaffSession } from './staffSession';

describe('GET /api/auth/staff/roster', () => {
  it('sends the device token the way /device does and maps the role number', async () => {
    const get = vi.fn().mockResolvedValue({
      data: [
        { staffMemberId: 'a', fullName: 'Anna', role: 1 },
        { staffMemberId: 'k', fullName: 'Kara', role: 4 },
      ],
    });
    const auth = createStaffAuth({ get } as unknown as ApiClient);

    const roster = await auth.getRoster('device-token');

    expect(get).toHaveBeenCalledWith('/api/auth/staff/roster', {
      skipAuth: true,
      headers: { authorization: 'Bearer device-token' },
    });
    expect(roster).toEqual([
      { staffMemberId: 'a', fullName: 'Anna', role: 'owner' },
      { staffMemberId: 'k', fullName: 'Kara', role: 'kitchen' },
    ]);
  });

  it('turns a 401 into a revoked device', async () => {
    const get = vi.fn().mockRejectedValue(new UnauthorizedError({ url: '/roster' }));
    const auth = createStaffAuth({ get } as unknown as ApiClient);
    await expect(auth.getRoster('device-token')).rejects.toBeInstanceOf(DeviceRevokedError);
  });
});

describe('the session roster', () => {
  function session(auth: Partial<StaffAuth>, deviceToken: string | null) {
    const storage = {
      readDeviceToken: vi.fn().mockResolvedValue(deviceToken),
      clearDeviceToken: vi.fn().mockResolvedValue(undefined),
      clearRenewalToken: vi.fn().mockResolvedValue(undefined),
    };
    return {
      storage,
      session: createStaffSession({
        auth: auth as StaffAuth,
        storage: storage as unknown as StaffCredentialStorage,
        scheduleIdleCheck: () => () => undefined,
      }),
    };
  }

  it('asks with the stored device token', async () => {
    const getRoster = vi
      .fn()
      .mockResolvedValue([{ staffMemberId: 'a', fullName: 'A', role: 'waiter' }]);
    const { session: s } = session({ getRoster }, 'stored-token');
    expect(await s.roster()).toHaveLength(1);
    expect(getRoster).toHaveBeenCalledWith('stored-token');
  });

  it('unenrols when the roster says the device is revoked', async () => {
    const getRoster = vi.fn().mockRejectedValue(new DeviceRevokedError({ url: '' }));
    const { session: s, storage } = session({ getRoster }, 'stored-token');
    await expect(s.roster()).rejects.toBeInstanceOf(DeviceRevokedError);
    expect(storage.clearDeviceToken).toHaveBeenCalled();
    expect(s.getSnapshot().state).toBe('unenrolled');
  });
});
