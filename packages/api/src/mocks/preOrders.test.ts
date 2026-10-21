import { describe, expect, it } from 'vitest';
import type { CreateBookingCommand } from '../contracts/booking';
import {
  BookingCommandInUseError,
  BookingNotChangeableError,
  OnMyWayNotOpenError,
  PreOrderAlreadySentError,
  PreOrderItemsUnavailableError,
  PreOrderLockedError,
  PreOrdersNotAcceptedError,
} from '../contracts/errors';
import type { BranchMenu } from '../contracts/ordering';
import { canEditPreOrder, preOrderMenu } from '../contracts/preOrder';
import { ValidationError } from '../errors';
import { SEEDED_ACCOUNT } from './accounts';
import { createMockGateway, type MockGateway, type MockGatewayOptions } from './mockGateway';
import { createMockPreOrderBook, type MockPreOrderBooking } from './preOrders';
import { createPublicMockGateway, manageTokenFor } from './publicMock';

/**
 * Pre-orders in the diner's mock (PO wire, 2026-10-21) — the rules the server
 * enforces, in its order, so the app and the public page are built against
 * them: the two-hour lock, the branch switch, every unavailable dish named,
 * the bounds, the price lock, the command id, the states as the booking
 * moves, "on my way", and the feed's question 45 minutes before.
 */

const NORTH = 'b-lumen-north';
const CASCADE = 'b-lumen-cascade';
/** Monday 19 October 2026, 12:00 in Yerevan. */
const START = Date.parse('2026-10-19T08:00:00.000Z');
/** Tuesday 20 October, 19:30 in Yerevan. */
const SLOT = '2026-10-20T15:30:00.000Z';
const minutesBefore = (minutes: number) =>
  new Date(Date.parse(SLOT) - minutes * 60_000).toISOString();

