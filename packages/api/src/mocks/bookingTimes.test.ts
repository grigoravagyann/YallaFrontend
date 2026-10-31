import { describe, expect, it } from 'vitest';
import type { Booking, CreateBookingCommand, SlotFloor } from '../contracts/booking';
import { FreeByRequiredError, TableRequestClosedError } from '../contracts/errors';
import type { YallaGateway } from '../gateway';
import { SEEDED_ACCOUNT } from './accounts';
import { createMockGateway, type MockGatewayOptions } from './mockGateway';

/**
 * Booking times, in the diner's mock: fifteen-minute times from ten minutes
 * out, and the table-sequencing rules on one table — the 90-minute block after
 * a booking, the 45 minutes before the next one, the sitting cut short (and the
 * promise to free it), a table only requestable after an earlier booking, and
 * the earlier guest's answer to that request.
 */

const NORTH = 'b-lumen-north';
/** Monday 19 October 2026, 12:00 in Yerevan. */
const NOW = '2026-10-19T08:00:00.000Z';
const TOMORROW = '2026-10-20';
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

/** A Yerevan wall-clock time as an instant. */
function at(date: string, time: string): string {
  return new Date(`${date}T${time}:00+04:00`).toISOString();
}

function world(time: ReturnType<typeof clock>, options: MockGatewayOptions = {}) {
  return createMockGateway({
    latencyMs: 0,
    simulateJoiners: false,
    now: time.now,
    codeSeed: 11,
    ...options,
  });
}

async function signedIn(gateway: YallaGateway): Promise<void> {
  await gateway.loginDiner({
    identifier: SEEDED_ACCOUNT.username,
    password: SEEDED_ACCOUNT.password,
  });
  const challenge = await gateway.requestPhoneCode(SEEDED_ACCOUNT.phoneE164);
  await gateway.verifyPhoneCode({ challengeId: challenge.challengeId, code: challenge.devCode! });
}

function command(
  tableId: string,
  slotUtc: string,
  extra: Partial<CreateBookingCommand> = {},
): CreateBookingCommand {
  return {
    commandId: crypto.randomUUID(),
    branchId: NORTH,
    tableId,
    slotUtc,
    timeZoneId: 'Asia/Yerevan',
    partySize: 2,
    guestName: 'Ani',
    guestPhone: '+37477123456',
    channel: 'app',
    ...extra,
  };
}

async function floorAt(gateway: YallaGateway, time: string, date = TOMORROW): Promise<SlotFloor> {
  const floor = await gateway.getSlotFloor({
    branchId: NORTH,
    slotUtc: at(date, time),
    partySize: 2,
  });
  return floor!;
}

const tableOf = (floor: SlotFloor, tableId: string) =>
  floor.tables.find((table) => table.tableId === tableId)!;

/** The diner's own booking tomorrow at 19:00 on the first table the room offers. */
async function bookedAtSeven(gateway: YallaGateway): Promise<Booking> {
  const floor = await floorAt(gateway, '19:00');
  const table = floor.tables.find((entry) => entry.isBookable)!;
  return gateway.createBooking(command(table.tableId, at(TOMORROW, '19:00')));
}

describe('the day', () => {
  it('lists every quarter hour, the first ten minutes from now', async () => {
    const gateway = world(clock());
    const today = await gateway.getDaySlots({ branchId: NORTH, date: '2026-10-19', partySize: 2 });

    expect(today!.stepMinutes).toBe(15);
    const offered = today!.slots.filter((slot) => slot.isAvailable);
    // 12:00 now, ten minutes' lead: 12:15 is the first quarter hour on offer.
    expect(offered[0]!.time).toBe('12:15');
    expect(today!.slots.find((slot) => slot.time === '12:00')?.unavailableReason).toBe(
      'pastLeadTime',
    );
    expect(offered.slice(0, 3).map((slot) => slot.time)).toEqual(['12:15', '12:30', '12:45']);
  });

  it('takes a booking ten minutes out, on any minute', async () => {
    const gateway = world(clock(), { floorApprovesAtOnce: true });
    await signedIn(gateway);
    const floor = await floorAt(gateway, '12:10', '2026-10-19');
    const table = floor.tables.find((entry) => entry.isBookable);
    expect(floor.rejection).toBeNull();
    expect(table).toBeDefined();
  });
});

