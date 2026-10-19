import { describe, expect, it, vi } from 'vitest';
import { createAuthSession } from '../auth/session';
import { createMemoryTokenStorage } from '../auth/storage';
import { ValidationError } from '../errors';
import { createConsoleHttpGateway, createMemoryIdentityStore } from './consoleHttpGateway';
import { fakeBackend, type FakeRoute } from './fakeBackend.testkit';

/**
 * Special days over HTTP, on the wire the backend's agent decided for
 * `feat/venue-console-3` (VC3 wire §1): `GET/PUT
 * /api/branches/{id}/opening-hours/exceptions`, the PUT a bare array that is
 * the whole list from the branch's today on.
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
  it('reads the list in date order, a closed day as no blocks and an absent note as null', async () => {
    const { gateway } = gatewayOver({
      [`GET ${URL}`]: {
        body: [
          { date: '2027-01-01', closed: true, blocks: [] },
          {
            date: '2026-12-31',
            note: 'Ամանորի գիշեր',
            closed: false,
            blocks: [{ opensAt: '18:00:00', closesAt: '03:00:00', closesNextDay: true }],
          },
        ],
      },
    });

    expect(await gateway.getSpecialDays('b-1')).toEqual([
      {
        date: '2026-12-31',
        note: 'Ամանորի գիշեր',
        blocks: [{ opensAt: '18:00', closesAt: '03:00' }],
      },
      { date: '2027-01-01', note: null, blocks: [] },
    ]);
  });

  it('sends the whole list as a bare array, times with seconds, and takes the saved list back', async () => {
    const { gateway, backend } = gatewayOver({
      [`PUT ${URL}`]: {
        body: {
          days: [
            { date: '2027-01-06', note: 'Սուրբ Ծնունդ', closed: true, blocks: [] },
            {
              date: '2027-03-08',
              closed: false,
              blocks: [{ opensAt: '12:00:00', closesAt: '18:00:00', closesNextDay: false }],
            },
          ],
          affectedExistingReservations: 2,
          affectedReservationIds: ['r-1', 'r-2'],
        },
      },
    });

    const saved = await gateway.replaceSpecialDays({
      branchId: 'b-1',
      days: [
        { date: '2027-01-06', note: ' Սուրբ Ծնունդ ', blocks: [] },
        { date: '2027-03-08', note: '  ', blocks: [{ opensAt: '12:00', closesAt: '18:00' }] },
      ],
    });

    expect(backend.requests[0]?.method).toBe('PUT');
    expect(backend.requests[0]?.body).toEqual([
      { date: '2027-01-06', note: 'Սուրբ Ծնունդ', blocks: [] },
      { date: '2027-03-08', note: null, blocks: [{ opensAt: '12:00:00', closesAt: '18:00:00' }] },
    ]);
    expect(saved.days.map((day) => day.date)).toEqual(['2027-01-06', '2027-03-08']);
    expect(saved.days[1]?.note).toBeNull();
    expect(saved.affectedExistingReservations).toBe(2);
    expect(saved.affectedReservationIds).toEqual(['r-1', 'r-2']);
  });

  it('turns a 422 into a ValidationError naming every field', async () => {
    const { gateway } = gatewayOver({
      [`PUT ${URL}`]: {
        status: 422,
        body: {
          type: 'https://yalla.am/problems/validation-failed',
          title: 'Validation failed',
          status: 422,
          detail: 'Validation failed.',
          code: 'validation-failed',
          context: {
            fields: [
              { field: '[0].date', bound: 'min', min: '2026-10-19', message: 'In the past.' },
              { field: '[1].date', bound: 'conflict', message: 'Twice.' },
            ],
          },
        },
      },
    });

    const failure = await gateway
      .replaceSpecialDays({ branchId: 'b-1', days: [] })
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ValidationError);
    expect((failure as ValidationError).violations.map((v) => [v.field, v.bound])).toEqual([
      ['[0].date', 'min'],
      ['[1].date', 'conflict'],
    ]);
  });
});
