import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CoverChangedError,
  FloorPlanChangedError,
  RelocationNotAllowedError,
} from '../contracts/errors';
import type { EditorFloorPlan, ReplaceFloorPlanCommand } from '../contracts/floorPlan';
import type { VenueListing, VenueListingInput } from '../contracts/listing';
import { NotFoundError, ValidationError } from '../errors';
import { pngBlob } from './png';
import type { ContractSubject } from './subject';
import { CONTRACT_RUN, randomUuid } from './subject';

/**
 * The branch's diner-app listing, its gallery, its cover and the tables pinned
 * on it, as the console edits them (`BranchListingService`, K5–K7).
 *
 * Three rules carry the weight:
 *
 * - **Nothing is written for any refusal.** A foreign photo, a repeat, a half
 *   pin or a manager's move each refuse the *whole* form, so every refusal
 *   below is followed by a read that must equal the read before it.
 * - **Moving a branch is an owner's or the platform's** (K5). A manager may
 *   save everything else; repeating the stored location is not a move.
 * - **Pins belong to one picture and are saved on their own** (K6, K7). A plan
 *   save neither writes nor wipes them, a pin save does not bump the plan's
 *   version, and a new cover takes every pin off.
 *
 * Every suite that changes the fixture branch puts it back afterwards, so a
 * run against a database somebody develops on leaves the demo branch as it
 * found it.
 */
