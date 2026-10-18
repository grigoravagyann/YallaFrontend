import { describe, expect, it } from 'vitest';
import type { Booking, CreateBookingCommand } from '../contracts/booking';
import {
  BookingNotChangeableError,
  BookingRejectedError,
  LeadTimeExceededError,
  TableTakenError,
} from '../contracts/errors';
import { NotFoundError, ValidationError } from '../errors';
import type { YallaGateway } from '../gateway';
import { SEEDED_ACCOUNT } from './accounts';
import { percentOf } from './billing';
import { createMockGateway } from './mockGateway';
import { publicBranchFixtures } from './publicVenues';
import { createStaffMockGateway } from './staffMock';
import { mockTableCode } from './tableCodes';

/**
 * The diner design gaps in the mock: bars and districts on the browse list, a
 * day of slots that agrees with the room, changing a booking by the server's
 * rules, the room on a booking, the bill request with its amounts, the tips
 * and the faces on the roster.
 *
 * The mock is what every screen is built against first. Each of these is a
 * rule the backend branch enforces, so a screen built here meets the answer
 * production gives it.
 */

const NORTH = 'b-lumen-north';
const SARYAN = 'b-lumen-saryan';
const ZONE_OFFSET = '+04:00';

/** Tuesday 20 October 2026, 12:00 in Yerevan. */
const NOW = '2026-10-20T08:00:00.000Z';
const TODAY = '2026-10-20';
const TOMORROW = '2026-10-21'; // Wednesday
const YESTERDAY = '2026-10-19';
const SUNDAY = '2026-10-25';
const MONDAY = '2026-10-26';
const MINUTE_MS = 60_000;

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
  return new Date(`${date}T${time}:00${ZONE_OFFSET}`).toISOString();
}

async function caught(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => null,
    (error: unknown) => error,
  );
}

function world(time = clock()) {
  return createMockGateway({ latencyMs: 0, simulateJoiners: false, now: time.now, codeSeed: 7 });
}

/** A booking for `partySize` at the first table the room offers then. */
async function book(
  gateway: YallaGateway,
  slotUtc: string,
  options: { partySize?: number; tableId?: string; branchId?: string } = {},
): Promise<Booking> {
  const branchId = options.branchId ?? NORTH;
  const partySize = options.partySize ?? 2;
  const floor = await gateway.getSlotFloor({ branchId, slotUtc, partySize });
  const tableId =
    options.tableId ?? floor?.tables.find((table) => table.isBookable)?.tableId ?? 'none';
  const command: CreateBookingCommand = {
    commandId: crypto.randomUUID(),
    branchId,
    tableId,
    slotUtc,
    timeZoneId: 'Asia/Yerevan',
    partySize,
    guestName: 'Ani',
    guestPhone: '+37477123456',
    channel: 'app',
  };
  return gateway.createBooking(command);
}

function move(
  booking: Booking,
  change: { slotUtc?: string; tableId?: string; partySize?: number; commandId?: string },
) {
  return {
    bookingId: booking.id,
    commandId: change.commandId ?? crypto.randomUUID(),
    tableId: change.tableId ?? booking.tableId,
    slotUtc: change.slotUtc ?? booking.slotUtc,
    timeZoneId: booking.timeZoneId,
    partySize: change.partySize ?? booking.partySize,
  };
}

// --- Bars and districts -----------------------------------------------------------------------

describe('bars and districts on the browse list', () => {
  it('finds the bars, and only the bars, behind the Bars filter', async () => {
    const bars = await world().listBranches({ venueType: 'bar' });

    expect(bars.map((listing) => listing.venueName).sort()).toEqual(['Copper Fox', 'Vinoteka']);
    expect(bars.every((listing) => listing.venueType === 'bar')).toBe(true);
  });

  it("carries each branch's district, and none for a branch that never named one", async () => {
    const listings = await world().listBranches();

    for (const listing of listings) {
      expect(listing.district, listing.branchId).toBe(
        publicBranchFixtures[listing.branchId]?.district,
      );
    }
    expect(listings.find((listing) => listing.branchId === 'b-greenbean-main')?.district).toBe(
      null,
    );
  });

  it('matches the district in a search, as the server now does', async () => {
    const found = await world().searchBranches({ query: 'arabkir' });

    expect(found.map((listing) => listing.branchId).sort()).toEqual([
      'b-lumen-cascade',
      'b-vinoteka-komitas',
    ]);
  });

  it('gives a bar a menu, drinks first', async () => {
    const menu = await world().getBranchMenuDetail('b-copperfox-saryan');
    expect(menu?.categories[0]?.id).toBe('drinks');
  });
});

