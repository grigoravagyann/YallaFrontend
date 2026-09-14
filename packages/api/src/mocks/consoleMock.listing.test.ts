import { beforeEach, describe, expect, it } from 'vitest';
import type { ConsoleGateway } from '../consoleGateway';
import type { VenueListingInput } from '../contracts/listing';
import { NotFoundError, ValidationError } from '../errors';
import { createConsoleMockGateway } from './consoleMock';

const BRANCH = 'b-lumen-cascade';

const EMPTY: VenueListingInput = {
  cuisine: null,
  about: null,
  priceLevel: null,
  websiteUrl: null,
  amenities: [],
  galleryPhotoIds: [],
  latitude: null,
  longitude: null,
};

async function upload(gateway: ConsoleGateway, fileName: string, size: number) {
  const result = await gateway.uploadPhoto({
    branchId: BRANCH,
    file: new Blob([new Uint8Array(size)], { type: 'image/png' }),
    fileName,
  });
  return result.photo.photoId;
}

/** The diner app listing and table photo positions in the mock. */
describe('the branch listing in the mock', () => {
  let gateway: ConsoleGateway;

  beforeEach(() => {
    gateway = createConsoleMockGateway({ latencyMs: 0 });
  });

  it('starts empty with a pin, and saves every field with the gallery in order', async () => {
    const start = await gateway.getBranchListing(BRANCH);
    expect(start).toMatchObject({ cuisine: null, priceLevel: null, amenities: [], gallery: [] });

    const first = await upload(gateway, 'a.png', 3);
    const second = await upload(gateway, 'b.png', 4);

    const saved = await gateway.updateBranchListing({
      branchId: BRANCH,
      listing: {
        cuisine: 'Armenian',
        about: 'Bright and busy.',
        priceLevel: 3,
        websiteUrl: 'https://lumen.am',
        amenities: ['wifi', 'parking'],
        galleryPhotoIds: [second, first],
        latitude: 40.2,
        longitude: 44.6,
      },
    });

    expect(saved.gallery.map((p) => p.photoId)).toEqual([second, first]);
    expect(saved).toMatchObject({ cuisine: 'Armenian', priceLevel: 3, latitude: 40.2 });
    expect(await gateway.getBranchListing(BRANCH)).toEqual(saved);
  });

  it('refuses a gallery photo it never stored and writes nothing', async () => {
    const caught = await gateway
      .updateBranchListing({
        branchId: BRANCH,
        listing: { ...EMPTY, cuisine: 'Changed', galleryPhotoIds: ['photo-elsewhere'] },
      })
      .catch((error: unknown) => error);

    expect(caught).toBeInstanceOf(NotFoundError);
    expect((await gateway.getBranchListing(BRANCH)).cuisine).toBeNull();
  });

  it('names every bad field at once', async () => {
    const caught = await gateway
      .updateBranchListing({
        branchId: BRANCH,
        listing: { ...EMPTY, priceLevel: 5, websiteUrl: 'lumen', latitude: 40 },
      })
      .catch((error: unknown) => error);

    expect(caught).toBeInstanceOf(ValidationError);
    expect((caught as ValidationError).violations.map((v) => v.field)).toEqual([
      'priceLevel',
      'websiteUrl',
      'latitude',
    ]);
  });

  it('refuses a coordinate out of range as the server does: a 400 naming one field', async () => {
    const caught = await gateway
      .updateBranchListing({
        branchId: BRANCH,
        listing: { ...EMPTY, latitude: 40.18, longitude: 200 },
      })
      .catch((error: unknown) => error);

    expect(caught).toBeInstanceOf(ValidationError);
    const refusal = caught as ValidationError;
    expect(refusal.status).toBe(400);
    expect(refusal.field).toBe('longitude');
    // No collected list: that is what the form has to cope with.
    expect(refusal.violations).toEqual([]);
  });
});

describe('table photo positions in the mock floor plan', () => {
  it('keeps positions sent with the plan and drops those omitted', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0 });
    const plan = await gateway.getFloorPlan(BRANCH);
    const [one, two] = plan.tables;

    const result = await gateway.replaceFloorPlan({
      branchId: BRANCH,
      command: {
        floorWidth: plan.floorWidth,
        floorHeight: plan.floorHeight,
        areas: [],
        tables: plan.tables.map((t) => ({
          ...t,
          photoX: t.id === one!.id ? 0.3 : null,
          photoY: t.id === one!.id ? 0.6 : null,
        })),
      },
    });

    expect(result.plan.tables.find((t) => t.id === one!.id)).toMatchObject({
      photoX: 0.3,
      photoY: 0.6,
    });
    expect(result.plan.tables.find((t) => t.id === two!.id)?.photoX).toBeNull();
  });

  it('refuses a position outside 0–1 or with one half missing', async () => {
    const gateway = createConsoleMockGateway({ latencyMs: 0 });
    const plan = await gateway.getFloorPlan(BRANCH);
    const command = (photoX: number | null, photoY: number | null) => ({
      floorWidth: plan.floorWidth,
      floorHeight: plan.floorHeight,
      areas: [],
      tables: plan.tables.map((t, i) => (i === 0 ? { ...t, photoX, photoY } : t)),
    });

    for (const [x, y] of [
      [1.2, 0.5],
      [0.5, null],
    ] as const) {
      const caught = await gateway
        .replaceFloorPlan({ branchId: BRANCH, command: command(x, y) })
        .catch((error: unknown) => error);
      expect(caught).toBeInstanceOf(ValidationError);
    }
  });
});
