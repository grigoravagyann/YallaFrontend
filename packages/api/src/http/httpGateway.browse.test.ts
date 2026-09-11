import { describe, expect, it } from 'vitest';
import type { components } from '../generated/schema';
import { createMockGateway } from '../mocks/mockGateway';
import { fakeBackend } from './fakeBackend.testkit';
import { createHttpGateway } from './httpGateway';

type Card = components['schemas']['Yalla.Application.Public.PublicVenueCard'];

/**
 * Browse, against the one venue read the backend publishes.
 *
 * The phone app used to GET `/api/venues` and `/api/venues/{id}`, which the
 * backend never served: every call 404'd, became `EndpointNotWiredError`, and
 * Explore said "not available yet" over an empty list. These pin the route and
 * the mapping, and they fail against that code at the first call.
 */

const CARDS: Card[] = [
  {
    venueSlug: 'lumen-coffee',
    name: 'Lumen Coffee',
    type: 1,
    branches: [
      {
        branchId: '0b5f3c1e-0000-4000-8000-000000000001',
        branchSlug: 'northern-avenue',
        name: 'Northern Avenue',
        address: 'Northern Avenue 5, Yerevan',
        freeTableCount: 4,
        isOpenNow: true,
        timeZoneId: 'Asia/Yerevan',
      },
      {
        branchId: '0b5f3c1e-0000-4000-8000-000000000002',
        branchSlug: 'cascade',
        name: 'Cascade',
        address: 'Tamanyan 8, Yerevan',
        freeTableCount: 7,
        isOpenNow: false,
        timeZoneId: 'Asia/Yerevan',
      },
    ],
  },
  {
    venueSlug: 'dolmama',
    name: 'Dolmama',
    type: 2,
    branches: [
      {
        branchId: '0b5f3c1e-0000-4000-8000-000000000003',
        branchSlug: 'pushkin-street',
        name: 'Pushkin Street',
        address: 'Pushkin 10, Yerevan',
        freeTableCount: 0,
        isOpenNow: true,
        timeZoneId: 'Europe/Moscow',
      },
    ],
  },
];

function gatewayOver(cards: readonly Card[]) {
  const backend = fakeBackend({ 'GET /api/public/venues': { body: cards } });
  const gateway = createHttpGateway(backend.client(), {
    audience: 'diner',
    fallback: createMockGateway(),
  });
  return { gateway, backend };
}

describe('browse over /api/public/venues', () => {
  it('lists every venue from the public list, keyed by slug, with each branch zone and open state', async () => {
    const { gateway, backend } = gatewayOver(CARDS);

    const venues = await gateway.listVenues();

    expect(backend.requests.map((r) => `${r.method} ${r.path}`)).toEqual([
      'GET /api/public/venues',
    ]);
    // Anonymous: browsing needs no account, and a stale diner token must not
    // be able to turn a browse into a 401.
    expect(backend.requests[0]?.headers.get('authorization')).toBeNull();

    expect(venues).toEqual([
      {
        id: 'lumen-coffee',
        name: 'Lumen Coffee',
        type: 'cafe',
        branches: [
          {
            id: '0b5f3c1e-0000-4000-8000-000000000001',
            slug: 'northern-avenue',
            venueId: 'lumen-coffee',
            venueName: 'Lumen Coffee',
            name: 'Northern Avenue',
            addressLine: 'Northern Avenue 5, Yerevan',
            timeZoneId: 'Asia/Yerevan',
            openState: { isOpen: true, closesAtUtc: null, opensAtUtc: null },
            freeTables: 4,
          },
          {
            id: '0b5f3c1e-0000-4000-8000-000000000002',
            slug: 'cascade',
            venueId: 'lumen-coffee',
            venueName: 'Lumen Coffee',
            name: 'Cascade',
            addressLine: 'Tamanyan 8, Yerevan',
            timeZoneId: 'Asia/Yerevan',
            openState: { isOpen: false, closesAtUtc: null, opensAtUtc: null },
            freeTables: 7,
          },
        ],
      },
      {
        id: 'dolmama',
        name: 'Dolmama',
        type: 'restaurant',
        branches: [
          {
            id: '0b5f3c1e-0000-4000-8000-000000000003',
            slug: 'pushkin-street',
            venueId: 'dolmama',
            venueName: 'Dolmama',
            name: 'Pushkin Street',
            addressLine: 'Pushkin 10, Yerevan',
            // The branch's own zone, carried through rather than guessed.
            timeZoneId: 'Europe/Moscow',
            openState: { isOpen: true, closesAtUtc: null, opensAtUtc: null },
            freeTables: 0,
          },
        ],
      },
    ]);
  });

  it('finds one venue by the id the list gave it, from the same route', async () => {
    const { gateway, backend } = gatewayOver(CARDS);

    const venue = await gateway.getVenue('dolmama');

    expect(venue?.name).toBe('Dolmama');
    expect(venue?.branches.map((b) => b.name)).toEqual(['Pushkin Street']);
    expect(backend.requests.map((r) => r.path)).toEqual(['/api/public/venues']);
  });

  it('answers null for a venue that is no longer listed, rather than an error', async () => {
    const { gateway } = gatewayOver(CARDS);

    await expect(gateway.getVenue('closed-for-good')).resolves.toBeNull();
  });

  it('reads how far ahead and how soon a branch books from its public page', async () => {
    const backend = fakeBackend({
      'GET /api/public/branches/lumen-coffee/northern-avenue': {
        body: { bookingWindowDays: 30, policy: { minLeadMinutes: 45 } },
      },
    });
    const gateway = createHttpGateway(backend.client(), {
      audience: 'diner',
      fallback: createMockGateway(),
    });

    await expect(
      gateway.getBookingRules({ venueSlug: 'lumen-coffee', branchSlug: 'northern-avenue' }),
    ).resolves.toEqual({ bookingWindowDays: 30, minLeadMinutes: 45 });
    await expect(
      gateway.getBookingRules({ venueSlug: 'lumen-coffee', branchSlug: 'gone' }),
    ).resolves.toBeNull();
  });

  it('keeps getVenue working when the method is called unbound', async () => {
    const { gateway } = gatewayOver(CARDS);
    const { getVenue } = gateway;

    await expect(getVenue('lumen-coffee')).resolves.toMatchObject({ id: 'lumen-coffee' });
  });
});
