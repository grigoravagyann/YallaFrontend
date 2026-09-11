import type {
  EnrolDeviceCommand,
  EnrolledDevice,
  PinSignInCommand,
  StaffCredentialStorage,
  StaffSessionIdentity,
  StaffSignOutReason,
} from '../contracts/staffAuth';
import { DeviceRevokedError } from '../contracts/errors';
import { newCommandId } from '../ids';
import { jwtExpiresAtMs } from './jwt';
import type { AuthSession, AuthState, TokenPair } from './session';
import type { StaffAuth } from './staffEndpoints';

/**
 * The tablet's session, as a state machine with four states.
 *
 * ```
 *   unknown ──restore──▶ unenrolled ──enrol──▶ locked ──pin──▶ signedIn
 *                            ▲                   ▲                │
 *                            └──── revoked ──────┴──── idle ──────┘
 * ```
 *
 * `locked` is the state this whole module exists for: the tablet is enrolled
 * and knows where it is, and nobody is signed in on it. It is where a shift
 * starts, where thirty idle minutes lead, and where handing the tablet to a
 * colleague leads. It is **not** an error state and it is not signed-out — the
 * device credential survives it, so the way back is four digits and not an
 * onboarding conversation.
 *
 * Two rules that follow from a tablet on a counter and not from taste:
 *
 * 1. **Locking never discards work.** This module holds credentials and
 *    nothing else. Whatever the waiter had half-entered lives in the screen
 *    above it, which stays mounted behind the keypad. A session manager that
 *    unmounted the floor is a session manager nobody lets lock.
 * 2. **A revoked device is not an expired session.** Both end up off the floor,
 *    but one is answered by a PIN and the other by a manager, so they are
 *    different states and produce different screens. Bouncing a revoked tablet
 *    to the keypad is the redirect loop this design exists to avoid.
 *
 * It satisfies {@link AuthSession} so `ApiClient` can hold it, refresh once on
 * a 401 and retry — which is what turns a session that expired between two taps
 * into a renewed one rather than into a failed seat.
 */

export type StaffSessionState = 'unknown' | 'unenrolled' | 'locked' | 'signedIn';

export interface StaffSessionSnapshot {
  readonly state: StaffSessionState;
  /** What the tablet is bound to, once `getDevice` has answered. */
  readonly device: EnrolledDevice | null;
  /**
   * Whose session this is — or was, while the tablet is locked.
   *
   * **`state` is the authority on whether anybody is signed in**, not this.
   * The identity deliberately survives a lock so the screen underneath the
   * keypad can keep rendering with a branch and a role instead of being torn
   * down and rebuilt, which is what would throw away a half-entered order. It
   * is cleared when the tablet is unenrolled, because then it is not this
   * venue's tablet any more.
   */
  readonly identity: StaffSessionIdentity | null;
  /** Why the last session ended, for the line above the keypad. */
  readonly lastSignOut: StaffSignOutReason | null;
}

export interface StaffSessionConfig {
  readonly auth: StaffAuth;
  readonly storage: StaffCredentialStorage;
  /**
   * How long without a tap before the tablet locks itself.
   *
   * Slightly under the server's thirty minutes on purpose: locking on our own
   * clock produces a keypad, and letting the server get there first produces a
   * failed request that has to be explained. Default 25 minutes.
   */
  readonly idleMs?: number | undefined;
  /** Mints the per-install device id when storage has none. */
  readonly newDeviceId?: (() => string) | undefined;
  readonly now?: (() => number) | undefined;
  /**
   * Schedules the idle check. Injected so tests do not wait 25 minutes, and so
   * a non-browser host can pass a no-op.
   */
  readonly scheduleIdleCheck?: ((callback: () => void, ms: number) => () => void) | undefined;
}

export interface StaffSession extends AuthSession {
  getSnapshot(): StaffSessionSnapshot;
  subscribeToStaffSession(listener: (snapshot: StaffSessionSnapshot) => void): () => void;

  /** The stable per-install id, minted and stored on first read. */
  deviceId(): Promise<string>;
  enrol(input: Omit<EnrolDeviceCommand, 'deviceId'>): Promise<EnrolledDevice>;
  /** Re-read `GET /api/auth/staff/device`. Also how a revocation is noticed. */
  refreshDevice(): Promise<EnrolledDevice | null>;
  signInWithPin(command: PinSignInCommand): Promise<StaffSessionIdentity>;
  /** Lock the tablet. The device stays enrolled. */
  lock(reason: StaffSignOutReason): Promise<void>;
  /** A tap happened. Pushes the idle deadline out. */
  touch(): void;
}

const DEFAULT_IDLE_MS = 25 * 60_000;

/** Renew this long before `exp`, so the request that follows carries a live token. */
const EXPIRY_SKEW_MS = 30_000;

