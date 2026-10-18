import type { SubscriptionTier, VenueStatus, VenueType } from '../contracts/console';

/**
 * The platform venues list's demo world: the nine venues the approved Venues
 * artboard draws (docs/design/console/artboards/Venues.dc.html), each seeded
 * in the state the artboard shows it in.
 *
 * Console-only. The diner side keeps `mockVenues`; these exist so every state
 * of the redesigned list can be walked in mock mode — and the two the HANDOFF
 * names (section 3) are fixed points: **Mountain View** is refused Paid
 * because a branch's menu is unfinished, **Sunset Lounge** goes Paid. Cascade
 * Cafe is the delete its fifteen open tabs block; Old Town Pub is the deleted
 * venue the "Deleted" filter shows.
 *
 * The data is in Armenian where the artboard's is: district, cuisine and the
 * branch names are what a platform admin in Yerevan reads.
 */

export interface DemoBranchSeed {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly tableCount: number;
  readonly tier: SubscriptionTier;
  /** Tabs open right now. Blocks a delete, and a move to Free. */
  readonly openTabs: number;
  /** Dishes missing a detail a diner needs. Anything above 0 refuses Paid. */
  readonly unfinishedDishes: number;
  /** False: no opening hours set yet. */
  readonly hours: boolean;
  readonly district: string;
  /** The street address, as the branch's listing has it. */
  readonly address: string;
  /** Bookings in a typical week, for the venue page's Bookings tab. */
  readonly bookingsPerWeek: number;
}

export interface DemoVenueSeed {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly type: VenueType;
  readonly status: VenueStatus;
  readonly cuisine: string;
  /** `null` with no reviews yet. */
  readonly rating: number | null;
  readonly reviewCount: number;
  /**
   * The cover thumbnail's two colours, or `null` for a venue with no cover
   * yet. The mock draws the thumbnail itself (see {@link demoCoverThumbnail}):
   * there is no photo server behind mock mode.
   */
  readonly cover: { readonly ground: string; readonly ink: string } | null;
  readonly branches: readonly DemoBranchSeed[];
}

const branch = (
  id: string,
  name: string,
  slug: string,
  options: Partial<Omit<DemoBranchSeed, 'id' | 'name' | 'slug'>> & {
    readonly tableCount: number;
    readonly tier: SubscriptionTier;
    readonly district: string;
    readonly address: string;
  },
): DemoBranchSeed => ({
  id,
  name,
  slug,
  openTabs: 0,
  unfinishedDishes: 0,
  hours: true,
  // About three bookings a table a week, a busy Yerevan average.
  bookingsPerWeek: options.tableCount * 3,
  ...options,
});

