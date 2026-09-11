import { beforeEach, describe, expect, it } from 'vitest';
import type { Booking } from '../contracts/booking';
import type { YallaGateway } from '../gateway';
import { createMockGateway } from './mockGateway';

/**
 * "I'm at my table": the booking code, on the mock.
 *
 * The rules the server applies, applied here — whose booking it is, what state
 * it is in, whether the table is being held for it yet — so the screens can be
 * walked without a backend and so the two cannot quietly disagree about which
 * refusal a diner sees.
 *
 * One rule is deliberately not re-tested here: a table out of service. It is
 * not reachable through a booking in this fixture (an out-of-service table
 * cannot be booked in the first place), and it is the *same* code path the
 * table scan takes — `openAtTable` — which the scan's own tests cover.
 */

const BRANCH = 'b-lumen-north';
/** Comfortably past the 15-minute lead time, and a 90-minute sitting after it. */
const SLOT = new Date('2026-09-04T18:00:00Z').toISOString();
const BOOKED_UNTIL = new Date('2026-09-04T19:30:00Z');

let clock = new Date('2026-09-04T14:30:00Z');
let gateway: YallaGateway;

beforeEach(() => {
  clock = new Date('2026-09-04T14:30:00Z');
  gateway = createMockGateway({ now: () => clock, simulateJoiners: false });
});

async function book(partySize = 2): Promise<Booking> {
  const challenge = await gateway.requestPhoneCode('+37411223344');
  const verified = await gateway.verifyPhoneCode({
    challengeId: challenge.challengeId,
    code: challenge.devCode ?? '123456',
  });
  const availability = await gateway.getTableAvailability({
    branchId: BRANCH,
    slotUtc: SLOT,
    partySize,
  });
  const bookable = availability.find((a) => a.isBookable);
  expect(bookable, 'fixture must contain a bookable table').toBeDefined();

  return gateway.createBooking({
    commandId: `book-${bookable!.tableId}`,
    branchId: BRANCH,
    tableId: bookable!.tableId,
    slotUtc: SLOT,
    partySize,
    guestPhone: verified.phoneE164,
    timeZoneId: 'Asia/Yerevan',
    guestName: 'Ani',
    channel: 'app',
  });
}

async function caught(promise: Promise<unknown>): Promise<Error & Record<string, unknown>> {
  try {
    await promise;
  } catch (error) {
    return error as Error & Record<string, unknown>;
  }
  throw new Error('expected a rejection');
}

/** Inside the window the table is held for the booking. */
function arrive(): void {
  clock = new Date('2026-09-04T17:55:00Z');
}

describe('opening the tab from a booking', () => {
  it('opens the tab on the table that was booked, with the diner hosting it', async () => {
    const booking = await book();
    arrive();

    const result = await gateway.openTabByBooking({ bookingCode: booking.code, commandId: 'c1' });

    expect(result.kind).toBe('tabOpened');
    // The booked table, not merely some table at the branch.
    expect(result.tab.tableLabel).toBe(booking.tableLabel);
    expect(result.tab.me.role).toBe('host');
  });

  it('seats the booking rather than leaving it waiting for a party that is eating', async () => {
    const booking = await book();
    arrive();

    await gateway.openTabByBooking({ bookingCode: booking.code, commandId: 'c1' });

    // Left Confirmed, the floor goes on treating them as not arrived: flagged
    // late, nudged, one tap from a no-show — while they are sitting there.
    expect((await gateway.getBooking(booking.id))?.status).toBe('seated');
  });

  it('takes the code however it was read out or typed', async () => {
    const booking = await book();
    arrive();

    const typed = `${booking.code.slice(0, 3)}-${booking.code.slice(3)}`.toLowerCase();
    await expect(
      gateway.openTabByBooking({ bookingCode: ` ${typed} `, commandId: 'c1' }),
    ).resolves.toMatchObject({ kind: 'tabOpened' });
  });

  it('answers a code that is not one of yours with no such booking', async () => {
    await book();
    arrive();

    // In the mock, as on the server, the lookup runs over *this diner's own*
    // bookings — so a stranger's code and a code nobody holds are the same
    // answer, which is the point: a six-character code proves nothing.
    const error = await caught(
      gateway.openTabByBooking({ bookingCode: 'ZZZZZZ', commandId: 'c1' }),
    );

    expect(error.name).toBe('BookingNotFoundError');
    expect(error['status']).toBe(404);
  });

  it('refuses before the table is held, and says from when it is', async () => {
    const booking = await book();
    // Hours early: the table is still somebody else's until the holdback.
    const error = await caught(
      gateway.openTabByBooking({ bookingCode: booking.code, commandId: 'c1' }),
    );

    expect(error.name).toBe('BookingTooEarlyError');
    expect(Date.parse(error['earliestUtc'] as string)).toBeLessThan(Date.parse(SLOT));
    expect(Date.parse(error['earliestUtc'] as string)).toBeGreaterThan(clock.getTime());
  });

  it('opens the moment the table starts being held, not a minute later', async () => {
    const booking = await book();
    const early = await caught(
      gateway.openTabByBooking({ bookingCode: booking.code, commandId: 'c0' }),
    );

    clock = new Date(early['earliestUtc'] as string);

    await expect(
      gateway.openTabByBooking({ bookingCode: booking.code, commandId: 'c1' }),
    ).resolves.toMatchObject({ kind: 'tabOpened' });
  });

  it('refuses once the sitting is over', async () => {
    const booking = await book();
    clock = BOOKED_UNTIL;

    const error = await caught(
      gateway.openTabByBooking({ bookingCode: booking.code, commandId: 'c1' }),
    );

    expect(error.name).toBe('BookingEndedError');
  });

  it('is late-friendly: past the start is still their table', async () => {
    const booking = await book();
    clock = new Date('2026-09-04T18:40:00Z');

    await expect(
      gateway.openTabByBooking({ bookingCode: booking.code, commandId: 'c1' }),
    ).resolves.toMatchObject({ kind: 'tabOpened' });
  });

  it('refuses a booking that is no longer live, and says which state it is in', async () => {
    const booking = await book();
    await gateway.cancelBooking(booking.id);
    arrive();

    const error = await caught(
      gateway.openTabByBooking({ bookingCode: booking.code, commandId: 'c1' }),
    );

    expect(error.name).toBe('BookingNotActiveError');
    expect(error['bookingStatus']).toBe('cancelledByDiner');
  });

  it('replaying one command id cannot open two tabs on the table', async () => {
    const booking = await book();
    arrive();

    const first = await gateway.openTabByBooking({ bookingCode: booking.code, commandId: 'same' });
    const second = await gateway.openTabByBooking({ bookingCode: booking.code, commandId: 'same' });

    expect(second.tab.tabId).toBe(first.tab.tabId);
  });

  it('lands a second person on the tab already open at their booked table', async () => {
    const booking = await book();
    arrive();

    await gateway.openTabByBooking({ bookingCode: booking.code, commandId: 'c1' });
    const again = await gateway.openTabByBooking({ bookingCode: booking.code, commandId: 'c2' });

    // Same tab, no second one: this is the scan's own join semantics, reached
    // from a booking instead of a QR.
    expect(again.kind).toBe('alreadyOn');
  });
});
