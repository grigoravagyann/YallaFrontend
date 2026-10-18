import { describe, expect, it } from 'vitest';
import { isApprovalExpired } from '../contracts/approvals';
import type { Booking, CreateBookingCommand } from '../contracts/booking';
import type { YallaGateway } from '../gateway';
import { createMockGateway, type MockGatewayOptions } from './mockGateway';
import { SEEDED_ACCOUNT } from './accounts';

/**
 * Short notice, in the diner's mock: a booking for today, or within six hours,
 * waits for the floor, which has fifteen minutes to answer before the booking
 * is declined with an apology. The mock plays the floor, so the success
 * screen's countdown can be walked to both of its endings on one phone.
 */

const NORTH = 'b-lumen-north';
/** Tuesday 20 October 2026, 12:00 in Yerevan. */
const NOW = '2026-10-20T08:00:00.000Z';
const MINUTE = 60_000;

function clock(start = NOW) {
  let t = Date.parse(start);
  return {
    now: () => new Date(t),
    advance: (ms: number) => {
      t += ms;
    },
  };
}

/** A Yerevan wall-clock time as the instant a booking carries. */
function at(date: string, time: string): string {
  return new Date(`${date}T${time}:00+04:00`).toISOString();
}

function world(time: ReturnType<typeof clock>, options: MockGatewayOptions = {}) {
  return createMockGateway({
    latencyMs: 0,
    simulateJoiners: false,
    now: time.now,
    codeSeed: 7,
    ...options,
  });
}

/** Signed in with a proved phone, as booking requires — the feed is the account's. */
async function signedIn(gateway: YallaGateway): Promise<void> {
  await gateway.loginDiner({
    identifier: SEEDED_ACCOUNT.username,
    password: SEEDED_ACCOUNT.password,
  });
  const challenge = await gateway.requestPhoneCode(SEEDED_ACCOUNT.phoneE164);
  await gateway.verifyPhoneCode({ challengeId: challenge.challengeId, code: challenge.devCode! });
}

async function book(
  gateway: YallaGateway,
  slotUtc: string,
  options: { partySize?: number; channel?: CreateBookingCommand['channel'] } = {},
): Promise<Booking> {
  const partySize = options.partySize ?? 2;
  const floor = await gateway.getSlotFloor({ branchId: NORTH, slotUtc, partySize });
  const tableId = floor?.tables.find((table) => table.isBookable)?.tableId ?? 'none';
  return gateway.createBooking({
    commandId: crypto.randomUUID(),
    branchId: NORTH,
    tableId,
    slotUtc,
    timeZoneId: 'Asia/Yerevan',
    partySize,
    guestName: 'Ani',
    guestPhone: '+37477123456',
    channel: options.channel ?? 'app',
  });
}

describe('a booking at short notice', () => {
  it('waits for the floor with a fifteen-minute window when it is for today', async () => {
    const time = clock();
    const gateway = world(time);
    await signedIn(gateway);

    const booking = await book(gateway, at('2026-10-20', '21:00'));

    expect(booking).toMatchObject({
      status: 'pendingApproval',
      awaitingApprovalBecause: 'shortNotice',
      approvalExpiresAtUtc: '2026-10-20T08:15:00.000Z',
      declinedBecause: null,
    });
  });

  it('is the same from the public page', async () => {
    const gateway = world(clock());
    await signedIn(gateway);
    const booking = await book(gateway, at('2026-10-20', '21:00'), { channel: 'web' });
    expect(booking.awaitingApprovalBecause).toBe('shortNotice');
  });

  it('closes at the start when that comes before the fifteen minutes', async () => {
    const time = clock();
    const gateway = world(time, { approvalWindowMs: 60 * MINUTE });
    await signedIn(gateway);
    const booking = await book(gateway, at('2026-10-20', '12:45'));
    expect(booking.approvalExpiresAtUtc).toBe(at('2026-10-20', '12:45'));
  });

  it('confirms a booking for another day as before, and a large party still waits without a clock', async () => {
    const gateway = world(clock());
    await signedIn(gateway);

    const tomorrow = await book(gateway, at('2026-10-21', '19:00'));
    expect(tomorrow).toMatchObject({
      status: 'confirmed',
      awaitingApprovalBecause: null,
      approvalExpiresAtUtc: null,
    });

    const party = await book(gateway, at('2026-10-21', '20:00'), { partySize: 8 });
    expect(party).toMatchObject({
      status: 'pendingApproval',
      awaitingApprovalBecause: 'largeParty',
      approvalExpiresAtUtc: null,
    });
  });
});

