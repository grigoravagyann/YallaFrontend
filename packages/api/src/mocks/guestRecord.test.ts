import { describe, expect, it } from 'vitest';
import type { CreateBookingCommand } from '../contracts/booking';
import {
  BookingBlockedNoShowsError,
  BookingOverlapsOwnError,
  NoShowUndoWindowClosedError,
  PhoneHasActiveBookingError,
  PhoneNotVerifiedError,
} from '../contracts/errors';
import { ConcurrencyConflictError, ForbiddenError } from '../errors';
import { newCommandId } from '../ids';
import { createConsoleMockGateway } from './consoleMock';
import { SEEDED_ACCOUNT } from './accounts';
import { createMockGateway, type MockGateway, type MockGatewayOptions } from './mockGateway';
import { createStaffMockGateway } from './staffMock';

/**
 * The guest record in the diner's mock (GR wire, 2026-10-20): the same rules
 * the server enforces, so the public page and the app are built against them.
 *
 * - No booking without a proved number: an unproved account is a 403 again.
 * - No two of one guest's sittings overlap anywhere; at another branch they
 *   need half an hour between them. At most three active bookings per number.
 * - The guest's own record comes beside their bookings.
 * - Three no-shows on bookings that started within 72 hours block booking for
 *   a week and cancel every booking of theirs not started yet.
 */

const NORTH = 'b-lumen-north';
const CASCADE = 'b-lumen-cascade';
/** Monday 19 October 2026, 12:00 in Yerevan. */
const START = Date.parse('2026-10-19T08:00:00.000Z');
const DAY = 24 * 3_600_000;

/** `day` days after Monday 19 October, at `time` in Yerevan. */
function at(day: number, time: string): string {
  const date = new Date(START + day * DAY).toISOString().slice(0, 10);
  return new Date(`${date}T${time}:00+04:00`).toISOString();
}

function world(options: MockGatewayOptions = {}) {
  let clock = START;
  const gateway = createMockGateway({
    latencyMs: 0,
    simulateJoiners: false,
    simulateWaiter: false,
    now: () => new Date(clock),
    codeSeed: 5,
    ...options,
  });
  return {
    gateway,
    /** Moves the world's clock to an instant. */
    travel(to: string) {
      clock = Date.parse(to);
    },
  };
}

async function proved(gateway: MockGateway): Promise<void> {
  await gateway.loginDiner({
    identifier: SEEDED_ACCOUNT.username,
    password: SEEDED_ACCOUNT.password,
  });
  const challenge = await gateway.requestPhoneCode(SEEDED_ACCOUNT.phoneE164);
  await gateway.verifyPhoneCode({ challengeId: challenge.challengeId, code: challenge.devCode! });
}

async function book(
  gateway: MockGateway,
  slotUtc: string,
  branchId = NORTH,
): ReturnType<MockGateway['createBooking']> {
  const floor = await gateway.getSlotFloor({ branchId, slotUtc, partySize: 2 });
  const table = floor!.tables.find((entry) => entry.isBookable && !entry.mustFreeByUtc);
  const command: CreateBookingCommand = {
    commandId: crypto.randomUUID(),
    branchId,
    tableId: table!.tableId,
    slotUtc,
    timeZoneId: 'Asia/Yerevan',
    partySize: 2,
    guestName: 'Ani',
    guestPhone: SEEDED_ACCOUNT.phoneE164,
    channel: 'app',
  };
  return gateway.createBooking(command);
}

async function caught(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected a rejection');
}

describe('no booking without a proved number', () => {
  it('refuses an account whose number is not proved, as before unverified bookings', async () => {
    const { gateway } = world();
    await gateway.registerDiner({
      username: 'unproved1',
      email: 'unproved1@example.com',
      password: 'correct horse',
      phoneE164: '+37499000123',
      displayName: 'Ani',
    });

    expect(await caught(book(gateway, at(1, '19:00')))).toBeInstanceOf(PhoneNotVerifiedError);
  });
});

