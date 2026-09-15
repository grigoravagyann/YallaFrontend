import { beforeEach, describe, expect, it } from 'vitest';
import type { ConsoleGateway } from '../consoleGateway';
import { RelocationNotAllowedError } from '../contracts/errors';
import type { VenueListingInput } from '../contracts/listing';
import { NotFoundError, ValidationError } from '../errors';
import { createConsoleMockGateway } from './consoleMock';
import { publicBranchFixtures } from './publicVenues';

const BRANCH = 'b-lumen-cascade';

const EMPTY: VenueListingInput = {
  cuisine: null,
  about: null,
  priceLevel: null,
  websiteUrl: null,
  amenities: [],
  galleryPhotoIds: [],
  address: null,
  latitude: null,
  longitude: null,
};

async function upload(gateway: ConsoleGateway, fileName: string, size: number, branchId = BRANCH) {
  const result = await gateway.uploadPhoto({
    branchId,
    file: new Blob([new Uint8Array(size)], { type: 'image/png' }),
    fileName,
  });
  return result.photo.photoId;
}

async function caught(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => null,
    (error: unknown) => error,
  );
}

/** Each violation as `[field, bound]`, the pair the console maps to its own sentence. */
function named(error: unknown): (readonly [string, string | undefined])[] {
  expect(error).toBeInstanceOf(ValidationError);
  return (error as ValidationError).violations.map((v) => [v.field, v.bound] as const);
}

/** The diner app listing in the mock, with the backend's rules and its order. */
describe('the branch listing in the mock', () => {
  let gateway: ConsoleGateway;
  const update = (listing: VenueListingInput) =>
    gateway.updateBranchListing({ branchId: BRANCH, listing });

  beforeEach(() => {
    gateway = createConsoleMockGateway({ latencyMs: 0 });
  });

  it("starts empty, at its own fixture's address and pin rather than one shared by every branch", async () => {
    const fixture = publicBranchFixtures[BRANCH]!;
    const start = await gateway.getBranchListing(BRANCH);
    expect(start).toMatchObject({
      cuisine: null,
      priceLevel: null,
      amenities: [],
      gallery: [],
      address: fixture.addressLine,
      latitude: fixture.latitude,
      longitude: fixture.longitude,
    });
    expect((await gateway.getBranchListing('b-lumen-north')).latitude).not.toBe(start.latitude);
  });

  it('saves every field, the gallery in order and the amenities once each, canonical', async () => {
    const first = await upload(gateway, 'a.png', 3);
    const second = await upload(gateway, 'b.png', 4);

    const saved = await update({
      cuisine: 'Armenian',
      about: 'Bright and busy.',
      priceLevel: 3,
      websiteUrl: 'https://lumen.am',
      amenities: ['WiFi', 'parking', 'wifi'],
      galleryPhotoIds: [second, first],
      address: 'Test address 1',
      latitude: 40.2,
      longitude: 44.6,
    });

    expect(saved.gallery.map((p) => p.photoId)).toEqual([second, first]);
    expect(saved).toMatchObject({
      cuisine: 'Armenian',
      priceLevel: 3,
      amenities: ['wifi', 'parking'],
      address: 'Test address 1',
      latitude: 40.2,
    });
    expect(await gateway.getBranchListing(BRANCH)).toEqual(saved);
  });

  it('refuses in the server order: the pin pair, the gallery size, repeats, a foreign photo, then the fields', async () => {
    const own = await upload(gateway, 'own.png', 5);
    const foreign = await upload(gateway, 'foreign.png', 6, 'b-lumen-north');
    const thirteen = Array.from({ length: 13 }, () => own);

    // Half a pin names the missing half, before anything else is looked at.
    expect(
      named(
        await caught(update({ ...EMPTY, latitude: 40, galleryPhotoIds: thirteen, priceLevel: 9 })),
      ),
    ).toEqual([['longitude', 'required']]);
    // The address travels with the pin, both ways (K5).
    expect(named(await caught(update({ ...EMPTY, latitude: 40.1, longitude: 44.5 })))).toEqual([
      ['address', 'required'],
    ]);
    expect(named(await caught(update({ ...EMPTY, address: 'Test address 2' })))).toEqual([
      ['latitude', 'required'],
      ['longitude', 'required'],
    ]);
    // More than twelve, then a repeat.
    expect(
      named(await caught(update({ ...EMPTY, galleryPhotoIds: thirteen, priceLevel: 9 }))),
    ).toEqual([['galleryPhotoIds', 'max']]);
    expect(
      named(await caught(update({ ...EMPTY, galleryPhotoIds: [own, own], priceLevel: 9 }))),
    ).toEqual([['galleryPhotoIds', 'conflict']]);
    // A photo uploaded for another branch is not found here, before the fields.
    expect(
      await caught(update({ ...EMPTY, galleryPhotoIds: [foreign], priceLevel: 9 })),
    ).toBeInstanceOf(NotFoundError);
    // Then every other field at once.
    expect(
      named(
        await caught(
          update({
            ...EMPTY,
            galleryPhotoIds: [own],
            cuisine: 'x'.repeat(121),
            priceLevel: 9,
            websiteUrl: 'ftp://lumen.am',
            amenities: ['sauna'],
          }),
        ),
      ),
    ).toEqual([
      ['cuisine', 'max'],
      ['priceLevel', 'range'],
      ['websiteUrl', undefined],
      ['amenities', undefined],
    ]);

    // Nothing was written by any of them.
    expect(await gateway.getBranchListing(BRANCH)).toMatchObject({ gallery: [], cuisine: null });
  });

  it('reads a website with a URL parser: absolute http or https, at most 2048 characters', async () => {
    expect(named(await caught(update({ ...EMPTY, websiteUrl: 'lumen.am' })))).toEqual([
      ['websiteUrl', undefined],
    ]);
    expect(
      named(await caught(update({ ...EMPTY, websiteUrl: `https://${'a'.repeat(2050)}.am` }))),
    ).toEqual([['websiteUrl', 'max']]);
    await expect(update({ ...EMPTY, websiteUrl: 'http://lumen' })).resolves.toMatchObject({
      websiteUrl: 'http://lumen',
    });
  });

  it('refuses a coordinate out of range as the server does: a 400 naming one field', async () => {
    const refusal = await caught(
      update({ ...EMPTY, address: 'Test address 3', latitude: 40.18, longitude: 200 }),
    );

    expect(refusal).toBeInstanceOf(ValidationError);
    expect((refusal as ValidationError).status).toBe(400);
    expect((refusal as ValidationError).field).toBe('longitude');
    // No collected list: that is what the form has to cope with.
    expect((refusal as ValidationError).violations).toEqual([]);
  });
});

