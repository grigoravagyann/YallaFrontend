import { describe, expect, it } from 'vitest';
import { createStaffMockGateway } from './staffMock';

/**
 * Booking times on the floor tablet's mock (mock mode only): a request for a
 * table whose earlier guest booked on the web — so the floor rings them and
 * decides, with no clock — and a party that promised to free its table
 * before the next booking. Off by default: every other test reads the room as
 * it always was.
 */

const START = new Date('2026-10-18T14:00:00Z');

function clock(at: Date = START) {
  let now = at;
  return {
    now: () => now,
    advance(ms: number) {
      now = new Date(now.getTime() + ms);
    },
  };
}

describe('booking times on the floor', () => {
  it('lists a request waiting on the guest before, with no clock and the promise it carries', async () => {
    const staff = createStaffMockGateway({ now: clock().now, seedBookingTimes: true });
    const listed = await staff.listAwaitingApproval('b1');
    const asking = listed.find((entry) => entry.because === 'earlierGuestConsent');

    expect(asking).toBeDefined();
    // The floor's own question for another day: no clock (reservations.md §3e).
    expect(asking!.approvalExpiresAtUtc).toBeNull();
    expect(asking!.previousBooking).toMatchObject({ status: 'confirmed' });
    expect(asking!.previousBooking!.guestPhone).toMatch(/^\+374\d{8}$/u);
    expect(asking!.promisedFreeByUtc).not.toBeNull();
    // The time to ask them for: five minutes before this booking starts.
    expect(Date.parse(asking!.earlierGuestFreeByUtc!)).toBe(
      Date.parse(asking!.startUtc) - 5 * 60_000,
    );
  });

  it('keeps it waiting past two hours — it waits as any booking the floor decides', async () => {
    const time = clock();
    const staff = createStaffMockGateway({ now: time.now, seedBookingTimes: true });
    time.advance(3 * 60 * 60_000);
    const listed = await staff.listAwaitingApproval('b1');
    expect(listed.some((entry) => entry.because === 'earlierGuestConsent')).toBe(true);
  });

  it('says on the floor by when the party sitting, and the next booking, promised to leave', async () => {
    const staff = createStaffMockGateway({ now: clock().now, seedBookingTimes: true });
    const floor = await staff.getFloor('b1');
    const promised = floor!.details.filter((detail) => detail.sittingPromisedFreeByUtc);
    expect(promised).toHaveLength(1);
    const [table] = promised;
    // Sitting now, gone before the next booking; which itself promised a time.
    expect(Date.parse(table!.sittingPromisedFreeByUtc!)).toBeLessThan(
      Date.parse(table!.nextReservationStartUtc!),
    );
    expect(table!.nextReservationPromisedFreeByUtc).not.toBeNull();
  });

  it('seeds none of it unless asked', async () => {
    const staff = createStaffMockGateway({ now: clock().now });
    const listed = await staff.listAwaitingApproval('b1');
    expect(listed.some((entry) => entry.because === 'earlierGuestConsent')).toBe(false);
    const floor = await staff.getFloor('b1');
    expect(
      floor!.details.some(
        (detail) => detail.sittingPromisedFreeByUtc || detail.nextReservationPromisedFreeByUtc,
      ),
    ).toBe(false);
  });
});
