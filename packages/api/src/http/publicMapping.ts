import type { HoursBlock, HoursDay, WeekdayIndex, WeeklyHours } from '../contracts/branchSettings';
import type {
  OpenState,
  PublicBranch,
  PublicPageMeta,
  PublicVenue,
  PublicVenueHeader,
} from '../contracts/publicBranch';
import type { VenueType } from '../contracts/booking';
import type { components } from '../generated/schema';

type Schemas = components['schemas'];
export type WirePublicBranch = Schemas['Yalla.Application.Public.PublicBranchPage'];
export type WirePublicVenueCard = Schemas['Yalla.Application.Public.PublicVenueCard'];
export type WirePublicBranchMeta = Schemas['Yalla.Application.Public.PublicBranchMeta'];

/**
 * The public wire shapes to the public page's contract types.
 *
 * ## Why this file exists
 *
 * It did not, and that was the bug. `publicHttpGateway` was written before the
 * backend had any `/api/public` routes, against a guessed shape, and cast the
 * response straight to {@link PublicBranch} with no conversion. When the routes
 * landed they were a different shape at a different path, so every public page
 * 404'd — and would have rendered undefined fields even if the path had matched.
 *
 * Typing the wire side from `generated/schema.ts` rather than by hand is the
 * point: that file is generated from the backend's own swagger, so the next
 * time a field is renamed server-side this stops compiling instead of failing
 * silently in a browser.
 *
 * ## Three fields the public API does not serve
 *
 * `PublicBranchPage` carries fifteen fields. The page's contract wants
 * eighteen, and the gap is not laziness on either side — it is a genuine seam:
 *
 * - **`phoneE164`** is absent from the wire and nullable in the contract, so it
 *   maps to `null`. Both call sites already guard it, and the page simply does
 *   not render a call button.
 * - **`policy`** and **`bookingWindowDays`** are per-branch reservation settings
 *   the backend exposes only on authenticated console routes. Both are nullable
 *   in the contract for exactly this reason; see the notes on each below.
 * - **`acceptsWebBookings`** has no backend concept at all, in any route. See
 *   {@link acceptsWebBookings} below.
 *
 * Nothing here invents a value it cannot source. Where the answer is unknown the
 * mapping says so with `null` and the page degrades, rather than guessing a
 * number a diner would act on.
 */

/** `1 Cafe, 2 Restaurant`, per `Yalla.Domain.Enums.VenueType`. */
function venueTypeFromWire(type: number | undefined): VenueType {
  return type === 2 ? 'restaurant' : 'cafe';
}

/** `HH:mm:ss` on the wire, `HH:mm` in the contract — seconds are noise on a hours row. */
function clockFromWire(value: string | undefined): string {
  return (value ?? '').slice(0, 5);
}

/**
 * The wire's flat list of blocks to the contract's day-grouped shape.
 *
 * A day with no block is omitted rather than emitted empty: `closed` and "no
 * intervals" are the same fact, and `branchSettings` is explicit that a
 * zero-length `00:00-00:00` reads to the availability query as a venue open for
 * an instant at midnight.
 */
function weeklyHoursFromWire(hours: WirePublicBranch['openingHours']): WeeklyHours {
  const byDay = new Map<WeekdayIndex, HoursBlock[]>();

  for (const entry of hours ?? []) {
    const day = (entry.day ?? 0) as WeekdayIndex;
    const block: HoursBlock = {
      opensAt: clockFromWire(entry.opensAt),
      closesAt: clockFromWire(entry.closesAt),
    };
    const existing = byDay.get(day);
    if (existing) existing.push(block);
    else byDay.set(day, [block]);
  }

  const days: HoursDay[] = [];
  for (const [day, blocks] of byDay) days.push({ day, blocks });
  return days.sort((a, b) => a.day - b.day);
}

/**
 * Open or shut, from the server's answer — and no more than that.
 *
 * `isOpenNow` is computed backend-side against the branch's real clock, so it is
 * taken as given. The two timestamps are **not** derived here even though the
 * weekly hours are in hand, and `mocks/openState.ts` explains why in full: a
 * client that computed them would let a phone with a wrong date tell a visitor
 * that a shut venue is open. Null is what the contract documents for "not
 * scheduled", and `LiveCount` already falls back to a plain open/closed line.
 */
function openStateFromWire(wire: WirePublicBranch): OpenState {
  return { isOpen: wire.isOpenNow ?? false, closesAtUtc: null, opensAtUtc: null };
}

function venueHeaderFromWire(wire: WirePublicBranch): PublicVenueHeader {
  return {
    /*
     * The slug, because the wire carries no venue id and this surface is
     * addressed by slug on purpose — `publicBranch.ts` opens with that rule.
     * Nothing on the public page reads `venue.id`; it is here to satisfy the
     * shared header shape.
     */
    id: wire.venueSlug ?? '',
    slug: wire.venueSlug ?? '',
    name: wire.venueName ?? '',
    type: venueTypeFromWire(wire.venueType),
    // Neither is on the public wire. Both are nullable and both call sites guard.
    description: null,
    coverPhoto: null,
  };
}

/**
 * One branch's public page.
 *
 * `receivedAtUtc` is the caller's clock at the moment the response arrived, and
 * it stands in for `asOfUtc`, which this route does not send. `LiveCount` uses
 * it only to age the free-table count ("as of a minute ago"), so a round-trip's
 * worth of skew is immaterial — and a stale count that admits its age is the
 * whole point of the field.
 */