export function createStaffSession(config: StaffSessionConfig): StaffSession {
  const { auth, storage } = config;
  const now = config.now ?? (() => Date.now());
  const idleMs = config.idleMs ?? DEFAULT_IDLE_MS;
  // Not crypto.randomUUID: it exists only in a secure context, and a tablet on
  // a plain-http LAN address has none. newCommandId falls back when it is missing.
  const newDeviceId = config.newDeviceId ?? newCommandId;
  const schedule =
    config.scheduleIdleCheck ??
    ((callback, ms) => {
      const handle = setTimeout(callback, ms);
      return () => clearTimeout(handle);
    });

  const listeners = new Set<(snapshot: StaffSessionSnapshot) => void>();
  const authListeners = new Set<(state: AuthState) => void>();

  let snapshot: StaffSessionSnapshot = {
    state: 'unknown',
    device: null,
    identity: null,
    lastSignOut: null,
  };
  let accessToken: string | null = null;
  let accessExpiresAtMs = 0;
  let inflight: Promise<string | null> | null = null;
  let lastTouchMs = now();
  let cancelIdle: (() => void) | null = null;

  function set(next: Partial<StaffSessionSnapshot>): void {
    const merged = { ...snapshot, ...next };
    if (
      merged.state === snapshot.state &&
      merged.device === snapshot.device &&
      merged.identity === snapshot.identity &&
      merged.lastSignOut === snapshot.lastSignOut
    ) {
      return;
    }
    const previousAuthState = authStateOf(snapshot.state);
    snapshot = merged;
    for (const listener of listeners) listener(snapshot);
    const nextAuthState = authStateOf(snapshot.state);
    if (nextAuthState !== previousAuthState) {
      for (const listener of authListeners) listener(nextAuthState);
    }
  }

  function armIdle(): void {
    cancelIdle?.();
    cancelIdle = null;
    if (snapshot.state !== 'signedIn') return;

    const due = lastTouchMs + idleMs - now();
    cancelIdle = schedule(
      () => {
        if (snapshot.state !== 'signedIn') return;
        if (now() - lastTouchMs >= idleMs) {
          void lock('idle');
          return;
        }
        armIdle();
      },
      Math.max(1_000, due),
    );
  }

  async function lock(reason: StaffSignOutReason): Promise<void> {
    accessToken = null;
    accessExpiresAtMs = 0;
    cancelIdle?.();
    cancelIdle = null;
    await storage.clearRenewalToken();
    // The identity stays. Nothing can be done with it — there is no token —
    // and it is what lets the floor stay mounted behind the keypad.
    set({ state: 'locked', lastSignOut: reason });
  }

  async function unenrol(): Promise<void> {
    accessToken = null;
    accessExpiresAtMs = 0;
    cancelIdle?.();
    cancelIdle = null;
    await Promise.all([storage.clearRenewalToken(), storage.clearDeviceToken()]);
    set({ state: 'unenrolled', device: null, identity: null, lastSignOut: 'expired' });
  }

  async function adopt(input: {
    identity: StaffSessionIdentity;
    accessToken: string;
    renewalToken: string;
    expiresInSeconds: number;
  }): Promise<void> {
    accessToken = input.accessToken;
    accessExpiresAtMs = jwtExpiresAtMs(input.accessToken) ?? now() + input.expiresInSeconds * 1000;
    await storage.writeRenewalToken(input.renewalToken);
    lastTouchMs = now();
    set({ state: 'signedIn', identity: input.identity, lastSignOut: null });
    armIdle();
  }

  /**
   * One renewal at a time.
   *
   * The handle rotates on every use and the server revokes the chain when a
   * spent one comes back, so two renewals racing each other would lock the
   * tablet — during a rush, on the one screen that cannot afford it.
   */
  function renew(): Promise<string | null> {
    if (inflight) return inflight;

    inflight = (async () => {
      const renewalToken = await storage.readRenewalToken();
      if (!renewalToken) {
        accessToken = null;
        if (snapshot.state === 'signedIn') await lock('expired');
        return null;
      }

      try {
        const result = await auth.renew(renewalToken);
        if (!result) {
          await lock('expired');
          return null;
        }
        await adopt({
          identity: result.identity,
          accessToken: result.tokens.accessToken,
          renewalToken: result.tokens.renewalToken,
          expiresInSeconds: result.tokens.expiresInSeconds,
        });
        return result.tokens.accessToken;
      } catch (error) {
        if (error instanceof DeviceRevokedError) {
          await unenrol();
          return null;
        }
        // Could not reach the server, or it fell over: the handle may still be
        // good, so keep it and let the caller report the outage. A tablet that
        // locked because the wifi dropped is a tablet nobody trusts to stay on.
        throw error;
      }
    })().finally(() => {
      inflight = null;
    });

    return inflight;
  }

  return {
    // --- Staff-specific -------------------------------------------------------

    getSnapshot: () => snapshot,

    subscribeToStaffSession(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    async deviceId() {
      const stored = await storage.readDeviceId();
      if (stored) return stored;
      const minted = newDeviceId();
      await storage.writeDeviceId(minted);
      return minted;
    },

    async enrol(input) {
      const deviceId = await this.deviceId();
      const enrolment = await auth.enrol({ ...input, deviceId });
      await storage.writeDeviceToken(enrolment.deviceToken);
      // Straight to the keypad, and straight to the branch name: the manager who
      // just read out a code is standing there, and this is when a tablet bound
      // to the wrong branch is cheap to notice.
      const device = await auth.getDevice(enrolment.deviceToken);
      set({ state: 'locked', device, identity: null, lastSignOut: null });
      return device;
    },

    async refreshDevice() {
      const deviceToken = await storage.readDeviceToken();
      if (!deviceToken) {
        set({ state: 'unenrolled', device: null, identity: null });
        return null;
      }
      try {
        const device = await auth.getDevice(deviceToken);
        set({ device, ...(snapshot.state === 'unknown' ? { state: 'locked' as const } : {}) });
        return device;
      } catch (error) {
        if (error instanceof DeviceRevokedError) {
          await unenrol();
          return null;
        }
        // Offline on a tablet that *is* enrolled. The keypad still works —
        // the PIN exchange needs the server, but showing the enrolment screen
        // here would suggest the tablet has been kicked out when it has not.
        if (snapshot.state === 'unknown') set({ state: 'locked' });
        throw error;
      }
    },

    async signInWithPin(command) {
      const deviceToken = await storage.readDeviceToken();
      if (!deviceToken) {
        await unenrol();
        throw new DeviceRevokedError({ url: '' });
      }

      try {
        const result = await auth.signInWithPin(deviceToken, command);
        await adopt({
          identity: result.identity,
          accessToken: result.tokens.accessToken,
          renewalToken: result.tokens.renewalToken,
          expiresInSeconds: result.tokens.expiresInSeconds,
        });
        return result.identity;
      } catch (error) {
        if (error instanceof DeviceRevokedError) await unenrol();
        throw error;
      }
    },

    lock,

    touch() {
      lastTouchMs = now();
      if (snapshot.state === 'signedIn' && !cancelIdle) armIdle();
    },

    // --- AuthSession ----------------------------------------------------------

    async restore() {
      if (snapshot.state !== 'unknown') return authStateOf(snapshot.state);

      const [deviceToken, renewalToken] = await Promise.all([
        storage.readDeviceToken(),
        storage.readRenewalToken(),
      ]);

      if (!deviceToken) {
        set({ state: 'unenrolled' });
        return 'signedOut';
      }

      // A stored renewal handle is not a session: it is a claim that one may
      // still be alive, and only the server can settle that. So the tablet
      // starts locked and the first renewal decides — a screen that rendered
      // the floor on the strength of a stored handle would show a waiter a room
      // they may no longer be signed in to.
      set({ state: 'locked' });
      if (renewalToken) {
        try {
          await renew();
        } catch {
          // Offline at launch. Stay locked; the keypad says why.
        }
      }
      return authStateOf(snapshot.state);
    },

    async getAccessToken() {
      if (accessToken !== null && now() < accessExpiresAtMs - EXPIRY_SKEW_MS) return accessToken;
      if (snapshot.state === 'unenrolled') return null;
      return renew();
    },

    refresh: renew,

    peekAccessToken: () => accessToken,

    /** Adopting a pair directly, for a host that signed in by another route. */
    async signIn(tokens: TokenPair) {
      accessToken = tokens.accessToken;
      accessExpiresAtMs =
        jwtExpiresAtMs(tokens.accessToken) ?? now() + tokens.expiresInSeconds * 1000;
      await storage.writeRenewalToken(tokens.refreshToken);
      lastTouchMs = now();
      set({ state: 'signedIn', lastSignOut: null });
      armIdle();
    },

    async signOut() {
      const renewalToken = await storage.readRenewalToken();
      if (renewalToken) await auth.signOut(renewalToken);
      await lock('signedOut');
    },

    getState: () => authStateOf(snapshot.state),

    subscribe(listener) {
      authListeners.add(listener);
      return () => {
        authListeners.delete(listener);
      };
    },
  };
}

/** The three-state view `ApiClient` and the shared code expect. */
function authStateOf(state: StaffSessionState): AuthState {
  if (state === 'unknown') return 'unknown';
  return state === 'signedIn' ? 'signedIn' : 'signedOut';
}
