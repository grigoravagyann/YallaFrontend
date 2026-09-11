import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StaffCredentialStorage } from '../contracts/staffAuth';
import { createStaffSession } from './staffSession';
import type { StaffAuth } from './staffEndpoints';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function fakes() {
  const auth = {
    enrol: vi.fn().mockResolvedValue({ deviceToken: 'device-token' }),
    getDevice: vi.fn().mockResolvedValue({ deviceId: 'd', branchId: 'b', name: 'Counter' }),
  };
  const storage = {
    readDeviceId: vi.fn().mockResolvedValue(null),
    writeDeviceId: vi.fn().mockResolvedValue(undefined),
    writeDeviceToken: vi.fn().mockResolvedValue(undefined),
  };
  return {
    auth,
    storage,
    session: createStaffSession({
      auth: auth as unknown as StaffAuth,
      storage: storage as unknown as StaffCredentialStorage,
      scheduleIdleCheck: () => () => undefined,
    }),
  };
}

describe('enrolling a tablet', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /*
   * `crypto.randomUUID` exists only in a secure context (HTTPS or localhost).
   * A tablet opening the console at a plain-http LAN address has no such
   * function, and enrolment used to throw before any request left — the
   * screen then said "Could not set this device up" with nothing in the logs.
   */
  it('mints a device id without crypto.randomUUID, as on a plain-http LAN address', async () => {
    vi.stubGlobal('crypto', {});
    const { auth, storage, session } = fakes();

    await session.enrol({ code: '123456', deviceName: 'Counter tablet' });

    expect(auth.enrol).toHaveBeenCalledTimes(1);
    const sent = auth.enrol.mock.calls[0]?.[0] as { deviceId: string };
    expect(sent.deviceId).toMatch(UUID_V4);
    expect(storage.writeDeviceId).toHaveBeenCalledWith(sent.deviceId);
  });

  it('keeps the stored device id when one exists', async () => {
    const { auth, storage, session } = fakes();
    storage.readDeviceId.mockResolvedValue('stored-id');

    await session.enrol({ code: '123456', deviceName: 'Counter tablet' });

    expect(auth.enrol.mock.calls[0]?.[0]).toMatchObject({ deviceId: 'stored-id' });
    expect(storage.writeDeviceId).not.toHaveBeenCalled();
  });
});
