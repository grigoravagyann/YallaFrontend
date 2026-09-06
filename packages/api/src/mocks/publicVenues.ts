import type { WeeklyHours } from '../contracts/branchSettings';
import type { PublicBranchStatus, PublicPhoto } from '../contracts/publicBranch';
import { mockVenues } from './venues';

/**
 * The half of a venue that only the public page shows.
 *
 * Kept beside `venues.ts` rather than inside it because the two answer to
 * different consumers. `venues.ts` is the diner app's world — ids, floors,
 * table states — and every screen that reads it is behind a phone. This file is
 * what a venue publishes to strangers: a slug, an address, one line of prose, a
 * cover photo and a week of opening hours. None of it exists on the wire yet
 * (see `publicHttpGateway.ts`), so the shapes here are the ones the backend is
 * being asked for, filled with plausible Yerevan data.
 *
 * Keyed by the ids in `venues.ts` so the two cannot drift: a branch added there
 * and missed here is a `resolveBranch` that returns null, which is loud, rather
 * than a page rendered with a made-up address, which is not.
 */

/** Photo URLs shaped exactly like the backend's serve route. */
function mockCover(seed: string): PublicPhoto {
  const photoId = `photo-cover-${seed}`;
  return {
    photoId,
    thumbnailUrl: `/api/photos/${photoId}/thumbnail`,
    cardUrl: `/api/photos/${photoId}/card`,
    fullUrl: `/api/photos/${photoId}/full`,
    width: 1600,
    height: 900,
  };
}

/**
 * A week, from one repeated span plus the days that differ.
 *
 * `System.DayOfWeek` numbering — 0 is Sunday — because that is the wire's, and
 * a second numbering in a fixture is a fixture that tests the wrong week.
 */
function week(
  everyDay: { opensAt: string; closesAt: string },
  overrides: Partial<
    Record<0 | 1 | 2 | 3 | 4 | 5 | 6, { opensAt: string; closesAt: string }[]>
  > = {},
): WeeklyHours {
  return ([0, 1, 2, 3, 4, 5, 6] as const).map((day) => ({
    day,
    blocks: overrides[day] ?? [everyDay],
  }));
}

export interface PublicVenueFixture {
  readonly slug: string;
  readonly description: string;
  readonly coverPhoto: PublicPhoto | null;
}

export interface PublicBranchFixture {
  readonly slug: string;
  readonly addressLine: string;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly phoneE164: string | null;
  readonly status: PublicBranchStatus;
  readonly acceptsWebBookings: boolean;
  readonly weeklyHours: WeeklyHours;
}

export const publicVenueFixtures: Readonly<Record<string, PublicVenueFixture>> = {
  'v-lumen': {
    slug: 'lumen-coffee',
    description: 'Small-batch roastery and all-day kitchen.',
    coverPhoto: mockCover('lumen'),
  },
  'v-dolmama': {
    slug: 'dolmama',
    description: 'Armenian home cooking, since 1998.',
    coverPhoto: mockCover('dolmama'),
  },
  'v-tumanyan': {
    slug: 'tumanyan-shawarma',
    description: 'Charcoal shawarma, open late.',
    // A venue that has not uploaded one. The page has to survive this, and one
    // of the four fixtures being bare is how that stays true.
    coverPhoto: null,
  },
  'v-ararat': {
    slug: 'ararat-terrace',
    description: 'Thirty tables under the vines, with a view of the Opera.',
    coverPhoto: mockCover('ararat'),
  },
  'v-greenbean': {
    slug: 'green-bean',
    description: 'Coffee, pastries and a very slow wifi password.',
    coverPhoto: mockCover('greenbean'),
  },
};

const LATE = { opensAt: '09:00', closesAt: '01:00' };
const EVENING = { opensAt: '09:00', closesAt: '23:00' };
const EARLY = { opensAt: '08:00', closesAt: '22:00' };