describe('the number rules', () => {
  it('refuses a fourth active booking, naming her next one, and frees a place on a cancel', async () => {
    const { gateway } = world();
    await proved(gateway);
    const first = await book(gateway, at(1, '19:00'));
    await book(gateway, at(2, '19:00'));
    await book(gateway, at(3, '19:00'));

    const error = await caught(book(gateway, at(4, '19:00')));

    expect(error).toBeInstanceOf(PhoneHasActiveBookingError);
    expect(error).toMatchObject({
      maxActiveBookings: 3,
      held: { reservationId: first.id, localDate: '2026-10-20', localStartTime: '19:00' },
    });

    await gateway.cancelBooking(first.id);
    await expect(book(gateway, at(4, '19:00'))).resolves.toMatchObject({ status: 'confirmed' });
  });

  it('needs half an hour between her sittings at two venues, naming the other one', async () => {
    const { gateway } = world();
    await proved(gateway);
    // 19:00 at North runs to 20:30: Cascade at 20:45 is too close, 21:00 is fine.
    await book(gateway, at(1, '19:00'));

    const error = await caught(book(gateway, at(1, '20:45'), CASCADE));

    expect(error).toBeInstanceOf(BookingOverlapsOwnError);
    expect(error).toMatchObject({ localStartTime: '19:00', branchName: 'Northern Avenue' });
    await expect(book(gateway, at(1, '21:00'), CASCADE)).resolves.toBeTruthy();
  });

  it('still lets her sittings touch at the same branch', async () => {
    const { gateway } = world();
    await proved(gateway);
    await book(gateway, at(1, '19:00'));

    await expect(book(gateway, at(1, '20:30'))).resolves.toBeTruthy();
  });
});

describe("the guest's own record", () => {
  it('is new with nothing behind her, and counts what came and what did not', async () => {
    const { gateway, travel } = world();
    await proved(gateway);
    expect((await gateway.listBookings()).guestRecord).toMatchObject({
      booked: 0,
      isNewGuest: true,
      blockedUntilUtc: null,
    });

    const came = await book(gateway, at(1, '19:00'));
    const missed = await book(gateway, at(2, '19:00'));
    const late = await book(gateway, at(3, '19:00'));
    // A late cancel counts apart, once its time has come.
    travel(at(3, '18:30'));
    await gateway.cancelBooking(late.id);
    travel(at(3, '20:00'));
    gateway.seatAsVenue(came.id);
    gateway.markNoShowAsVenue(missed.id);

    expect((await gateway.listBookings()).guestRecord).toEqual({
      booked: 3,
      came: 1,
      noShows: 1,
      lateCancellations: 1,
      unmarked: 0,
      isNewGuest: false,
      blockedUntilUtc: null,
    });
  });

  it('starts from the record mock mode seeds', async () => {
    const { gateway } = world({ guestRecord: { came: 11, noShows: 1 } });

    expect((await gateway.listBookings()).guestRecord).toMatchObject({
      booked: 12,
      came: 11,
      noShows: 1,
      isNewGuest: false,
    });
  });
});

