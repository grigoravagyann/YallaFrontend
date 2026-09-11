import type { ApiClient } from '../client';
import {
  DeviceRevokedError,
  EnrolmentCodeSpentError,
  PinLockedError,
  PinRejectedError,
} from '../contracts/errors';
import type {
  DeviceEnrolment,
  EnrolDeviceCommand,
  EnrolledDevice,
  PinSignInCommand,
  StaffRosterEntry,
  StaffSignInResult,
} from '../contracts/staffAuth';
import { ApiError, ForbiddenError, UnauthorizedError } from '../errors';
import type { components } from '../generated/schema';
import { staffRoleToUserRole } from './endpoints';

type Schemas = components['schemas'];

/** One row of `GET /api/auth/staff/roster`. */
type StaffRosterEntryWire = components['schemas']['Yalla.Application.Auth.StaffRosterEntry'];

const STAFF = '/api/auth/staff';

/**
 * The four staff auth calls, typed from the generated schema.
 *
 * Every one of them passes `skipAuth` and sets its own `authorization` header,
 * because the token being *sent* is the credential being exchanged rather than
 * one authorising the call. Letting the shared session attach a bearer here
 * would send a session token to the endpoint whose job is to mint one, and a
 * 401 would trigger a refresh of the very thing being refreshed.
 *
 * Failures are translated into the four typed errors the sign-in screens branch
 * on. The server deliberately gives one answer for every way a PIN can be wrong
 * and a different one for a lockout; that distinction is the only one preserved
 * here, because it is the only one the waiter is entitled to and the only one
 * whose fix differs.
 */