export function describeConsoleListingContract(subject: ContractSubject): void {
  const reason = subject.unsupported('consoleListing');
  const suite = reason ? describe.skip : describe;

  suite(`console listing — ${subject.name}${reason ? ` (skipped: ${reason})` : ''}`, () => {
    const { console: owner, managerConsole: manager, gateway, fixtures } = subject;
    const branchId = fixtures.branchId;

    const ids = (listing: VenueListing) => listing.gallery.map((photo) => photo.photoId);
    const round6 = (value: number) => Math.round(value * 1e6) / 1e6;

    /** The form as it stands: the location repeated (not a move), the gallery left alone. */
    function inputFrom(
      listing: VenueListing,
      changes: Partial<VenueListingInput> = {},
    ): VenueListingInput {
      return {
        cuisine: listing.cuisine,
        about: listing.about,
        priceLevel: listing.priceLevel,
        websiteUrl: listing.websiteUrl,
        amenities: listing.amenities,
        galleryPhotoIds: null,
        address: listing.address,
        latitude: listing.latitude,
        longitude: listing.longitude,
        ...changes,
      };
    }

    let uploads = 0;
    async function upload(): Promise<string> {
      uploads += 1;
      const { photo } = await owner.uploadPhoto({
        branchId,
        file: pngBlob(),
        fileName: `contract-${CONTRACT_RUN}-${uploads}.png`,
      });
      return photo.photoId;
    }

    /** Whatever a refusal rejected with, or `null` when nothing refused. */
    function refusalOf(listing: VenueListingInput): Promise<unknown> {
      return owner.updateBranchListing({ branchId, listing }).then(
        () => null,
        (error: unknown) => error,
      );
    }

    /** Every field a validation refusal named, from its single pointer and its collected list. */
    function namedFields(error: unknown): string[] {
      expect(error).toBeInstanceOf(ValidationError);
      const refusal = error as ValidationError;
      return [
        ...new Set(
          [refusal.field, ...refusal.violations.map((violation) => violation.field)].filter(
            (field): field is string => typeof field === 'string',
          ),
        ),
      ];
    }

    // --- Putting the branch back ------------------------------------------------------

    let original: {
      readonly listing: VenueListing;
      readonly phoneE164: string | null;
      readonly acceptsWebBookings: boolean;
      readonly coverPhotoId: string | null;
      readonly pins: readonly { tableId: string; photoX: number; photoY: number }[];
    } | null = null;

    beforeAll(async () => {
      const listing = await owner.getBranchListing(branchId);
      const profile = await owner.getPublicProfile(branchId);
      const plan = await owner.getFloorPlan(branchId);
      original = {
        listing,
        phoneE164: profile.phoneE164,
        acceptsWebBookings: profile.acceptsWebBookings,
        coverPhotoId: profile.coverPhoto?.photoId ?? null,
        pins: plan.tables.flatMap((table) =>
          typeof table.photoX === 'number' && typeof table.photoY === 'number'
            ? [{ tableId: table.id, photoX: table.photoX, photoY: table.photoY }]
            : [],
        ),
      };
    });

    afterAll(async () => {
      if (!original) return;
      await owner.updateBranchListing({
        branchId,
        listing: { ...inputFrom(original.listing), galleryPhotoIds: ids(original.listing) },
      });
      await owner.updatePublicProfile({
        branchId,
        profile: {
          phoneE164: original.phoneE164,
          acceptsWebBookings: original.acceptsWebBookings,
          coverPhotoId: original.coverPhotoId,
        },
      });
      if (original.coverPhotoId && original.pins.length > 0) {
        await owner.saveTablePhotoPositions(branchId, {
          coverPhotoId: original.coverPhotoId,
          positions: original.pins,
        });
      }
    });

    // --- The listing ------------------------------------------------------------------

    it('saves every field and reads it back normalised; blank clears', async () => {
      const before = await owner.getBranchListing(branchId);
      const moved = {
        address: '1 Contract Street, Yerevan',
        latitude: round6(before.latitude + 0.0005),
        longitude: round6(before.longitude - 0.0005),
      };

      const saved = await owner.updateBranchListing({
        branchId,
        listing: inputFrom(before, {
          cuisine: '  Contract cuisine  ',
          about: '  Written by the contract run.  ',
          priceLevel: 3,
          websiteUrl: 'https://example.com/yalla-contract',
          // Matched ignoring case and stored as the canonical key, once each.
          amenities: ['WIFI', 'vegan', 'Wifi'],
          ...moved,
        }),
      });

      expect(saved).toMatchObject({
        cuisine: 'Contract cuisine',
        about: 'Written by the contract run.',
        priceLevel: 3,
        websiteUrl: 'https://example.com/yalla-contract',
        ...moved,
      });
      expect([...saved.amenities].sort()).toEqual(['vegan', 'wifi']);
      // `galleryPhotoIds: null` leaves the gallery as it was.
      expect(ids(saved)).toEqual(ids(before));
      expect(await owner.getBranchListing(branchId)).toEqual(saved);

      const cleared = await owner.updateBranchListing({
        branchId,
        listing: inputFrom(saved, {
          cuisine: '   ',
          about: null,
          websiteUrl: '',
          priceLevel: null,
          amenities: [],
        }),
      });
      expect(cleared).toMatchObject({
        cuisine: null,
        about: null,
        websiteUrl: null,
        priceLevel: null,
        amenities: [],
      });
    });

    it('orders the gallery as sent, leaves it with null and clears it with []', async () => {
      const first = await upload();
      const second = await upload();
      const current = await owner.getBranchListing(branchId);

      const ordered = await owner.updateBranchListing({
        branchId,
        listing: inputFrom(current, { galleryPhotoIds: [second, first] }),
      });
      expect(ids(ordered)).toEqual([second, first]);
      for (const photo of ordered.gallery) expect(photo.cardUrl).toBeTruthy();

      const left = await owner.updateBranchListing({ branchId, listing: inputFrom(ordered) });
      expect(ids(left)).toEqual([second, first]);

      const cleared = await owner.updateBranchListing({
        branchId,
        listing: inputFrom(left, { galleryPhotoIds: [] }),
      });
      expect(cleared.gallery).toEqual([]);
    });

    it('stores the same bytes once, and says so', async () => {
      // "Uploading the same image twice returns the first photo and writes nothing."
      const file = pngBlob();
      const fileName = `contract-${CONTRACT_RUN}-same.png`;
      const first = await owner.uploadPhoto({ branchId, file, fileName });
      const again = await owner.uploadPhoto({ branchId, file, fileName });

      expect(first.wasDeduplicated).toBe(false);
      expect(again.wasDeduplicated).toBe(true);
      expect(again.photo.photoId).toBe(first.photo.photoId);
    });

    const bytesGap = subject.unsupported('photoBytes');
    (bytesGap ? it.skip : it)(
      `serves an uploaded gallery photo's card as an image${bytesGap ? ` (skipped: ${bytesGap})` : ''}`,
      async () => {
        const photoId = await upload();
        const listing = await owner.updateBranchListing({
          branchId,
          listing: inputFrom(await owner.getBranchListing(branchId), {
            galleryPhotoIds: [photoId],
          }),
        });

        const cardUrl = listing.gallery[0]?.cardUrl;
        expect(cardUrl, 'the saved gallery has no card link').toBeTruthy();
        const served = await subject.fetchPhoto(cardUrl!);
        expect(served.status).toBe(200);
        expect(served.contentType).toMatch(/^image\//u);
      },
    );

    // --- Refusals, and nothing written ---------------------------------------------

    it('refuses a photo that was not uploaded for this branch with a 404, and writes nothing', async () => {
      const before = await owner.getBranchListing(branchId);

      const refusal = await refusalOf(
        inputFrom(before, { cuisine: 'Must not land', galleryPhotoIds: [randomUuid()] }),
      );

      expect(refusal).toBeInstanceOf(NotFoundError);
      expect(await owner.getBranchListing(branchId)).toEqual(before);
    });

    it('refuses repeats, more than twelve, half a pin and an impossible latitude, naming the field', async () => {
      const before = await owner.getBranchListing(branchId);
      const photo = randomUuid();

      expect(
        namedFields(await refusalOf(inputFrom(before, { galleryPhotoIds: [photo, photo] }))),
      ).toContain('galleryPhotoIds');

      const thirteen = Array.from({ length: 13 }, () => randomUuid());
      expect(
        namedFields(await refusalOf(inputFrom(before, { galleryPhotoIds: thirteen }))),
      ).toContain('galleryPhotoIds');

      // Together or neither.
      const half = namedFields(await refusalOf(inputFrom(before, { longitude: null })));
      expect(
        half.some((field) => field === 'latitude' || field === 'longitude'),
        half.join(', '),
      ).toBe(true);

      expect(namedFields(await refusalOf(inputFrom(before, { latitude: 91 })))).toContain(
        'latitude',
      );

      expect(await owner.getBranchListing(branchId)).toEqual(before);
    });

    it('refuses a manager moving the branch, writes nothing, and lets them save the rest', async () => {
      const listing = await manager.getBranchListing(branchId);

      const move = manager.updateBranchListing({
        branchId,
        listing: inputFrom(listing, { latitude: round6(listing.latitude + 0.01) }),
      });
      await expect(move).rejects.toBeInstanceOf(RelocationNotAllowedError);
      expect(await manager.getBranchListing(branchId)).toEqual(listing);

      // Sending the stored location back unchanged is not a move.
      const kept = await manager.updateBranchListing({ branchId, listing: inputFrom(listing) });
      expect(kept).toMatchObject({
        address: listing.address,
        latitude: listing.latitude,
        longitude: listing.longitude,
      });
    });

    // --- The cover and its pins -------------------------------------------------------

    let pinned: Promise<{
      coverPhotoId: string;
      placed: string;
      unplaced: string;
      versionBefore: string;
      saved: Awaited<ReturnType<typeof owner.saveTablePhotoPositions>>;
    }> | null = null;

    /** A new cover with one table pinned and one taken off, made once for the tests below. */
    function pinnedCover() {
      pinned ??= (async () => {
        const coverPhotoId = await upload();
        const profile = await owner.getPublicProfile(branchId);
        await owner.updatePublicProfile({
          branchId,
          profile: {
            phoneE164: profile.phoneE164,
            acceptsWebBookings: profile.acceptsWebBookings,
            coverPhotoId,
          },
        });

        const plan = await owner.getFloorPlan(branchId);
        const active = plan.tables.filter((table) => table.isActive);
        expect(
          active.length,
          'the fixture branch has fewer than two active tables',
        ).toBeGreaterThanOrEqual(2);
        const [placed, unplaced] = [active[0]!.id, active[1]!.id];

        const saved = await owner.saveTablePhotoPositions(branchId, {
          coverPhotoId,
          positions: [
            { tableId: placed, photoX: 0.25, photoY: 0.5 },
            { tableId: unplaced, photoX: null, photoY: null },
          ],
        });
        return { coverPhotoId, placed, unplaced, versionBefore: plan.version, saved };
      })();
      return pinned;
    }

    const tableIn = (plan: EditorFloorPlan, tableId: string) =>
      plan.tables.find((table) => table.id === tableId);

    it("pins tables on the cover, answers every active table, and leaves the plan's version", async () => {
      const { coverPhotoId, placed, unplaced, versionBefore, saved } = await pinnedCover();

      expect(saved.coverPhotoId).toBe(coverPhotoId);
      expect(saved.tables.find((table) => table.tableId === placed)).toMatchObject({
        photoX: 0.25,
        photoY: 0.5,
      });
      expect(saved.tables.find((table) => table.tableId === unplaced)).toMatchObject({
        photoX: null,
        photoY: null,
      });

      const plan = await owner.getFloorPlan(branchId);
      expect(plan.tables.filter((table) => table.isActive).length).toBe(saved.tables.length);
      // Pin saves and cover changes do not bump it.
      expect(plan.version).toBe(versionBefore);
      expect(tableIn(plan, placed)).toMatchObject({ photoX: 0.25, photoY: 0.5 });
    });

    it('refuses pins placed on a picture that is no longer the cover, and writes nothing', async () => {
      const { coverPhotoId, placed } = await pinnedCover();

      const stale = owner.saveTablePhotoPositions(branchId, {
        coverPhotoId: randomUuid(),
        positions: [{ tableId: placed, photoX: 0.9, photoY: 0.9 }],
      });
      await expect(stale).rejects.toBeInstanceOf(CoverChangedError);
      const refusal = (await stale.catch((error: unknown) => error)) as CoverChangedError;
      expect(refusal.currentCoverPhotoId).toBe(coverPhotoId);

      expect(tableIn(await owner.getFloorPlan(branchId), placed)).toMatchObject({
        photoX: 0.25,
        photoY: 0.5,
      });
    });

    const markersGap = subject.unsupported('photoMarkers');
    (markersGap ? it.skip : it)(
      `shows the pins to a diner, on the cover they were placed on${markersGap ? ` (skipped: ${markersGap})` : ''}`,
      async () => {
        const { coverPhotoId, placed, unplaced } = await pinnedCover();

        const markers = await gateway.getBranchTableMarkers(branchId);
        expect(markers?.photo?.photoId).toBe(coverPhotoId);
        expect(markers!.tables.find((table) => table.tableId === placed)).toMatchObject({
          x: 0.25,
          y: 0.5,
        });
        // Only tables a manager placed on the cover photo appear.
        expect(markers!.tables.some((table) => table.tableId === unplaced)).toBe(false);
      },
    );

    it('keeps pins through a floor-plan save, and refuses a save against a stale version', async () => {
      const { placed } = await pinnedCover();
      const plan = await owner.getFloorPlan(branchId);

      const result = await owner.replaceFloorPlan({ branchId, command: commandFrom(plan) });
      expect(result.plan.version).not.toBe(plan.version);
      expect(tableIn(result.plan, placed)).toMatchObject({ photoX: 0.25, photoY: 0.5 });

      const stale = owner.replaceFloorPlan({ branchId, command: commandFrom(plan) });
      await expect(stale).rejects.toBeInstanceOf(FloorPlanChangedError);
      const refusal = (await stale.catch((error: unknown) => error)) as FloorPlanChangedError;
      expect(refusal.currentVersion).toBe(result.plan.version);
    });

    // Last of the pin tests: it changes the cover the ones above rely on.
    it('keeps every pin for the same cover sent again, and takes them all off for a new one', async () => {
      const { coverPhotoId, placed } = await pinnedCover();
      const profile = await owner.getPublicProfile(branchId);
      const withCover = (cover: string) =>
        owner.updatePublicProfile({
          branchId,
          profile: {
            phoneE164: profile.phoneE164,
            acceptsWebBookings: profile.acceptsWebBookings,
            coverPhotoId: cover,
          },
        });

      await withCover(coverPhotoId);
      expect(tableIn(await owner.getFloorPlan(branchId), placed)).toMatchObject({
        photoX: 0.25,
        photoY: 0.5,
      });

      await withCover(await upload());
      for (const table of (await owner.getFloorPlan(branchId)).tables) {
        expect(table.photoX ?? null, `table ${table.label} kept its pin`).toBeNull();
        expect(table.photoY ?? null, `table ${table.label} kept its pin`).toBeNull();
      }
    });
  });
}

/** The plan exactly as read, sent back against the version it was read at. */
function commandFrom(plan: EditorFloorPlan): ReplaceFloorPlanCommand {
  const areaName = new Map(plan.areas.map((area) => [area.id, area.name]));
  return {
    floorWidth: plan.floorWidth,
    floorHeight: plan.floorHeight,
    expectedVersion: plan.version,
    areas: plan.areas.map((area) => ({
      id: area.id,
      name: area.name,
      displayOrder: area.displayOrder,
    })),
    tables: plan.tables
      .filter((table) => table.isActive)
      .map((table) => ({
        id: table.id,
        label: table.label,
        seats: table.seats,
        x: table.x,
        y: table.y,
        width: table.width,
        height: table.height,
        rotationDegrees: table.rotationDegrees,
        shape: table.shape,
        floorAreaName: table.floorAreaId ? (areaName.get(table.floorAreaId) ?? null) : null,
        isBookable: table.isBookable,
      })),
  };
}
