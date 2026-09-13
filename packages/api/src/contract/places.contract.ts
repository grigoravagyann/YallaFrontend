import { describe, expect, it } from 'vitest';
import type { ContractSubject } from './subject';

/**
 * Browse, as the backend documents it (`PublicBranchListing`, `PublicBranchDetail`).
 *
 * Every assertion here is about honesty with the unknown: no rating until the
 * first review, coordinates as a pair or not at all, a distance only when a
 * position was sent. A double that invents a 0.0 rating or Yerevan-centre
 * coordinates is exactly the defect this suite is for.
 */
export function describePlacesContract(subject: ContractSubject): void {
  const reason = subject.unsupported('places');
  const suite = reason ? describe.skip : describe;

  suite(`places — ${subject.name}${reason ? ` (skipped: ${reason})` : ''}`, () => {
    const { gateway, fixtures } = subject;

    it('lists the fixture branch, with a rating only when somebody reviewed it', async () => {
      const listings = await gateway.listBranches();

      expect(listings.map((listing) => listing.branchId)).toContain(fixtures.branchId);
      for (const listing of listings) {
        // "Absent when reviewCount == 0" — never a zero standing in for none.
        expect(listing.rating === null, listing.branchId).toBe(listing.reviewCount === 0);
        // Together or neither.
        expect(listing.latitude === null).toBe(listing.longitude === null);
        // Only when lat/lng were sent, and they were not.
        expect(listing.distanceKm).toBeNull();
        expect(['cafe', 'restaurant']).toContain(listing.venueType);
      }
    });

    it('adds a distance for a position, and puts the nearest first', async () => {
      const listings = await gateway.listBranches({
        position: { latitude: 40.1792, longitude: 44.4991 },
      });
      const located = listings.filter((listing) => listing.latitude !== null);
      for (const listing of located) expect(listing.distanceKm).not.toBeNull();
      const distances = located.map((listing) => listing.distanceKm ?? 0);
      expect(distances).toEqual([...distances].sort((a, b) => a - b));
    });

    it('reads the detail of a listed branch, and null for one that does not exist', async () => {
      const detail = await gateway.getBranchDetail(fixtures.branchId);
      expect(detail?.listing.branchId).toBe(fixtures.branchId);
      expect(detail!.recentReviews.length).toBeLessThanOrEqual(3);
      for (const marker of detail!.tableMarkers) {
        expect(marker.x).toBeGreaterThanOrEqual(0);
        expect(marker.x).toBeLessThanOrEqual(1);
      }

      await expect(
        gateway.getBranchDetail('00000000-0000-4000-8000-00000000dead'),
      ).resolves.toBeNull();
    });
  });
}