function world(options: MockGatewayOptions = {}) {
  let clock = START;
  const gateway = createMockGateway({
    latencyMs: 0,
    simulateJoiners: false,
    simulateWaiter: false,
    now: () => new Date(clock),
    codeSeed: 7,
    preOrders: {
      branches: {
        [NORTH]: { acceptsPreOrders: true, minutesBefore: 30, excludedMenuItemIds: ['gata'] },
      },
    },
    ...options,
  });
  return {
    gateway,
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

async function book(gateway: MockGateway, branchId = NORTH, slotUtc = SLOT) {
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
  return promise.then(
    () => null,
    (error: unknown) => error,
  );
}

const save = (
  gateway: MockGateway,
  reservationId: string,
  lines: { menuItemId: string; quantity: number; note?: string }[],
  clientCommandId: string = crypto.randomUUID(),
) => gateway.replacePreOrder({ reservationId, clientCommandId, lines, note: ' salad first ' });

describe('offering a pre-order', () => {
  it('offers the editor until two hours before at a branch that takes them, and not elsewhere', async () => {
    const { gateway } = world();
    await proved(gateway);
    const north = await book(gateway);
    const elsewhere = await book(gateway, CASCADE, '2026-10-21T15:30:00.000Z');

    expect(north.preOrderEditableUntilUtc).toBe(minutesBefore(120));
    expect(canEditPreOrder(north, new Date(START))).toBe(true);
    expect(elsewhere.preOrderEditableUntilUtc).toBeUndefined();
    expect(canEditPreOrder(elsewhere, new Date(START))).toBe(false);

    const refused = await caught(
      save(gateway, elsewhere.id, [{ menuItemId: 'espresso', quantity: 1 }]),
    );
    expect(refused).toBeInstanceOf(PreOrdersNotAcceptedError);
  });

  it('serves the menu with sold-out and excluded dishes marked', async () => {
    const { gateway } = world();
    gateway.setDishSoldOutAsVenue(NORTH, 'croissant', true);
    const menu = (await gateway.getBranchMenuDetail(NORTH))!;
    const dish = (id: string) =>
      menu.categories.flatMap((category) => category.items).find((item) => item.id === id);

    expect(dish('gata')).toMatchObject({ isAvailable: true, availableForPreOrder: false });
    expect(dish('croissant')).toMatchObject({ isAvailable: false, availableForPreOrder: true });
    expect(dish('espresso')).toMatchObject({ isAvailable: true, availableForPreOrder: true });
    const offered = preOrderMenu(menu).categories.flatMap((category) => category.items);
    expect(offered.map((item) => item.id)).not.toContain('gata');
    expect(offered.map((item) => item.id)).not.toContain('croissant');
    expect(offered.map((item) => item.id)).toContain('espresso');
  });
});

describe('saving one', () => {
  it('saves the whole list at the menu prices, and the booking reads it back', async () => {
    const { gateway } = world();
    await proved(gateway);
    const booking = await book(gateway);

    const result = await save(gateway, booking.id, [
      { menuItemId: 'cappuccino', quantity: 2, note: ' oat milk ' },
      { menuItemId: 'croissant', quantity: 1 },
    ]);

    expect(result.wasReplay).toBe(false);
    expect(result.preOrder).toMatchObject({
      reservationId: booking.id,
      state: 'editable',
      note: 'salad first',
      totalDram: 2 * 1200 + 1100,
      editableUntilUtc: minutesBefore(120),
      dueAtUtc: minutesBefore(30),
      sentAtUtc: null,
      kitchenStatus: null,
      onTab: false,
      notComingAtUtc: null,
    });
    expect(result.preOrder?.lines).toMatchObject([
      {
        menuItemId: 'cappuccino',
        name: 'Cappuccino',
        unitPriceDram: 1200,
        quantity: 2,
        lineTotalDram: 2400,
        note: 'oat milk',
        availableNow: true,
      },
      { menuItemId: 'croissant', unitPriceDram: 1100, quantity: 1, note: null, availableNow: true },
    ]);
    expect((await gateway.getBooking(booking.id))?.preOrder).toEqual(result.preOrder);
  });

  it('names every dish it cannot take, and saves nothing', async () => {
    const { gateway } = world();
    await proved(gateway);
    const booking = await book(gateway);

    const error = await caught(
      save(gateway, booking.id, [
        { menuItemId: 'espresso', quantity: 1 },
        { menuItemId: 'gata', quantity: 1 },
        { menuItemId: 'cold-brew', quantity: 1 },
        { menuItemId: 'compote', quantity: 1 },
        { menuItemId: 'nothing-like-it', quantity: 1 },
      ]),
    );

    expect(error).toBeInstanceOf(PreOrderItemsUnavailableError);
    expect((error as PreOrderItemsUnavailableError).items).toEqual([
      { menuItemId: 'gata', reason: 'notForPreOrder' },
      { menuItemId: 'cold-brew', reason: 'soldOut' },
      { menuItemId: 'compote', reason: 'notOnMenu' },
      { menuItemId: 'nothing-like-it', reason: 'notOnMenu' },
    ]);
    expect((await gateway.getBooking(booking.id))?.preOrder).toBeUndefined();
  });

  it('holds the bounds, in the server field names', async () => {
    const { gateway } = world();
    await proved(gateway);
    const booking = await book(gateway);

    const error = await caught(
      save(gateway, booking.id, [
        { menuItemId: 'espresso', quantity: 21 },
        { menuItemId: 'americano', quantity: 1, note: 'x'.repeat(201) },
      ]),
    );
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).violations.map((violation) => violation.field)).toEqual([
      'lines[0].quantity',
      'lines[1].note',
    ]);
    const empty = await caught(save(gateway, booking.id, []));
    expect((empty as ValidationError).field).toBe('lines');
  });

  it('answers a retry as it stands, and refuses the id for anything else', async () => {
    const { gateway } = world();
    await proved(gateway);
    const first = await book(gateway);
    const second = await book(gateway, NORTH, '2026-10-21T15:30:00.000Z');
    const command = crypto.randomUUID();

    await save(gateway, first.id, [{ menuItemId: 'espresso', quantity: 1 }], command);
    const replay = await save(
      gateway,
      first.id,
      [{ menuItemId: 'espresso', quantity: 5 }],
      command,
    );
    expect(replay.wasReplay).toBe(true);
    expect(replay.preOrder?.lines[0]?.quantity).toBe(1);

    const reused = await caught(
      save(gateway, second.id, [{ menuItemId: 'espresso', quantity: 1 }], command),
    );
    expect(reused).toBeInstanceOf(BookingCommandInUseError);
    const asClear = await caught(
      gateway.clearPreOrder({ reservationId: first.id, clientCommandId: command }),
    );
    expect(asClear).toBeInstanceOf(BookingCommandInUseError);
  });

  it('keeps a dish that ran out, marked, and refuses a save that keeps it', async () => {
    const { gateway } = world();
    await proved(gateway);
    const booking = await book(gateway);
    await save(gateway, booking.id, [
      { menuItemId: 'croissant', quantity: 1 },
      { menuItemId: 'espresso', quantity: 1 },
    ]);

    gateway.setDishSoldOutAsVenue(NORTH, 'croissant', true);
    const read = await gateway.getBooking(booking.id);
    expect(read?.preOrder?.lines.map((line) => line.availableNow)).toEqual([false, true]);

    const kept = await caught(
      save(gateway, booking.id, [
        { menuItemId: 'croissant', quantity: 1 },
        { menuItemId: 'espresso', quantity: 2 },
      ]),
    );
    expect((kept as PreOrderItemsUnavailableError).items).toEqual([
      { menuItemId: 'croissant', reason: 'soldOut' },
    ]);
    const swapped = await save(gateway, booking.id, [{ menuItemId: 'espresso', quantity: 2 }]);
    expect(swapped.preOrder?.lines).toHaveLength(1);
  });

  it('locks two hours before: read as locked, and a save or a clear is refused', async () => {
    const { gateway, travel } = world();
    await proved(gateway);
    const booking = await book(gateway);
    await save(gateway, booking.id, [{ menuItemId: 'espresso', quantity: 1 }]);

    travel(minutesBefore(121));
    expect((await gateway.getBooking(booking.id))?.preOrder?.state).toBe('editable');

    travel(minutesBefore(120));
    const read = await gateway.getBooking(booking.id);
    expect(read?.preOrder?.state).toBe('locked');
    expect(canEditPreOrder(read!, new Date(minutesBefore(120)))).toBe(false);
    const locked = await caught(
      save(gateway, booking.id, [{ menuItemId: 'espresso', quantity: 2 }]),
    );
    expect(locked).toBeInstanceOf(PreOrderLockedError);
    expect(locked).toMatchObject({ lockedAtUtc: minutesBefore(120), reservationId: booking.id });
    const clear = await caught(
      gateway.clearPreOrder({ reservationId: booking.id, clientCommandId: crypto.randomUUID() }),
    );
    expect(clear).toBeInstanceOf(PreOrderLockedError);
  });

  it('clears, even after the branch stopped taking them', async () => {
    const { gateway } = world();
    await proved(gateway);
    const booking = await book(gateway);
    await save(gateway, booking.id, [{ menuItemId: 'espresso', quantity: 1 }]);

    gateway.setPreOrderSettingsAsVenue(NORTH, {
      acceptsPreOrders: false,
      minutesBefore: 30,
      excludedMenuItemIds: [],
    });
    const offOnly = await gateway.getBooking(booking.id);
    expect(offOnly?.preOrderEditableUntilUtc).toBeUndefined();
    expect(offOnly?.preOrder?.state).toBe('editable');
    const edit = await caught(save(gateway, booking.id, [{ menuItemId: 'espresso', quantity: 2 }]));
    expect(edit).toBeInstanceOf(PreOrdersNotAcceptedError);

    const cleared = await gateway.clearPreOrder({
      reservationId: booking.id,
      clientCommandId: crypto.randomUUID(),
    });
    expect(cleared).toEqual({ reservationId: booking.id, preOrder: null, wasReplay: false });
    expect((await gateway.getBooking(booking.id))?.preOrder).toBeUndefined();
  });
});

