import { NotFoundError } from '../../errors';
import type { ConsoleGateway } from '../../consoleGateway';
import { type ConsoleMockContext, URL_TAG } from './context';

/** A branch's shifts. */
export function shiftsMethods(
  ctx: ConsoleMockContext,
): Pick<ConsoleGateway, 'listBranchShifts' | 'createShift' | 'updateShift' | 'deleteShift'> {
  const { requireManagerAtBranch, shiftServiceDate, shiftStore, shiftSubject, wait } = ctx;
  return {
    // --- Shifts ---------------------------------------------------------------

    async listBranchShifts({ branchId, from, to }) {
      await wait();
      requireManagerAtBranch(branchId, `${URL_TAG}/branches/${branchId}/shifts`);
      return shiftStore.list({ branchId, serviceDate: shiftServiceDate(branchId), from, to });
    },

    async createShift({ branchId, staffMemberId, shift }) {
      await wait();
      const member = shiftSubject(branchId, staffMemberId);
      return shiftStore.create({
        branchId,
        serviceDate: shiftServiceDate(branchId),
        member,
        shift,
      });
    },

    async updateShift({ branchId, shiftId, shift }) {
      await wait();
      const current = shiftStore.find(branchId, shiftId);
      if (!current) throw new NotFoundError({ url: `${URL_TAG}/branches/${branchId}/shifts` });
      shiftSubject(branchId, current.staffMemberId);
      return shiftStore.update({
        branchId,
        serviceDate: shiftServiceDate(branchId),
        shiftId,
        shift,
      });
    },

    async deleteShift({ branchId, shiftId }) {
      await wait();
      const current = shiftStore.find(branchId, shiftId);
      if (!current) throw new NotFoundError({ url: `${URL_TAG}/branches/${branchId}/shifts` });
      shiftSubject(branchId, current.staffMemberId);
      shiftStore.remove({ branchId, serviceDate: shiftServiceDate(branchId), shiftId });
    },
  };
}
