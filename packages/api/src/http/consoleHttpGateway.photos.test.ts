import { describe, expect, it, vi } from 'vitest';
import { createAuthSession } from '../auth/session';
import { createMemoryTokenStorage } from '../auth/storage';
import { createApiClient } from '../client';
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

const WIRE_PHOTO = {
  photoId: 'p1',
  thumbnailUrl: '/api/photos/p1/thumbnail',
  cardUrl: '/api/photos/p1/card',
  fullUrl: '/api/photos/p1/full',
  width: 1600,
  height: 1200,
};

/**
 * Photo links arrive server-relative and the console runs on another origin,
 * so an `<img src>` built from them asked the Vite server — or the web host —
 * for a picture only the API has. Every upload "worked" and every picture was
 * broken. Resolved against the API's origin at the gateway, once.
 */
describe('photo urls over HTTP', () => {
  it('makes the cover photo on the public profile absolute', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(json(200, { acceptsWebBookings: true, coverPhoto: WIRE_PHOTO }));

    const profile = await gatewayOver(fetchImpl).getPublicProfile('b-1');

    expect(profile.coverPhoto?.cardUrl).toBe(`${BASE}/api/photos/p1/card`);
    expect(profile.coverPhoto?.thumbnailUrl).toBe(`${BASE}/api/photos/p1/thumbnail`);
  });

  it('makes every dish photo on the admin menu absolute', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      json(200, [
        {
          id: 'c1',
          name: 'Mains',
          displayOrder: 0,
          items: [
            {
              id: 'i1',
              categoryId: 'c1',
              name: 'Khachapuri',
              priceAmd: 3200,
              spiceLevel: 0,
              isAvailable: true,
              displayOrder: 0,
              photo: WIRE_PHOTO,
            },
          ],
        },
      ]),
    );

    const menu = await gatewayOver(fetchImpl).getAdminMenu('b-1');

    expect(menu[0]?.items[0]?.photo.cardUrl).toBe(`${BASE}/api/photos/p1/card`);
  });

  it('leaves an externally hosted photo alone', async () => {
    const hosted = { ...WIRE_PHOTO, cardUrl: 'https://cdn.example/p1.webp' };
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(json(200, { acceptsWebBookings: false, coverPhoto: hosted }));

    const profile = await gatewayOver(fetchImpl).getPublicProfile('b-1');

    expect(profile.coverPhoto?.cardUrl).toBe('https://cdn.example/p1.webp');
  });
});
