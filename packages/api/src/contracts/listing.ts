import type { Photo } from './menuAdmin';

/** The amenity keys the server accepts, in the order the form shows them. */
export const AMENITY_KEYS = ['outdoorSeating', 'wifi', 'parking', 'cardPayment', 'vegan'] as const;
export type AmenityKey = (typeof AMENITY_KEYS)[number];

/** The most gallery photos a branch may have beyond its cover. */
export const MAX_GALLERY_PHOTOS = 12;

/**
 * What a branch says about itself on the diner app's browse screens.
 *
 * Separate from the public profile: the cover photo, phone and booking switch
 * stay there. Absent-when-null wire fields are made explicit nulls here.
 */
export interface VenueListing {
  readonly cuisine: string | null;
  readonly about: string | null;
  /** 1–4, or null when unset. */
  readonly priceLevel: number | null;
  readonly websiteUrl: string | null;
  readonly amenities: readonly string[];
  readonly address: string;
  readonly latitude: number;
  readonly longitude: number;
  /** Pictures beyond the cover, in display order. */
  readonly gallery: readonly Photo[];
}

/** The listing as written. Every field is replaced; null or blank clears. */
export interface VenueListingInput {
  readonly cuisine: string | null;
  readonly about: string | null;
  readonly priceLevel: number | null;
  readonly websiteUrl: string | null;
  readonly amenities: readonly string[];
  /** Photos uploaded for this branch, ordered, at most 12. Null leaves the gallery; [] clears it. */
  readonly galleryPhotoIds: readonly string[] | null;
  /** Latitude and longitude together or neither. */
  readonly latitude: number | null;
  readonly longitude: number | null;
}
