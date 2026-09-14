import {
  haversineKm,
  type BranchDetail,
  type BranchListing,
  type BranchMenu,
  type BranchReview,
  type BranchTableMarker,
  type Photo,
} from '@yalla/api';
import type { Locale } from '@yalla/format';
import {
  openStateFor,
  type Coordinates,
  type MenuSection,
  type OpeningHours,
  type Place,
  type Review,
  type TablePhotoMarker,
} from './model';

/**
 * The backend's branch shapes onto the app's `Place`.
 *
 * Pure, so it is tested without a phone. The one rule that runs through all of
 * it: what the server did not say stays unknown. No rating yet is `null`, not
 * 0.0 stars; no coordinates is `null`, not a pin in the middle of Yerevan.
 */

export interface PlaceMappingContext {
  readonly now: Date;
  readonly locale: Locale;
  /** The phone's position, when the diner allowed it. */
  readonly position: Coordinates | null;
}

function coordsOf(listing: BranchListing): Coordinates | null {
  return listing.latitude !== null && listing.longitude !== null
    ? { latitude: listing.latitude, longitude: listing.longitude }
    : null;
}

/** The server's figure when it computed one, else ours from the phone's fix; else unknown. */
export function distanceFor(listing: BranchListing, position: Coordinates | null): number | null {
  if (listing.distanceKm !== null) return listing.distanceKm;
  const coords = coordsOf(listing);
  if (!coords || !position) return null;
  return Math.round(haversineKm(position, coords) * 10) / 10;
}

/**
 * The large rendition of a photo: the hero, and the picture table markers are
 * placed on. The detail and the markers both name the cover this way, so the
 * two can be compared to tell whether the cover changed between their reads.
 */
export function coverUrl(photo: Photo | null | undefined): string | null {
  return photo ? photo.fullUrl || photo.cardUrl || null : null;
}

/**
 * "Venue · Branch" whenever the branch has a name of its own, so two branches
 * of one venue can be told apart on a card, a pin or a favourite — the way the
 * Orders tab already writes it.
 */
export function placeName(listing: Pick<BranchListing, 'venueName' | 'branchName'>): string {
  const branch = (listing.branchName ?? '').trim();
  const venue = listing.venueName.trim();
  return branch && branch.toLocaleLowerCase() !== venue.toLocaleLowerCase()
    ? `${listing.venueName} · ${branch}`
    : listing.venueName;
}

export function markerFromApi(marker: BranchTableMarker): TablePhotoMarker {
  return {
    tableId: marker.tableId,
    label: marker.label,
    status: marker.status,
    // Tables have seats and no minimum party; one person may book any table.
    capacityMin: 1,
    capacityMax: marker.seats,
    x: marker.x,
    y: marker.y,
  };
}

export function reviewFromApi(review: BranchReview): Review {
  return {
    id: review.reviewId,
    author: review.authorName,
    rating: review.rating,
    text: review.text ?? '',
    date: (review.updatedAtUtc || review.createdAtUtc).slice(0, 10),
  };
}

/**
 * Several blocks a day are allowed on the wire, and every one is kept:
 * `openStateFor` and the slot picker read them all.
 */
export function hoursFromApi(detail: BranchDetail): OpeningHours[] {
  return detail.openingHours.map((block) => ({
    day: block.day,
    open: block.opensAt.slice(0, 5),
    close: block.closesAt.slice(0, 5),
  }));
}

export function menuFromApi(menu: BranchMenu | null): MenuSection[] {
  if (!menu) return [];
  return [...menu.categories]
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .filter((category) => category.items.length > 0)
    .map((category) => ({
      section: category.name,
      items: category.items.map((item) => ({
        name: item.name,
        price: item.priceDram,
        ...(item.description ? { description: item.description } : {}),
      })),
    }));
}

/** A card on Explore, search and the map: everything the list knows, no hours. */
export function placeFromListing(listing: BranchListing, context: PlaceMappingContext): Place {
  const cover = listing.coverPhoto?.cardUrl ?? listing.coverPhoto?.fullUrl;
  return {
    id: listing.branchId,
    venueId: listing.venueId,
    name: placeName(listing),
    type: listing.venueType,
    cuisine: listing.cuisine ?? '',
    distanceKm: distanceFor(listing, context.position),
    rating: listing.rating,
    ratingCount: listing.reviewCount,
    badges: listing.badges,
    // The list carries no hours, so the server's own "open now" is the answer.
    openState: { isOpen: listing.isOpenNow, todayLabel: '' },
    photos: cover ? [cover] : [],
    coverPhoto: coverUrl(listing.coverPhoto),
    coords: coordsOf(listing),
    address: listing.address,
    timeZoneId: listing.timeZoneId,
    hours: [],
    amenities: [],
    about: '',
    menu: [],
    reviews: [],
    tables: [],
  };
}

/** The details screen: the listing plus hours, gallery, reviews, markers and menu. */
export function placeFromDetail(
  detail: BranchDetail,
  menu: BranchMenu | null,
  context: PlaceMappingContext,
): Place {
  const base = placeFromListing(detail.listing, context);
  const hours = hoursFromApi(detail);
  const cover = coverUrl(detail.listing.coverPhoto);
  return {
    ...base,
    // Hours are known here, so "open" and today's label come from them; with
    // none published, the server's flag stands.
    openState:
      hours.length > 0
        ? openStateFor(hours, context.now, base.timeZoneId, context.locale)
        : base.openState,
    photos: [...(cover ? [cover] : []), ...detail.gallery.map((photo) => photo.fullUrl)],
    // Said outright: with no cover, the first photo is a gallery picture.
    coverPhoto: cover,
    ...(detail.phoneE164 ? { phone: detail.phoneE164 } : {}),
    ...(detail.websiteUrl ? { website: detail.websiteUrl } : {}),
    hours,
    amenities: detail.amenities,
    about: detail.about ?? '',
    menu: menuFromApi(menu),
    reviews: detail.recentReviews.map(reviewFromApi),
    // Markers only mean something on the cover; without one there is nothing to draw on.
    tables: cover ? detail.tableMarkers.map(markerFromApi) : [],
  };
}
