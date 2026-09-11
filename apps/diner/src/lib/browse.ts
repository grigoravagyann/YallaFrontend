import type { VenueSummary } from '@yalla/api';

/**
 * Two decisions the browse screens make, kept out of the components so they
 * can be pinned by a test.
 */

export type VenueScreenState = 'offline' | 'loading' | 'error' | 'notFound' | 'ready';

/**
 * What the venue screen shows.
 *
 * `notFound` is its own state, apart from "no branches": a venue that resolves
 * to `null` — an old link, or one suspended since the list was cached — does
 * not exist any more, and telling the diner it "has no locations listed yet"
 * describes a real venue that is not there.
 */
export function venueScreenState(input: {
  readonly offline: boolean;
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly venue: VenueSummary | null | undefined;
}): VenueScreenState {
  if (input.offline) return 'offline';
  if (input.isLoading) return 'loading';
  if (input.isError) return 'error';
  return input.venue ? 'ready' : 'notFound';
}

/**
 * Where the branch's time zone comes from, and whether to go and ask for it.
 *
 * The browse card carries the zone, so a branch reached from its venue has it
 * straight away. A branch reached any other way — a deep link with no
 * `venueId`, or a venue that no longer lists it — asks the branch itself.
 * **Never a literal.** Guessing `Asia/Yerevan` is harmless for exactly as long
 * as every venue is in Yerevan, and turns a slot into the wrong wall-clock time
 * the day one is not.
 *
 * `zone` is `null` until one of the two sources answers, and the caller holds
 * every zone-dependent read until then.
 */
export function branchZoneSource(input: {
  readonly venueId: string | undefined;
  /** Where the venue read stands; `pending` also covers a read that never ran. */
  readonly venueStatus: 'pending' | 'error' | 'success';
  readonly zoneFromVenue: string | null;
  readonly zoneFromBranch: string | null | undefined;
}): { readonly zone: string | null; readonly lookup: boolean } {
  if (input.zoneFromVenue) return { zone: input.zoneFromVenue, lookup: false };

  const venueCannotSay = !input.venueId || input.venueStatus !== 'pending';
  return { zone: input.zoneFromBranch ?? null, lookup: venueCannotSay };
}