export function createStaffAuth(client: ApiClient) {
  function bearer(token: string): Record<string, string> {
    return { authorization: `Bearer ${token}` };
  }

  return {
    /**
     * Redeem a one-time enrolment code.
     *
     * Anonymous: the tablet has no credential yet, which is the point of the
     * code.
     */
    async enrol(command: EnrolDeviceCommand): Promise<DeviceEnrolment> {
      try {
        const { data } = await client.post<Schemas['Yalla.Application.Auth.DeviceEnrolmentResult']>(
          `${STAFF}/enrol`,
          {
            code: command.code,
            deviceId: command.deviceId,
            deviceName: command.deviceName,
          } satisfies Schemas['Yalla.Api.Endpoints.RedeemEnrolmentCodeRequest'],
          { skipAuth: true },
        );
        return {
          deviceId: data.deviceId,
          deviceName: data.deviceName,
          branchId: data.branchId,
          deviceToken: data.deviceToken,
          expiresAtUtc: data.expiresAtUtc,
        };
      } catch (error) {
        if (error instanceof ApiError && error.status === 409) {
          throw new EnrolmentCodeSpentError({ url: error.url, requestId: error.requestId });
        }
        throw error;
      }
    },

    /**
     * Which venue and branch this device is bound to.
     *
     * A 401 here means revoked or never enrolled, and the two are the same
     * answer: the tablet goes back to the enrolment screen with a sentence, not
     * to a keypad it can never get past.
     */
    async getDevice(deviceToken: string): Promise<EnrolledDevice> {
      try {
        const { data } = await client.get<Schemas['Yalla.Application.Auth.EnrolledDeviceView']>(
          `${STAFF}/device`,
          { skipAuth: true, headers: bearer(deviceToken) },
        );
        return {
          deviceId: data.deviceId,
          deviceName: data.deviceName,
          branchId: data.branchId,
          branchName: data.branchName,
          venueName: data.venueName,
          enrolledAtUtc: data.enrolledAtUtc,
          lastSeenAtUtc: data.lastSeenAtUtc ?? null,
        };
      } catch (error) {
        throw asDeviceFailure(error);
      }
    },

    /**
     * The branch's people, for the PIN screen's name tiles.
     *
     * Same credential and same refusals as {@link getDevice}: a 401 means the
     * tablet is revoked or was never enrolled.
     */
    async getRoster(deviceToken: string): Promise<readonly StaffRosterEntry[]> {
      try {
        const { data } = await client.get<readonly StaffRosterEntryWire[]>(`${STAFF}/roster`, {
          skipAuth: true,
          headers: bearer(deviceToken),
        });
        return data.map((entry) => ({
          staffMemberId: entry.staffMemberId,
          fullName: entry.fullName,
          role: staffRoleToUserRole(entry.role),
        }));
      } catch (error) {
        throw asDeviceFailure(error);
      }
    },

    /** Exchange the device token and four digits for a session. */
    async signInWithPin(
      deviceToken: string,
      command: PinSignInCommand,
    ): Promise<StaffSignInResult> {
      try {
        const { data } = await client.post<Schemas['Yalla.Application.Auth.StaffSessionResult']>(
          `${STAFF}/pin`,
          {
            staffMemberId: command.staffMemberId,
            pin: command.pin,
          } satisfies Schemas['Yalla.Api.Endpoints.StaffPinRequest'],
          { skipAuth: true, headers: bearer(deviceToken) },
        );
        return toSignIn(data);
      } catch (error) {
        // Ordered: the lockout is a 403 and must not fall through to the
        // generic refusal, or somebody stands at a tablet retyping a PIN that
        // was correct all along.
        if (error instanceof ForbiddenError) {
          throw new PinLockedError({
            url: error.url,
            lockedUntilUtc: lockedUntil(error),
            requestId: error.requestId,
          });
        }
        if (error instanceof UnauthorizedError) {
          // `device-revoked` and a wrong PIN are both 401 and mean opposite
          // things to the screen: one goes back to enrolment, the other stays
          // on the keypad.
          if (error.code === 'device-revoked') {
            throw new DeviceRevokedError({ url: error.url, requestId: error.requestId });
          }
          throw new PinRejectedError({ url: error.url, requestId: error.requestId });
        }
        throw error;
      }
    },

    /**
     * Keep the session alive and rotate the handle.
     *
     * Refused once the session has been idle for thirty minutes, once its
     * shift-length cap runs out, or as soon as the tablet is revoked. In every
     * case the answer is the PIN screen, so a 401 is not thrown on: the caller
     * gets `null` and locks.
     */
    async renew(renewalToken: string): Promise<StaffSignInResult | null> {
      try {
        const { data } = await client.post<Schemas['Yalla.Application.Auth.StaffSessionResult']>(
          `${STAFF}/renew`,
          { renewalToken } satisfies Schemas['Yalla.Api.Endpoints.RenewStaffSessionRequest'],
          { skipAuth: true },
        );
        return toSignIn(data);
      } catch (error) {
        if (error instanceof UnauthorizedError) {
          if (error.code === 'device-revoked') {
            throw new DeviceRevokedError({ url: error.url, requestId: error.requestId });
          }
          return null;
        }
        throw error;
      }
    },

    /** The tablet's sign-out button. Always succeeds, including offline. */
    async signOut(renewalToken: string): Promise<void> {
      try {
        await client.post(
          `${STAFF}/sign-out`,
          { renewalToken } satisfies Schemas['Yalla.Api.Endpoints.RenewStaffSessionRequest'],
          { skipAuth: true },
        );
      } catch {
        // A local sign-out must succeed even with no connection. The renewal
        // handle is discarded either way, and the server's copy times out.
      }
    },
  };
}

export type StaffAuth = ReturnType<typeof createStaffAuth>;

function toSignIn(data: Schemas['Yalla.Application.Auth.StaffSessionResult']): StaffSignInResult {
  return {
    identity: {
      staffMemberId: data.staffMemberId,
      fullName: data.fullName,
      role: staffRoleToUserRole(data.role),
      branchId: data.branchId,
    },
    tokens: {
      accessToken: data.accessToken,
      renewalToken: data.renewalToken,
      expiresInSeconds: data.expiresInSeconds,
    },
  };
}

/** A 401 on a device-token call. Always the same conclusion. */
function asDeviceFailure(error: unknown): unknown {
  if (error instanceof UnauthorizedError) {
    return new DeviceRevokedError({ url: error.url, requestId: error.requestId });
  }
  return error;
}

/** `context.lockedUntilUtc` from the `account-locked` problem, when it is there. */
function lockedUntil(error: ApiError): string | null {
  const value = error.problem?.context?.['lockedUntilUtc'];
  return typeof value === 'string' ? value : null;
}
