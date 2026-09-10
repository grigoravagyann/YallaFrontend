import { instantFromZonedClock, type TimeZone } from '@yalla/format';
import type { HoursBlock, HoursDay, WeekdayIndex, WeeklyHours } from '../contracts/branchSettings';
import type {
  ManagedBooking,
  OpenState,
  PublicBranch,
  PublicBranchPolicy,
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
export type WirePublicBooking = Schemas['Yalla.Application.Public.PublicBookingView'];

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
 * point: that file is generated from the backend's own swagger, so the next time
 * a field is renamed server-side this stops compiling instead of failing
 * silently in a browser. `check-gateway-schema.mjs` enforces the other half —
 * that the URLs are ones the backend actually serves.
 *
 * ## Two things about this wire that are easy to get wrong
 *
 * **Enums are integers.** `venueType`, `status`, a table's `shape` and a day's
 * `day` all arrive as numbers. Every one has a named mapping below rather than a
 * cast, because the numbers do not line up with the string unions by accident.
 *
 * **Absent is not null.** The API serialises with
 * `DefaultIgnoreCondition = WhenWritingNull`, so an unset `phoneE164` is missing
 * from the JSON rather than present as `null`. `?? null` covers both, and
 * neither is a failure.
 */

/** `1 Cafe, 2 Restaurant`, per `Yalla.Domain.Enums.VenueType`. */
function venueTypeFromWire(type: number | undefined): VenueType {
  return type === 2 ? 'restaurant' : 'cafe';
}

/** `HH:mm:ss` on the wire, `HH:mm` in the contract — seconds are noise on an hours row. */
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

function policyFromWire(wire: WirePublicBranch['policy']): PublicBranchPolicy {
  return {
    turnTimeMinutes: wire?.turnTimeMinutes ?? 0,
    minLeadMinutes: wire?.minLeadMinutes ?? 0,
    cancellationDeadlineMinutes: wire?.cancellationDeadlineMinutes ?? 0,
  };
}

/** One branch's public page. */
export function publicBranchFromWire(wire: WirePublicBranch): PublicBranch {
  return {
    venue: venueHeaderFromWire(wire),

    id: wire.branchId ?? '',
    slug: wire.branchSlug ?? '',
    name: wire.branchName ?? '',

    /*
     * Always `live`.
     *
     * The wire used to carry a `status` as well — `PublicBranchStatus`, `1 Open,
     * 2 Closed`, which `PublicVenueQuery` set as `isOpenNow ? Open : Closed` —
     * and this mapper never read it: it restated the opening hours, it was not
     * an availability gate, and mapping `2` onto anything `BranchRoute` treats
     * as unavailable would blank the page for every branch outside its opening
     * hours, which is exactly the branch that still wants its menu read and its
     * hours checked. The backend has since dropped the field, so `isOpenNow`
     * (read into `openState` below) is the only open-or-closed signal there is.
     *
     * There is no suspended state to map either, by design: a suspended venue,
     * an inactive branch and a wrong slug all answer 404 identically, because a
     * page that distinguished them would publish a customer's billing status to
     * anybody who guessed a slug. So a branch this route returns at all is live,
     * and Open/Closed is `openState.isOpen`'s job.
     */
    status: 'live',

    addressLine: wire.address ?? '',
    latitude: wire.latitude ?? null,
    longitude: wire.longitude ?? null,
    // Absent rather than null when unset — see the header on WhenWritingNull.
    phoneE164: wire.phoneE164 ?? null,

    timeZoneId: wire.timeZoneId ?? '',
    openState: openStateFromWire(wire),
    weeklyHours: weeklyHoursFromWire(wire.openingHours),

    freeTables: wire.freeTableCount ?? 0,
    totalTables: wire.tableCount ?? 0,
    /*
     * Server-stamped beside the reads it describes. The page is cached for
     * seconds and the link is shared for days, so the count says how old it is
     * rather than implying it is live.
     */
    asOfUtc: wire.asOfUtc ?? '',

    policy: policyFromWire(wire.policy),
    bookingWindowDays: wire.bookingWindowDays ?? 0,

    /*
     * Read live server-side, and `false` by default there. Taken exactly as
     * sent, never defaulted to `true` to keep a form on screen: a venue that
     * switches bookings off must not have its page go on offering a button the
     * reservation service will refuse.
     */
    acceptsWebBookings: wire.acceptsWebBookings ?? false,
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
      // Same reasoning as the branch page: this route publishes live branches only.
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
 * is resolved against the origin the caller is actually being served from.
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

/**
 * `ReservationStatus` to the five states the manage link renders.
 *
 * `Seated` folds into `confirmed`: the booking stands and the table is theirs,
 * which is what the page says either way. Both cancellations fold into
 * `cancelled` — who cancelled is the venue's business, and a diner reading their
 * own link already knows whether it was them.
 */
function bookingStatusFromWire(status: number | undefined): ManagedBooking['status'] {
  switch (status) {
    case 1:
      return 'pendingApproval';
    case 5:
      return 'completed';
    case 6:
    case 7:
      return 'cancelled';
    case 8:
      return 'noShow';
    // 2 Confirmed, 4 Seated, and anything a later backend adds: the booking
    // stands until something says otherwise.
    default:
      return 'confirmed';
  }
}

/**
 * The booking's start as an instant, from the wall clock the wire sends.
 *
 * The endpoint reports `localDate` and `localStartTime` in the branch's zone
 * rather than a UTC instant, so the two are resolved through the branch's zone —
 * never the reader's, who is routinely in a different one.
 */
function slotInstant(
  localDate: string | undefined,
  localStartTime: string | undefined,
  timeZoneId: string,
): string {
  if (!localDate || !localStartTime || !timeZoneId) return '';

  const [year, month, day] = localDate.split('-').map(Number);
  const [hour, minute] = localStartTime.split(':').map(Number);
  const parts = [year, month, day, hour, minute];
  if (parts.some((part) => part === undefined || Number.isNaN(part))) return '';

  return instantFromZonedClock(
    {
      year: year as number,
      month: month as number,
      day: day as number,
      hour: hour as number,
      minute: minute as number,
    },
    timeZoneId as TimeZone,
  ).toISOString();
}

/**
 * One booking as its manage link shows it.
 *
 * `venueSlug` and `branchSlug` come from the caller rather than the wire,
 * because the manage URL is `/{venueSlug}/{branchSlug}/booking/{token}` — the
 * route already has both from its own address and the endpoint does not send
 * them. That is a real source, not a guess.
 */
export function managedBookingFromWire(
  wire: WirePublicBooking,
  slugs: { readonly venueSlug: string; readonly branchSlug: string },
): ManagedBooking {
  const timeZoneId = wire.timeZoneId ?? '';

  return {
    code: wire.code ?? '',
    status: bookingStatusFromWire(wire.status),

    venueName: wire.venueName ?? '',
    venueSlug: slugs.venueSlug,
    branchName: wire.branchName ?? '',
    branchSlug: slugs.branchSlug,
    addressLine: wire.branchAddress ?? '',
    timeZoneId,

    tableLabel: wire.tableLabel ?? '',
    // Not published on the manage link, and nullable in the contract.
    floorAreaName: null,
    partySize: wire.partySize ?? 0,
    slotUtc: slotInstant(wire.localDate, wire.localStartTime, timeZoneId),
    // No turn time on this route — see the note on the contract field.
    endsAtUtc: null,
    freeCancellationUntilUtc: wire.cancellationDeadlineUtc ?? '',

    /*
     * Server-decided, and taken as sent. Lateness must not turn this false:
     * cancelling ten minutes before is far better for the venue than a no-show,
     * so a late cancellation is a sentence on the page, never a disabled button.
     * `cancelledLate` is what says it happened late.
     */
    canCancel: wire.canCancel ?? false,
  };
}

/** Whether a cancellation was recorded as late — a sentence on the page, not a refusal. */
export function cancelledLate(wire: WirePublicBooking): boolean {
  return wire.cancelledAfterDeadline ?? false;
}
