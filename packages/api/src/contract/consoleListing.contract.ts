import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FloorPlanChangedError, RelocationNotAllowedError } from '../contracts/errors';
import type { EditorFloorPlan, ReplaceFloorPlanCommand } from '../contracts/floorPlan';
import type { VenueListing, VenueListingInput } from '../contracts/listing';
import { NotFoundError, ValidationError } from '../errors';
import { pngBlob } from './png';
import type { ContractSubject } from './subject';
import { CONTRACT_RUN, randomUuid } from './subject';

/**
 * The branch's diner-app listing, its gallery, its cover, and the tables pinned
 * on room photos, as the console edits them (`BranchListingService`,
 * `BranchSettingsService`, K5–K6).
 *
 * Three rules carry the weight:
 *
 * - **Nothing is written for any refusal.** A foreign photo, a repeat, a half
 *   pin or a manager's move each refuse the *whole* form, so every refusal
 *   below is followed by a read that must equal the read before it.
 * - **Moving a branch is an owner's or the platform's** (K5). A manager may
 *   save everything else; repeating the stored location is not a move.
 * - **A pin is on one of its own room's photos, and saved with the plan** (K6).
 *   The cover is the card's picture only: changing it moves no pin.
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
        district: listing.district,
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
      readonly plan: EditorFloorPlan;
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
        plan,
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
      // The rooms as they were, against whatever version the tests left.
      const now = await owner.getFloorPlan(branchId);
      await owner.replaceFloorPlan({
        branchId,
        command: { ...commandFrom(original.plan), expectedVersion: now.version },
      });
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

    // --- Rooms, their photos and the pins on them -------------------------------------

    const ROOM = `Contract room ${CONTRACT_RUN}`;

    let pinned: Promise<{
      photoId: string;
      placed: string;
      versionBefore: string;
      saved: Awaited<ReturnType<typeof owner.replaceFloorPlan>>;
    }> | null = null;

    /** A room of its own with one photo and one table pinned on it, made once for the tests below. */
    function pinnedRoom() {
      pinned ??= (async () => {
        const photoId = await upload();
        const plan = await owner.getFloorPlan(branchId);
        const active = plan.tables.filter((table) => table.isActive);
        expect(active.length, 'the fixture branch has no active table').toBeGreaterThanOrEqual(1);
        const placed = active[0]!.id;

        const command = commandFrom(plan);
        const saved = await owner.replaceFloorPlan({
          branchId,
          command: {
            ...command,
            areas: [
              ...command.areas,
              { name: ROOM, displayOrder: command.areas.length, photoIds: [photoId] },
            ],
            tables: command.tables.map((table) =>
              table.id === placed
                ? { ...table, floorAreaName: ROOM, pin: { photoId, x: 0.25, y: 0.5 } }
                : table,
            ),
          },
        });
        return { photoId, placed, versionBefore: plan.version, saved };
      })();
      return pinned;
    }

    const tableIn = (plan: EditorFloorPlan, tableId: string) =>
      plan.tables.find((table) => table.id === tableId);

    it('saves a room with its photo and a table pinned on it, and moves the version', async () => {
      const { photoId, placed, versionBefore, saved } = await pinnedRoom();

      expect(saved.plan.version).not.toBe(versionBefore);
      const room = saved.plan.areas.find((area) => area.name === ROOM);
      expect(room?.photos.map((photo) => photo.photoId)).toEqual([photoId]);
      expect(tableIn(saved.plan, placed)).toMatchObject({
        floorAreaId: room!.id,
        pin: { photoId, x: 0.25, y: 0.5 },
      });
      expect(await owner.getFloorPlan(branchId)).toEqual(saved.plan);
    });

    it("refuses a pin on another room's photo and a photo in two rooms, naming each field, and writes nothing", async () => {
      const { photoId, placed } = await pinnedRoom();
      const before = await owner.getFloorPlan(branchId);
      const command = commandFrom(before);
      const other = command.tables.findIndex((table) => table.id !== placed);

      const elsewhere = await owner
        .replaceFloorPlan({
          branchId,
          command: {
            ...command,
            tables: command.tables.map((table, index) =>
              index === other
                ? { ...table, floorAreaName: null, pin: { photoId, x: 0.5, y: 0.5 } }
                : table,
            ),
          },
        })
        .catch((error: unknown) => error);
      if (other >= 0) {
        expect(namedFields(elsewhere)).toContain(`tables[${other}].photoId`);
      }

      const twice = await owner
        .replaceFloorPlan({
          branchId,
          command: {
            ...command,
            areas: [
              ...command.areas,
              { name: `${ROOM} 2`, displayOrder: command.areas.length, photoIds: [photoId] },
            ],
          },
        })
        .catch((error: unknown) => error);
      expect(namedFields(twice)).toContain(`areas[${command.areas.length}].photoIds[0]`);

      expect(await owner.getFloorPlan(branchId)).toEqual(before);
    });

    it("refuses a room photo that is not this branch's with a 404, and writes nothing", async () => {
      await pinnedRoom();
      const before = await owner.getFloorPlan(branchId);
      const command = commandFrom(before);

      const refusal = owner.replaceFloorPlan({
        branchId,
        command: {
          ...command,
          areas: command.areas.map((area) =>
            area.name === ROOM ? { ...area, photoIds: [...area.photoIds, randomUuid()] } : area,
          ),
        },
      });

      await expect(refusal).rejects.toBeInstanceOf(NotFoundError);
      expect(await owner.getFloorPlan(branchId)).toEqual(before);
    });

    const markersGap = subject.unsupported('photoMarkers');
    (markersGap ? it.skip : it)(
      `shows the pin to a diner, on the room photo it was placed on${markersGap ? ` (skipped: ${markersGap})` : ''}`,
      async () => {
        const { photoId, placed } = await pinnedRoom();

        const rooms = await gateway.getBranchRooms(branchId);
        const room = rooms?.rooms.find((candidate) => candidate.name === ROOM);
        expect(room?.photos[0]?.photo.photoId).toBe(photoId);
        expect(room!.photos[0]!.tables.find((table) => table.tableId === placed)).toMatchObject({
          x: 0.25,
          y: 0.5,
        });
      },
    );

    it('moves no pin when the cover changes, and refuses a save against a stale version', async () => {
      const { placed, photoId } = await pinnedRoom();
      const profile = await owner.getPublicProfile(branchId);
      await owner.updatePublicProfile({
        branchId,
        profile: {
          phoneE164: profile.phoneE164,
          acceptsWebBookings: profile.acceptsWebBookings,
          coverPhotoId: await upload(),
        },
      });
      const plan = await owner.getFloorPlan(branchId);
      expect(tableIn(plan, placed)?.pin).toEqual({ photoId, x: 0.25, y: 0.5 });

      const result = await owner.replaceFloorPlan({ branchId, command: commandFrom(plan) });
      expect(result.plan.version).not.toBe(plan.version);

      const stale = owner.replaceFloorPlan({ branchId, command: commandFrom(plan) });
      await expect(stale).rejects.toBeInstanceOf(FloorPlanChangedError);
      const refusal = (await stale.catch((error: unknown) => error)) as FloorPlanChangedError;
      expect(refusal.currentVersion).toBe(result.plan.version);
    });

    // Last of the room tests: it takes away the photo the ones above rely on.
    it('takes a table off a photo the plan drops, with a warning naming it', async () => {
      const { placed } = await pinnedRoom();
      const plan = await owner.getFloorPlan(branchId);
      const command = commandFrom(plan);

      const result = await owner.replaceFloorPlan({
        branchId,
        command: {
          ...command,
          areas: command.areas.map((area) =>
            area.name === ROOM ? { ...area, photoIds: [] } : area,
          ),
        },
      });

      const label = tableIn(plan, placed)!.label;
      expect(tableIn(result.plan, placed)?.pin).toBeNull();
      expect(result.warnings.some((warning) => warning.includes(label))).toBe(true);
    });
  });
}

/** The plan exactly as read, sent back against the version it was read at. */
function commandFrom(plan: EditorFloorPlan): ReplaceFloorPlanCommand {
  const areaName = new Map(plan.areas.map((area) => [area.id, area.name]));
  return {
    expectedVersion: plan.version,
    areas: plan.areas.map((area) => ({
      id: area.id,
      name: area.name,
      displayOrder: area.displayOrder,
      photoIds: area.photos.map((photo) => photo.photoId),
    })),
    tables: plan.tables
      .filter((table) => table.isActive)
      .map((table) => ({
        id: table.id,
        label: table.label,
        seats: table.seats,
        floorAreaName: table.floorAreaId ? (areaName.get(table.floorAreaId) ?? null) : null,
        isBookable: table.isBookable,
        pin: table.pin,
      })),
  };
}