// --- A day of slots ------------------------------------------------------------------------

describe('a day of slots', () => {
  it('lists every half hour whose whole sitting fits the hours, in the branch’s wall clock', async () => {
    const day = await world().getDaySlots({ branchId: NORTH, date: TOMORROW, partySize: 2 });

    expect(day).toMatchObject({
      branchId: NORTH,
      date: TOMORROW,
      partySize: 2,
      stepMinutes: 30,
      unavailableReason: null,
    });
    const times = day!.slots.map((slot) => slot.time);
    // Open 09:00 to 01:00, ninety-minute sittings: 23:30 is the last that fits.
    expect(times[0]).toBe('09:00');
    expect(times[times.length - 1]).toBe('23:30');
    expect(times).toHaveLength(30);
    for (const slot of day!.slots) {
      expect(slot.slotUtc).toBe(at(TOMORROW, slot.time));
    }
  });

  it('agrees with the room at every slot: available exactly when a table there is', async () => {
    const gateway = world();
    await book(gateway, at(TOMORROW, '20:00'));
    const day = await gateway.getDaySlots({ branchId: NORTH, date: TOMORROW, partySize: 2 });

    for (const slot of day!.slots) {
      const floor = await gateway.getSlotFloor({
        branchId: NORTH,
        slotUtc: slot.slotUtc,
        partySize: 2,
      });
      const free = floor!.tables.filter((table) => table.isBookable).length;
      expect(slot.isAvailable, slot.time).toBe(free > 0);
      expect(slot.freeTableCount, slot.time).toBe(free);
    }
  });

  it('follows the hours of the day asked about: a short Sunday, a shut Monday', async () => {
    const gateway = world();
    const sunday = await gateway.getDaySlots({ branchId: NORTH, date: SUNDAY, partySize: 2 });
    expect(sunday!.slots[0]?.time).toBe('10:00');
    expect(sunday!.slots[sunday!.slots.length - 1]?.time).toBe('21:30');

    // Saryan Street does not open on Mondays: nothing to list, and it says why.
    const monday = await gateway.getDaySlots({ branchId: SARYAN, date: MONDAY, partySize: 2 });
    expect(monday).toMatchObject({ unavailableReason: 'closed', slots: [] });
  });

  it('strikes what is too soon today and refuses a day gone or out of reach as a whole', async () => {
    const gateway = world();
    const today = await gateway.getDaySlots({ branchId: NORTH, date: TODAY, partySize: 2 });
    expect(today!.unavailableReason).toBeNull();
    expect(today!.slots.find((slot) => slot.time === '12:00')).toMatchObject({
      isAvailable: false,
      freeTableCount: 0,
      unavailableReason: 'pastLeadTime',
    });
    expect(today!.slots.find((slot) => slot.time === '12:30')?.unavailableReason).not.toBe(
      'pastLeadTime',
    );

    const gone = await gateway.getDaySlots({ branchId: NORTH, date: YESTERDAY, partySize: 2 });
    expect(gone!.unavailableReason).toBe('pastLeadTime');
    expect(gone!.slots.every((slot) => !slot.isAvailable)).toBe(true);

    const far = await gateway.getDaySlots({ branchId: NORTH, date: '2026-11-05', partySize: 2 });
    expect(far!.unavailableReason).toBe('tooFarAhead');
  });

  it('says a big party waits for the venue, and a party no table fits is refused for size', async () => {
    const gateway = world();
    const eight = await gateway.getDaySlots({ branchId: NORTH, date: TOMORROW, partySize: 8 });
    expect(eight!.slots.every((slot) => slot.requiresApproval)).toBe(true);

    const crowd = await gateway.getDaySlots({ branchId: NORTH, date: TOMORROW, partySize: 40 });
    expect(crowd!.slots.every((slot) => slot.unavailableReason === 'tooSmall')).toBe(true);
  });

  it('counts a booked table out, and back in for the booking being changed', async () => {
    const gateway = world();
    const before = await gateway.getDaySlots({ branchId: NORTH, date: TOMORROW, partySize: 2 });
    const booking = await book(gateway, at(TOMORROW, '20:00'));

    const after = await gateway.getDaySlots({ branchId: NORTH, date: TOMORROW, partySize: 2 });
    const changing = await gateway.getDaySlots({
      branchId: NORTH,
      date: TOMORROW,
      partySize: 2,
      excludeBookingId: booking.id,
    });

    const at20 = (day: typeof before) => day!.slots.find((slot) => slot.time === '20:00');
    expect(at20(after)!.freeTableCount).toBe(at20(before)!.freeTableCount - 1);
    expect(at20(changing)!.freeTableCount).toBe(at20(before)!.freeTableCount);
  });

  it('answers null for a branch that does not exist', async () => {
    await expect(
      world().getDaySlots({ branchId: 'nowhere', date: TOMORROW, partySize: 2 }),
    ).resolves.toBeNull();
  });
});

