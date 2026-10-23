import { describe, expect, it } from 'vitest';
import {
  AskOnMyWayAskedRecentlyError,
  AskOnMyWayNotOpenError,
  AskOnMyWayTooEarlyError,
  GuestAlreadyAnsweredError,
  OnMyWayNotOpenError,
} from '../contracts/errors';
import { ValidationError } from '../errors';
import { SEEDED_ACCOUNT } from './accounts';
import { createMockGateway } from './mockGateway';
import { MOCK_PRE_ORDER_BRANCHES } from './preOrders';
import { createPublicMockGateway } from './publicMock';
import { createStaffMockGateway } from './staffMock';

/**
 * "I'm coming" in the mocks (2026-10-22): the guest's running late (a later
 * answer overwrites; on my way after late clears it), the venue's ask and its
 * four refusals, the answers on every booking read, the feed row the ask
 * writes, and the floor's seeded rail.
 */

/** Wednesday 2026-09-16, 14:00 in Yerevan. */
const START = Date.parse('2026-09-16T10:00:00.000Z');
const COMING = 'bk_coming';

async function comingWorld() {
  let clock = START;
  const gateway = createMockGateway({
    now: () => new Date(clock),
    preOrders: { branches: MOCK_PRE_ORDER_BRANCHES },
    seedComingBooking: true,
  });
  // The seeded account's own number, proved: whoever holds it owns the booking.
  const challenge = await gateway.requestPhoneCode(SEEDED_ACCOUNT.phoneE164);
  await gateway.verifyPhoneCode({ challengeId: challenge.challengeId, code: challenge.devCode! });
  return {
    gateway,
    advance: (minutes: number) => {
      clock += minutes * 60_000;
    },
  };
}

async function caught(promise: Promise<unknown> | (() => unknown)): Promise<unknown> {
  try {
    await (typeof promise === 'function' ? promise() : promise);
    return null;
  } catch (error) {
    return error;
  }
}

describe('the seeded booking inside the window', () => {
  it('is confirmed, forty-odd minutes out, with a pre-order and the window it opens', async () => {
    const { gateway } = await comingWorld();
    const booking = await gateway.getBooking(COMING);
    expect(booking).toMatchObject({ status: 'confirmed', branchId: 'b-lumen-north' });
    expect(booking?.preOrder?.lines.length).toBe(2);
    const start = Date.parse(booking!.slotUtc);
    expect(start - START).toBeGreaterThanOrEqual(40 * 60_000);
    expect(start - START).toBeLessThan(60 * 60_000);
    expect(booking?.onMyWayOpensAtUtc).toBe(new Date(start - 2 * 3_600_000).toISOString());
    expect((await gateway.listBookings()).upcoming.map((entry) => entry.id)).toContain(COMING);
  });
});

describe("the guest's running late", () => {
  it('records the latest answer, and on my way after it clears it', async () => {
    const { gateway, advance } = await comingWorld();
    const late = await gateway.reportRunningLate({ reservationId: COMING, minutes: 10 });
    const booking = await gateway.getBooking(COMING);
    expect(late).toMatchObject({
      guestRunningLateMinutes: 10,
      expectedArrivalUtc: new Date(Date.parse(booking!.slotUtc) + 10 * 60_000).toISOString(),
    });
    advance(1);
    await gateway.reportRunningLate({ reservationId: COMING, minutes: 30 });
    expect(await gateway.getBooking(COMING)).toMatchObject({ guestRunningLateMinutes: 30 });

    const onWay = await gateway.confirmOnMyWay(COMING);
    expect(onWay.wasReplay).toBe(false);
    const after = await gateway.getBooking(COMING);
    expect(after?.guestRunningLateMinutes).toBeUndefined();
    expect(after?.guestConfirmedOnWayAtUtc).toBe(onWay.guestConfirmedOnWayAtUtc);
    // Said twice with nothing between: the first answer, as before.
    expect((await gateway.confirmOnMyWay(COMING)).wasReplay).toBe(true);
  });

  it('refuses minutes other than 10, 15 or 30, and a booking outside the window', async () => {
    const { gateway, advance } = await comingWorld();
    expect(
      await caught(gateway.reportRunningLate({ reservationId: COMING, minutes: 20 as 10 })),
    ).toBeInstanceOf(ValidationError);
    advance(6 * 60);
    expect(
      await caught(gateway.reportRunningLate({ reservationId: COMING, minutes: 10 })),
    ).toBeInstanceOf(OnMyWayNotOpenError);
  });

  it('takes it from the manage link too', async () => {
    const { gateway } = await comingWorld();
    const booking = await gateway.getBooking(COMING);
    const link = createPublicMockGateway({ now: () => new Date(START), gateway });
    const late = await link.reportManagedRunningLate({ token: booking!.manageToken!, minutes: 15 });
    expect(late.guestRunningLateMinutes).toBe(15);
    expect(await link.getManagedBooking({ token: booking!.manageToken! })).toMatchObject({
      guestRunningLateMinutes: 15,
    });
  });
});

