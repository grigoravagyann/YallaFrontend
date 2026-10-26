import type { ConsoleGateway } from '../../consoleGateway';
import type { components } from '../../generated/schema';
import {
  createStaffBody,
  staffMember,
  staffSignInLink,
  updateStaffBody,
} from '../staffAdminMapping';
import { type ConsoleHttpContext, BRANCHES, VENUES, staffRefusal } from './context';

// `WireStaff` is taken by the staff *report*; this is the staff *member*.
type WireStaffMember = components['schemas']['Yalla.Application.Staff.StaffMemberView'];
type WireSignInLink = components['schemas']['Yalla.Application.Staff.StaffSignInLink'];

export function staffMethods(
  ctx: ConsoleHttpContext,
): Pick<
  ConsoleGateway,
  | 'listStaff'
  | 'createStaff'
  | 'updateStaff'
  | 'setStaffPin'
  | 'issueStaffSignIn'
  | 'clearPinLockout'
> {
  const { client } = ctx;
  return {
    // --- Staff ----------------------------------------------------------------

    async listStaff(venueId) {
      const { data } = await client.get<WireStaffMember[]>(`${VENUES}/${venueId}/staff`);
      return data.map(staffMember);
    },

    async createStaff({ venueId, staff }) {
      try {
        const { data } = await client.post<WireStaffMember>(
          `${VENUES}/${venueId}/staff`,
          createStaffBody(staff),
        );
        return staffMember(data);
      } catch (error) {
        return staffRefusal(error);
      }
    },

    async updateStaff({ venueId, staffMemberId, patch }) {
      try {
        const { data } = await client.patch<WireStaffMember>(
          `${VENUES}/${venueId}/staff/${staffMemberId}`,
          updateStaffBody(patch),
        );
        return staffMember(data);
      } catch (error) {
        return staffRefusal(error);
      }
    },

    async setStaffPin({ venueId, staffMemberId, pin }) {
      // In the body, never the path. A PIN in a URL is a PIN in the server log,
      // the browser history and every proxy in between.
      try {
        const { data } = await client.post<WireStaffMember>(
          `${VENUES}/${venueId}/staff/${staffMemberId}/pin`,
          { pin },
        );
        return staffMember(data);
      } catch (error) {
        // `pin-taken` (409) and the rank rule (403), as on create and edit.
        return staffRefusal(error);
      }
    },

    async issueStaffSignIn({ venueId, staffMemberId, email }) {
      try {
        const { data } = await client.post<WireSignInLink>(
          `${VENUES}/${venueId}/staff/${staffMemberId}/sign-in`,
          { email },
        );
        return staffSignInLink(data);
      } catch (error) {
        // Only the 403 is re-wrapped: it is the rank rule, same as create and
        // edit. The 409 (PIN-only role, deactivated, address taken) and the 422
        // (not an address) already arrive as ConcurrencyConflictError and
        // ValidationError carrying the server's own sentence, which is the
        // thing the screen shows.
        return staffRefusal(error);
      }
    },

    async clearPinLockout({ branchId, staffMemberId }) {
      await client.post<void>(`${BRANCHES}/${branchId}/staff/${staffMemberId}/clear-pin-lockout`);
    },
  };
}
