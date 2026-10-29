import { describe, expect, it } from 'vitest';
import { booksByTimeOnly, timeFullGuestsLeft } from '../contracts/publicBranch';
import { ApiError } from '../errors';
import type { ProblemDetails } from '../problem';
import { fakeBackend } from './fakeBackend.testkit';
import { createPublicHttpGateway } from './publicHttpGateway';
import { managedBookingFromWire, type WirePublicBooking } from './publicMapping';

/**
 * Booking by time only (2026-10-29) as the public page reads it: the branch's
 * mode, a day of times that counts guests, a booking with no table yet, and
 * the `time-full` refusal's count.
 */

const BRANCH = '0b5f3c1e-0000-4000-8000-000000000001';

describe('a day of times at a branch that books by time only', () => {
  it('reads how many more guests each time takes, from the public route', async () => {
    const backend = fakeBackend({
      [`GET /api/public/branches/${BRANCH}/availability/slots`]: {
        body: {
          branchId: BRANCH,
          date: '2026-10-30',
          partySize: 4,
          stepMinutes: 15,
          slots: [
            {
              time: '19:30',
              startUtc: '2026-10-30T15:30:00Z',
              isAvailable: false,
              isRequestable: false,
              requiresApproval: false,
              freeTableCount: 0,
              requestableTableCount: 0,
              guestsLeft: 2,
              unavailableReason: 16,
            },
            {
              time: '19:00',
              startUtc: '2026-10-30T15:00:00Z',
              isAvailable: true,
              isRequestable: false,
              requiresApproval: false,
              freeTableCount: 0,
              requestableTableCount: 0,
              guestsLeft: 12,
            },
          ],
        },
      },
    });
    const gateway = createPublicHttpGateway(backend.client());

    const day = await gateway.getTimeOnlySlots({
      branchId: BRANCH,
      date: '2026-10-30',
      partySize: 4,
    });

    const query = backend.requests[0]?.query;
    expect(query?.get('date')).toBe('2026-10-30');
    expect(query?.get('partySize')).toBe('4');
    // Anonymous, as everything on the public page.
    expect(backend.requests[0]?.headers.get('authorization')).toBeNull();
    // Earliest first, each with its own count; the full one is struck.
    expect(day?.slots.map((slot) => [slot.time, slot.isAvailable, slot.guestsLeft])).toEqual([
      ['19:00', true, 12],
      ['19:30', false, 2],
    ]);
  });
});

describe('a booking made by time only, from its manage link', () => {
  const WIRE = {
    reservationId: 'r-1',
    code: 'Y3107',
    status: 2,
    venueName: 'Lumen Coffee',
    branchName: 'Northern Avenue',
    branchAddress: 'Northern Avenue 5',
    partySize: 4,
    localDate: '2026-10-30',
    localStartTime: '19:00:00',
    timeZoneId: 'Asia/Yerevan',
    cancellationDeadlineUtc: '2026-10-30T13:00:00Z',
    canCancel: true,
    canChange: false,
  } as unknown as WirePublicBooking;

  it('has no table until the venue seats it, and says it was booked without one', () => {
    expect(managedBookingFromWire(WIRE)).toMatchObject({
      tableId: null,
      tableLabel: null,
      bookedWithoutTable: true,
    });
  });

  it('is an ordinary booking once it has a table', () => {
    expect(managedBookingFromWire({ ...WIRE, tableId: 't-7', tableLabel: '7' })).toMatchObject({
      tableId: 't-7',
      tableLabel: '7',
      bookedWithoutTable: false,
    });
  });
});

describe('the branch page and the time-full refusal', () => {
  it('reads the mode, an absent one as choosing a table', () => {
    expect(booksByTimeOnly({ bookingMode: 'timeOnly' })).toBe(true);
    expect(booksByTimeOnly({ bookingMode: 'chooseTable' })).toBe(false);
    expect(booksByTimeOnly({})).toBe(false);
  });

  it('says how many the time could still take, and nothing for another refusal', () => {
    const problem = (code: string, context: Record<string, unknown>) =>
      ({
        type: 'about:blank',
        title: 'Conflict',
        status: 409,
        detail: code,
        code,
        context,
      }) as unknown as ProblemDetails;
    const full = new ApiError('full', {
      status: 409,
      url: 'https://api.test/api/public/branches/b/reservations',
      problem: problem('time-full', { branchId: BRANCH, partySize: 6, guestsLeft: 3 }),
    });
    const taken = new ApiError('taken', {
      status: 409,
      url: 'https://api.test/api/public/branches/b/reservations',
      problem: problem('table-already-booked', {}),
    });

    expect(timeFullGuestsLeft(full)).toBe(3);
    expect(timeFullGuestsLeft(taken)).toBeNull();
    expect(timeFullGuestsLeft(new Error('offline'))).toBeNull();
  });
});
