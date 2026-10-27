import type { ApiClient } from '../client';
import {
  DeviceRevokedError,
  EnrolmentCodeExpiredError,
  EnrolmentCodeSpentError,
  KitchenPhoneNotAllowedError,
  PairingCodeExpiredError,
  PairingCodeInvalidError,
  PairingCodeUnusableError,
  PinLockedError,
  PinRejectedError,
  isFeatureNotEnabled,
} from '../contracts/errors';
import type {
  DeviceEnrolment,
  EnrolDeviceCommand,
  EnrolledDevice,
  PairPhoneCommand,
  PhonePairing,
  PhonePairingPreview,
  PinSignInCommand,
  StaffRosterEntry,
  StaffSignInResult,
} from '../contracts/staffAuth';
import { ApiError, ForbiddenError, UnauthorizedError } from '../errors';
import type { components } from '../generated/schema';
import { staffRoleToUserRole } from './endpoints';
import { staffDeviceBrowserCode, staffDevicePlatformCode } from '../http/staffAdminMapping';
import { branchFeaturesFromWire } from '../http/branchFeatureMapping';
import { ProblemCodes } from '../generated/problemCodes';

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
        // Expired and mistyped are both 401; only the reason code tells them apart.
        if (error instanceof ApiError && error.code === ProblemCodes.EnrolmentCodeExpired) {
          throw new EnrolmentCodeExpiredError({ url: error.url, requestId: error.requestId });
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
          kind: data.kind === 2 ? 'phone' : 'tablet',
          boundStaffMember: data.boundStaffMember
            ? {
                id: data.boundStaffMember.id,
                fullName: data.boundStaffMember.fullName,
                role: staffRoleToUserRole(data.boundStaffMember.role),
              }
            : null,
          features: branchFeaturesFromWire(data.features),
        };
      } catch (error) {
        throw asDeviceFailure(error);
      }
    },

    /**
     * Who a phone pairing code is for: the phone's "is this you?". Anonymous,
     * and it spends nothing — the PIN does that, in {@link pairPhone}.
     */
    async previewPhonePairing(code: string): Promise<PhonePairingPreview> {
      try {
        const { data } = await client.post<Schemas['Yalla.Application.Auth.PhonePairingPreview']>(
          `${STAFF}/phone-pair/preview`,
          { code } satisfies Schemas['Yalla.Api.Endpoints.PhonePairPreviewRequest'],
          { skipAuth: true },
        );
        return {
          staffMemberId: data.staffMemberId,
          fullName: data.fullName,
          role: staffRoleToUserRole(data.role),
          branchId: data.branchId,
          branchName: data.branchName,
          venueName: data.venueName,
          expiresAtUtc: data.expiresAtUtc,
        };
      } catch (error) {
        throw asPairingFailure(error);
      }
    },

    /**
     * Pair this browser as the code's person's phone, with their own PIN. The
     * answer is a tablet's enrolment and a PIN sign-in at once. A wrong PIN is
     * the PIN screen's refusal and leaves the code usable; the lockout is the
     * PIN screen's lockout.
     */
    async pairPhone(command: PairPhoneCommand): Promise<PhonePairing> {
      try {
        const { data } = await client.post<Schemas['Yalla.Application.Auth.PhonePairingResult']>(
          `${STAFF}/phone-pair`,
          {
            code: command.code,
            pin: command.pin,
            clientDeviceId: command.clientDeviceId,
            deviceName: command.deviceName,
            ...(command.platform ? { platform: staffDevicePlatformCode(command.platform) } : {}),
            ...(command.browser ? { browser: staffDeviceBrowserCode(command.browser) } : {}),
          } satisfies Schemas['Yalla.Api.Endpoints.PhonePairRequest'],
          { skipAuth: true },
        );
        return {
          device: {
            deviceId: data.device.deviceId,
            deviceName: data.device.deviceName,
            branchId: data.device.branchId,
            deviceToken: data.device.deviceToken,
            expiresAtUtc: data.device.expiresAtUtc,
          },
          session: toSignIn(data.session),
        };
      } catch (error) {
        if (error instanceof ForbiddenError) {
          throw new PinLockedError({
            url: error.url,
            lockedUntilUtc: lockedUntil(error),
            requestId: error.requestId,
          });
        }
        if (error instanceof ApiError && error.code === ProblemCodes.PinInvalid) {
          throw new PinRejectedError({ url: error.url, requestId: error.requestId });
        }
        throw asPairingFailure(error);
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
        return data.map(rosterEntry);
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
          if (error.code === ProblemCodes.DeviceRevoked) {
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
          if (error.code === ProblemCodes.DeviceRevoked) {
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
      features: branchFeaturesFromWire(data.features),
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

/**
 * A pairing code's refusals, by the code the server gives — the three ways a
 * code fails need three different sentences on the phone.
 */
function asPairingFailure(error: unknown): unknown {
  if (!(error instanceof ApiError)) return error;
  // Staff phones are off at the branch: not the code's fault, and the phone
  // says so rather than "ask for a new code".
  if (isFeatureNotEnabled(error)) return error;
  const options = { url: error.url, requestId: error.requestId };
  if (error.code === ProblemCodes.PairingCodeExpired) return new PairingCodeExpiredError(options);
  if (error.code === ProblemCodes.PairingCodeInvalid) return new PairingCodeInvalidError(options);
  if (error.code === ProblemCodes.KitchenPhoneNotAllowed)
    return new KitchenPhoneNotAllowedError(options);
  if (error.status === 409) return new PairingCodeUnusableError(options);
  if (error.status === 401) return new PairingCodeInvalidError(options);
  return error;
}

/** `context.lockedUntilUtc` from the `account-locked` problem, when it is there. */
function lockedUntil(error: ApiError): string | null {
  const value = error.problem?.context?.['lockedUntilUtc'];
  return typeof value === 'string' ? value : null;
}

/**
 * One roster row. The shift's five fields arrive together or not at all (the
 * server omits nulls); a row with only some of them is treated as having
 * none rather than drawn with a gap. A server from before shifts sends no
 * `onShiftNow`, which reads as nobody on shift — the flat list it always was.
 */
function rosterEntry(entry: StaffRosterEntryWire): StaffRosterEntry {
  const { startsAt, endsAt, startsAtUtc, endsAtUtc } = entry;
  return {
    staffMemberId: entry.staffMemberId,
    fullName: entry.fullName,
    role: staffRoleToUserRole(entry.role),
    onShiftNow: entry.onShiftNow ?? false,
    shift:
      startsAt && endsAt && startsAtUtc && endsAtUtc
        ? {
            startsAt: startsAt.slice(0, 5),
            endsAt: endsAt.slice(0, 5),
            endsNextDay: entry.endsNextDay ?? false,
            startsAtUtc,
            endsAtUtc,
          }
        : null,
  };
}