// --- The room on a booking -----------------------------------------------------------------

describe('the room on a booking', () => {
  it("is the booked table's room, by id and name, on the booking and in the list", async () => {
    const gateway = world();
    const floor = await gateway.getSlotFloor({
      branchId: NORTH,
      slotUtc: at(TOMORROW, '20:00'),
      partySize: 2,
    });
    const table = floor!.plan.tables.find((entry) => entry.isBookable)!;

    const booking = await book(gateway, at(TOMORROW, '20:00'), { tableId: table.id });

    expect(booking.roomId).toBe(table.floorAreaId);
    expect(booking.roomName).toBe(table.floorAreaName);
    expect(booking.roomName).not.toBeNull();
    const { upcoming } = await gateway.listBookings();
    expect(upcoming[0]).toMatchObject({ roomId: table.floorAreaId, roomName: table.floorAreaName });
  });
});

// --- Changing a booking --------------------------------------------------------------------

describe('changing a booking', () => {
  it('moves it half an hour on the same table, keeping its id, its code and its link', async () => {
    const gateway = world();
    const booking = await book(gateway, at(TOMORROW, '20:00'));
    const later = at(TOMORROW, '20:30');

    // The booking collides with itself unless it is left out.
    const asked = await gateway.getSlotFloor({ branchId: NORTH, slotUtc: later, partySize: 2 });
    expect(asked!.tables.find((t) => t.tableId === booking.tableId)?.unavailableReason).toBe(
      'alreadyBooked',
    );
    const changing = await gateway.getSlotFloor({
      branchId: NORTH,
      slotUtc: later,
      partySize: 2,
      excludeBookingId: booking.id,
    });
    expect(changing!.tables.find((t) => t.tableId === booking.tableId)?.isBookable).toBe(true);

    const moved = await gateway.rescheduleBooking(move(booking, { slotUtc: later }));

    expect(moved).toMatchObject({
      id: booking.id,
      code: booking.code,
      manageToken: booking.manageToken,
      status: 'confirmed',
      tableId: booking.tableId,
      slotUtc: later,
    });
    expect(Date.parse(moved.endUtc) - Date.parse(later)).toBe(90 * MINUTE_MS);
    expect(Date.parse(moved.freeCancellationUntilUtc)).toBeLessThan(Date.parse(later));
    await expect(gateway.getBooking(booking.id)).resolves.toEqual(moved);
  });

  it('decides the status again: a bigger party waits for the venue, a smaller one does not', async () => {
    const gateway = world();
    const booking = await book(gateway, at(TOMORROW, '20:00'));
    const big = (await gateway.getSlotFloor({
      branchId: NORTH,
      slotUtc: booking.slotUtc,
      partySize: 8,
      excludeBookingId: booking.id,
    }))!.tables.find((table) => table.isBookable)!;

    const grown = await gateway.rescheduleBooking(
      move(booking, { partySize: 8, tableId: big.tableId }),
    );
    expect(grown).toMatchObject({ status: 'pendingApproval', partySize: 8, tableId: big.tableId });

    const shrunk = await gateway.rescheduleBooking(move(grown, { partySize: 6 }));
    expect(shrunk.status).toBe('confirmed');
  });

  it('frees the old table, and the room moves with the table', async () => {
    const gateway = world();
    const booking = await book(gateway, at(TOMORROW, '20:00'));
    const floor = await gateway.getSlotFloor({
      branchId: NORTH,
      slotUtc: booking.slotUtc,
      partySize: 2,
      excludeBookingId: booking.id,
    });
    const other = floor!.plan.tables.find(
      (table) => table.isBookable && table.floorAreaId !== booking.roomId,
    )!;

    const moved = await gateway.rescheduleBooking(move(booking, { tableId: other.id }));

    expect(moved).toMatchObject({ roomId: other.floorAreaId, roomName: other.floorAreaName });
    const now = await gateway.getSlotFloor({
      branchId: NORTH,
      slotUtc: booking.slotUtc,
      partySize: 2,
    });
    expect(now!.tables.find((t) => t.tableId === booking.tableId)?.isBookable).toBe(true);
    expect(now!.tables.find((t) => t.tableId === other.id)?.isBookable).toBe(false);
  });

  it('answers a replayed command with the booking as it stands, not a second move', async () => {
    const gateway = world();
    const booking = await book(gateway, at(TOMORROW, '20:00'));
    const command = move(booking, { slotUtc: at(TOMORROW, '19:30') });

    const first = await gateway.rescheduleBooking(command);
    const again = await gateway.rescheduleBooking({ ...command, slotUtc: at(TOMORROW, '21:00') });

    expect(again).toEqual(first);
  });

  it('refuses a table somebody else holds then, and every rule a new booking meets', async () => {
    const gateway = world();
    const mine = await book(gateway, at(TOMORROW, '18:00'));
    const theirs = await book(gateway, at(TOMORROW, '20:00'));

    expect(
      await caught(
        gateway.rescheduleBooking(move(mine, { slotUtc: theirs.slotUtc, tableId: theirs.tableId })),
      ),
    ).toBeInstanceOf(TableTakenError);
    expect(
      await caught(gateway.rescheduleBooking(move(mine, { slotUtc: at(TODAY, '12:00') }))),
    ).toBeInstanceOf(LeadTimeExceededError);
    const shut = await caught(
      gateway.rescheduleBooking(move(mine, { slotUtc: at(TOMORROW, '04:00') })),
    );
    expect(shut).toBeInstanceOf(BookingRejectedError);
    expect((shut as BookingRejectedError).reason).toBe('closed');
    expect(
      await caught(gateway.rescheduleBooking({ ...move(mine, {}), commandId: 'not-a-guid' })),
    ).toBeInstanceOf(ValidationError);

    // Nothing moved.
    await expect(gateway.getBooking(mine.id)).resolves.toEqual(mine);
  });

  it('refuses a cancelled booking and one that has started, and nothing it does not know', async () => {
    const time = clock();
    // Today's booking is short notice; this is about one the floor confirmed.
    const gateway = createMockGateway({
      latencyMs: 0,
      simulateJoiners: false,
      now: time.now,
      codeSeed: 7,
      floorApprovesAtOnce: true,
    });
    const cancelled = await book(gateway, at(TOMORROW, '18:00'));
    await gateway.cancelBooking(cancelled.id);
    const started = await book(gateway, at(TODAY, '14:00'));

    expect(await caught(gateway.rescheduleBooking(move(cancelled, {})))).toBeInstanceOf(
      BookingNotChangeableError,
    );
    time.advance(2 * 60 * MINUTE_MS + MINUTE_MS);
    expect(
      await caught(gateway.rescheduleBooking(move(started, { slotUtc: at(TOMORROW, '14:00') }))),
    ).toBeInstanceOf(BookingNotChangeableError);
    expect(
      await caught(gateway.rescheduleBooking({ ...move(started, {}), bookingId: 'bk_nobody' })),
    ).toBeInstanceOf(NotFoundError);
  });

  it("answers somebody else's booking exactly as one that does not exist", async () => {
    const gateway = world();
    await gateway.loginDiner({
      identifier: SEEDED_ACCOUNT.username,
      password: SEEDED_ACCOUNT.password,
    });
    const challenge = await gateway.requestPhoneCode(SEEDED_ACCOUNT.phoneE164);
    await gateway.verifyPhoneCode({ challengeId: challenge.challengeId, code: challenge.devCode! });
    const theirs = await book(gateway, at(TOMORROW, '20:00'));

    const phoneE164 = '+37491000555';
    await gateway.registerDiner({
      username: 'someoneelse',
      email: 'someoneelse@example.test',
      password: 'correct horse',
      phoneE164,
      displayName: 'Someone Else',
    });
    const code = await gateway.requestPhoneCode(phoneE164);
    await gateway.verifyPhoneCode({ challengeId: code.challengeId, code: code.devCode! });

    expect(
      await caught(gateway.rescheduleBooking(move(theirs, { slotUtc: at(TOMORROW, '19:30') }))),
    ).toBeInstanceOf(NotFoundError);
  });

  it('moves the reminder with the booking', async () => {
    const time = clock();
    // A reminder is for a confirmed booking; today's wait for the floor first.
    const gateway = createMockGateway({
      latencyMs: 0,
      simulateJoiners: false,
      now: time.now,
      codeSeed: 7,
      floorApprovesAtOnce: true,
    });
    await gateway.loginDiner({
      identifier: SEEDED_ACCOUNT.username,
      password: SEEDED_ACCOUNT.password,
    });
    const challenge = await gateway.requestPhoneCode(SEEDED_ACCOUNT.phoneE164);
    await gateway.verifyPhoneCode({ challengeId: challenge.challengeId, code: challenge.devCode! });
    const booking = await book(gateway, at(TODAY, '14:00'));
    const reminders = async () =>
      (await gateway.listNotifications({ limit: 50 })).items.filter(
        (row) => row.kind === 'booking-reminder' && row.reservationId === booking.id,
      );
    expect(await reminders()).toHaveLength(1);

    await gateway.rescheduleBooking(move(booking, { slotUtc: at(TODAY, '20:00') }));
    expect(await reminders()).toHaveLength(0);

    time.advance(6 * 60 * MINUTE_MS + 30 * MINUTE_MS);
    expect(await reminders()).toHaveLength(1);
  });
});

