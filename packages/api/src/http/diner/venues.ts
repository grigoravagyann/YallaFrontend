import type { FloorPlanData } from '../../contracts/tableFloor';
import { bookingModeFromCode, type DaySlots, type VenueSummary } from '../../contracts/booking';
import { NotFoundError } from '../../errors';
import type { YallaGateway } from '../../gateway';
import type { components } from '../../generated/schema';
import {
  availabilityFromResponse,
  daySlotsFromWire,
  floorFromAvailability,
  slotFloorFromResponse,
  floorFromState,
  localDateTime,
  type WireDaySlots,
} from '../mapping';
import { venueSummariesFromCards } from '../publicMapping';
import type { DinerHttpContext } from './context';

type Schemas = components['schemas'];

export function venuesMethods(
  ctx: DinerHttpContext,
): Pick<
  YallaGateway,
  | 'listVenues'
  | 'getVenue'
  | 'getBookingRules'
  | 'getFloorPlan'
  | 'getBranchTimeZone'
  | 'getTableAvailability'
  | 'getSlotFloor'
  | 'getDaySlots'
> {
  const { client, audience, defaultZone, venueNames } = ctx;
  /**
   * The browse list: `GET /api/public/venues`, anonymous.
   *
   * The only venue read the backend publishes. A local function rather than a
   * method so `getVenue` can reuse it without `this`, which stays correct if a
   * method is ever passed around unbound.
   */
  async function listVenues(): Promise<readonly VenueSummary[]> {
    const { data } = await client.get<Schemas['Yalla.Application.Public.PublicVenueCard'][]>(
      '/api/public/venues',
      { skipAuth: true },
    );
    const venues = venueSummariesFromCards(data ?? []);
    for (const venue of venues) {
      for (const branch of venue.branches) venueNames.set(branch.id, venue.name);
    }
    return venues;
  }

  async function availability(
    branchId: string,
    query: { date?: string; time?: string; partySize?: number; excludeReservationId?: string },
  ): Promise<Schemas['Yalla.Application.Reservations.BranchAvailability']> {
    const { data } = await client.get<Schemas['Yalla.Application.Reservations.BranchAvailability']>(
      `/api/branches/${branchId}/availability`,
      { query, skipAuth: true },
    );
    return data;
  }

  /**
   * `excludeReservationId`, only when there is one: the booking being changed,
   * which the server then ignores so its own table reads free. Absent is the
   * ordinary question and must stay byte-identical to it, for the server's
   * cache as much as for anything else.
   */
  function excluding(bookingId: string | undefined): { excludeReservationId?: string } {
    return bookingId ? { excludeReservationId: bookingId } : {};
  }

  return {
    // --- Browse -------------------------------------------------------------

    listVenues,

    /**
     * One venue, from the list.
     *
     * There is no by-slug venue route, so this reads the list and picks. Honest
     * at the size the list is, and the same thing the web chooser does. A venue
     * that has dropped off the list — suspended, or never published — is
     * `null`, which the screen renders as "not found" rather than as an error.
     */
    async getVenue(venueId): Promise<VenueSummary | null> {
      const venues = await listVenues();
      return venues.find((venue) => venue.id === venueId) ?? null;
    },

    /** `GET /api/public/branches/{venueSlug}/{branchSlug}`: the window and the lead time. */
    async getBookingRules({ venueSlug, branchSlug }) {
      try {
        const { data } = await client.get<Schemas['Yalla.Application.Public.PublicBranchPage']>(
          `/api/public/branches/${venueSlug}/${branchSlug}`,
          { skipAuth: true },
        );
        return {
          bookingWindowDays: data.bookingWindowDays,
          minLeadMinutes: data.policy.minLeadMinutes,
          // Absent only from a server that predates the K9 gate, which books.
          acceptsAppBookings: data.acceptsAppBookings ?? true,
          bookingMode: bookingModeFromCode(data.policy.bookingMode),
        };
      } catch (error) {
        if (error instanceof NotFoundError) return null;
        throw error;
      }
    },

    // --- Floor ----------------------------------------------------------------

    async getFloorPlan(branchId): Promise<FloorPlanData | null> {
      try {
        if (audience === 'staff') {
          const { data } = await client.get<Schemas['Yalla.Application.Floor.BranchFloorState']>(
            `/api/branches/${branchId}/tables/floor`,
          );
          return floorFromState(data);
        }
        // No date, time or party size: the backend answers for "now, one
        // person", which is exactly the room as it stands.
        return floorFromAvailability(await availability(branchId, {}));
      } catch (error) {
        if (error instanceof NotFoundError) return null;
        throw error;
      }
    },

    async getBranchTimeZone(branchId): Promise<string | null> {
      try {
        const data = await availability(branchId, {});
        return data.timeZoneId;
      } catch (error) {
        if (error instanceof NotFoundError) return null;
        throw error;
      }
    },

    async getTableAvailability({ branchId, slotUtc, partySize, timeZoneId }) {
      const { date, time } = localDateTime(slotUtc, timeZoneId ?? defaultZone);
      return availabilityFromResponse(await availability(branchId, { date, time, partySize }));
    },

    async getSlotFloor({ branchId, slotUtc, partySize, timeZoneId, excludeBookingId }) {
      try {
        // The branch's wall clock, never the device's: the backend asks in
        // local date and time terms, and a tourist's phone on Moscow time would
        // otherwise book a table three hours from the one they picked.
        const { date, time } = localDateTime(slotUtc, timeZoneId ?? defaultZone);
        return slotFloorFromResponse(
          await availability(branchId, { date, time, partySize, ...excluding(excludeBookingId) }),
        );
      } catch (error) {
        if (error instanceof NotFoundError) return null;
        throw error;
      }
    },

    /**
     * `GET /api/branches/{id}/availability/slots`, anonymous like the single
     * slot. The date is the branch's own calendar day, as the diner picked it.
     */
    async getDaySlots({ branchId, date, partySize, excludeBookingId }): Promise<DaySlots | null> {
      try {
        const { data } = await client.get<WireDaySlots>(
          `/api/branches/${branchId}/availability/slots`,
          { query: { date, partySize, ...excluding(excludeBookingId) }, skipAuth: true },
        );
        return daySlotsFromWire(data);
      } catch (error) {
        if (error instanceof NotFoundError) return null;
        throw error;
      }
    },
  };
}