describe('moving a branch in the mock (K5)', () => {
  async function storedPin(gateway: ConsoleGateway) {
    const listing = await gateway.getBranchListing(BRANCH);
    return { address: listing.address, latitude: listing.latitude, longitude: listing.longitude };
  }

  it('refuses a manager who changes the pin or the address, and writes nothing at all', async () => {
    // Venue-wide, so the branch itself is within reach and only the move is refused.
    const manager = createConsoleMockGateway({ role: 'manager', managerBranch: 'none' });
    const pin = await storedPin(manager);

    for (const change of [{ latitude: pin.latitude + 0.01 }, { address: 'Test address 4' }]) {
      const refusal = await caught(
        manager.updateBranchListing({
          branchId: BRANCH,
          listing: { ...EMPTY, ...pin, ...change, cuisine: 'Changed' },
        }),
      );
      expect(refusal).toBeInstanceOf(RelocationNotAllowedError);
    }
    // Atomic: the cuisine sent with the move was not kept either.
    expect(await manager.getBranchListing(BRANCH)).toMatchObject({ ...pin, cuisine: null });
  });

  it('lets a manager send the stored pin and address back, which is not a move', async () => {
    const manager = createConsoleMockGateway({ role: 'manager', managerBranch: 'none' });
    const pin = await storedPin(manager);

    await expect(
      manager.updateBranchListing({
        branchId: BRANCH,
        listing: { ...EMPTY, ...pin, cuisine: 'Armenian' },
      }),
    ).resolves.toMatchObject({ ...pin, cuisine: 'Armenian' });
  });

  it('lets an owner and the platform admin move it', async () => {
    for (const role of ['owner', 'platformAdmin'] as const) {
      const gateway = createConsoleMockGateway({ role });
      await expect(
        gateway.updateBranchListing({
          branchId: BRANCH,
          listing: { ...EMPTY, address: 'Test address 5', latitude: 40.19, longitude: 44.52 },
        }),
      ).resolves.toMatchObject({ address: 'Test address 5', latitude: 40.19, longitude: 44.52 });
    }
  });
});
