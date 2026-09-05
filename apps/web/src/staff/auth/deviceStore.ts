import type { StaffCredentialStorage } from '@yalla/api';
import { del, get, set, type UseStore } from 'idb-keyval';
import { openStore } from '../../offline/idb';

/**
 * The tablet's credentials, in IndexedDB.
 *
 * **Not `localStorage`, and the requirement is specific rather than stylistic.**
 * The device token has to survive a tablet reboot — a browser that reaps the
 * tab, a power cut in a basement, somebody holding the button down — because
 * the way back from losing it is a manager generating a new enrolment code,
 * which on a Friday means the counter screen is gone for the evening.
 * `localStorage` is readable by anything running on the origin and is cleared
 * by "clear site data" alongside caches; IndexedDB survives more and is
 * reachable from the service worker if it ever needs to be.
 *
 * Every read is wrapped: a private window, or a browser with site data blocked,
 * throws on access rather than returning null, and a tablet that cannot read
 * its token must show the enrolment screen rather than a blank page.
 */

const DEVICE_ID = 'deviceId';
const DEVICE_TOKEN = 'deviceToken';
const RENEWAL_TOKEN = 'renewalToken';
const KNOWN_STAFF = 'knownStaff';

/**
 * Somebody who has signed in on this tablet before.
 *
 * The PIN screen needs a name and a staff id to send, and **there is no
 * endpoint that lists a branch's staff to a device token** — `GET
 * /api/venues/{venueId}/staff` is `ManagerOrAbove` and venue-scoped, which a
 * tablet is not. So the tablet remembers who it has seen. A person who has
 * never used this tablet enters their id once, from the manager's console, and
 * is a tile from then on.
 */
export interface KnownStaffMember {
  readonly staffMemberId: string;
  readonly fullName: string;
  /** Most-recent first, so the people on tonight's shift are the top tiles. */
  readonly lastSignedInAtMs: number;
}

export interface StaffDeviceStore extends StaffCredentialStorage {
  readKnownStaff(): Promise<readonly KnownStaffMember[]>;
  rememberStaff(member: Omit<KnownStaffMember, 'lastSignedInAtMs'>): Promise<void>;
  forgetStaff(staffMemberId: string): Promise<void>;
}

async function read<T>(key: string, store: UseStore): Promise<T | null> {
  try {
    return (await get<T>(key, store)) ?? null;
  } catch {
    return null;
  }
}

async function write(key: string, value: unknown, store: UseStore): Promise<void> {
  try {
    await set(key, value, store);
  } catch {
    // A tablet that cannot persist still has to work for this shift. The next
    // launch will ask for a PIN again, which is visible and recoverable; a
    // thrown write during sign-in would not be.
  }
}

async function remove(key: string, store: UseStore): Promise<void> {
  try {
    await del(key, store);
  } catch {
    /* As above. */
  }
}

export function createStaffDeviceStore(store: UseStore = openStore('device')): StaffDeviceStore {
  return {
    readDeviceId: () => read<string>(DEVICE_ID, store),
    writeDeviceId: (deviceId) => write(DEVICE_ID, deviceId, store),

    readDeviceToken: () => read<string>(DEVICE_TOKEN, store),
    writeDeviceToken: (token) => write(DEVICE_TOKEN, token, store),
    clearDeviceToken: () => remove(DEVICE_TOKEN, store),

    readRenewalToken: () => read<string>(RENEWAL_TOKEN, store),
    writeRenewalToken: (token) => write(RENEWAL_TOKEN, token, store),
    clearRenewalToken: () => remove(RENEWAL_TOKEN, store),

    async readKnownStaff() {
      const stored = (await read<KnownStaffMember[]>(KNOWN_STAFF, store)) ?? [];
      return [...stored].sort((a, b) => b.lastSignedInAtMs - a.lastSignedInAtMs);
    },

    async rememberStaff(member) {
      const stored = (await read<KnownStaffMember[]>(KNOWN_STAFF, store)) ?? [];
      const next = [
        { ...member, lastSignedInAtMs: Date.now() },
        ...stored.filter((known) => known.staffMemberId !== member.staffMemberId),
      ];
      await write(KNOWN_STAFF, next, store);
    },

    async forgetStaff(staffMemberId) {
      const stored = (await read<KnownStaffMember[]>(KNOWN_STAFF, store)) ?? [];
      await write(
        KNOWN_STAFF,
        stored.filter((known) => known.staffMemberId !== staffMemberId),
        store,
      );
    },
  };
}

/** An in-memory store, for tests and for a browser with no IndexedDB at all. */
export function createMemoryDeviceStore(): StaffDeviceStore {
  const values = new Map<string, unknown>();
  let known: KnownStaffMember[] = [];
  return {
    readDeviceId: async () => (values.get(DEVICE_ID) as string) ?? null,
    writeDeviceId: async (deviceId) => void values.set(DEVICE_ID, deviceId),
    readDeviceToken: async () => (values.get(DEVICE_TOKEN) as string) ?? null,
    writeDeviceToken: async (token) => void values.set(DEVICE_TOKEN, token),
    clearDeviceToken: async () => void values.delete(DEVICE_TOKEN),
    readRenewalToken: async () => (values.get(RENEWAL_TOKEN) as string) ?? null,
    writeRenewalToken: async (token) => void values.set(RENEWAL_TOKEN, token),
    clearRenewalToken: async () => void values.delete(RENEWAL_TOKEN),
    readKnownStaff: async () => [...known].sort((a, b) => b.lastSignedInAtMs - a.lastSignedInAtMs),
    rememberStaff: async (member) => {
      known = [
        { ...member, lastSignedInAtMs: Date.now() },
        ...known.filter((entry) => entry.staffMemberId !== member.staffMemberId),
      ];
    },
    forgetStaff: async (staffMemberId) => {
      known = known.filter((entry) => entry.staffMemberId !== staffMemberId);
    },
  };
}

export const staffDeviceStore: StaffDeviceStore = createStaffDeviceStore();