describe('as the booking moves', () => {
  it('is cancelled with the booking, and refused on a cancelled one', async () => {
    const { gateway } = world();
    await proved(gateway);
    const booking = await book(gateway);
    await save(gateway, booking.id, [{ menuItemId: 'espresso', quantity: 1 }]);

    const cancelled = await gateway.cancelBooking(booking.id);
    expect(cancelled.preOrder?.state).toBe('cancelled');
    const refused = await caught(
      save(gateway, booking.id, [{ menuItemId: 'espresso', quantity: 1 }]),
    );
    expect(refused).toBeInstanceOf(BookingNotChangeableError);
  });

  it('once sent: stays sent, and neither the pre-order nor the booking moves', async () => {
    const { gateway, travel } = world();
    await proved(gateway);
    const booking = await book(gateway);
    await save(gateway, booking.id, [{ menuItemId: 'espresso', quantity: 1 }]);

    travel(minutesBefore(30));
    gateway.sendPreOrderAsVenue(booking.id);
    const sent = await gateway.getBooking(booking.id);
    expect(sent?.preOrder).toMatchObject({ state: 'sent', kitchenStatus: 'inKitchen' });
    expect(sent?.preOrder?.sentAtUtc).toBe(minutesBefore(30));

    travel(minutesBefore(200));
    const edit = await caught(save(gateway, booking.id, [{ menuItemId: 'espresso', quantity: 2 }]));
    expect(edit).toBeInstanceOf(PreOrderAlreadySentError);
    const floor = await gateway.getSlotFloor({
      branchId: NORTH,
      slotUtc: '2026-10-20T16:30:00.000Z',
      partySize: 2,
      excludeBookingId: booking.id,
    });
    const move = await caught(
      gateway.rescheduleBooking({
        bookingId: booking.id,
        commandId: crypto.randomUUID(),
        tableId: floor!.tables.find((table) => table.isBookable)!.tableId,
        slotUtc: '2026-10-20T16:30:00.000Z',
        timeZoneId: 'Asia/Yerevan',
        partySize: 2,
      }),
    );
    expect(move).toBeInstanceOf(PreOrderAlreadySentError);
  });

  it('a move carries it, judged against the new start, and clears "not coming"', async () => {
    const { gateway, travel } = world();
    await proved(gateway);
    const booking = await book(gateway);
    await save(gateway, booking.id, [{ menuItemId: 'espresso', quantity: 1 }]);
    gateway.markPreOrderNotComingAsVenue(booking.id);
    expect((await gateway.getBooking(booking.id))?.preOrder?.state).toBe('notComing');

    travel('2026-10-20T08:00:00.000Z');
    const later = '2026-10-21T15:30:00.000Z';
    const floor = await gateway.getSlotFloor({
      branchId: NORTH,
      slotUtc: later,
      partySize: 2,
      excludeBookingId: booking.id,
    });
    const moved = await gateway.rescheduleBooking({
      bookingId: booking.id,
      commandId: crypto.randomUUID(),
      tableId: floor!.tables.find((table) => table.isBookable)!.tableId,
      slotUtc: later,
      timeZoneId: 'Asia/Yerevan',
      partySize: 2,
    });
    expect(moved.preOrder).toMatchObject({
      state: 'editable',
      notComingAtUtc: null,
      editableUntilUtc: '2026-10-21T13:30:00.000Z',
    });
  });
});

