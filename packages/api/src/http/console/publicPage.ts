import type { ConsoleGateway } from '../../consoleGateway';
import type { BranchPublicProfile } from '../../contracts/publicProfile';
import type { VenueListing } from '../../contracts/listing';
import { absolutePhoto } from '../photoUrl';
import { RelocationNotAllowedError } from '../../contracts/errors';
import { ApiError } from '../../errors';
import type { components } from '../../generated/schema';
import { photo } from '../venueSettingsMapping';
import { ProblemCodes } from '../../generated/problemCodes';
import { type ConsoleHttpContext, BRANCHES } from './context';

type Schemas = components['schemas'];
type WirePublicProfile = Schemas['Yalla.Application.BranchSettings.PublicProfileView'];
type WireListing = Schemas['Yalla.Application.BranchSettings.BranchListingView'];
type WireListingCommand = Schemas['Yalla.Application.BranchSettings.BranchListingCommand'];

/**
 * The public page's settings, with the absent-when-null fields made explicit
 * and the cover's links resolved against the API — see `photoUrl.ts`.
 */
function publicProfile(view: WirePublicProfile, baseUrl: string): BranchPublicProfile {
  return {
    phoneE164: view.phoneE164 ?? null,
    acceptsWebBookings: view.acceptsWebBookings,
    coverPhoto: view.coverPhoto ? absolutePhoto(baseUrl, photo(view.coverPhoto)) : null,
  };
}

/** The listing with absent fields made explicit and gallery links made absolute. */
function branchListing(view: WireListing, baseUrl: string): VenueListing {
  return {
    cuisine: view.cuisine ?? null,
    about: view.about ?? null,
    priceLevel: view.priceLevel ?? null,
    websiteUrl: view.websiteUrl ?? null,
    amenities: view.amenities ?? [],
    address: view.address,
    district: view.district?.trim() || null,
    latitude: view.latitude,
    longitude: view.longitude,
    gallery: (view.gallery ?? []).map((item) => absolutePhoto(baseUrl, photo(item))),
  };
}

function blankToNull(value: string | null): string | null {
  return value === null || value.trim() === '' ? null : value.trim();
}

export function publicPageMethods(
  ctx: ConsoleHttpContext,
): Pick<
  ConsoleGateway,
  'getPublicProfile' | 'updatePublicProfile' | 'getBranchListing' | 'updateBranchListing'
> {
  const { client } = ctx;
  return {
    // --- The public page ------------------------------------------------------------

    async getPublicProfile(branchId: string): Promise<BranchPublicProfile> {
      const { data } = await client.get<WirePublicProfile>(
        `${BRANCHES}/${branchId}/public-profile`,
      );
      return publicProfile(data, client.baseUrl);
    },

    async updatePublicProfile({ branchId, profile }): Promise<BranchPublicProfile> {
      // The server omits null fields on the way out and takes them on the way
      // in; both the phone and the picture clear with an explicit null.
      const { data } = await client.put<WirePublicProfile>(
        `${BRANCHES}/${branchId}/public-profile`,
        {
          phoneE164: profile.phoneE164,
          acceptsWebBookings: profile.acceptsWebBookings,
          coverPhotoId: profile.coverPhotoId,
        },
      );
      return publicProfile(data, client.baseUrl);
    },

    // --- The diner app listing ------------------------------------------------------

    async getBranchListing(branchId: string): Promise<VenueListing> {
      const { data } = await client.get<WireListing>(`${BRANCHES}/${branchId}/listing`);
      return branchListing(data, client.baseUrl);
    },

    async updateBranchListing({ branchId, listing }): Promise<VenueListing> {
      // Every field is replaced, so blanks travel as explicit nulls. The
      // address travels with the pin (K5): the server refuses either half alone.
      try {
        const { data } = await client.put<WireListing>(`${BRANCHES}/${branchId}/listing`, {
          cuisine: blankToNull(listing.cuisine),
          about: blankToNull(listing.about),
          priceLevel: listing.priceLevel,
          websiteUrl: blankToNull(listing.websiteUrl),
          amenities: [...listing.amenities],
          galleryPhotoIds: listing.galleryPhotoIds === null ? null : [...listing.galleryPhotoIds],
          address: blankToNull(listing.address),
          // Always sent: every field here is replaced, and an absent district
          // would clear the one the venue set.
          district: blankToNull(listing.district),
          latitude: listing.latitude,
          longitude: listing.longitude,
        } satisfies WireListingCommand);
        return branchListing(data, client.baseUrl);
      } catch (error) {
        if (error instanceof ApiError && error.code === ProblemCodes.RelocationNotAllowed) {
          throw new RelocationNotAllowedError({ url: error.url, requestId: error.requestId });
        }
        throw error;
      }
    },
  };
}