describe('when nobody answers', () => {
  it('is declined for want of an answer once the window closes, and says sorry in the feed', async () => {
    const time = clock();
    const gateway = world(time);
    await signedIn(gateway);
    const booking = await book(gateway, at('2026-10-20', '21:00'));

    time.advance(15 * MINUTE);

    expect(await gateway.getBooking(booking.id)).toMatchObject({
      status: 'cancelledByVenue',
      awaitingApprovalBecause: null,
      approvalExpiresAtUtc: null,
      declinedBecause: 'noAnswer',
    });
    const feed = await gateway.listNotifications();
    const row = feed.items.find((item) => item.reservationId === booking.id);
    // As the server writes them: text.
    expect(row).toMatchObject({
      kind: 'booking-declined',
      params: { expired: 'true', wasChange: 'false', originalKept: 'false' },
    });
  });

  it('frees the table again', async () => {
    const time = clock();
    const gateway = world(time);
    await signedIn(gateway);
    const slot = at('2026-10-20', '21:00');
    const booking = await book(gateway, slot);

    time.advance(16 * MINUTE);
    await gateway.getBooking(booking.id);

    const floor = await gateway.getSlotFloor({ branchId: NORTH, slotUtc: slot, partySize: 2 });
    expect(floor?.tables.find((table) => table.tableId === booking.tableId)?.isBookable).toBe(true);
  });
});

describe('the floor, played by the mock', () => {
  it('approves the first short-notice request, and lets the next one run out', async () => {
    const time = clock();
    const gateway = world(time, { simulateVenueApprovalAfterMs: 20_000 });
    await signedIn(gateway);

    const first = await book(gateway, at('2026-10-20', '21:00'));
    const second = await book(gateway, at('2026-10-20', '22:00'));

    time.advance(20_000);
    expect(await gateway.getBooking(first.id)).toMatchObject({
      status: 'confirmed',
      approvalExpiresAtUtc: null,
    });
    expect((await gateway.getBooking(second.id))?.status).toBe('pendingApproval');

    time.advance(15 * MINUTE);
    expect((await gateway.getBooking(second.id))?.declinedBecause).toBe('noAnswer');
    const feed = await gateway.listNotifications();
    expect(feed.items.find((item) => item.reservationId === first.id)?.kind).toBe(
      'booking-confirmed',
    );
  });
});

describe('moving a booking', () => {
  it('keeps a confirmed booking confirmed when only the party shrinks', async () => {
    const time = clock();
    const gateway = world(time, { simulateVenueApprovalAfterMs: 1_000 });
    await signedIn(gateway);
    const booking = await book(gateway, at('2026-10-20', '21:00'), { partySize: 3 });
    time.advance(1_000);
    expect((await gateway.getBooking(booking.id))?.status).toBe('confirmed');

    const smaller = await gateway.rescheduleBooking({
      bookingId: booking.id,
      commandId: crypto.randomUUID(),
      tableId: booking.tableId,
      slotUtc: booking.slotUtc,
      timeZoneId: 'Asia/Yerevan',
      partySize: 2,
    });
    expect(smaller).toMatchObject({ status: 'confirmed', approvalExpiresAtUtc: null });
  });

  it('asks the floor again, with a fresh window, when a booking moves into short notice', async () => {
    const time = clock();
    const gateway = world(time);
    await signedIn(gateway);
    const booking = await book(gateway, at('2026-10-21', '19:00'));
    expect(booking.status).toBe('confirmed');

    time.advance(5 * MINUTE);
    const moved = await gateway.rescheduleBooking({
      bookingId: booking.id,
      commandId: crypto.randomUUID(),
      tableId: booking.tableId,
      slotUtc: at('2026-10-20', '20:00'),
      timeZoneId: 'Asia/Yerevan',
      partySize: 2,
    });
    expect(moved).toMatchObject({
      status: 'pendingApproval',
      awaitingApprovalBecause: 'shortNotice',
      approvalExpiresAtUtc: '2026-10-20T08:20:00.000Z',
    });
  });
});

