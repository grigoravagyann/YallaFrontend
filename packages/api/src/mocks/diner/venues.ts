import { mockVenues } from '../venues';
import { publicVenueFixtures, publicBranchFixtures } from '../publicVenues';
import { BOOKING_WINDOW_DAYS } from '../publicMock';
import { type DinerMockContext, DEFAULT_POLICY, type MockGateway } from './context';

/** Venues, booking rules, the floor and slot availability. */
export function venuesMethods(
  ctx: DinerMockContext,
): Pick<
  MockGateway,
  | 'listVenues'
  | 'getVenue'
  | 'getBookingRules'
  | 'getFloorPlan'
  | 'getBranchTimeZone'
  | 'getTableAvailability'
  | 'getSlotFloor'
  | 'getDaySlots'
> {
  const {
    acceptsAppBookings,
    availabilityFor,
    daySlotsFor,
    findBranch,
    floors,
    publishedVenues,
    slotFloorFor,
    wait,
  } = ctx;
  return {
    async listVenues() {
      await wait();
      return publishedVenues();
    },

    async getVenue(venueId) {
      await wait();
      // By the published id (the slug) or the venue's own id: the places list
      // the diner app builds from the fixture carries the latter, and a lookup
      // that knew only the slug left the confirm screen's "Where" row empty
      // (QA F14).
      const own = mockVenues.find((venue) => venue.id === venueId);
      const published = own ? (publicVenueFixtures[own.id]?.slug ?? own.id) : venueId;
      return publishedVenues().find((venue) => venue.id === published) ?? null;
    },

    async getBookingRules({ venueSlug, branchSlug }) {
      await wait();
      const venue = mockVenues.find((v) => publicVenueFixtures[v.id]?.slug === venueSlug);
      const branch = venue?.branches.find((b) => publicBranchFixtures[b.id]?.slug === branchSlug);
      return branch
        ? {
            bookingWindowDays: BOOKING_WINDOW_DAYS,
            minLeadMinutes: DEFAULT_POLICY.leadTimeMinutes,
            acceptsAppBookings: acceptsAppBookings(branch.id),
            // The mock's branches all choose tables.
            bookingMode: 'chooseTable' as const,
          }
        : null;
    },

    async getFloorPlan(branchId) {
      await wait();
      return floors.get(branchId) ?? null;
    },

    async getBranchTimeZone(branchId) {
      await wait();
      return findBranch(branchId)?.branch.timeZoneId ?? null;
    },

    async getTableAvailability({ branchId, slotUtc, partySize }) {
      await wait();
      return availabilityFor(branchId, slotUtc, partySize);
    },

    async getSlotFloor({ branchId, slotUtc, partySize, excludeBookingId }) {
      await wait();
      return slotFloorFor(branchId, slotUtc, partySize, excludeBookingId);
    },

    async getDaySlots({ branchId, date, partySize, excludeBookingId }) {
      await wait();
      return daySlotsFor(branchId, date, partySize, excludeBookingId);
    },
  };
}
