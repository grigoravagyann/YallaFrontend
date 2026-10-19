import { describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '../client';
import { DeviceRevokedError } from '../contracts/errors';
import {
  isOnShiftAt,
  type StaffCredentialStorage,
  type StaffRosterEntry,
} from '../contracts/staffAuth';
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
      { staffMemberId: 'a', fullName: 'Anna', role: 'owner', onShiftNow: false, shift: null },
      { staffMemberId: 'k', fullName: 'Kara', role: 'kitchen', onShiftNow: false, shift: null },
    ]);
  });

  it('reads who is on shift, and the shift, with its wall clock cut to minutes', async () => {
    const get = vi.fn().mockResolvedValue({
      data: [
        {
          staffMemberId: 'n',
          fullName: 'Narek',
          role: 3,
          onShiftNow: true,
          startsAt: '18:00:00',
          endsAt: '02:00:00',
          endsNextDay: true,
          startsAtUtc: '2026-10-19T14:00:00Z',
          endsAtUtc: '2026-10-19T22:00:00Z',
        },
        // Nothing to report: the fields are omitted, as the server omits nulls.
        { staffMemberId: 's', fullName: 'Sona', role: 3, onShiftNow: false, endsNextDay: false },
      ],
    });
    const auth = createStaffAuth({ get } as unknown as ApiClient);

    const [narek, sona] = await auth.getRoster('device-token');

    expect(narek).toEqual({
      staffMemberId: 'n',
      fullName: 'Narek',
      role: 'waiter',
      onShiftNow: true,
      shift: {
        startsAt: '18:00',
        endsAt: '02:00',
        endsNextDay: true,
        startsAtUtc: '2026-10-19T14:00:00Z',
        endsAtUtc: '2026-10-19T22:00:00Z',
      },
    });
    expect(sona).toMatchObject({ onShiftNow: false, shift: null });
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

describe('on shift, re-read against the clock', () => {
  const shift = {
    startsAt: '18:00',
    endsAt: '02:00',
    endsNextDay: true,
    startsAtUtc: '2026-10-19T14:00:00Z',
    endsAtUtc: '2026-10-19T22:00:00Z',
  };
  const entry = (onShiftNow: boolean, withShift = true): StaffRosterEntry => ({
    staffMemberId: 'n',
    fullName: 'Narek',
    role: 'waiter',
    onShiftNow,
    shift: withShift ? shift : null,
  });

  it('starts at the start and is over at the end, whatever the read said', () => {
    expect(isOnShiftAt(entry(false), new Date('2026-10-19T13:59:59Z'))).toBe(false);
    expect(isOnShiftAt(entry(false), new Date('2026-10-19T14:00:00Z'))).toBe(true);
    expect(isOnShiftAt(entry(true), new Date('2026-10-19T21:59:59Z'))).toBe(true);
    expect(isOnShiftAt(entry(true), new Date('2026-10-19T22:00:00Z'))).toBe(false);
  });

  it('takes the read as it was when there is no shift to time', () => {
    expect(isOnShiftAt(entry(false, false), new Date('2026-10-19T15:00:00Z'))).toBe(false);
  });
});
