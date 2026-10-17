import type { VenueType } from '../contracts/booking';

/**
 * `Yalla.Domain.Enums.VenueType` on the wire: 1 Cafe, 2 Restaurant, 3 Bar.
 *
 * One pair, used by every mapper and gateway that reads or writes the number.
 * There were four, and they disagreed about what an unknown number meant — the
 * browse list read it as a restaurant, the console and the public page as a
 * cafe, and the console's create and edit forms wrote anything that was not a
 * restaurant as a cafe. A bar would have been saved as a cafe by one screen
 * and shown as a restaurant by another.
 */
const FROM_CODE: Readonly<Record<number, VenueType>> = {
  1: 'cafe',
  2: 'restaurant',
  3: 'bar',
};

const TO_CODE: Readonly<Record<VenueType, 1 | 2 | 3>> = {
  cafe: 1,
  restaurant: 2,
  bar: 3,
};

/**
 * The kind of place for a wire number. Anything this build has no word for is
 * read as a restaurant, the widest kind: it is the label least likely to
 * mislead somebody choosing where to eat.
 */
export function venueTypeFromCode(code: number | null | undefined): VenueType {
  return (code !== null && code !== undefined ? FROM_CODE[code] : undefined) ?? 'restaurant';
}

/** The wire number for a kind of place, for a command body or a `category` filter. */
export function venueTypeCode(type: VenueType): 1 | 2 | 3 {
  return TO_CODE[type];
}