describe('"Are you on your way?"', () => {
  it('lands in the feed 45 minutes before a booking with a pre-order, and only that one', async () => {
    const { gateway, travel } = world();
    await proved(gateway);
    const withOne = await book(gateway);
    const without = await book(gateway, NORTH, '2026-10-21T15:30:00.000Z');
    await save(gateway, withOne.id, [{ menuItemId: 'espresso', quantity: 1 }]);

    travel(minutesBefore(46));
    const early = await gateway.listNotifications();
    expect(early.items.filter((row) => row.kind === 'booking-on-your-way')).toEqual([]);

    travel(minutesBefore(45));
    const asked = (await gateway.listNotifications()).items.filter(
      (row) => row.kind === 'booking-on-your-way',
    );
    expect(asked).toHaveLength(1);
    expect(asked[0]?.reservationId).not.toBe(without.id);
    expect(asked[0]).toMatchObject({
      reservationId: withOne.id,
      branchId: NORTH,
      createdAtUtc: minutesBefore(45),
      params: { reservationCode: withOne.code, partySize: '2', time: '19:30' },
    });
  });

  it('is not asked in the feed once a waiter marked the party not coming', async () => {
    const { gateway, travel } = world();
    await proved(gateway);
    const booking = await book(gateway);
    await save(gateway, booking.id, [{ menuItemId: 'espresso', quantity: 1 }]);
    gateway.markPreOrderNotComingAsVenue(booking.id);

    travel(minutesBefore(40));
    const rows = (await gateway.listNotifications()).items;
    expect(rows.filter((row) => row.kind === 'booking-on-your-way')).toEqual([]);
  });

  it('records "on my way" once, and refuses a booking not expecting anybody', async () => {
    const { gateway, travel } = world({ floorApprovesAtOnce: true });
    await proved(gateway);
    const booking = await book(gateway);
    await save(gateway, booking.id, [{ menuItemId: 'espresso', quantity: 1 }]);

    travel(minutesBefore(40));
    const first = await gateway.confirmOnMyWay(booking.id);
    expect(first).toEqual({
      reservationId: booking.id,
      guestConfirmedOnWayAtUtc: minutesBefore(40),
      wasReplay: false,
    });
    travel(minutesBefore(35));
    expect(await gateway.confirmOnMyWay(booking.id)).toEqual({ ...first, wasReplay: true });
    expect((await gateway.getBooking(booking.id))?.guestConfirmedOnWayAtUtc).toBe(
      minutesBefore(40),
    );

    const other = await book(gateway, NORTH, '2026-10-21T15:30:00.000Z');
    await gateway.cancelBooking(other.id);
    const refused = await caught(gateway.confirmOnMyWay(other.id));
    expect(refused).toBeInstanceOf(OnMyWayNotOpenError);
    expect(refused).toMatchObject({ bookingStatus: 'cancelledByDiner' });
  });
});

