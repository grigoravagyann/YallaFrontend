import { describe, expect, it, vi } from 'vitest';
import { createAuthSession } from '../auth/session';
import { createMemoryTokenStorage } from '../auth/storage';
import { StaffPermissionError } from '../contracts/errors';
import { ValidationError } from '../errors';
import { createConsoleHttpGateway, createMemoryIdentityStore } from './consoleHttpGateway';
import { fakeBackend, problemReply, type FakeRoute } from './fakeBackend.testkit';

/**
 * Shifts over HTTP (VC5 wire §1): `GET/POST /api/branches/{id}/shifts`,
 * `PUT/DELETE …/shifts/{shiftId}`. Times arrive as `HH:mm:ss` and are shown
 * `HH:mm`; a day off carries no times either way; the rank rule's 403 is the
 * staff routes' refusal, and a 422 names every field.
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

const URL = '/api/branches/b-1/shifts';

describe('shifts over HTTP', () => {
  it('reads the window, today and the head count, with times in minutes', async () => {
    const { gateway, backend } = gatewayOver({
      [`GET ${URL}`]: {
        body: {
          branchId: 'b-1',
          serviceDate: '2026-10-19',
          from: '2026-10-19',
          to: '2026-11-01',
          onShiftToday: 1,
          shifts: [
            {
              id: 's-2',
              staffMemberId: 'p-2',
              branchId: 'b-1',
              date: '2026-10-19',
              dayOff: true,
              endsNextDay: false,
            },
            {
              id: 's-1',
              staffMemberId: 'p-1',
              branchId: 'b-1',
              date: '2026-10-19',
              dayOff: false,
              startsAt: '16:00:00',
              endsAt: '00:00:00',
              endsNextDay: true,
              startsAtUtc: '2026-10-19T12:00:00Z',
              endsAtUtc: '2026-10-19T20:00:00Z',
            },
          ],
        },
      },
    });

    const read = await gateway.listBranchShifts({ branchId: 'b-1' });
    // No dates asked for: the server answers from the branch's service day.
    expect([...(backend.requests[0]?.query.keys() ?? [])]).toEqual([]);
    expect(read).toEqual({
      branchId: 'b-1',
      serviceDate: '2026-10-19',
      from: '2026-10-19',
      to: '2026-11-01',
      onShiftToday: 1,
      shifts: [
        {
          id: 's-2',
          staffMemberId: 'p-2',
          branchId: 'b-1',
          date: '2026-10-19',
          dayOff: true,
          startsAt: null,
          endsAt: null,
          endsNextDay: false,
        },
        {
          id: 's-1',
          staffMemberId: 'p-1',
          branchId: 'b-1',
          date: '2026-10-19',
          dayOff: false,
          startsAt: '16:00',
          endsAt: '00:00',
          endsNextDay: true,
        },
      ],
    });
  });

  it('asks for a window when one is given', async () => {
    const { gateway, backend } = gatewayOver({
      [`GET ${URL}`]: {
        body: {
          branchId: 'b-1',
          serviceDate: '2026-10-19',
          from: '2026-10-20',
          to: '2026-10-26',
          onShiftToday: 0,
          shifts: [],
        },
      },
    });
    await gateway.listBranchShifts({ branchId: 'b-1', from: '2026-10-20', to: '2026-10-26' });
    expect(backend.requests[0]?.query.get('from')).toBe('2026-10-20');
    expect(backend.requests[0]?.query.get('to')).toBe('2026-10-26');
  });

  it('plans a shift for a person, and a day off without times', async () => {
    const shift = {
      id: 's-9',
      staffMemberId: 'p-1',
      branchId: 'b-1',
      date: '2026-10-21',
      dayOff: false,
      startsAt: '10:00:00',
      endsAt: '19:00:00',
      endsNextDay: false,
    };
    const { gateway, backend } = gatewayOver({ [`POST ${URL}`]: { status: 201, body: shift } });

    const made = await gateway.createShift({
      branchId: 'b-1',
      staffMemberId: 'p-1',
      shift: { date: '2026-10-21', dayOff: false, startsAt: '10:00', endsAt: '19:00' },
    });
    expect(backend.requests[0]?.body).toEqual({
      staffMemberId: 'p-1',
      date: '2026-10-21',
      dayOff: false,
      startsAt: '10:00',
      endsAt: '19:00',
    });
    expect(made.startsAt).toBe('10:00');

    await gateway.createShift({
      branchId: 'b-1',
      staffMemberId: 'p-1',
      shift: { date: '2026-10-22', dayOff: true, startsAt: '10:00', endsAt: '19:00' },
    });
    expect(backend.requests[1]?.body).toEqual({
      staffMemberId: 'p-1',
      date: '2026-10-22',
      dayOff: true,
    });
  });

  it('puts the whole shift back without the person, and deletes by id', async () => {
    const { gateway, backend } = gatewayOver({
      [`PUT ${URL}/s-1`]: {
        body: {
          id: 's-1',
          staffMemberId: 'p-1',
          branchId: 'b-1',
          date: '2026-10-21',
          dayOff: false,
          startsAt: '18:00:00',
          endsAt: '02:00:00',
          endsNextDay: true,
        },
      },
      [`DELETE ${URL}/s-1`]: { status: 204 },
    });

    const changed = await gateway.updateShift({
      branchId: 'b-1',
      shiftId: 's-1',
      shift: { date: '2026-10-21', dayOff: false, startsAt: '18:00', endsAt: '02:00' },
    });
    expect(backend.requests[0]?.body).toEqual({
      date: '2026-10-21',
      dayOff: false,
      startsAt: '18:00',
      endsAt: '02:00',
    });
    expect(changed.endsNextDay).toBe(true);

    await gateway.deleteShift({ branchId: 'b-1', shiftId: 's-1' });
    expect(backend.requests[1]?.method).toBe('DELETE');
  });

  it('turns the rank rule into a StaffPermissionError', async () => {
    const { gateway } = gatewayOver({
      [`POST ${URL}`]: problemReply(403, 'forbidden', undefined, 'Not yours to plan.'),
    });
    const failure = await gateway
      .createShift({
        branchId: 'b-1',
        staffMemberId: 'p-1',
        shift: { date: '2026-10-21', dayOff: false, startsAt: '10:00', endsAt: '19:00' },
      })
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(StaffPermissionError);
  });

  it('keeps every field a 422 names, with its bound', async () => {
    const { gateway } = gatewayOver({
      [`PUT ${URL}/s-1`]: problemReply(422, 'validation-failed', {
        fields: [
          { field: 'startsAt', bound: 'conflict', message: 'It overlaps 2026-10-21 10:00–19:00.' },
          { field: 'endsAt', bound: 'max', message: 'At most 16 hours.', max: 960 },
        ],
      }),
    });
    const failure = await gateway
      .updateShift({
        branchId: 'b-1',
        shiftId: 's-1',
        shift: { date: '2026-10-21', dayOff: false, startsAt: '09:00', endsAt: '12:00' },
      })
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ValidationError);
    expect((failure as ValidationError).violations.map((v) => [v.field, v.bound])).toEqual([
      ['startsAt', 'conflict'],
      ['endsAt', 'max'],
    ]);
  });
});
