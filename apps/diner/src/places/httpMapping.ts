import {
  NO_TAKEAWAY,
  haversineKm,
  type BranchDetail,
  type BranchListing,
  type BranchMenu,
  type BranchReview,
  type BranchReviewPage,
  type BranchRoom,
  type BranchTableMarker,
  type Photo,
} from '@yalla/api';
import { branchDayKey, type Locale } from '@yalla/format';
import {
  openStateFor,
  type Coordinates,
  type MenuSection,
  type OpeningHours,
  type Place,
  type PlaceRoom,
  type PlaceSpecialDay,
  type Review,
  type ReviewPage,
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

/** The large rendition of a photo: the hero, and a room photo under its pins. */
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
    isBookable: marker.isBookable,
    // Tables have seats and no minimum party; one person may book any table.
    capacityMin: 1,
    capacityMax: marker.seats,
    x: marker.x,
    y: marker.y,
  };
}

/** The server's rooms, in its order, each photo with the pins placed on it. */
export function roomsFromApi(rooms: readonly BranchRoom[]): PlaceRoom[] {
  return rooms
    .map((room) => ({
      roomId: room.roomId,
      name: room.name,
      photos: room.photos.flatMap(({ photo, tables }) => {
        const url = coverUrl(photo);
        // A photo with no picture to draw has nowhere to put a pin.
        if (!url) return [];
        return [
          {
            photoId: photo.photoId,
            url,
            thumbUrl: photo.thumbnailUrl || photo.cardUrl || url,
            width: photo.width ?? null,
            height: photo.height ?? null,
            tables: tables.map(markerFromApi),
          },
        ];
      }),
    }))
    .filter((room) => room.photos.length > 0);
}

/**
 * `timeZoneId` is the branch's: a review posted at 01:40 in Yerevan is dated
 * the 16th there, and was shown as the 15th while the date was cut from the
 * UTC instant.
 */
export function reviewFromApi(review: BranchReview, timeZoneId: string): Review {
  return {
    id: review.reviewId,
    author: review.authorName,
    rating: review.rating,
    text: review.text ?? '',
    date: branchDayKey(review.updatedAtUtc || review.createdAtUtc, timeZoneId),
    edited: review.edited,
    reply: review.reply
      ? {
          text: review.reply.text,
          authorName: review.reply.authorName,
          authorRole: review.reply.authorRole,
          date: branchDayKey(review.reply.updatedAtUtc || review.reply.createdAtUtc, timeZoneId),
          edited: review.reply.edited,
          reviewEditedAfter:
            Date.parse(review.updatedAtUtc) > Date.parse(review.reply.updatedAtUtc),
        }
      : null,
  };
}

export function reviewPageFromApi(page: BranchReviewPage, timeZoneId: string): ReviewPage {
  return {
    reviews: page.reviews.map((review) => reviewFromApi(review, timeZoneId)),
    total: page.reviewCount,
    page: page.page,
    pageSize: page.pageSize,
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

/** The special days ahead (VC3), each replacing its date's weekly hours. */
export function specialDaysFromApi(detail: BranchDetail): PlaceSpecialDay[] {
  return (detail.specialDays ?? []).map((day) => ({
    date: day.date,
    note: day.note,
    blocks: day.blocks.map((block) => ({
      open: block.opensAt.slice(0, 5),
      close: block.closesAt.slice(0, 5),
    })),
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

/** A card on Explore, search, the map and Favorites: everything the list knows, no hours. */
export function placeFromListing(listing: BranchListing, context: PlaceMappingContext): Place {
  const cover = listing.coverPhoto?.cardUrl ?? listing.coverPhoto?.fullUrl;
  return {
    id: listing.branchId,
    venueId: listing.venueId,
    venueSlug: listing.venueSlug,
    branchSlug: listing.branchSlug,
    venueName: listing.venueName,
    branchName: listing.branchName,
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
    coords: coordsOf(listing),
    address: listing.address,
    // Blank is unset, as the server's own rule for the field.
    district: listing.district?.trim() || null,
    timeZoneId: listing.timeZoneId,
    hours: [],
    amenities: [],
    about: '',
    // The list does not say; the place's own page does.
    acceptsAppBookings: null,
    reviews: [],
    rooms: [],
    features: listing.features,
  };
}

/** The details screen: the listing plus hours, gallery, reviews and rooms. The menu is its own read. */
export function placeFromDetail(detail: BranchDetail, context: PlaceMappingContext): Place {
  const base = placeFromListing(detail.listing, context);
  const hours = hoursFromApi(detail);
  const specialDays = specialDaysFromApi(detail);
  const cover = coverUrl(detail.listing.coverPhoto);
  return {
    ...base,
    // Hours are known here, so "open" and today's label come from them; with
    // none published, the server's flag stands.
    openState:
      hours.length > 0
        ? {
            ...openStateFor(hours, context.now, base.timeZoneId, context.locale, specialDays),
            // The server's "open now" is the truth (it knows the special days
            // and the clock); the hours only say until or from when.
            isOpen: base.openState.isOpen,
          }
        : base.openState,
    photos: [...(cover ? [cover] : []), ...detail.gallery.map((photo) => photo.fullUrl)],
    ...(detail.phoneE164 ? { phone: detail.phoneE164 } : {}),
    ...(detail.websiteUrl ? { website: detail.websiteUrl } : {}),
    hours,
    specialDays,
    amenities: detail.amenities,
    about: detail.about ?? '',
    acceptsAppBookings: detail.acceptsAppBookings,
    bookingMode: detail.bookingMode ?? 'chooseTable',
    takeaway: detail.takeaway ?? NO_TAKEAWAY,
    reviews: detail.recentReviews.map((review) => reviewFromApi(review, base.timeZoneId)),
    rooms: roomsFromApi(detail.rooms),
  };
}