export function publicBranchFromWire(wire: WirePublicBranch, receivedAtUtc: string): PublicBranch {
  return {
    venue: venueHeaderFromWire(wire),

    id: wire.branchId ?? '',
    slug: wire.branchSlug ?? '',
    name: wire.branchName ?? '',

    /*
     * Always `live`, and this is derived rather than assumed: `PublicVenueQuery`
     * filters on `b.IsActive && b.Venue.IsActive && SuspendedAtUtc == null &&
     * DeletedAtUtc == null`, so a branch this route returns at all is by
     * definition live. A suspended one answers 404, which `resolveBranch` turns
     * into `null` and the route renders as "not available".
     */
    status: 'live',

    addressLine: wire.address ?? '',
    latitude: wire.latitude ?? null,
    longitude: wire.longitude ?? null,
    // Not on the public wire. Nullable in the contract; both call sites guard.
    phoneE164: null,

    timeZoneId: wire.timeZoneId ?? '',
    openState: openStateFromWire(wire),
    weeklyHours: weeklyHoursFromWire(wire.openingHours),

    freeTables: wire.freeTableCount ?? 0,
    totalTables: wire.tableCount ?? 0,
    asOfUtc: receivedAtUtc,

    /*
     * The four reservation numbers live on an authenticated console route, not
     * this one. Null rather than a plausible default: they drive the copy in the
     * booking flow ("free cancellation up to 2 hours before"), and a sentence
     * stating the wrong cancellation window is worse than no sentence.
     */
    policy: null,

    /*
     * How far ahead this branch takes bookings — also console-only.
     *
     * Null leaves the date input unbounded, which the original comment on this
     * field warns against. It is still the right answer: the server enforces the
     * window and `availability` names `OutsideBookingWindow` as a rejection
     * reason, which `RoomSection` already renders as a spoken sentence *before*
     * a table is chosen. A guessed `max` would silently forbid days a venue
     * really does take, which is the worse of the two failures.
     */
    bookingWindowDays: null,

    /*
     * True, because the backend has no concept of a branch that refuses web
     * bookings — not on this route, not anywhere. There is no
     * `acceptsWebBookings` field in the swagger document and nothing gates
     * reservations on subscription tier, so the server accepts a booking from
     * any live branch.
     *
     * This flag was written for a product rule ("false for a venue on the free
     * tier") that was never built server-side. Mapping it to `false` would hide
     * a working feature; mapping it to `true` matches what the API actually
     * does. When the backend grows the rule, this reads it instead.
     */
    acceptsWebBookings: true,
  };
}

/**
 * The venue-level chooser, assembled from the list route.
 *
 * `/api/public/venues` returns every published venue with its branches, and
 * there is no by-slug route to ask instead. Filtering client-side is honest for
 * the size this list is today and keeps the page working; if the list ever grows
 * past a page, the fix is a backend route, not paging on the client.
 */
export function publicVenueFromCards(
  cards: readonly WirePublicVenueCard[],
  venueSlug: string,
): PublicVenue | null {
  const card = cards.find((entry) => entry.venueSlug === venueSlug);
  if (!card) return null;

  return {
    venue: {
      id: card.venueSlug ?? '',
      slug: card.venueSlug ?? '',
      name: card.name ?? '',
      type: venueTypeFromWire(card.type),
      description: null,
      coverPhoto: null,
    },
    branches: (card.branches ?? []).map((branch) => ({
      slug: branch.branchSlug ?? '',
      name: branch.name ?? '',
      addressLine: branch.address ?? '',
      // Same derivation as the branch page: the list route filters to live only.
      status: 'live' as const,
      openState: { isOpen: branch.isOpenNow ?? false, closesAtUtc: null, opensAtUtc: null },
      freeTables: branch.freeTableCount ?? 0,
      // Not on the card shape. Null, not zero: zero is a denominator and would
      // render as "7 of 0 tables free".
      totalTables: null,
      // The card carries no zone. The branch page resolves the real one.
      timeZoneId: '',
    })),
  };
}

/**
 * The unfurl card.
 *
 * The wire sends a canonical *path*; every unfurler drops a relative URL, so it
 * is resolved against the origin the caller is actually being served from. The
 * caller passes that as `canonicalUrl` — its own absolute address for this page
 * — and the backend's path wins over its query string and fragment.
 */
export function publicPageMetaFromWire(
  wire: WirePublicBranchMeta,
  canonicalUrl: string,
): PublicPageMeta {
  let canonical = canonicalUrl;
  if (wire.canonicalPath) {
    try {
      canonical = new URL(wire.canonicalPath, canonicalUrl).toString();
    } catch {
      // A path the URL parser refuses is not worth failing the page's tags over.
    }
  }

  return {
    title: wire.title ?? '',
    description: wire.description ?? '',
    imageUrl: wire.imageUrl ?? null,
    canonicalUrl: canonical,
    /*
     * `og:site_name` is the site, not the venue — the venue is already the
     * title. This is the product's own name, which is a fact rather than a
     * default, so it does not need the backend to send it.
     */
    siteName: 'Yalla',
    /*
     * The wire sends the og form (`hy_AM`); the contract means the short code,
     * which is what `OG_LOCALE` in `public/meta.ts` maps back up and what a
     * `<html lang>` can legally hold. An underscore tag is not valid BCP-47.
     */
    locale: (wire.locale ?? '').split('_')[0] ?? '',
  };
}
