import type { ConsoleGateway } from '../../consoleGateway';
import { KitchenPhoneNotAllowedError } from '../../contracts/errors';
import { ApiError } from '../../errors';
import type { components } from '../../generated/schema';
import { enrolmentCode, phonePairingCode, staffDevice } from '../staffAdminMapping';
import { ProblemCodes } from '../../generated/problemCodes';
import { type ConsoleHttpContext, BRANCHES } from './context';

type WireDevice = components['schemas']['Yalla.Application.Auth.StaffDeviceSummary'];
type WireCode = components['schemas']['Yalla.Application.Auth.DeviceEnrolmentCodeResult'];
type WirePhonePairing = components['schemas']['Yalla.Application.Auth.PhonePairingCodeResult'];

export function devicesMethods(
  ctx: ConsoleHttpContext,
): Pick<
  ConsoleGateway,
  'listDevices' | 'createPhonePairing' | 'createEnrolmentCode' | 'revokeDevice'
> {
  const { client } = ctx;
  return {
    // --- Devices --------------------------------------------------------------

    async listDevices(branchId, kind) {
      // `kind` 1 the tablets, 2 the phones; absent, the server answers both.
      const { data } = await client.get<WireDevice[]>(
        `${BRANCHES}/${branchId}/devices`,
        kind ? { query: { kind: kind === 'phone' ? 2 : 1 } } : undefined,
      );
      return data.map(staffDevice);
    },

    async createPhonePairing({ branchId, staffMemberId }) {
      try {
        const { data } = await client.post<WirePhonePairing>(
          `${BRANCHES}/${branchId}/staff/${staffMemberId}/phone-pairings`,
        );
        return phonePairingCode(data);
      } catch (error) {
        // The kitchen stays on its tablet: said, not a generic conflict.
        if (error instanceof ApiError && error.code === ProblemCodes.KitchenPhoneNotAllowed) {
          throw new KitchenPhoneNotAllowedError({ url: error.url, requestId: error.requestId });
        }
        throw error;
      }
    },

    async createEnrolmentCode(branchId) {
      const { data } = await client.post<WireCode>(
        `${BRANCHES}/${branchId}/devices/enrolment-codes`,
      );
      return enrolmentCode(data);
    },

    async revokeDevice({ branchId, deviceId }) {
      await client.post<void>(`${BRANCHES}/${branchId}/devices/${deviceId}/revoke`);
    },
  };
}