describe('one table, with the diner booked at 19:00 tomorrow', () => {
  it('refuses it for the 90 minutes after, and 45 minutes before, that booking', async () => {
    const gateway = world(clock());
    await signedIn(gateway);
    const booking = await bookedAtSeven(gateway);

    for (const time of ['19:00', '19:30', '20:15', '18:20', '18:45']) {
      const table = tableOf(await floorAt(gateway, time), booking.tableId!);
      expect(table.isBookable, time).toBe(false);
      expect(table.unavailableReason, time).toBe('alreadyBooked');
    }
  });

  it('offers it from 90 minutes after as a request to the guest before, and free from three hours', async () => {
    const gateway = world(clock());
    await signedIn(gateway);
    const booking = await bookedAtSeven(gateway);

    const requested = tableOf(await floorAt(gateway, '20:30'), booking.tableId!);
    expect(requested).toMatchObject({
      isBookable: true,
      requiresApproval: true,
      requiresEarlierGuestConsent: true,
    });
    const free = tableOf(await floorAt(gateway, '22:00'), booking.tableId!);
    expect(free).toMatchObject({ isBookable: true, requiresEarlierGuestConsent: false });
  });

  it('cuts a sitting before it short, and says by when the table must be free', async () => {
    const gateway = world(clock());
    await signedIn(gateway);
    const booking = await bookedAtSeven(gateway);

    expect(tableOf(await floorAt(gateway, '17:30'), booking.tableId!)).toMatchObject({
      isBookable: true,
      mustFreeByUtc: at(TOMORROW, '18:55'),
    });
    // 17:25 + 90 + 5 = 19:00: the whole sitting fits.
    expect(tableOf(await floorAt(gateway, '17:15'), booking.tableId!).mustFreeByUtc).toBeNull();
  });

  it('agrees with the day: a requestable time and a cut-short one', async () => {
    const gateway = world(clock());
    await signedIn(gateway);
    await bookedAtSeven(gateway);
    const day = await gateway.getDaySlots({ branchId: NORTH, date: TOMORROW, partySize: 2 });
    // Other tables are free at both times, so neither is requestable-only.
    const nineThirty = day!.slots.find((slot) => slot.time === '20:30')!;
    expect(nineThirty).toMatchObject({ isAvailable: true, requestable: false });
  });
});

describe('the promise to free the table', () => {
  it('is asked for, then kept on the booking, which ends then', async () => {
    const gateway = world(clock());
    await signedIn(gateway);
    const later = await bookedAtSeven(gateway);

    let refused: unknown;
    try {
      await gateway.createBooking(command(later.tableId!, at(TOMORROW, '17:30')));
    } catch (error) {
      refused = error;
    }
    expect(refused).toBeInstanceOf(FreeByRequiredError);
    expect((refused as FreeByRequiredError).requiredFreeByUtc).toBe(at(TOMORROW, '18:55'));

    // A different time is no promise either.
    await expect(
      gateway.createBooking(
        command(later.tableId!, at(TOMORROW, '17:30'), { acceptsFreeByUtc: at(TOMORROW, '18:50') }),
      ),
    ).rejects.toBeInstanceOf(FreeByRequiredError);

    const kept = await gateway.createBooking(
      command(later.tableId!, at(TOMORROW, '17:30'), { acceptsFreeByUtc: at(TOMORROW, '18:55') }),
    );
    expect(kept).toMatchObject({
      promisedFreeByUtc: at(TOMORROW, '18:55'),
      endUtc: at(TOMORROW, '18:55'),
    });
  });
});

