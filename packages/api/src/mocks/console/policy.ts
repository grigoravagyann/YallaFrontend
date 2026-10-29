import {
  type ReservationPolicy,
  type ReservationPolicyDefaults,
  defaultPolicyFor,
  GUESTS_AT_ONCE_BOUNDS,
  POLICY_BOUNDS,
  type PolicyChangeResult,
} from '../../contracts/branchSettings';
import { PolicyBoundsError } from '../../contracts/errors';
import type { ConsoleGateway } from '../../consoleGateway';
import {
  type ConsoleMockContext,
  MOCK_AFFECTED_RESERVATIONS,
  POLICY_LABELS,
  URL_TAG,
} from './context';

/** The reservation policy. */
export function policyMethods(
  ctx: ConsoleMockContext,
): Pick<
  ConsoleGateway,
  'getReservationPolicy' | 'getReservationPolicyDefaults' | 'replaceReservationPolicy'
> {
  const { policies, policyFor, policyReviewed, requireBranchInVenue, venueOfBranch, venues, wait } =
    ctx;
  return {
    async getReservationPolicy(branchId): Promise<ReservationPolicy> {
      await wait();
      requireBranchInVenue(branchId);
      return policyFor(branchId);
    },

    async getReservationPolicyDefaults(branchId): Promise<ReservationPolicyDefaults> {
      await wait();
      requireBranchInVenue(branchId);
      const venueId = venueOfBranch(branchId);
      const type = (venueId ? venues.get(venueId)?.type : undefined) ?? 'cafe';
      return {
        defaults: defaultPolicyFor(type),
        // The server's editing bounds (`ReservationPolicyLimits`), wire names and all.
        bounds: [
          ...Object.entries(POLICY_BOUNDS).map(([field, bound]) => ({
            field,
            min: bound.min,
            max: bound.max,
          })),
          { field: 'maxSeatOverhang', min: 0, max: null },
          { field: 'approvalRequiredAbovePartySize', min: 1, max: null },
          { field: 'guestsAtOnce', ...GUESTS_AT_ONCE_BOUNDS },
        ],
      };
    },

    async replaceReservationPolicy({ branchId, policy }): Promise<PolicyChangeResult> {
      await wait();

      // Refused, never clamped, and named — the same sentence shape the server
      // produces, so the message-to-field mapping is exercised by the mock too.
      for (const [field, bounds] of Object.entries(POLICY_BOUNDS)) {
        const value = policy[field as keyof ReservationPolicy];
        if (typeof value !== 'number') continue;
        if (value < bounds.min || value > bounds.max) {
          throw new PolicyBoundsError({
            url: `${URL_TAG}/reservation-policy`,
            field,
            detail: `${POLICY_LABELS[field] ?? field} must be between ${bounds.min} and ${bounds.max}; ${value} was given.`,
          });
        }
      }

      // `ReservationPolicyLimits.ValidateBookingMode`: a 422 naming the field.
      const { guestsAtOnce } = policy;
      if (
        policy.bookingMode === 'timeOnly' &&
        (guestsAtOnce === null ||
          !Number.isInteger(guestsAtOnce) ||
          guestsAtOnce < GUESTS_AT_ONCE_BOUNDS.min ||
          guestsAtOnce > GUESTS_AT_ONCE_BOUNDS.max)
      ) {
        throw new PolicyBoundsError({
          url: `${URL_TAG}/reservation-policy`,
          field: 'guestsAtOnce',
          detail: `Booking by time only needs how many guests the branch takes at once, ${GUESTS_AT_ONCE_BOUNDS.min} to ${GUESTS_AT_ONCE_BOUNDS.max}.`,
        });
      }

      const previous = policyFor(branchId);
      // The server keeps no capacity for a branch whose diners choose a table.
      const saved: ReservationPolicy =
        policy.bookingMode === 'timeOnly' ? policy : { ...policy, guestsAtOnce: null };
      policies.set(branchId, saved);
      // Saving the form is what marks the policy reviewed, defaults or not.
      policyReviewed.add(branchId);

      // Bookings that would not have been allowed under the new rules. They are
      // **not** changed — a settings edit never rewrites a booking — and the
      // count is the whole reason this screen reports anything at all.
      const affected =
        policy.bookingWindowDays < previous.bookingWindowDays ||
        policy.turnTimeMinutes > previous.turnTimeMinutes
          ? MOCK_AFFECTED_RESERVATIONS
          : [];

      return {
        policy: saved,
        affectedExistingReservations: affected.length,
        affectedReservationIds: affected,
      };
    },
  };
}
