import type { BranchPublicProfile } from '../../contracts/publicProfile';
import { NotFoundError, ValidationError } from '../../errors';
import {
  type VenueListing,
  MAX_GALLERY_PHOTOS,
  MAX_DISTRICT_LENGTH,
  AMENITY_KEYS,
} from '../../contracts/listing';
import { validationFailed, type MockViolation, invalidRequest } from '../problems';
import { RelocationNotAllowedError } from '../../contracts/errors';
import type { ConsoleGateway } from '../../consoleGateway';
import {
  type ConsoleMockContext,
  ABOUT_MAX,
  ADDRESS_MAX,
  CUISINE_MAX,
  isHttpUrl,
  URL_MAX,
  URL_TAG,
} from './context';
import { ProblemCodes } from '../../generated/problemCodes';

/** The branch's public page and its diner-app listing. */
export function publicPageMethods(
  ctx: ConsoleMockContext,
): Pick<
  ConsoleGateway,
  'getPublicProfile' | 'updatePublicProfile' | 'getBranchListing' | 'updateBranchListing'
> {
  const {
    actingStaff,
    listingFor,
    listings,
    photoBranch,
    photosById,
    profileFor,
    profiles,
    requireBranchInVenue,
    role,
    staffFor,
    venueOfBranch,
    wait,
  } = ctx;
  return {
    // --- The reservation policy ---------------------------------------------------

    // --- The public page ------------------------------------------------------------

    async getPublicProfile(branchId): Promise<BranchPublicProfile> {
      await wait();
      requireBranchInVenue(branchId);
      return profileFor(branchId);
    },

    async updatePublicProfile({ branchId, profile }): Promise<BranchPublicProfile> {
      await wait();
      requireBranchInVenue(branchId);

      // The server's order: the picture is checked before anything is written,
      // so a foreign photo refuses the whole form and leaves the old phone and
      // switch as they were. A photo this mock never stored is "not found at
      // this branch", the same answer a menu item gets.
      const cover =
        profile.coverPhotoId === null
          ? null
          : photoBranch.get(profile.coverPhotoId) === branchId
            ? photosById.get(profile.coverPhotoId)
            : undefined;
      if (cover === undefined) {
        throw new NotFoundError({ url: `${URL_TAG}/branches/${branchId}/public-profile` });
      }

      const phone = profile.phoneE164?.replace(/[\s\-()]/gu, '') ?? '';
      if (phone !== '' && !/^\+[1-9]\d{6,14}$/u.test(phone)) {
        throw new ValidationError({
          url: `${URL_TAG}/branches/${branchId}/public-profile`,
          status: 422,
          problem: {
            type: 'about:blank',
            title: 'Validation failed',
            status: 422,
            detail: 'phoneE164 must be an E.164 number such as +37411223344.',
            code: ProblemCodes.ValidationFailed,
            traceId: 'mock',
            context: { field: 'phoneE164' },
          },
        });
      }

      const saved: BranchPublicProfile = {
        phoneE164: phone === '' ? null : phone,
        acceptsWebBookings: profile.acceptsWebBookings,
        coverPhoto: cover,
      };
      profiles.set(branchId, saved);
      return saved;
    },

    // --- The diner app listing ------------------------------------------------------

    async getBranchListing(branchId): Promise<VenueListing> {
      await wait();
      requireBranchInVenue(branchId);
      return listingFor(branchId);
    },

    /**
     * The server's order, and nothing is written for any refusal: the pin and
     * its address as a pair (422), the gallery's size and repeats (422), a
     * photo that is not this branch's (404), every other field at once (422),
     * a move by somebody who may not move the branch (403, K5), then a
     * coordinate out of range (`Branch.Relocate`'s 400).
     */
    async updateBranchListing({ branchId, listing }): Promise<VenueListing> {
      await wait();
      requireBranchInVenue(branchId);
      const url = `${URL_TAG}/branches/${branchId}/listing`;
      const existing = listingFor(branchId);

      const clean = (value: string | null | undefined) =>
        value === null || value === undefined || value.trim() === '' ? null : value.trim();

      // 1. The pin is a pair, and its street address travels with it.
      const hasLatitude = listing.latitude !== null;
      const hasLongitude = listing.longitude !== null;
      if (hasLatitude !== hasLongitude) {
        throw validationFailed(url, [
          {
            field: hasLatitude ? 'longitude' : 'latitude',
            message: 'Send latitude and longitude together to move the pin, or neither.',
            bound: 'required',
          },
        ]);
      }
      const hasPin = hasLatitude && hasLongitude;
      const address = clean(listing.address);
      if (hasPin && address === null) {
        throw validationFailed(url, [
          { field: 'address', message: 'Send the street address with the pin.', bound: 'required' },
        ]);
      }
      if (!hasPin && address !== null) {
        throw validationFailed(url, [
          {
            field: 'latitude',
            message: 'Send the pin with the street address.',
            bound: 'required',
          },
          {
            field: 'longitude',
            message: 'Send the pin with the street address.',
            bound: 'required',
          },
        ]);
      }
      if (address !== null && address.length > ADDRESS_MAX) {
        throw validationFailed(url, [
          {
            field: 'address',
            message: `At most ${ADDRESS_MAX} characters.`,
            bound: 'max',
            max: ADDRESS_MAX,
          },
        ]);
      }

      // 2. The gallery: how many, then repeats. 3. Then whose.
      const ids = listing.galleryPhotoIds;
      if (ids !== null) {
        if (ids.length > MAX_GALLERY_PHOTOS) {
          throw validationFailed(url, [
            {
              field: 'galleryPhotoIds',
              message: `A gallery holds at most ${MAX_GALLERY_PHOTOS} photos.`,
              bound: 'max',
              max: MAX_GALLERY_PHOTOS,
            },
          ]);
        }
        if (new Set(ids).size !== ids.length) {
          throw validationFailed(url, [
            {
              field: 'galleryPhotoIds',
              message: 'A photo appears in the gallery more than once.',
              bound: 'conflict',
            },
          ]);
        }
        if (ids.some((id) => photoBranch.get(id) !== branchId)) throw new NotFoundError({ url });
      }
      const gallery = ids === null ? existing.gallery : ids.map((id) => photosById.get(id)!);

      // 4. Every other field at once, as `BranchListingRules.Normalise` collects them.
      const cuisine = clean(listing.cuisine);
      const about = clean(listing.about);
      const website = clean(listing.websiteUrl);
      const district = clean(listing.district);
      const fields: MockViolation[] = [];
      if (cuisine !== null && cuisine.length > CUISINE_MAX) {
        fields.push({
          field: 'cuisine',
          message: `At most ${CUISINE_MAX} characters.`,
          bound: 'max',
          max: CUISINE_MAX,
        });
      }
      if (about !== null && about.length > ABOUT_MAX) {
        fields.push({
          field: 'about',
          message: `At most ${ABOUT_MAX} characters.`,
          bound: 'max',
          max: ABOUT_MAX,
        });
      }
      if (
        listing.priceLevel !== null &&
        (!Number.isInteger(listing.priceLevel) || listing.priceLevel < 1 || listing.priceLevel > 4)
      ) {
        fields.push({
          field: 'priceLevel',
          message: 'The price level is 1 to 4.',
          bound: 'range',
          min: 1,
          max: 4,
        });
      }
      if (website !== null && website.length > URL_MAX) {
        fields.push({
          field: 'websiteUrl',
          message: `At most ${URL_MAX} characters.`,
          bound: 'max',
          max: URL_MAX,
        });
      }
      if (website !== null && !isHttpUrl(website)) {
        fields.push({
          field: 'websiteUrl',
          message: 'The website must be an http or https address.',
        });
      }
      // The area of town is a listing field like the cuisine, not a move: a
      // manager may set it, and it is not tied to the pin (diner design gaps).
      if (district !== null && district.length > MAX_DISTRICT_LENGTH) {
        fields.push({
          field: 'district',
          message: `At most ${MAX_DISTRICT_LENGTH} characters.`,
          bound: 'max',
          max: MAX_DISTRICT_LENGTH,
        });
      }
      // Matched ignoring case and stored as the canonical key, once each.
      const amenities: string[] = [];
      for (const raw of listing.amenities) {
        const known = AMENITY_KEYS.find((key) => key.toLowerCase() === raw.trim().toLowerCase());
        if (!known) {
          fields.push({
            field: 'amenities',
            message: `'${raw}' is not an amenity. Known: ${AMENITY_KEYS.join(', ')}.`,
          });
        } else if (!amenities.includes(known)) {
          amenities.push(known);
        }
      }
      if (fields.length > 0) throw validationFailed(url, fields);

      // 5. Moving the branch — the pin or the address — is an owner's or the
      //    platform's (K5). Repeating what is stored is not a move.
      const moves =
        hasPin &&
        (listing.latitude !== existing.latitude ||
          listing.longitude !== existing.longitude ||
          address !== existing.address);
      if (moves && role !== 'platformAdmin') {
        const venueId = venueOfBranch(branchId);
        const actor = role === 'owner' && venueId !== null ? actingStaff(venueId) : null;
        const row =
          actor && venueId !== null
            ? staffFor(venueId).find((member) => member.id === actor.id)
            : undefined;
        if (!row || !row.isActive || row.role !== 'owner') {
          throw new RelocationNotAllowedError({ url });
        }
      }

      // 6. A coordinate out of range is not one of the collected fields but
      //    `Branch.Relocate`'s guard: a 400 `invalid-request` naming one parameter.
      if (listing.latitude !== null && Math.abs(listing.latitude) > 90) {
        throw invalidRequest(url, 'latitude', 'latitude is out of range.');
      }
      if (listing.longitude !== null && Math.abs(listing.longitude) > 180) {
        throw invalidRequest(url, 'longitude', 'longitude is out of range.');
      }

      const saved: VenueListing = {
        cuisine,
        about,
        priceLevel: listing.priceLevel,
        websiteUrl: website,
        amenities,
        address: hasPin && address !== null ? address : existing.address,
        district,
        latitude: listing.latitude ?? existing.latitude,
        longitude: listing.longitude ?? existing.longitude,
        gallery,
      };
      listings.set(branchId, saved);
      return saved;
    },
  };
}