describe('a change of party size alone', () => {
  it('keeps the promise without asking for it again, and never lengthens the sitting', async () => {
    const gateway = world(clock());
    await signedIn(gateway);
    const later = await bookedAtSeven(gateway);
    const kept = await gateway.createBooking(
      command(later.tableId!, at(TOMORROW, '17:30'), { acceptsFreeByUtc: at(TOMORROW, '18:55') }),
    );

    const moved = await gateway.rescheduleBooking({
      bookingId: kept.id,
      commandId: crypto.randomUUID(),
      tableId: kept.tableId!,
      slotUtc: kept.slotUtc,
      timeZoneId: 'Asia/Yerevan',
      partySize: 1,
    });
    expect(moved).toMatchObject({
      partySize: 1,
      promisedFreeByUtc: at(TOMORROW, '18:55'),
      endUtc: at(TOMORROW, '18:55'),
    });
  });
});

describe('a request to the guest before', () => {
  async function requested(time = clock(), options: MockGatewayOptions = {}) {
    const gateway = world(time, options);
    await signedIn(gateway);
    const earlier = await bookedAtSeven(gateway);
    const later = await gateway.createBooking(command(earlier.tableId!, at(TOMORROW, '20:30')));
    return { gateway, earlier, later, time };
  }

  it('waits two hours for their answer, and their booking carries the question', async () => {
    const { gateway, earlier, later } = await requested();

    expect(later).toMatchObject({
      status: 'pendingApproval',
      awaitingApprovalBecause: 'earlierGuestConsent',
      approvalExpiresAtUtc: '2026-10-19T10:00:00.000Z',
    });
    const asked = await gateway.getBooking(earlier.id);
    expect(asked?.incomingTableRequest).toMatchObject({
      requestedStartUtc: at(TOMORROW, '20:30'),
      freeByUtc: at(TOMORROW, '20:25'),
      expiresAtUtc: '2026-10-19T10:00:00.000Z',
    });
    const listed = await gateway.listBookings();
    expect(
      listed.upcoming.find((entry) => entry.id === earlier.id)?.incomingTableRequest,
    ).not.toBeNull();
  });

  it('on yes, confirms the later booking and cuts the earlier one to the promise', async () => {
    const { gateway, earlier, later } = await requested();
    const request = (await gateway.getBooking(earlier.id))!.incomingTableRequest!;

    const answered = await gateway.answerTableRequest({
      bookingId: earlier.id,
      requestId: request.requestId,
      accept: true,
      commandId: crypto.randomUUID(),
    });

    expect(answered).toMatchObject({
      id: earlier.id,
      promisedFreeByUtc: at(TOMORROW, '20:25'),
      endUtc: at(TOMORROW, '20:25'),
    });
    expect(answered.incomingTableRequest ?? null).toBeNull();
    expect(await gateway.getBooking(later.id)).toMatchObject({
      status: 'confirmed',
      awaitingApprovalBecause: null,
      approvalExpiresAtUtc: null,
    });
  });

  it('on no, declines the later booking, saying the guest before said no', async () => {
    const { gateway, earlier, later } = await requested();
    const request = (await gateway.getBooking(earlier.id))!.incomingTableRequest!;
    const commandId = crypto.randomUUID();

    await gateway.answerTableRequest({
      bookingId: earlier.id,
      requestId: request.requestId,
      accept: false,
      commandId,
    });

    expect(await gateway.getBooking(later.id)).toMatchObject({
      status: 'cancelledByVenue',
      declinedBecause: 'earlierGuestDeclined',
    });
    const earlierNow = await gateway.getBooking(earlier.id);
    expect(earlierNow?.promisedFreeByUtc ?? null).toBeNull();
    expect(earlierNow?.incomingTableRequest ?? null).toBeNull();

    // The same answer again is the answer it was; a second, different one is refused.
    await expect(
      gateway.answerTableRequest({
        bookingId: earlier.id,
        requestId: request.requestId,
        accept: false,
        commandId,
      }),
    ).resolves.toMatchObject({ id: earlier.id });
    await expect(
      gateway.answerTableRequest({
        bookingId: earlier.id,
        requestId: request.requestId,
        accept: true,
        commandId: crypto.randomUUID(),
      }),
    ).rejects.toBeInstanceOf(TableRequestClosedError);
  });

  it('asks one question at a time: the table is refused while the guest before is being asked', async () => {
    const { gateway, earlier } = await requested();
    const table = tableOf(await floorAt(gateway, '21:00'), earlier.tableId!);
    expect(table).toMatchObject({ isBookable: false, unavailableReason: 'alreadyBooked' });
  });

  it('confirms the later booking when the earlier one is cancelled — the table is free of them', async () => {
    const { gateway, earlier, later } = await requested();
    await gateway.cancelBooking(earlier.id);
    expect(await gateway.getBooking(later.id)).toMatchObject({
      status: 'confirmed',
      awaitingApprovalBecause: null,
    });
  });

  it('with no answer in two hours, declines the later booking as unanswered', async () => {
    const { gateway, earlier, later, time } = await requested();
    time.advance(121 * MINUTE);

    expect(await gateway.getBooking(later.id)).toMatchObject({
      status: 'cancelledByVenue',
      declinedBecause: 'earlierGuestNoAnswer',
    });
    expect((await gateway.getBooking(earlier.id))?.incomingTableRequest ?? null).toBeNull();
  });

  it('goes to the floor instead, today', async () => {
    const gateway = world(clock());
    await signedIn(gateway);
    const floor = await floorAt(gateway, '15:00', '2026-10-19');
    const table = floor.tables.find((entry) => entry.isBookable)!;
    await gateway.createBooking(command(table.tableId, at('2026-10-19', '15:00')));

    const requested = tableOf(await floorAt(gateway, '16:45', '2026-10-19'), table.tableId);
    expect(requested).toMatchObject({
      isBookable: true,
      requiresApproval: true,
      isRequestable: true,
      requiresEarlierGuestConsent: false,
    });
    const later = await gateway.createBooking(command(table.tableId, at('2026-10-19', '16:45')));
    expect(later.awaitingApprovalBecause).toBe('shortNotice');
  });
});