// --- The tab: a bill request, faces --------------------------------------------------------

/** A tab on a free table, this device its host, with one item ordered. */
async function tabWithAnItem(gateway: YallaGateway) {
  const scan = await gateway.scanTableCode({
    tableCode: mockTableCode(`${NORTH}-t1`),
    commandId: crypto.randomUUID(),
  });
  const tab = scan.tab;
  const menu = await gateway.getBranchMenuDetail(tab.branchId);
  const item = menu!.categories[0]!.items[0]!;
  await gateway.placeOrder({
    tabId: tab.tabId,
    clientCommandId: crypto.randomUUID(),
    lines: [
      { menuItemId: item.id, quantity: 2, isShared: false, participantId: tab.me.participantId },
    ],
  });
  return tab;
}

describe('asking for the bill with a tip', () => {
  it('works out the whole bill: the balance with service, the tip on the items before it', async () => {
    const gateway = world();
    const tab = await tabWithAnItem(gateway);
    const money = (await gateway.getDinerTab(tab.tabId))!.money;
    if (money.kind !== 'table') throw new Error('the host sees the table total');

    const call = await gateway.callWaiter({
      tabId: tab.tabId,
      reason: 'bill',
      commandId: crypto.randomUUID(),
      bill: { scope: 'whole', tipPercent: 10 },
    });

    expect(call.reason).toBe('bill');
    expect(call.bill).toEqual({
      scope: 'whole',
      amountDram: money.bill.remainingDram,
      tipPercent: 10,
      tipDram: percentOf(money.bill.subtotalDram, 10),
    });
    // Nothing was paid, so the tab carries no tips yet.
    expect(money.tipsDram).toBe(0);
  });

  it("works out the diner's own share from the same split the shares view shows", async () => {
    const gateway = world();
    const tab = await tabWithAnItem(gateway);
    const shares = await gateway.getTabShares(tab.tabId);
    const mine = shares!.yourShare!;

    const call = await gateway.callWaiter({
      tabId: tab.tabId,
      reason: 'bill',
      commandId: crypto.randomUUID(),
      bill: { scope: 'mine', tipPercent: 0 },
    });

    expect(call.bill).toEqual({
      scope: 'mine',
      amountDram: mine.shareDram - mine.paidDram,
      tipPercent: 0,
      tipDram: 0,
    });
  });

  it('refuses a bill on anything but the bill, a tip out of range, and nothing to pay', async () => {
    const gateway = world();
    const scan = await gateway.scanTableCode({
      tableCode: mockTableCode(`${NORTH}-t2`),
      commandId: crypto.randomUUID(),
    });
    const ask = (reason: 'bill' | 'water', tipPercent: number) =>
      caught(
        gateway.callWaiter({
          tabId: scan.tab.tabId,
          reason,
          commandId: crypto.randomUUID(),
          bill: { scope: 'whole', tipPercent },
        }),
      );
    const field = (error: unknown) => (error as ValidationError).violations[0]?.field;

    expect(field(await ask('water', 5))).toBe('billScope');
    expect(field(await ask('bill', 26))).toBe('tipPercent');
    expect(field(await ask('bill', 2.5))).toBe('tipPercent');
    // An empty tab: nothing left to pay is refused by naming the scope.
    expect(field(await ask('bill', 5))).toBe('billScope');
  });

  it('leaves an ordinary call without a bill', async () => {
    const gateway = world();
    const tab = await tabWithAnItem(gateway);
    const call = await gateway.callWaiter({
      tabId: tab.tabId,
      reason: 'water',
      commandId: crypto.randomUUID(),
    });
    expect(call.bill).toBeNull();
  });
});