describe('from the manage link', () => {
  it('edits the pre-order behind the token, and asks "on your way" when it is time', async () => {
    const { gateway, travel } = world();
    const page = createPublicMockGateway({ gateway, now: () => new Date(START) });
    await proved(gateway);
    const booking = await book(gateway);
    const token = manageTokenFor(booking.id);

    const saved = await page.replaceManagedPreOrder({
      token,
      clientCommandId: crypto.randomUUID(),
      lines: [{ menuItemId: 'espresso', quantity: 2 }],
    });
    expect(saved.preOrder?.totalDram).toBe(1400);

    const managed = await page.getManagedBooking({ token });
    expect(managed).not.toHaveProperty('branchId');
    expect(managed).toMatchObject({
      venueSlug: 'lumen-coffee',
      branchSlug: 'northern-avenue',
      preOrderEditableUntilUtc: minutesBefore(120),
      onYourWayAsked: false,
    });
    expect(managed?.preOrder?.id).toBe(saved.preOrder?.id);

    travel(minutesBefore(40));
    const asking = createPublicMockGateway({ gateway, now: () => new Date(minutesBefore(40)) });
    expect((await asking.getManagedBooking({ token }))?.onYourWayAsked).toBe(true);
    const answer = await asking.confirmManagedOnMyWay({ token });
    expect(answer.guestConfirmedOnWayAtUtc).toBe(minutesBefore(40));
    expect((await asking.getManagedBooking({ token }))?.onYourWayAsked).toBe(false);

    const locked = await caught(
      asking.clearManagedPreOrder({ token, clientCommandId: crypto.randomUUID() }),
    );
    expect(locked).toBeInstanceOf(PreOrderLockedError);
  });
});

describe('the price lock', () => {
  it('keeps the price a dish had when it entered; a dish added later is priced now', () => {
    let price = 1000;
    const menu = (): BranchMenu => ({
      branchId: 'b',
      fetchedAtUtc: '',
      categories: [
        {
          id: 'c',
          name: 'C',
          displayOrder: 0,
          items: ['soup', 'bread'].map((id, index) => ({
            id,
            categoryId: 'c',
            name: id,
            description: '',
            priceDram: id === 'soup' ? price : price / 2,
            photo: {
              photoId: '',
              thumbnailUrl: '',
              cardUrl: '',
              fullUrl: '',
              width: null,
              height: null,
            },
            ingredients: '',
            allergens: '',
            portionSize: '',
            spiceLevel: 'notSpicy' as const,
            prepMinutes: 1,
            isAvailable: true,
            displayOrder: index,
          })),
        },
      ],
    });
    const book = createMockPreOrderBook({
      now: () => new Date(START),
      menu,
      branches: { b: { acceptsPreOrders: true } },
    });
    const booking: MockPreOrderBooking = {
      id: 'r',
      branchId: 'b',
      status: 'confirmed',
      startUtc: SLOT,
      endUtc: '2026-10-20T17:30:00.000Z',
    };

    book.replace({
      url: 'mock',
      booking,
      draft: { lines: [{ menuItemId: 'soup', quantity: 1 }] },
      clientCommandId: crypto.randomUUID(),
      actor: 'a',
    });
    price = 1500;
    const edited = book.replace({
      url: 'mock',
      booking,
      draft: {
        lines: [
          { menuItemId: 'soup', quantity: 3 },
          { menuItemId: 'bread', quantity: 1 },
        ],
      },
      clientCommandId: crypto.randomUUID(),
      actor: 'a',
    });

    expect(edited.preOrder?.lines.map((line) => line.unitPriceDram)).toEqual([1000, 750]);
    expect(edited.preOrder?.totalDram).toBe(3 * 1000 + 750);
  });
});
