import { describe, expect, it } from 'vitest';
import type { components } from '../generated/schema';
import { publicBranchFromWire, publicPageMetaFromWire } from './publicMapping';

type Page = components['schemas']['Yalla.Application.Public.PublicBranchPage'];
type Meta = components['schemas']['Yalla.Application.Public.PublicBranchMeta'];

const BASE = 'https://api.test.yalla.am';

const PAGE: Page = {
  venueSlug: 'lumen-coffee',
  branchSlug: 'northern-avenue',
  branchId: '0b5f3c1e-0000-4000-8000-000000000001',
  venueName: 'Lumen Coffee',
  branchName: 'Northern Avenue',
  venueType: 1,
  address: 'Northern Avenue 5, Yerevan',
  latitude: 40.18,
  longitude: 44.51,
  timeZoneId: 'Asia/Yerevan',
  openingHours: [],
  isOpenNow: true,
  freeTableCount: 2,
  tableCount: 8,
  floorPlan: { floorWidth: 800, floorHeight: 600, areas: [], tables: [] },
  acceptsWebBookings: true,
  bookingWindowDays: 14,
  policy: { turnTimeMinutes: 90, minLeadMinutes: 30, cancellationDeadlineMinutes: 120 },
  asOfUtc: '2026-09-13T00:00:00Z',
  coverPhoto: {
    photoId: 'p1',
    thumbnailUrl: '/api/photos/p1/thumbnail',
    cardUrl: '/api/photos/p1/card',
    fullUrl: '/api/photos/p1/full',
    width: 1600,
    height: 1200,
  },
};

/**
 * The public page used to hard-code `coverPhoto: null` — the wire did not carry
 * one — so the cover an owner set never reached the page. It does now, and its
 * links are resolved against the API's origin: the page runs on the web host,
 * and a root-relative `<img src>` would ask that host for a picture only the
 * API has.
 */
describe('the public branch page and its cover', () => {
  it('carries the cover from the wire, made absolute', () => {
    const branch = publicBranchFromWire(PAGE, BASE);
    expect(branch.venue.coverPhoto?.photoId).toBe('p1');
    expect(branch.venue.coverPhoto?.cardUrl).toBe(`${BASE}/api/photos/p1/card`);
  });

  it('has no cover when the wire has none', () => {
    const branch = publicBranchFromWire({ ...PAGE, coverPhoto: null }, BASE);
    expect(branch.venue.coverPhoto).toBeNull();
  });

  it('resolves the unfurl image the same way, since chat apps drop relative urls', () => {
    const meta: Meta = {
      title: 'Lumen Coffee — Northern Avenue',
      description: 'Cafe in Yerevan.',
      imageUrl: '/api/photos/p1/card',
      canonicalPath: '/lumen-coffee/northern-avenue',
      locale: 'hy_AM',
    };
    const page = publicPageMetaFromWire(meta, 'https://yalla.am/', BASE);
    expect(page.imageUrl).toBe(`${BASE}/api/photos/p1/card`);
  });
});