describe("the venue's ask", () => {
  it('asks once, writes the feed row, and refuses another within fifteen minutes', async () => {
    const { gateway, advance } = await comingWorld();
    const asked = gateway.askOnMyWayAsVenue(COMING);
    expect(asked).toMatchObject({ reservationId: COMING, notified: true });
    expect(await gateway.getBooking(COMING)).toMatchObject({
      staffAskedOnMyWayAtUtc: asked.staffAskedOnMyWayAtUtc,
    });
    // Since 2026-10-23 the ask is a venue message: its row is `venue-message`
    // with `ask` "true", and no `booking-on-your-way` row beside it.
    const feed = await gateway.listNotifications({});
    const rows = feed.items.filter((row) => row.reservationId === COMING);
    expect(rows.find((row) => row.kind === 'venue-message')?.params).toMatchObject({
      ask: 'true',
      subjectKind: 'reservation',
    });
    expect(rows.find((row) => row.kind === 'venue-message')?.params).not.toHaveProperty('text');
    expect(rows.some((row) => row.params['askedByVenue'] === 'true')).toBe(false);

    advance(10);
    const again = await caught(() => gateway.askOnMyWayAsVenue(COMING));
    expect(again).toBeInstanceOf(AskOnMyWayAskedRecentlyError);
    expect(again).toMatchObject({ nextAllowedAtUtc: asked.nextAskAllowedAtUtc });
    advance(5);
    expect(gateway.askOnMyWayAsVenue(COMING).staffAskedOnMyWayAtUtc).not.toBe(
      asked.staffAskedOnMyWayAtUtc,
    );
  });

  it('is refused once the guest answered, saying how', async () => {
    const { gateway } = await comingWorld();
    await gateway.reportRunningLate({ reservationId: COMING, minutes: 15 });
    const error = await caught(() => gateway.askOnMyWayAsVenue(COMING));
    expect(error).toBeInstanceOf(GuestAlreadyAnsweredError);
    expect(error).toMatchObject({ runningLateMinutes: 15 });
  });
});

describe("the floor tablet's ask", () => {
  const BRANCH = 'branch-cafe-01';

  function floor() {
    let clock = START;
    const gateway = createStaffMockGateway({
      now: () => new Date(clock),
      branchId: BRANCH,
      preOrderSeeds: [
        {
          reservationId: 'res-soon',
          tableId: 't5',
          startsInMinutes: 25,
          guestName: 'Anna',
          guestPhone: '+37499111222',
          lines: [{ menuItemId: 'cappuccino', quantity: 1 }],
        },
        {
          reservationId: 'res-late',
          tableId: 't9',
          startsInMinutes: 20,
          guestName: 'Maria',
          guestPhone: '+37477445566',
          lines: [{ menuItemId: 'croissant', quantity: 1 }],
          runningLateMinutes: 15,
        },
        {
          reservationId: 'res-later',
          tableId: 't4',
          startsInMinutes: 180,
          guestName: 'Nare',
          lines: [{ menuItemId: 'granola', quantity: 1 }],
        },
      ],
    });
    return {
      gateway,
      advance: (minutes: number) => {
        clock += minutes * 60_000;
      },
    };
  }

  it('asks, and the rail and the floor say so', async () => {
    const { gateway } = floor();
    const asked = await gateway.askOnMyWay('res-soon');
    expect(asked.notified).toBe(true);
    const rail = await gateway.listDuePreOrders(BRANCH);
    expect(rail.items.find((card) => card.reservationId === 'res-soon')).toMatchObject({
      staffAskedOnMyWayAtUtc: asked.staffAskedOnMyWayAtUtc,
      guestRunningLateMinutes: null,
    });
    expect(rail.items.find((card) => card.reservationId === 'res-late')).toMatchObject({
      guestRunningLateMinutes: 15,
    });
    const room = await gateway.getFloor(BRANCH);
    expect(room?.details.find((table) => table.tableId === 't5')).toMatchObject({
      nextReservationStaffAskedOnMyWayAtUtc: asked.staffAskedOnMyWayAtUtc,
    });
    expect(room?.details.find((table) => table.tableId === 't9')).toMatchObject({
      nextReservationGuestRunningLateMinutes: 15,
    });
  });

  it('refuses too early, answered, and started', async () => {
    const { gateway, advance } = floor();
    expect(await caught(gateway.askOnMyWay('res-later'))).toBeInstanceOf(AskOnMyWayTooEarlyError);
    expect(await caught(gateway.askOnMyWay('res-late'))).toBeInstanceOf(GuestAlreadyAnsweredError);
    advance(30);
    expect(await caught(gateway.askOnMyWay('res-soon'))).toBeInstanceOf(AskOnMyWayNotOpenError);
  });

  it('seeds a guest running late and one asked a moment ago in mock mode', async () => {
    const gateway = createStaffMockGateway({ now: () => new Date(START), seedPreOrders: true });
    const rail = await gateway.listDuePreOrders(BRANCH);
    expect(rail.items.some((card) => card.guestRunningLateMinutes === 15)).toBe(true);
    const room = await gateway.getFloor(BRANCH);
    expect(
      room?.details.some((table) => table.nextReservationStaffAskedOnMyWayAtUtc !== null),
    ).toBe(true);
  });
});
