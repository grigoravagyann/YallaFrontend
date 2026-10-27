import type { ConsoleGateway } from './consoleGateway';
import type { ConsoleVenue } from './contracts/console';
import { venueFeatureSummary, type VenueFeatureSummary } from './contracts/branchFeatures';

/**
 * The platform venues list's feature column (2026-10-27, in place of the
 * Free/Paid tier): every branch on Full, on Basic, on the same other set, or
 * branches on different sets. The switches themselves are per branch, on the
 * branch's Features page.
 */
export function venueFeatures(venue: Pick<ConsoleVenue, 'branchFeatures'>): VenueFeatureSummary {
  return venueFeatureSummary(venue.branchFeatures ?? []);
}

/** The server's page ceiling (`PlatformService.ListVenuesAsync` clamps to 200). */
const PAGE_SIZE = 200;
/** A guard against a total that never arrives, not a real limit: 10 000 venues. */
const MAX_PAGES = 50;

/**
 * Every venue on the platform, deleted ones included, in the server's order.
 *
 * The redesigned list filters, sorts and searches in place, and counts what it
 * hides ("12 venues · 1 deleted"), so it reads the whole platform once rather
 * than a page at a time. The platform is tens of venues, not thousands.
 */
export async function listAllConsoleVenues(
  gateway: Pick<ConsoleGateway, 'listVenues'>,
): Promise<readonly ConsoleVenue[]> {
  const all: ConsoleVenue[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const answer = await gateway.listVenues({ includeDeleted: true, page, pageSize: PAGE_SIZE });
    all.push(...answer.items);
    if (answer.items.length === 0 || all.length >= answer.total) break;
  }
  return all;
}
