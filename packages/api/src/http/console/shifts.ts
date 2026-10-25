import type { ConsoleGateway } from '../../consoleGateway';
import {
  branchShifts,
  shiftBody,
  staffShift,
  type WireBranchShifts,
  type WireStaffShift,
} from '../shiftMapping';
import { type ConsoleHttpContext, BRANCHES, staffRefusal } from './context';

export function shiftsMethods(
  ctx: ConsoleHttpContext,
): Pick<ConsoleGateway, 'listBranchShifts' | 'createShift' | 'updateShift' | 'deleteShift'> {
  const { client } = ctx;
  return {
    // --- Shifts ---------------------------------------------------------------

    async listBranchShifts({ branchId, from, to }) {
      const { data } = await client.get<WireBranchShifts>(`${BRANCHES}/${branchId}/shifts`, {
        query: { ...(from ? { from } : {}), ...(to ? { to } : {}) },
      });
      return branchShifts(data);
    },

    async createShift({ branchId, staffMemberId, shift }) {
      try {
        const body = shiftBody(shift);
        const { data } = await client.post<WireStaffShift>(`${BRANCHES}/${branchId}/shifts`, {
          staffMemberId,
          date: body.date,
          dayOff: body.dayOff,
          ...(body.startsAt ? { startsAt: body.startsAt } : {}),
          ...(body.endsAt ? { endsAt: body.endsAt } : {}),
        });
        return staffShift(data);
      } catch (error) {
        // The rank rule is the staff routes' 403; the 422s and 409s carry the
        // server's own sentence and go through as they are.
        return staffRefusal(error);
      }
    },

    async updateShift({ branchId, shiftId, shift }) {
      try {
        const { data } = await client.put<WireStaffShift>(
          `${BRANCHES}/${branchId}/shifts/${shiftId}`,
          shiftBody(shift),
        );
        return staffShift(data);
      } catch (error) {
        return staffRefusal(error);
      }
    },

    async deleteShift({ branchId, shiftId }) {
      try {
        await client.delete<void>(`${BRANCHES}/${branchId}/shifts/${shiftId}`);
      } catch (error) {
        return staffRefusal(error);
      }
    },
  };
}