describe('the no-show block', () => {
  it('blocks a week after three no-shows in three days, cancelling what had not started', async () => {
    const { gateway, travel } = world();
    await proved(gateway);
    const a = await book(gateway, at(1, '19:00'));
    const b = await book(gateway, at(2, '19:00'));
    const c = await book(gateway, at(3, '19:00'));
    travel(at(1, '21:00'));
    const later = await book(gateway, at(6, '19:00'));
    travel(at(3, '19:30'));

    gateway.markNoShowAsVenue(a.id);
    gateway.markNoShowAsVenue(b.id);
    gateway.markNoShowAsVenue(c.id);

    const mine = await gateway.listBookings();
    const until = new Date(Date.parse(at(3, '19:30')) + 7 * DAY).toISOString();
    expect(mine.guestRecord).toMatchObject({ noShows: 3, blockedUntilUtc: until });
    expect(mine.past.find((entry) => entry.id === later.id)).toMatchObject({
      status: 'cancelledByVenue',
      cancelledBecause: 'noShowBlock',
    });

    const refused = await caught(book(gateway, at(8, '19:00')));
    expect(refused).toBeInstanceOf(BookingBlockedNoShowsError);
    expect(refused).toMatchObject({ blockedUntilUtc: until });

    const feed = await gateway.listNotifications();
    expect(feed.items.find((row) => row.kind === 'bookings-blocked-no-shows')?.params).toEqual({
      blockedUntilUtc: until,
      blockedUntilLocalDate: '2026-10-29',
      cancelledCount: '1',
    });
    // And each no-show was said on its own, naming the booking.
    const noShows = feed.items.filter((row) => row.kind === 'booking-no-show');
    expect(noShows.map((row) => row.reservationId).sort()).toEqual([a.id, b.id, c.id].sort());
    expect(noShows.find((row) => row.reservationId === a.id)?.params).toMatchObject({
      date: '2026-10-20',
      time: '19:00',
      reservationCode: a.code,
    });

    // Over at the end of the week.
    travel(new Date(Date.parse(until) + 60_000).toISOString());
    await expect(book(gateway, at(12, '19:00'))).resolves.toBeTruthy();
  });

  it('counts no no-show marked before the start and the grace is over', async () => {
    const { gateway, travel } = world();
    await proved(gateway);
    const a = await book(gateway, at(1, '19:00'));
    const b = await book(gateway, at(2, '19:00'));
    const c = await book(gateway, at(3, '19:00'));
    travel(at(1, '19:30'));
    gateway.markNoShowAsVenue(a.id);
    travel(at(2, '19:30'));
    gateway.markNoShowAsVenue(b.id);
    // Five minutes after the start: inside the grace, so it does not count.
    travel(at(3, '19:05'));
    gateway.markNoShowAsVenue(c.id);

    expect((await gateway.listBookings()).guestRecord?.blockedUntilUtc).toBeNull();
  });

  it('does nothing for two no-shows, or three spread over five days', async () => {
    const { gateway, travel } = world();
    await proved(gateway);
    const a = await book(gateway, at(1, '19:00'));
    travel(at(1, '21:00'));
    const b = await book(gateway, at(4, '19:00'));
    const c = await book(gateway, at(6, '19:00'));
    travel(at(4, '19:30'));
    gateway.markNoShowAsVenue(a.id);
    gateway.markNoShowAsVenue(b.id);
    travel(at(6, '19:30'));
    gateway.markNoShowAsVenue(c.id);

    const mine = await gateway.listBookings();
    expect(mine.guestRecord).toMatchObject({ noShows: 3, blockedUntilUtc: null });
    await expect(book(gateway, at(8, '19:00'))).resolves.toBeTruthy();
  });

  it('is said by mock mode when it seeds one', async () => {
    const until = '2026-10-25T10:00:00.000Z';
    const { gateway } = world({ blockedUntilUtc: until });

    expect((await gateway.listBookings()).guestRecord?.blockedUntilUtc).toBe(until);
    expect(await caught(book(gateway, at(1, '19:00')))).toBeInstanceOf(BookingBlockedNoShowsError);
  });
});

describe('undoing a no-show in the staff and console mocks (review round)', () => {
  it('confirms the late booking at table 6 again until 05:00 the next morning, then refuses', async () => {
    let clock = Date.parse('2026-10-20T15:00:00.000Z');
    const staff = createStaffMockGateway({ latencyMs: 0, now: () => new Date(clock) });
    const floor = await staff.getFloor('b1');
    const late = floor!.details.find((detail) => detail.tableId === 't6')!.nextReservationId!;
    await staff.releaseReservation({
      reservationId: late,
      outcome: 'noShow',
      clientCommandId: newCommandId(),
    });

    const undone = await staff.undoNoShow({ reservationId: late, clientCommandId: newCommandId() });
    expect(undone).toMatchObject({ reservationId: late, status: 'confirmed', tableLabel: '6' });

    await staff.releaseReservation({
      reservationId: late,
      outcome: 'noShow',
      clientCommandId: newCommandId(),
    });
    // 05:00 the next morning in Yerevan is 01:00 UTC.
    clock = Date.parse('2026-10-21T01:00:01.000Z');
    const refused = await caught(
      staff.undoNoShow({ reservationId: late, clientCommandId: newCommandId() }),
    );
    expect(refused).toBeInstanceOf(NoShowUndoWindowClosedError);
    expect(refused).toMatchObject({ undoableUntilUtc: '2026-10-21T01:00:00.000Z' });
  });

  it("undoes a console row's no-show, and refuses anything that is not one", async () => {
    const evening = new Date('2026-10-18T14:42:00Z');
    const consoleGateway = createConsoleMockGateway({ latencyMs: 0, now: () => evening });
    const overview = await consoleGateway.getBranchOverview('b-lumen-north');
    const late = overview.todayBookings.find(
      (row) => row.status === 'confirmed' && Date.parse(row.startUtc) < evening.getTime(),
    )!;
    const command = {
      branchId: 'b-lumen-north',
      reservationId: late.id,
      tableId: late.tableId,
    };
    await consoleGateway.actOnBooking({
      ...command,
      kind: 'noShow',
      clientCommandId: newCommandId(),
    });

    expect(
      await consoleGateway.actOnBooking({
        ...command,
        kind: 'undoNoShow',
        clientCommandId: newCommandId(),
      }),
    ).toMatchObject({ status: 'confirmed', wasReplay: false });
    const seated = overview.todayBookings.find((row) => row.status === 'seated')!;
    await expect(
      consoleGateway.actOnBooking({
        branchId: 'b-lumen-north',
        reservationId: seated.id,
        tableId: seated.tableId,
        kind: 'undoNoShow',
        clientCommandId: newCommandId(),
      }),
    ).rejects.toBeInstanceOf(ConcurrencyConflictError);
  });
});

