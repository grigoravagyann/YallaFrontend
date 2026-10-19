import { describe, expect, it } from 'vitest';
import { ReservationNotStartedError } from '../contracts/errors';
import { newCommandId } from '../ids';
import { createStaffMockGateway } from './staffMock';

/** The tablet's mock follows the server: no no-show before the booking's start (FT2 wire). */
describe('a no-show on the staff mock', () => {
  it('is refused before the start, and a release "they let us know" is not', async () => {
    const staff = createStaffMockGateway({ latencyMs: 0, seedBookingTimes: true });
    const floor = await staff.getFloor('b1');
    const ahead = floor!.details.find(
      (detail) =>
        detail.nextReservationId !== null &&
        detail.nextReservationStartUtc !== null &&
        Date.parse(detail.nextReservationStartUtc) > Date.now(),
    );
    expect(ahead).toBeDefined();

    const error = await staff
      .releaseReservation({
        reservationId: ahead!.nextReservationId!,
        outcome: 'noShow',
        clientCommandId: newCommandId(),
      })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ReservationNotStartedError);
    expect((error as ReservationNotStartedError).startUtc).toBe(ahead!.nextReservationStartUtc);

    await expect(
      staff.releaseReservation({
        reservationId: ahead!.nextReservationId!,
        outcome: 'guestCancelled',
        clientCommandId: newCommandId(),
      }),
    ).resolves.toMatchObject({ outcome: 'guestCancelled' });
  });
});