export const publicBranchFixtures: Readonly<Record<string, PublicBranchFixture>> = {
  'b-lumen-north': {
    slug: 'northern-avenue',
    addressLine: 'Northern Avenue 5, Yerevan 0001',
    latitude: 40.1817,
    longitude: 44.5142,
    phoneE164: '+37410500501',
    status: 'live',
    acceptsWebBookings: true,
    weeklyHours: week(LATE, { 0: [{ opensAt: '10:00', closesAt: '23:00' }] }),
  },
  'b-lumen-cascade': {
    slug: 'cascade',
    addressLine: 'Tamanyan 8, Yerevan 0009',
    latitude: 40.1908,
    longitude: 44.5152,
    phoneE164: '+37410500502',
    status: 'live',
    acceptsWebBookings: true,
    weeklyHours: week(EVENING),
  },
  'b-lumen-saryan': {
    slug: 'saryan-street',
    addressLine: 'Saryan 22, Yerevan 0002',
    latitude: 40.1836,
    longitude: 44.5023,
    phoneE164: '+37410500503',
    status: 'live',
    acceptsWebBookings: true,
    weeklyHours: week(EVENING, { 1: [] }),
  },
  'b-dolmama-pushkin': {
    slug: 'pushkin-street',
    addressLine: 'Pushkin 10, Yerevan 0010',
    latitude: 40.1848,
    longitude: 44.5108,
    phoneE164: '+37410561354',
    status: 'live',
    acceptsWebBookings: true,
    // Lunch and dinner with the kitchen shut between — two blocks in a day is
    // the case a single opens/closes pair cannot express.
    weeklyHours: week(
      { opensAt: '12:00', closesAt: '23:00' },
      {
        1: [
          { opensAt: '12:00', closesAt: '15:00' },
          { opensAt: '18:00', closesAt: '23:00' },
        ],
        2: [
          { opensAt: '12:00', closesAt: '15:00' },
          { opensAt: '18:00', closesAt: '23:00' },
        ],
      },
    ),
  },
  'b-dolmama-dalma': {
    slug: 'dalma-garden',
    addressLine: 'Tsitsernakaberd Highway 3, Yerevan 0082',
    latitude: 40.1725,
    longitude: 44.4839,
    phoneE164: null,
    // Not available, and not an error. The page says so plainly; it does not
    // render a free-table count for a venue the platform has switched off.
    status: 'suspended',
    acceptsWebBookings: false,
    weeklyHours: week(EVENING),
  },
  'b-tumanyan-main': {
    slug: 'tumanyan-street',
    addressLine: 'Tumanyan 34, Yerevan 0002',
    latitude: 40.1832,
    longitude: 44.5152,
    phoneE164: '+37477334455',
    status: 'live',
    // Live, listed, and takes no bookings. The room and the menu are still
    // worth a visitor's time; nothing on the page offers what it cannot honour.
    acceptsWebBookings: false,
    weeklyHours: week(LATE),
  },
  'b-ararat-opera': {
    slug: 'opera',
    addressLine: 'Tumanyan 54, Yerevan 0002',
    latitude: 40.1866,
    longitude: 44.5147,
    phoneE164: '+37410540540',
    status: 'live',
    acceptsWebBookings: true,
    weeklyHours: week(LATE),
  },
  'b-greenbean-main': {
    slug: 'mashtots-avenue',
    addressLine: 'Mashtots Avenue 41, Yerevan 0015',
    latitude: 40.1861,
    longitude: 44.5063,
    phoneE164: '+37410531212',
    status: 'live',
    acceptsWebBookings: true,
    weeklyHours: week(EARLY),
  },
};

/** Every branch in `venues.ts` must have a fixture here; this is what proves it. */
export function missingPublicFixtures(): readonly string[] {
  const missing: string[] = [];
  for (const venue of mockVenues) {
    if (!publicVenueFixtures[venue.id]) missing.push(venue.id);
    for (const branch of venue.branches) {
      if (!publicBranchFixtures[branch.id]) missing.push(branch.id);
    }
  }
  return missing;
}