/** Move a booking to `slotUtc`, on the same table unless told otherwise. */
function moveTo(
  gateway: YallaGateway,
  booking: Booking,
  slotUtc: string,
  tableId: string = booking.tableId,
): Promise<Booking> {
  return gateway.rescheduleBooking({
    bookingId: booking.id,
    commandId: crypto.randomUUID(),
    tableId,
    slotUtc,
    timeZoneId: 'Asia/Yerevan',
    partySize: booking.partySize,
  });
}

describe('a change the floor does not confirm', () => {
  it('puts a confirmed booking back on the slot it had, confirmed, and says so in the feed', async () => {
    const time = clock();
    const gateway = world(time);
    await signedIn(gateway);
    const booking = await book(gateway, at('2026-10-21', '19:00'));
    expect(booking.status).toBe('confirmed');

    const moved = await moveTo(gateway, booking, at('2026-10-20', '20:00'));
    expect(moved).toMatchObject({
      status: 'pendingApproval',
      awaitingApprovalBecause: 'shortNotice',
    });

    time.advance(15 * MINUTE);

    expect(await gateway.getBooking(booking.id)).toMatchObject({
      status: 'confirmed',
      slotUtc: booking.slotUtc,
      tableId: booking.tableId,
      partySize: booking.partySize,
      approvalExpiresAtUtc: null,
      awaitingApprovalBecause: null,
      declinedBecause: null,
    });
    const feed = await gateway.listNotifications();
    const row = feed.items.find((item) => item.reservationId === booking.id);
    expect(row).toMatchObject({
      kind: 'booking-declined',
      params: {
        expired: 'true',
        wasChange: 'true',
        originalKept: 'true',
        requestedDate: '2026-10-20',
        requestedTime: '20:00',
        // The booking as it now stands: back at its old slot.
        date: '2026-10-21',
        time: '19:00',
      },
    });
  });

  it('ends the booking when its old slot has gone in the meantime', async () => {
    const time = clock();
    const gateway = world(time);
    await signedIn(gateway);
    const booking = await book(gateway, at('2026-10-21', '19:00'));
    await moveTo(gateway, booking, at('2026-10-20', '20:00'));
    // Somebody takes the table at the old time while the change waits.
    await gateway.createBooking({
      commandId: crypto.randomUUID(),
      branchId: NORTH,
      tableId: booking.tableId,
      slotUtc: booking.slotUtc,
      timeZoneId: 'Asia/Yerevan',
      partySize: 2,
      guestName: 'Karen',
      guestPhone: '+37477123456',
      channel: 'app',
    });

    time.advance(15 * MINUTE);

    expect(await gateway.getBooking(booking.id)).toMatchObject({
      status: 'cancelledByVenue',
      declinedBecause: 'noAnswer',
    });
    const feed = await gateway.listNotifications();
    expect(feed.items.find((item) => item.reservationId === booking.id)?.params).toMatchObject({
      wasChange: 'true',
      originalKept: 'false',
      requestedTime: '20:00',
    });
  });
});

describe('moving a request that is already waiting', () => {
  it('keeps its deadline: a move buys the floor no extra minutes', async () => {
    const time = clock();
    const gateway = world(time);
    await signedIn(gateway);
    const waiting = await book(gateway, at('2026-10-20', '20:00'));
    expect(waiting.approvalExpiresAtUtc).toBe('2026-10-20T08:15:00.000Z');

    time.advance(5 * MINUTE);
    const moved = await moveTo(gateway, waiting, at('2026-10-20', '21:00'));

    expect(moved).toMatchObject({
      status: 'pendingApproval',
      approvalExpiresAtUtc: '2026-10-20T08:15:00.000Z',
    });
  });

  it('is refused once the deadline has passed, as too late rather than as unchangeable', async () => {
    const time = clock();
    const gateway = world(time);
    await signedIn(gateway);
    const waiting = await book(gateway, at('2026-10-20', '20:00'));

    time.advance(15 * MINUTE);
    const refusal = await moveTo(gateway, waiting, at('2026-10-20', '21:00')).catch(
      (error: unknown) => error,
    );

    expect(isApprovalExpired(refusal)).toBe(true);
  });
});
