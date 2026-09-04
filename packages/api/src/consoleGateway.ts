import type {
  ConsoleUser,
  ConsoleVenue,
  ConsoleVenueDetail,
  CreateVenueCommand,
  ListVenuesQuery,
  Page,
  SubscriptionTier,
} from './contracts/console';

/**
 * Everything the web console needs from a data source.
 *
 * Separate from {@link YallaGateway} on purpose: that one describes what a
 * diner's phone needs, and nothing in it should be able to suspend a venue.
 * Both are implemented twice — once against mock data, once over HTTP — and
 * both are swapped in exactly one module.
 *
 * Every method here is scoped **server-side** by the caller's token. The client
 * never passes a venue or branch id it did not receive from
 * {@link getCurrentUser} or from a list the server already filtered.
 */
export interface ConsoleGateway {
  /**
   * Who is signed in, with the scope their token grants.
   *
   * The navigation is built from this. A waiter's router has no platform route
   * at all — not a hidden one — so there is nothing to reveal by editing CSS or
   * typing a URL.
   */
  getCurrentUser(): Promise<ConsoleUser>;

  // --- Platform -----------------------------------------------------------
  /** Paged, searchable. Suspended venues are included; the team needs to see them. */
  listVenues(query: ListVenuesQuery): Promise<Page<ConsoleVenue>>;

  getVenue(venueId: string): Promise<ConsoleVenueDetail | null>;

  /**
   * @throws {SlugTakenError} the web address is already in use.
   */
  createVenue(command: CreateVenueCommand): Promise<ConsoleVenueDetail>;

  /** Reversible, and mostly about billing. */
  suspendVenue(input: { venueId: string; commandId: string }): Promise<ConsoleVenueDetail>;
  resumeVenue(input: { venueId: string; commandId: string }): Promise<ConsoleVenueDetail>;

  /**
   * Soft delete.
   *
   * @throws {VenueHasOpenTabsError} a table is still mid-service. The error
   * carries which tabs, because "cannot delete" alone is not actionable.
   */
  deleteVenue(input: { venueId: string; commandId: string }): Promise<ConsoleVenueDetail>;

  /** Platform admin only; an owner cannot change what they are paying for. */
  setBranchTier(input: {
    branchId: string;
    tier: SubscriptionTier;
    commandId: string;
  }): Promise<ConsoleVenueDetail>;
}