describe('faces on the roster', () => {
  it("shows the photo of the account the diner scanned in with, on their row and on 'me'", async () => {
    const gateway = world();
    await gateway.loginDiner({
      identifier: SEEDED_ACCOUNT.username,
      password: SEEDED_ACCOUNT.password,
    });
    const { photo } = await gateway.getDinerProfile();
    expect(photo, 'the seeded account has a photo').not.toBeNull();

    const scan = await gateway.scanTableCode({
      tableCode: mockTableCode(`${NORTH}-t3`),
      commandId: crypto.randomUUID(),
    });

    expect(scan.tab.me.photo?.photoId).toBe(photo!.photoId);
    expect(
      scan.tab.participants.find((entry) => entry.participantId === scan.tab.me.participantId)
        ?.photo?.photoId,
    ).toBe(photo!.photoId);

    // The account's photo as it stands: taking it off takes it off the tab.
    await gateway.removeDinerPhoto();
    expect((await gateway.getDinerTab(scan.tab.tabId))!.me.photo).toBeNull();
  });

  it('shows no photo for a walk-in with no account', async () => {
    const scan = await world().scanTableCode({
      tableCode: mockTableCode(`${NORTH}-t4`),
      commandId: crypto.randomUUID(),
    });
    expect(scan.tab.me.photo).toBeNull();
    expect(scan.tab.participants.every((entry) => entry.photo === null)).toBe(true);
  });
});

