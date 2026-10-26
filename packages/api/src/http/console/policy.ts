import type { ConsoleGateway } from '../../consoleGateway';
import type {
  PolicyChangeResult,
  ReservationPolicy,
  ReservationPolicyDefaults,
} from '../../contracts/branchSettings';
import { PolicyBoundsError } from '../../contracts/errors';
import { ApiError, ValidationError } from '../../errors';
import type { components } from '../../generated/schema';
import {
  policyChangeResult,
  policyCommand,
  policyDefaults,
  policyFieldFromMessage,
  reservationPolicy,
  type WirePolicyDefaults,
} from '../venueSettingsMapping';
import { type ConsoleHttpContext, BRANCHES } from './context';

type Schemas = components['schemas'];
type WirePolicy = Schemas['Yalla.Application.BranchSettings.ReservationPolicyView'];
type WirePolicyResult = Schemas['Yalla.Application.BranchSettings.ReservationPolicyChangeResult'];

export function policyMethods(
  ctx: ConsoleHttpContext,
): Pick<
  ConsoleGateway,
  'getReservationPolicy' | 'getReservationPolicyDefaults' | 'replaceReservationPolicy'
> {
  const { client } = ctx;
  return {
    // --- The reservation policy ---------------------------------------------------

    async getReservationPolicy(branchId: string): Promise<ReservationPolicy> {
      const { data } = await client.get<WirePolicy>(`${BRANCHES}/${branchId}/reservation-policy`);
      return reservationPolicy(data);
    },

    async getReservationPolicyDefaults(branchId: string): Promise<ReservationPolicyDefaults> {
      const { data } = await client.get<WirePolicyDefaults>(
        `${BRANCHES}/${branchId}/reservation-policy/defaults`,
      );
      return policyDefaults(data);
    },

    async replaceReservationPolicy({ branchId, policy }): Promise<PolicyChangeResult> {
      try {
        const { data } = await client.put<WirePolicyResult>(
          `${BRANCHES}/${branchId}/reservation-policy`,
          policyCommand(policy),
        );
        return policyChangeResult(data);
      } catch (error) {
        // Today a `422 validation-failed` naming every field out of bounds
        // (`ReservationPolicyLimits.Check`); an older server answered 400 with
        // the field only in its prose. Every field named is marked on the form.
        if (error instanceof ApiError && (error.status === 400 || error.status === 422)) {
          const detail = error.problem?.detail ?? error.message;
          const named =
            error instanceof ValidationError ? error.violations.map((v) => v.field) : [];
          const field = named[0] ?? (error instanceof ValidationError ? error.field : null);
          throw new PolicyBoundsError({
            url: error.url,
            field: field ?? policyFieldFromMessage(detail),
            fields: named.length > 0 ? named : undefined,
            detail,
            requestId: error.requestId,
          });
        }
        throw error;
      }
    },
  };
}