describe("the server's review rules (reservations.md §3e)", () => {
  it('never judges a confirmed booking again for a change that keeps its table and start', async () => {
    const gateway = world(clock());
    await signedIn(gateway);
    // 17:30 first, uncut; then a 19:00 on the same table, which asks its guest.
    const floor = await floorAt(gateway, '17:30');
    const table = floor.tables.find((entry) => entry.isBookable)!;
    const kept = await gateway.createBooking(command(table.tableId, at(TOMORROW, '17:30')));
    const asking = await gateway.createBooking(command(table.tableId, at(TOMORROW, '19:00')));
    expect(asking.awaitingApprovalBecause).toBe('earlierGuestConsent');

    // A smaller party: no promise asked for, nothing refused.
    const smaller = await gateway.rescheduleBooking({
      bookingId: kept.id,
      commandId: crypto.randomUUID(),
      tableId: kept.tableId!,
      slotUtc: kept.slotUtc,
      timeZoneId: 'Asia/Yerevan',
      partySize: 1,
    });
    expect(smaller).toMatchObject({ status: 'confirmed', partySize: 1, endUtc: kept.endUtc });
    expect(smaller.promisedFreeByUtc ?? null).toBeNull();
  });

  it('keeps a moved request, and its deadline, while it asks the same guest', async () => {
    const time = clock();
    const gateway = world(time);
    await signedIn(gateway);
    const earlier = await bookedAtSeven(gateway);
    const later = await gateway.createBooking(command(earlier.tableId!, at(TOMORROW, '20:30')));
    const asked = (await gateway.getBooking(earlier.id))!.incomingTableRequest!;

    time.advance(30 * MINUTE);
    const moved = await gateway.rescheduleBooking({
      bookingId: later.id,
      commandId: crypto.randomUUID(),
      tableId: later.tableId!,
      slotUtc: at(TOMORROW, '20:45'),
      timeZoneId: 'Asia/Yerevan',
      partySize: 2,
    });

    // The two hours do not restart.
    expect(moved).toMatchObject({
      status: 'pendingApproval',
      awaitingApprovalBecause: 'earlierGuestConsent',
      approvalExpiresAtUtc: '2026-10-19T10:00:00.000Z',
    });
    // The same question, retimed — not a second one.
    expect((await gateway.getBooking(earlier.id))!.incomingTableRequest).toMatchObject({
      requestId: asked.requestId,
      requestedStartUtc: at(TOMORROW, '20:45'),
      freeByUtc: at(TOMORROW, '20:40'),
      expiresAtUtc: '2026-10-19T10:00:00.000Z',
    });
  });

  it('gives the floor two hours to ring the guest before when they booked on the web', async () => {
    const time = clock();
    // Two worlds alike, one booking each: one diner may not hold two tables at once.
    const gateways = [
      world(time, { seedNeighbourBookings: true }),
      world(time, { seedNeighbourBookings: true }),
    ];
    for (const gateway of gateways) await signedIn(gateway);
    const floor = await floorAt(gateways[0]!, '21:30');
    const requestable = floor.tables.filter((entry) => entry.isBookable && entry.isRequestable);
    expect(requestable.length).toBeGreaterThanOrEqual(2);

    const made = await Promise.all(
      gateways.map((gateway, index) =>
        gateway.createBooking(command(requestable[index]!.tableId, at(TOMORROW, '21:30'))),
      ),
    );
    for (const booking of made) {
      expect(booking).toMatchObject({
        status: 'pendingApproval',
        awaitingApprovalBecause: 'earlierGuestConsent',
        // The same two hours whoever answers (reservations.md §3e).
        approvalExpiresAtUtc: '2026-10-19T10:00:00.000Z',
      });
    }
    // One guest before booked in the app (theirs to answer), one on the web (the floor's).
    expect(made.map((booking) => booking.awaitsEarlierGuestAnswer).sort()).toEqual([false, true]);
    const floorsAt = made.findIndex((booking) => booking.awaitsEarlierGuestAnswer === false);
    const floors = made[floorsAt]!;
    const theirs = made[1 - floorsAt]!;

    time.advance(121 * MINUTE);
    // Nobody answered: the floor's lapse is the venue's "no answer", theirs is theirs.
    expect(await gateways[floorsAt]!.getBooking(floors.id)).toMatchObject({
      status: 'cancelledByVenue',
      declinedBecause: 'noAnswer',
      awaitsEarlierGuestAnswer: false,
    });
    expect(await gateways[1 - floorsAt]!.getBooking(theirs.id)).toMatchObject({
      status: 'cancelledByVenue',
      declinedBecause: 'earlierGuestNoAnswer',
    });
  });
});

describe('a busy evening (the mock-mode seed)', () => {
  it('strikes the times every table is taken, offers the ones after as requests, and cuts the ones before', async () => {
    const gateway = world(clock(), { seedNeighbourBookings: true });
    const day = await gateway.getDaySlots({ branchId: NORTH, date: TOMORROW, partySize: 2 });
    const slot = (time: string) => day!.slots.find((entry) => entry.time === time)!;

    expect(slot('20:15')).toMatchObject({ isAvailable: false, unavailableReason: 'alreadyBooked' });
    expect(slot('19:30').isAvailable).toBe(false);
    expect(slot('21:30')).toMatchObject({
      isAvailable: true,
      requestable: true,
      requiresApproval: true,
      // Free outright: none; the requestable ones are counted apart.
      freeTableCount: 0,
    });
    expect(slot('21:30').requestableTableCount).toBeGreaterThan(0);
    expect(slot('19:00')).toMatchObject({
      isAvailable: true,
      requestable: false,
      mustFreeByUtc: at(TOMORROW, '19:55'),
    });
    expect(slot('23:00')).toMatchObject({
      isAvailable: true,
      requestable: false,
      mustFreeByUtc: null,
    });
  });
});