// --- The staff side --------------------------------------------------------------------------

describe('tips and the bill request at the counter', () => {
  it('lists the table asking for the whole bill with the amount and the tip worked out', async () => {
    const staff = createStaffMockGateway({ now: () => new Date(NOW) });
    const requests = await staff.listServiceRequests('any');
    const bill = requests.find((request) => request.reason === 'bill');
    expect(bill).toBeDefined();

    const tab = await staff.getStaffTab(bill!.tabId);
    expect(bill!.bill).toEqual({
      scope: 'whole',
      amountDram: tab!.totals.remainingDram,
      tipPercent: 5,
      tipDram: percentOf(tab!.totals.subtotalDram, 5),
    });
    // The other request is an ordinary one.
    expect(requests.filter((request) => request.bill === null).length).toBeGreaterThan(0);
  });

  it('sums the tips taken with each payment beside the totals, never into them', async () => {
    const staff = createStaffMockGateway({ now: () => new Date(NOW) });
    const tabId = (await staff.listServiceRequests('any')).find((r) => r.reason === 'bill')!.tabId;
    const before = (await staff.getStaffTab(tabId))!;
    expect(before.tipsDram).toBe(0);

    for (const [amountDram, tipDram] of [
      [100, 50],
      [200, 70],
    ] as const) {
      await staff.recordCashPayment({
        tabId,
        amountDram,
        tipDram,
        clientCommandId: crypto.randomUUID(),
      });
    }

    const after = (await staff.getStaffTab(tabId))!;
    expect(after.tipsDram).toBe(120);
    expect(after.totals.paidDram).toBe(before.totals.paidDram + 300);
  });

  it('shows the face of a participant who scanned in with an account that has one', async () => {
    const staff = createStaffMockGateway({ now: () => new Date(NOW) });
    const tabId = (await staff.listServiceRequests('any'))[0]!.tabId;
    const tab = (await staff.getStaffTab(tabId))!;

    expect(tab.participants.map((person) => person.photo !== null)).toEqual([true, false]);
  });
});