export const demoVenues: readonly DemoVenueSeed[] = [
  {
    id: 'v-cascade',
    name: 'Cascade Cafe',
    slug: 'cascade-cafe',
    type: 'cafe',
    status: 'active',
    cuisine: 'Հայկական · Միջերկրածովյան',
    rating: 4.7,
    reviewCount: 1200,
    cover: { ground: '#E7D3BF', ink: '#6B3A1C' },
    branches: [
      branch('b-cascade-center', 'Կենտրոն', 'center', {
        address: 'Թամանյան 10, Կենտրոն',
        tableCount: 22,
        tier: 'paid',
        openTabs: 15,
        district: 'Կենտրոն',
      }),
    ],
  },
  {
    // Mixed: the list says "Mixed · 1/2" and its button finishes the job.
    id: 'v-yalla-demo',
    name: 'Yalla Demo Cafe',
    slug: 'yalla-demo',
    type: 'restaurant',
    status: 'active',
    cuisine: 'Հայկական · Գրիլ',
    rating: 4.6,
    reviewCount: 920,
    cover: { ground: '#E2D6C8', ink: '#4F3424' },
    branches: [
      branch('b-yalla-demo-center', 'Կենտրոն', 'center', {
        address: 'Աբովյան 12, Կենտրոն',
        tableCount: 8,
        tier: 'paid',
        openTabs: 6,
        district: 'Կենտրոն',
      }),
      branch('b-yalla-demo-komitas', 'Կոմիտաս', 'komitas', {
        address: 'Կոմիտաս 32, Արաբկիր',
        tableCount: 6,
        tier: 'free',
        district: 'Արաբկիր',
      }),
    ],
  },
  {
    // The allowed path to Paid: a finished menu, no photo yet.
    id: 'v-sunset',
    name: 'Sunset Lounge',
    slug: 'sunset-lounge',
    type: 'bar',
    status: 'active',
    cuisine: 'Կոկտեյլներ',
    rating: null,
    reviewCount: 0,
    cover: null,
    branches: [
      branch('b-sunset-north', 'Հյուսիսային պողոտա', 'northern-avenue', {
        address: 'Հյուսիսային պողոտա 5',
        bookingsPerWeek: 0,
        tableCount: 12,
        tier: 'free',
        district: 'Հյուսիսային պողոտա',
      }),
    ],
  },
  {
    id: 'v-garden',
    name: 'Garden Bistro',
    slug: 'garden-bistro',
    type: 'restaurant',
    status: 'suspended',
    cuisine: 'Եվրոպական',
    rating: 4.2,
    reviewCount: 45,
    cover: { ground: '#DCE3D2', ink: '#3D5A2E' },
    branches: [
      branch('b-garden-arabkir', 'Արաբկիր', 'arabkir', {
        address: 'Բաղրամյան 44, Արաբկիր',
        tableCount: 10,
        tier: 'free',
        hours: false,
        district: 'Արաբկիր',
      }),
    ],
  },
  {
    id: 'v-luna',
    name: 'Luna Cafe',
    slug: 'luna-cafe',
    type: 'cafe',
    status: 'active',
    cuisine: 'Իտալական',
    rating: 4.8,
    reviewCount: 320,
    cover: { ground: '#EAD9C9', ink: '#7A4422' },
    branches: [
      branch('b-luna-arabkir', 'Արաբկիր', 'arabkir', {
        address: 'Կոմիտաս 8, Արաբկիր',
        tableCount: 14,
        tier: 'paid',
        openTabs: 11,
        district: 'Արաբկիր',
      }),
    ],
  },
  {
    // The Paid refusal (HANDOFF section 3). Its first branch is ready, so a
    // switch that skipped the check would move it and then be refused at the
    // second: the list has to name the branch that refused.
    id: 'v-mountain',
    name: 'Mountain View',
    slug: 'mountain-view',
    type: 'restaurant',
    status: 'active',
    cuisine: 'Հայկական',
    rating: 4.6,
    reviewCount: 110,
    cover: { ground: '#E5D9CC', ink: '#5A3B26' },
    branches: [
      branch('b-mountain-kanaker', 'Քանաքեռ', 'kanaker', {
        address: 'Ավան-Առինջ 3, Քանաքեռ',
        tableCount: 12,
        tier: 'free',
        district: 'Քանաքեռ',
      }),
      branch('b-mountain-nornork', 'Նոր Նորք', 'nor-nork', {
        address: 'Գայի պողոտա 21, Նոր Նորք',
        tableCount: 6,
        tier: 'free',
        unfinishedDishes: 4,
        district: 'Նոր Նորք',
      }),
    ],
  },
  {
    id: 'v-city-bites',
    name: 'City Bites',
    slug: 'city-bites',
    type: 'restaurant',
    status: 'active',
    cuisine: 'Միջազգային',
    rating: 4.5,
    reviewCount: 86,
    cover: { ground: '#E0D4C4', ink: '#5B3A20' },
    branches: [
      branch('b-city-bites-center', 'Կենտրոն', 'center', {
        address: 'Պուշկին 15, Կենտրոն',
        tableCount: 10,
        tier: 'paid',
        district: 'Կենտրոն',
      }),
    ],
  },
  {
    // Paid with an unfinished menu: dishes added after it went Paid.
    id: 'v-riverside',
    name: 'Riverside Restaurant',
    slug: 'riverside-restaurant',
    type: 'restaurant',
    status: 'active',
    cuisine: 'Ծովամթերք',
    rating: 4.9,
    reviewCount: 540,
    cover: { ground: '#E7D3BF', ink: '#6B3A1C' },
    branches: [
      branch('b-riverside-hrazdan', 'Հրազդանի կիրճ', 'hrazdan-gorge', {
        address: 'Հրազդանի կիրճ 1',
        tableCount: 30,
        tier: 'paid',
        openTabs: 9,
        unfinishedDishes: 3,
        district: 'Հրազդանի կիրճ',
      }),
    ],
  },
  {
    id: 'v-old-town',
    name: 'Old Town Pub',
    slug: 'old-town-pub',
    type: 'bar',
    status: 'deleted',
    cuisine: 'Գարեջուր · Խորտիկներ',
    rating: 4.1,
    reviewCount: 64,
    cover: { ground: '#E3D7CB', ink: '#5A3B26' },
    branches: [
      branch('b-old-town-center', 'Կենտրոն', 'center', {
        address: 'Սարյան 9, Կենտրոն',
        tableCount: 9,
        tier: 'free',
        district: 'Կենտրոն',
      }),
    ],
  },
];

/**
 * A cover thumbnail for mock mode: the venue's initial on its own warm tint,
 * as the artboard draws it, as an SVG data URL the list can put in an `<img>`
 * exactly as it would a real thumbnail.
 */
export function demoCoverThumbnail(
  name: string,
  cover: { readonly ground: string; readonly ink: string },
): string {
  const letter = Array.from(name)[0] ?? '';
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="112" height="84" viewBox="0 0 112 84">` +
    `<rect width="112" height="84" fill="${cover.ground}"/>` +
    `<text x="56" y="54" text-anchor="middle" font-family="Georgia, serif" font-size="34" ` +
    `font-weight="700" fill="${cover.ink}">${letter}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
