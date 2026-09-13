import { describe, expect, it, vi } from 'vitest';
import { createAuthSession } from '../auth/session';
import { createMemoryTokenStorage } from '../auth/storage';
import { createApiClient } from '../client';
import { ValidationError } from '../errors';
import { createConsoleHttpGateway, createMemoryIdentityStore } from './consoleHttpGateway';

const BASE = 'https://api.test.yalla.am';

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function gatewayOver(fetchImpl: typeof globalThis.fetch) {
  const auth = createAuthSession({
    storage: createMemoryTokenStorage('refresh-0'),
    refreshTokens: vi.fn(),
  });
  return createConsoleHttpGateway(
    createApiClient({ baseUrl: BASE, fetch: fetchImpl, getToken: () => 'held-token' }),
    { auth, identity: createMemoryIdentityStore() },
  );
}

function sentBody(fetchImpl: ReturnType<typeof vi.fn>, call = 0): unknown {
  const [input, init] = fetchImpl.mock.calls[call] as [RequestInfo | URL, RequestInit | undefined];
  const body = init?.body ?? (input instanceof Request ? null : undefined);
  return typeof body === 'string' ? JSON.parse(body) : body;
}

function sentUrl(fetchImpl: ReturnType<typeof vi.fn>, call = 0): string {
  const [input] = fetchImpl.mock.calls[call] as [RequestInfo | URL];
  return input instanceof Request ? input.url : String(input);
}

const WIRE_PHOTO = {
  photoId: 'p1',
  thumbnailUrl: '/api/photos/p1/thumbnail',
  cardUrl: '/api/photos/p1/card',
  fullUrl: '/api/photos/p1/full',
};

/** The diner app's listing, as the venue console reads and writes it. */
describe('the branch listing over HTTP', () => {
  it('reads absent fields as nulls and makes gallery links absolute', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      json(200, {
        amenities: ['wifi'],
        address: '12 Abovyan Street',
        latitude: 40.18,
        longitude: 44.51,
        gallery: [WIRE_PHOTO],
      }),
    );

    const listing = await gatewayOver(fetchImpl).getBranchListing('b-1');

    expect(sentUrl(fetchImpl)).toBe(`${BASE}/api/branches/b-1/listing`);
    expect(listing).toMatchObject({
      cuisine: null,
      about: null,
      priceLevel: null,
      websiteUrl: null,
      amenities: ['wifi'],
      latitude: 40.18,
      longitude: 44.51,
    });
    expect(listing.gallery[0]?.cardUrl).toBe(`${BASE}/api/photos/p1/card`);
  });

  it('puts every field, blanks as nulls, and the gallery in order', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        json(200, { amenities: [], address: 'a', latitude: 1, longitude: 2, gallery: [] }),
      );

    await gatewayOver(fetchImpl).updateBranchListing({
      branchId: 'b-1',
      listing: {
        cuisine: '  Armenian ',
        about: '   ',
        priceLevel: 2,
        websiteUrl: '',
        amenities: ['wifi', 'vegan'],
        galleryPhotoIds: ['p2', 'p1'],
        latitude: 40.1,
        longitude: 44.5,
      },
    });

    expect(sentUrl(fetchImpl)).toBe(`${BASE}/api/branches/b-1/listing`);
    expect(sentBody(fetchImpl)).toEqual({
      cuisine: 'Armenian',
      about: null,
      priceLevel: 2,
      websiteUrl: null,
      amenities: ['wifi', 'vegan'],
      galleryPhotoIds: ['p2', 'p1'],
      latitude: 40.1,
      longitude: 44.5,
    });
  });

  it('surfaces a 422 with every field it names', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      json(422, {
        type: 'about:blank',
        title: 'Validation failed',
        status: 422,
        detail: 'Bad listing.',
        code: 'validation-failed',
        context: {
          fields: [
            { field: 'websiteUrl', message: 'Must be absolute.' },
            { field: 'priceLevel', message: 'Out of range.' },
          ],
        },
      }),
    );

    const caught = await gatewayOver(fetchImpl)
      .updateBranchListing({
        branchId: 'b-1',
        listing: {
          cuisine: null,
          about: null,
          priceLevel: 9,
          websiteUrl: 'nope',
          amenities: [],
          galleryPhotoIds: null,
          latitude: null,
          longitude: null,
        },
      })
      .catch((error: unknown) => error);

    expect(caught).toBeInstanceOf(ValidationError);
    expect((caught as ValidationError).violations.map((v) => v.field)).toEqual([
      'websiteUrl',
      'priceLevel',
    ]);
  });
});

describe('table photo positions on the floor plan over HTTP', () => {
  it('reads photoX/photoY and sends them back, null when unplaced', async () => {
    const wireTable = {
      id: 't1',
      label: '1',
      seats: 2,
      x: 0,
      y: 0,
      width: 80,
      height: 80,
      rotationDegrees: 0,
      shape: 1,
      isBookable: true,
      isActive: true,
      qrToken: 'qr',
      photoX: 0.25,
      photoY: 0.5,
    };
    const plan = { branchId: 'b-1', floorWidth: 1000, floorHeight: 800, tables: [wireTable] };
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json(200, plan))
      .mockResolvedValueOnce(json(200, { plan }));
    const gateway = gatewayOver(fetchImpl);

    const read = await gateway.getFloorPlan('b-1');
    expect(read.tables[0]).toMatchObject({ photoX: 0.25, photoY: 0.5 });

    await gateway.replaceFloorPlan({
      branchId: 'b-1',
      command: {
        floorWidth: 1000,
        floorHeight: 800,
        areas: [],
        tables: [
          { ...read.tables[0]!, photoX: 0.75, photoY: 0.1 },
          { ...read.tables[0]!, id: 't2', label: '2', photoX: undefined, photoY: undefined },
        ],
      },
    });

    const body = sentBody(fetchImpl, 1) as { tables: { photoX: unknown; photoY: unknown }[] };
    expect(body.tables.map((t) => [t.photoX, t.photoY])).toEqual([
      [0.75, 0.1],
      [null, null],
    ]);
  });
});
