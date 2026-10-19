import { describe, expect, it, vi } from 'vitest';
import { createAuthSession } from '../auth/session';
import { createMemoryTokenStorage } from '../auth/storage';
import { ConcurrencyConflictError, ValidationError } from '../errors';
import { createConsoleHttpGateway, createMemoryIdentityStore } from './consoleHttpGateway';
import { fakeBackend, problemReply, type FakeRoute } from './fakeBackend.testkit';

/**
 * Special days over HTTP (VC3 wire §1, round 2): `GET/PUT
 * /api/branches/{id}/opening-hours/exceptions`, a versioned list — the GET
 * answers `{ version, days }`, the PUT sends `{ expectedVersion, days }` and a
 * list saved by somebody else meanwhile is a 409.
 */

function gatewayOver(routes: Record<string, FakeRoute>) {
  const backend = fakeBackend(routes);
  const auth = createAuthSession({
    storage: createMemoryTokenStorage('refresh-0'),
    refreshTokens: vi.fn(),
  });
  const gateway = createConsoleHttpGateway(backend.client({ getToken: () => 'held-token' }), {
    auth,
    identity: createMemoryIdentityStore(),
  });
  return { gateway, backend };
}

const URL = '/api/branches/b-1/opening-hours/exceptions';

describe('special days over HTTP', () => {
  it('reads the list and its version, in date order, a closed day as no blocks', async () => {
    const { gateway } = gatewayOver({
      [`GET ${URL}`]: {
        body: {
          version: '7',
          days: [
            { date: '2027-01-01', closed: true, blocks: [] },
            {
              date: '2026-12-31',
              note: 'Ամանորի գիշեր',
              closed: false,
              blocks: [{ opensAt: '18:00:00', closesAt: '03:00:00', closesNextDay: true }],
            },
          ],
        },
      },
    });

    expect(await gateway.getSpecialDays('b-1')).toEqual({
      version: '7',
      days: [
        {
          date: '2026-12-31',
          note: 'Ամանորի գիշեր',
          blocks: [{ opensAt: '18:00', closesAt: '03:00' }],
        },
        { date: '2027-01-01', note: null, blocks: [] },
      ],
    });
  });

  it('sends the whole list against the version it read, and takes the new version back', async () => {
    const { gateway, backend } = gatewayOver({
      [`PUT ${URL}`]: {
        body: {
          version: '8',
          days: [{ date: '2027-01-06', note: 'Սուրբ Ծնունդ', closed: true, blocks: [] }],
          affectedExistingReservations: 2,
          affectedReservationIds: ['r-1', 'r-2'],
        },
      },
    });

    const saved = await gateway.replaceSpecialDays({
      branchId: 'b-1',
      expectedVersion: '7',
      days: [
        { date: '2027-01-06', note: ' Սուրբ Ծնունդ ', blocks: [] },
        { date: '2027-03-08', note: '  ', blocks: [{ opensAt: '12:00', closesAt: '18:00' }] },
      ],
    });

    expect(backend.requests[0]?.method).toBe('PUT');
    expect(backend.requests[0]?.body).toEqual({
      expectedVersion: '7',
      days: [
        { date: '2027-01-06', note: 'Սուրբ Ծնունդ', blocks: [] },
        { date: '2027-03-08', note: null, blocks: [{ opensAt: '12:00:00', closesAt: '18:00:00' }] },
      ],
    });
    expect(saved.version).toBe('8');
    expect(saved.days.map((day) => day.date)).toEqual(['2027-01-06']);
    expect(saved.affectedReservationIds).toEqual(['r-1', 'r-2']);
  });

  it('turns a list saved by somebody else meanwhile into a ConcurrencyConflictError', async () => {
    const { gateway } = gatewayOver({
      [`PUT ${URL}`]: problemReply(409, 'concurrent-update', { currentVersion: '9' }),
    });
    const failure = await gateway
      .replaceSpecialDays({ branchId: 'b-1', expectedVersion: '7', days: [] })
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ConcurrencyConflictError);
  });

  it('turns a 422 into a ValidationError naming every field under days', async () => {
    const { gateway } = gatewayOver({
      [`PUT ${URL}`]: problemReply(422, 'validation-failed', {
        fields: [
          { field: 'days[0].date', bound: 'max', message: 'Too far.' },
          { field: 'days[1].date', bound: 'conflict', message: 'Twice.' },
        ],
      }),
    });

    const failure = await gateway
      .replaceSpecialDays({ branchId: 'b-1', expectedVersion: '7', days: [] })
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ValidationError);
    expect((failure as ValidationError).violations.map((v) => [v.field, v.bound])).toEqual([
      ['days[0].date', 'max'],
      ['days[1].date', 'conflict'],
    ]);
  });
});

describe("a dish's photo over HTTP", () => {
  it('takes it off with DELETE …/photo and reads the dish back without one', async () => {
    const { gateway, backend } = gatewayOver({
      'DELETE /api/branches/b-1/menu/items/i-1/photo': {
        body: {
          id: 'i-1',
          categoryId: 'c-1',
          name: 'Latte',
          priceAmd: 1400,
          spiceLevel: 0,
          isAvailable: true,
          isComplete: false,
          displayOrder: 0,
          missingFields: ['photo'],
        },
      },
    });

    const item = await gateway.removeMenuItemPhoto({ branchId: 'b-1', itemId: 'i-1' });
    expect(backend.requests[0]?.method).toBe('DELETE');
    expect(item.photo.photoId).toBe('');
    expect(item.missingFields).toEqual(['photoId']);
  });
});

describe('a new category or dish', () => {
  it('sends no display order, so the server puts it last', async () => {
    const { gateway, backend } = gatewayOver({
      'POST /api/branches/b-1/menu/categories': {
        body: { id: 'c-9', name: 'Tea', displayOrder: 4, items: [] },
      },
    });
    await gateway.createCategory({ branchId: 'b-1', name: 'Tea' });
    expect(backend.requests[0]?.body).toEqual({ name: 'Tea' });
  });
});