describe("the overview's records in the console mock (review round 2)", () => {
  it('come only on pending or confirmed rows, as the wire sends them', async () => {
    const evening = new Date('2026-10-18T14:42:00Z');
    const consoleGateway = createConsoleMockGateway({ latencyMs: 0, now: () => evening });
    const overview = await consoleGateway.getBranchOverview('b-lumen-north');
    const withRecord = overview.todayBookings.filter((row) => row.guestRecord);

    expect(withRecord.length).toBeGreaterThan(0);
    for (const row of withRecord) expect(['pendingApproval', 'confirmed']).toContain(row.status);
    // The late guest blocked since keeps hers: that booking is still confirmed.
    expect(
      withRecord.some(
        (row) => row.status === 'confirmed' && row.guestRecord?.blockedUntilUtc != null,
      ),
    ).toBe(true);
  });

  it('drops it once the guest is seated', async () => {
    const evening = new Date('2026-10-18T14:42:00Z');
    const consoleGateway = createConsoleMockGateway({ latencyMs: 0, now: () => evening });
    const before = await consoleGateway.getBranchOverview('b-lumen-north');
    const late = before.todayBookings.find(
      (row) => row.status === 'confirmed' && row.guestRecord?.blockedUntilUtc != null,
    )!;
    await consoleGateway.actOnBooking({
      branchId: 'b-lumen-north',
      reservationId: late.id,
      tableId: late.tableId,
      kind: 'seat',
      clientCommandId: newCommandId(),
    });

    const after = await consoleGateway.getBranchOverview('b-lumen-north');
    const seated = after.todayBookings.find((row) => row.id === late.id)!;
    expect(seated.status).toBe('seated');
    expect(seated.guestRecord ?? null).toBeNull();
  });
});

describe('the platform lifts a block in the console mock (review round)', () => {
  it('lists the blocks in force and lifts one with a reason, which it needs', async () => {
    const platform = createConsoleMockGateway({ latencyMs: 0, role: 'platformAdmin' });
    const blocks = await platform.listBookingBlocks();
    expect(blocks.length).toBe(2);

    await expect(
      platform.liftBookingBlock({ blockId: blocks[0]!.blockId, reason: 'x' }),
    ).rejects.toBeTruthy();
    const lifted = await platform.liftBookingBlock({
      blockId: blocks[0]!.blockId,
      reason: 'Marked by mistake at two venues',
    });
    expect(lifted.liftedAtUtc).not.toBeNull();
    expect((await platform.listBookingBlocks()).map((block) => block.blockId)).not.toContain(
      blocks[0]!.blockId,
    );

    const owner = createConsoleMockGateway({ latencyMs: 0, role: 'owner' });
    await expect(owner.listBookingBlocks()).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('the staff mock on the wire §0a gaps', () => {
  it("draws the late booking's record on its table, and blocks its guest with the third no-show", async () => {
    const staff = createStaffMockGateway({
      latencyMs: 0,
      now: () => new Date('2026-10-20T15:00:00.000Z'),
    });
    const floor = await staff.getFloor('b1');
    const six = floor!.details.find((detail) => detail.tableId === 't6')!;
    expect(six.nextReservationGuestRecord).toMatchObject({ noShows: 2 });

    const released = await staff.releaseReservation({
      reservationId: six.nextReservationId!,
      outcome: 'noShow',
      clientCommandId: newCommandId(),
    });
    expect(released.guestBlockedUntilUtc).toBe('2026-10-27T15:00:00.000Z');
  });
});
