import { browserMockStorage } from './browserStorage';
import { MOCK_JOURNAL_PREFIX, type MockJournalStorage } from './persistence';
import type { BranchFeature } from '../contracts/branchFeatures';
import type { StaffDeviceBrowser, StaffDevicePlatform } from '../contracts/staff';

/**
 * What one mock hands to another across a page load.
 *
 * Three things leave the console on paper and arrive somewhere else later: a
 * sign-in link (pasted into a browser), an enrolment code (read out across a
 * counter) and the tablet credential the code is exchanged for. Each crosses
 * a reload and a gateway boundary, so none can live inside a gateway's own
 * closure. This is the drawer they go in: a map per kind, mirrored to
 * `localStorage` under the mock prefix when there is one, so the reset action
 * empties it with everything else, and in memory otherwise — which is what
 * every test gets.
 *
 * Nothing here is a credential in any real sense; see `publicMock.ts` on what
 * a mock token is and is not.
 */

const KEY = `${MOCK_JOURNAL_PREFIX}registry.`;

/**
 * What the registry keeps of a sign-in token: a hash, never the token.
 *
 * The server keeps only a hash of a reset token, and the staff screen promises
 * the link never reaches a disk (`staff.test.tsx`); the drawer is mirrored to
 * `localStorage`, so it may not hold the token either. Not a cryptographic
 * hash and it does not need to be: nothing in a mock is a secret, but a value
 * the screen tells a manager is shown once must not be readable back.
 */
export function mockTokenHash(token: string): string {
  // cyrb53: two 32-bit lanes, enough that two mock tokens never meet.
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let index = 0; index < token.length; index += 1) {
    const char = token.charCodeAt(index);
    h1 = Math.imul(h1 ^ char, 2654435761);
    h2 = Math.imul(h2 ^ char, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `h${(h2 >>> 0).toString(16).padStart(8, '0')}${(h1 >>> 0).toString(16).padStart(8, '0')}`;
}

export interface MockSignInLink {
  /** {@link mockTokenHash} of the token; the drawer is keyed by it too. */
  readonly tokenHash: string;
  readonly staffMemberId: string;
  readonly venueId: string;
  readonly email: string;
  readonly expiresAtUtc: string;
  readonly spentAtUtc: string | null;
}

export interface MockEnrolmentCode {
  readonly code: string;
  readonly branchId: string;
  readonly expiresAtUtc: string;
  readonly spentAtUtc: string | null;
}

export interface MockEnrolledDevice {
  readonly deviceToken: string;
  readonly deviceId: string;
  readonly deviceName: string;
  readonly branchId: string;
  readonly enrolledAtUtc: string;
  readonly revokedAtUtc: string | null;
  /** A phone paired to one person; absent on a tablet (and on a drawer from before phones). */
  readonly kind?: 'tablet' | 'phone' | undefined;
  /** The phone's person: the only PIN it takes. */
  readonly boundStaffMemberId?: string | null | undefined;
  /** Moved by every PIN sign-in and renewal, for the console's "last seen". */
  readonly lastSeenAtUtc?: string | null | undefined;
  /** What a phone said it runs on when it paired; absent on a tablet. */
  readonly platform?: StaffDevicePlatform | null | undefined;
  readonly browser?: StaffDeviceBrowser | null | undefined;
}

/**
 * A phone pairing code the console issued for one person: ten minutes, one
 * use, and a newer one for the same person supersedes it.
 */
export interface MockPhonePairing {
  /** Normalised: upper case, no dash. */
  readonly code: string;
  readonly branchId: string;
  readonly staffMemberId: string;
  readonly expiresAtUtc: string;
  readonly redeemedAtUtc: string | null;
  readonly supersededAtUtc: string | null;
}

/** What the platform admin allowed at a branch, kept across reloads (see `branchFeaturesMock.ts`). */
export interface MockBranchFeatures {
  readonly branchId: string;
  readonly features: readonly BranchFeature[];
}

export interface MockStaffHandle {
  readonly renewalToken: string;
  readonly deviceToken: string;
  readonly staffMemberId: string;
}

class Drawer<T> {
  private readonly items = new Map<string, T>();
  private loaded = false;

  constructor(
    private readonly name: string,
    private readonly storage: () => MockJournalStorage | null,
  ) {}

  private load(): void {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const raw = this.storage()?.getItem(KEY + this.name);
      if (!raw) return;
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed === 'object' && parsed !== null) {
        for (const [key, value] of Object.entries(parsed as Record<string, T>)) {
          this.items.set(key, value);
        }
      }
    } catch {
      // Unreadable: start empty.
    }
  }

  private save(): void {
    try {
      this.storage()?.setItem(KEY + this.name, JSON.stringify(Object.fromEntries(this.items)));
    } catch {
      // Nowhere to keep it: memory will do for this load.
    }
  }

  get(key: string): T | undefined {
    this.load();
    return this.items.get(key);
  }

  set(key: string, value: T): void {
    this.load();
    this.items.set(key, value);
    this.save();
  }

  /** Everything in the drawer, for the lists that are read across it (a branch's phones). */
  values(): T[] {
    this.load();
    return [...this.items.values()];
  }

  delete(key: string): void {
    this.load();
    this.items.delete(key);
    this.save();
  }

  clear(): void {
    this.items.clear();
    this.loaded = true;
    this.save();
  }
}

export interface MockRegistry {
  readonly signInLinks: Drawer<MockSignInLink>;
  readonly enrolmentCodes: Drawer<MockEnrolmentCode>;
  readonly devices: Drawer<MockEnrolledDevice>;
  readonly staffHandles: Drawer<MockStaffHandle>;
  readonly phonePairings: Drawer<MockPhonePairing>;
  readonly branchFeatures: Drawer<MockBranchFeatures>;
  /** Empty every drawer. Tests call it between cases. */
  reset(): void;
}

export function createMockRegistry(storage: () => MockJournalStorage | null): MockRegistry {
  const drawers = {
    signInLinks: new Drawer<MockSignInLink>('sign-in-links', storage),
    enrolmentCodes: new Drawer<MockEnrolmentCode>('enrolment-codes', storage),
    devices: new Drawer<MockEnrolledDevice>('devices', storage),
    staffHandles: new Drawer<MockStaffHandle>('staff-handles', storage),
    phonePairings: new Drawer<MockPhonePairing>('phone-pairings', storage),
    branchFeatures: new Drawer<MockBranchFeatures>('branch-features', storage),
  };
  return {
    ...drawers,
    reset() {
      for (const drawer of Object.values(drawers)) drawer.clear();
    },
  };
}

/** The one registry the app's mocks share: the browser's storage, or memory. */
export const mockRegistry: MockRegistry = createMockRegistry(browserMockStorage);
