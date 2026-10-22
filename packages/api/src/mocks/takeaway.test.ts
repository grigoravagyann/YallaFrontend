import { describe, expect, it } from 'vitest';
import {
  BookingBlockedNoShowsError,
  BookingCommandInUseError,
  TakeawayBusyError,
  TakeawayClosedError,
  TakeawayItemsUnavailableError,
  TakeawayNoShowTooEarlyError,
  TakeawayNotAcceptedError,
  TakeawaySlotUnavailableError,
  TakeawayStatusConflictError,
} from '../contracts/errors';
import type { PlaceTakeawayOrderCommand } from '../contracts/takeaway';
import { ValidationError } from '../errors';
import { SEEDED_ACCOUNT } from './accounts';
import { createConsoleMockGateway } from './consoleMock';
import { mockBranchMenu, publishedBranchMenu } from './menuDetail';
import { createMockGateway } from './mockGateway';
import { publicBranchFixtures } from './publicVenues';
import { createStaffMockGateway } from './staffMock';
import {
  MOCK_TAKEAWAY_BRANCHES,
  createMockTakeawayBook,
  type MockTakeawayBranch,
} from './takeaway';

/**
 * Takeaway in the mocks (`docs/takeaway.md`, 2026-10-22): the server's rules
 * in its order — the branch switch, the opening hours and the last order, the
 * kitchen's capacity, the slots, the dishes — the five-minute sweep, every
 * move at the counter, the kitchen's band, the Orders tab, and the diner,
 * staff and console worlds that hold it.
 */

const NORTH = 'b-lumen-north';
/** Wednesday 2026-09-16, 14:00 in Yerevan (UTC+4): Lumen North is open 09:00–01:00. */
const WEDNESDAY_2PM = Date.parse('2026-09-16T10:00:00.000Z');
/** Thursday 03:30 in Yerevan: shut since 01:00. */
const THURSDAY_330AM = Date.parse('2026-09-16T23:30:00.000Z');
/** Wednesday 00:45 (Thursday morning) in Yerevan: open, but past the last order. */
const PAST_LAST_ORDER = Date.parse('2026-09-16T20:45:00.000Z');

let commandSequence = 0;
const commandId = () =>
  `00000000-0000-4000-8000-${String((commandSequence += 1)).padStart(12, '0')}`;

function book(branch: MockTakeawayBranch = MOCK_TAKEAWAY_BRANCHES[NORTH]!, start = WEDNESDAY_2PM) {
  let clock = start;
  const fixture = publicBranchFixtures[NORTH]!;
  const takeaway = createMockTakeawayBook({
    now: () => new Date(clock),
    menu: (branchId) => publishedBranchMenu(mockBranchMenu(branchId, 'cafe')),
    place: () => ({
      venueName: 'Lumen Coffee',
      branchName: 'Northern Avenue',
      branchAddress: fixture.addressLine,
      branchPhoneE164: fixture.phoneE164,
      latitude: 40.18,
      longitude: 44.51,
      timeZoneId: 'Asia/Yerevan',
      weeklyHours: fixture.weeklyHours,
    }),
    branches: { [NORTH]: branch },
  });
  return {
    takeaway,
    advance: (minutes: number) => {
      clock += minutes * 60_000;
    },
    at: (minutes: number) => new Date(clock + minutes * 60_000).toISOString(),
  };
}

function order(extra: Partial<PlaceTakeawayOrderCommand> = {}): PlaceTakeawayOrderCommand {
  return {
    branchId: NORTH,
    pickup: { asap: true },
    lines: [
      { menuItemId: 'cappuccino', quantity: 2 },
      { menuItemId: 'croissant', quantity: 1 },
    ],
    clientCommandId: commandId(),
    ...extra,
  };
}

const URL = 'mock://takeaway';
const GUEST = { url: URL, actor: 'diner-1', guestName: 'Lilit', guestPhone: '+37494555666' };

function caught(run: () => unknown): unknown {
  try {
    run();
    return null;
  } catch (error) {
    return error;
  }
}

describe('when takeaway is on offer', () => {
  it('offers ASAP at now + prep and the quarter hours to closing − last order', () => {
    const { takeaway } = book();
    const availability = takeaway.availability(NORTH);
    expect(availability).toMatchObject({
      enabled: true,
      open: true,
      prepMinutes: 20,
      asapReadyAt: '14:20',
      asapReadyAtUtc: '2026-09-16T10:20:00.000Z',
      lastPickupAt: '00:30',
      busy: false,
      opensAt: null,
    });
    expect(availability.slots[0]).toBe('14:30');
    expect(availability.slots.at(-1)).toBe('00:30');
  });

  it('is closed outside the hours and past the last order, saying when it opens', () => {
    expect(book(undefined, THURSDAY_330AM).takeaway.availability(NORTH)).toMatchObject({
      open: false,
      slots: [],
      asapReadyAt: null,
      opensAt: '09:00',
    });
    const late = book(undefined, PAST_LAST_ORDER).takeaway;
    expect(late.availability(NORTH)).toMatchObject({ open: false, opensAt: '09:00' });
    const error = caught(() => late.place({ ...GUEST, command: order() }));
    expect(error).toBeInstanceOf(TakeawayClosedError);
    expect(error).toMatchObject({ opensAt: '09:00' });
  });

  it('is off at a branch that never switched it on', () => {
    const { takeaway } = book({});
    expect(takeaway.availability(NORTH)).toMatchObject({ enabled: false, open: false });
    expect(caught(() => takeaway.place({ ...GUEST, command: order() }))).toBeInstanceOf(
      TakeawayNotAcceptedError,
    );
    expect(takeaway.publicInfo(NORTH)).toEqual({ enabled: false, prepMinutes: 20 });
  });

  it('marks the hall-only dish on the menu', () => {
    const { takeaway } = book();
    const menu = takeaway.decorateMenu(publishedBranchMenu(mockBranchMenu(NORTH, 'cafe')));
    const dishes = menu.categories.flatMap((category) => category.items);
    expect(dishes.find((dish) => dish.id === 'matnakash-eggs')?.availableForTakeaway).toBe(false);
    expect(dishes.find((dish) => dish.id === 'cappuccino')?.availableForTakeaway).toBe(true);
  });
});

describe('sending an order', () => {
  it('snapshots the lines, mints a code and starts the five-minute clock', () => {
    const { takeaway } = book();
    const sent = takeaway.place({ ...GUEST, command: order({ note: '  no sugar ' }) });
    expect(sent).toMatchObject({
      status: 'sent',
      pickupAsap: true,
      requestedPickupUtc: '2026-09-16T10:20:00.000Z',
      requestedPickupAt: '14:20',
      acceptDeadlineUtc: '2026-09-16T10:05:00.000Z',
      note: 'no sugar',
      canCancel: true,
      totalDram: 2 * 1200 + 1100,
      branchName: 'Northern Avenue',
      wasReplay: false,
    });
    expect(sent.code).toMatch(/^T-\d{3}$/u);
    expect(sent.lines[0]).toMatchObject({ name: 'Cappuccino', unitPriceDram: 1200 });
  });

  it('answers a replay with the first order, and refuses the id to somebody else', () => {
    const { takeaway } = book();
    const command = order();
    const first = takeaway.place({ ...GUEST, command });
    const again = takeaway.place({ ...GUEST, command });
    expect(again).toMatchObject({ id: first.id, wasReplay: true });
    expect(caught(() => takeaway.place({ ...GUEST, actor: 'diner-2', command }))).toBeInstanceOf(
      BookingCommandInUseError,
    );
  });

  it('takes a slot on offer and refuses one that is not, with the slots there are', () => {
    const { takeaway } = book();
    expect(takeaway.place({ ...GUEST, command: order({ pickup: { at: '19:15' } }) })).toMatchObject(
      { pickupAsap: false, requestedPickupAt: '19:15' },
    );
    const error = caught(() =>
      takeaway.place({ ...GUEST, command: order({ pickup: { at: '03:00' } }) }),
    );
    expect(error).toBeInstanceOf(TakeawaySlotUnavailableError);
    expect((error as TakeawaySlotUnavailableError).slots).toContain('14:30');
  });

  it('names every dish that cannot go, and saves nothing', () => {
    const { takeaway } = book();
    const error = caught(() =>
      takeaway.place({
        ...GUEST,
        command: order({
          lines: [
            { menuItemId: 'matnakash-eggs', quantity: 1 },
            { menuItemId: 'pizza', quantity: 1 },
            { menuItemId: 'cappuccino', quantity: 1 },
          ],
        }),
      }),
    );
    expect(error).toBeInstanceOf(TakeawayItemsUnavailableError);
    expect((error as TakeawayItemsUnavailableError).items).toEqual([
      { menuItemId: 'matnakash-eggs', reason: 'notForTakeaway' },
      { menuItemId: 'pizza', reason: 'notOnMenu' },
    ]);
    expect(takeaway.records()).toHaveLength(0);
  });

  it('refuses the shape before anything else', () => {
    const { takeaway } = book({});
    expect(
      caught(() =>
        takeaway.place({
          ...GUEST,
          command: order({ lines: [{ menuItemId: 'x', quantity: 21 }] }),
        }),
      ),
    ).toBeInstanceOf(ValidationError);
  });

  it('refuses ASAP once the kitchen is full, and hides only the slots that would overflow', () => {
    const { takeaway } = book({ ...MOCK_TAKEAWAY_BRANCHES[NORTH], maxInProgress: 1 });
    takeaway.place({ ...GUEST, command: order({ pickup: { at: '19:15' } }) });
    expect(takeaway.availability(NORTH).busy).toBe(true);
    expect(caught(() => takeaway.place({ ...GUEST, command: order() }))).toBeInstanceOf(
      TakeawayBusyError,
    );
    const slots = takeaway.availability(NORTH).slots;
    // Twenty minutes' prep: 19:00 to 19:30 would be cooked beside 19:15.
    expect(slots).not.toContain('19:00');
    expect(slots).not.toContain('19:30');
    expect(slots).toContain('18:45');
    expect(slots).toContain('19:45');
  });

  it('is accepted at once at a branch on auto-accept', () => {
    const { takeaway } = book({ ...MOCK_TAKEAWAY_BRANCHES[NORTH], autoAccept: true });
    const sent = takeaway.place({ ...GUEST, command: order() });
    expect(sent).toMatchObject({
      status: 'accepted',
      readyAtUtc: sent.requestedPickupUtc,
      acceptDeadlineUtc: null,
      canCancel: false,
    });
  });
});

describe('the five-minute answer', () => {
  it('declines an order nobody accepted, as nobody answering', () => {
    const { takeaway, advance } = book();
    const sent = takeaway.place({ ...GUEST, command: order() });
    advance(4);
    expect(takeaway.guestOrder(sent.id, GUEST.actor)?.status).toBe('sent');
    advance(1);
    expect(takeaway.guestOrder(sent.id, GUEST.actor)).toMatchObject({
      status: 'declined',
      declinedBecause: 'noAnswer',
      canCancel: false,
    });
  });
});

describe('the guest cancels', () => {
  it('only while sent; a second tap answers it cancelled', () => {
    const { takeaway } = book();
    const sent = takeaway.place({ ...GUEST, command: order() });
    expect(takeaway.cancel(URL, sent.id, GUEST.actor).status).toBe('cancelled');
    expect(takeaway.cancel(URL, sent.id, GUEST.actor).wasReplay).toBe(true);

    const other = takeaway.place({ ...GUEST, command: order() });
    takeaway.accept(URL, other.id, other.requestedPickupUtc, 'Ani');
    const error = caught(() => takeaway.cancel(URL, other.id, GUEST.actor));
    expect(error).toBeInstanceOf(TakeawayStatusConflictError);
    expect(error).toMatchObject({ orderStatus: 'accepted' });
  });

  it("does not show somebody else's order", () => {
    const { takeaway } = book();
    const sent = takeaway.place({ ...GUEST, command: order() });
    expect(takeaway.guestOrder(sent.id, 'diner-2')).toBeNull();
  });
});

describe('the counter', () => {
  it('accepts, readies, hands over and records the payment', () => {
    const { takeaway, at, advance } = book();
    const sent = takeaway.place({ ...GUEST, command: order() });
    const accepted = takeaway.accept(URL, sent.id, at(25), 'Ani');
    expect(accepted).toMatchObject({
      status: 'accepted',
      readyAtUtc: at(25),
      acceptedByName: 'Ani',
      noShowFromUtc: at(55),
    });
    expect(takeaway.accept(URL, sent.id, at(25), 'Ani').wasReplay).toBe(true);
    advance(20);
    expect(takeaway.ready(URL, sent.id).status).toBe('ready');
    const collected = takeaway.collect(URL, sent.id, 'cash');
    expect(collected).toMatchObject({
      status: 'collected',
      paymentMethod: 'cash',
      paidAmountDram: sent.totalDram,
    });
  });

  it('refuses a ready time in the past, and a move the order is not in the state for', () => {
    const { takeaway, at } = book();
    const sent = takeaway.place({ ...GUEST, command: order() });
    expect(caught(() => takeaway.accept(URL, sent.id, at(-10), 'Ani'))).toBeInstanceOf(
      ValidationError,
    );
    expect(caught(() => takeaway.ready(URL, sent.id))).toBeInstanceOf(TakeawayStatusConflictError);
    expect(caught(() => takeaway.collect(URL, sent.id, 'card'))).toBeInstanceOf(
      TakeawayStatusConflictError,
    );
  });

  it('declines with the reason the guest sees', () => {
    const { takeaway } = book();
    const sent = takeaway.place({ ...GUEST, command: order() });
    expect(takeaway.decline(URL, sent.id, ' Out of milk ')).toMatchObject({
      status: 'declined',
      declinedBecause: 'venue',
      declineReason: 'Out of milk',
    });
  });

  it('allows no-show only thirty minutes after ready', () => {
    const { takeaway, at, advance } = book();
    const sent = takeaway.place({ ...GUEST, command: order() });
    takeaway.accept(URL, sent.id, at(20), 'Ani');
    advance(20);
    takeaway.ready(URL, sent.id);
    advance(29);
    const early = caught(() => takeaway.noShow(URL, sent.id));
    expect(early).toBeInstanceOf(TakeawayNoShowTooEarlyError);
    advance(1);
    expect(takeaway.noShow(URL, sent.id).status).toBe('noShow');
  });

  it('lists the active oldest first and today’s finished, with the badge counts', () => {
    const { takeaway, advance } = book();
    const first = takeaway.place({ ...GUEST, command: order() });
    advance(1);
    const second = takeaway.place({ ...GUEST, command: order() });
    advance(1);
    const third = takeaway.place({ ...GUEST, command: order() });
    takeaway.decline(URL, third.id, null);
    takeaway.accept(URL, second.id, second.requestedPickupUtc, 'Ani');
    takeaway.ready(URL, second.id);

    const counter = takeaway.branchOrders(NORTH);
    expect(counter.active.map((entry) => entry.id)).toEqual([first.id, second.id]);
    expect(counter.finishedToday.map((entry) => entry.id)).toEqual([third.id]);
    expect(counter).toMatchObject({ sentCount: 1, readyCount: 1 });
  });

  it("puts accepted orders on the kitchen's screen with the TAKEAWAY band", () => {
    const { takeaway, at } = book();
    const sent = takeaway.place({ ...GUEST, command: order({ note: 'Separate bag' }) });
    expect(takeaway.kitchenTickets(NORTH)).toEqual([]);
    takeaway.accept(URL, sent.id, at(25), 'Ani');
    const [ticket] = takeaway.kitchenTickets(NORTH);
    expect(ticket).toMatchObject({
      orderId: sent.id,
      tabId: null,
      tableLabel: sent.code,
      status: 'inKitchen',
      takeaway: {
        code: sent.code,
        readyAtUtc: at(25),
        readyAtLocalTime: '14:25',
        guestName: 'Lilit',
        note: 'Separate bag',
      },
    });
  });
});

describe('the Orders tab', () => {
  it('lists takeaway orders, the ones still moving first', () => {
    const { takeaway, advance } = book();
    const old = takeaway.place({ ...GUEST, command: order() });
    takeaway.decline(URL, old.id, null);
    advance(1);
    const live = takeaway.place({ ...GUEST, command: order() });
    const orders = takeaway.dinerOrders(GUEST.actor);
    expect(orders.map((entry) => entry.orderId)).toEqual([live.id, old.id]);
    expect(orders[0]).toMatchObject({
      kind: 'takeaway',
      tabId: null,
      status: 'inProgress',
      canCancel: true,
      takeaway: { code: live.code, status: 'sent', itemCount: 3 },
    });
    expect(orders[1]).toMatchObject({ status: 'cancelled', takeaway: { status: 'declined' } });
    expect(takeaway.dinerOrders('diner-2')).toEqual([]);
  });
});

describe("the diner's world", () => {
  async function signedIn(start = WEDNESDAY_2PM) {
    let clock = start;
    const gateway = createMockGateway({
      now: () => new Date(clock),
      takeaway: { branches: MOCK_TAKEAWAY_BRANCHES },
    });
    const challenge = await gateway.requestPhoneCode('+37491000199');
    await gateway.verifyPhoneCode({ challengeId: challenge.challengeId, code: challenge.devCode! });
    return {
      gateway,
      advance: (minutes: number) => {
        clock += minutes * 60_000;
      },
    };
  }

  it('shows the button on the place page and greys the hall-only dish', async () => {
    const { gateway } = await signedIn();
    expect((await gateway.getBranchDetail(NORTH))?.takeaway).toEqual({
      enabled: true,
      prepMinutes: 20,
    });
    expect((await gateway.getBranchDetail('b-lumen-cascade'))?.takeaway).toEqual({
      enabled: false,
      prepMinutes: 20,
    });
    const menu = await gateway.getBranchMenuDetail(NORTH);
    const eggs = menu?.categories
      .flatMap((category) => category.items)
      .find((dish) => dish.id === 'matnakash-eggs');
    expect(eggs?.availableForTakeaway).toBe(false);
  });

  it('places, lists, and hears back from the venue in the feed', async () => {
    const { gateway, advance } = await signedIn();
    const sent = await gateway.placeTakeawayOrder(order());
    expect((await gateway.listDinerOrders('active')).map((entry) => entry.orderId)).toEqual([
      sent.id,
    ]);
    expect(await gateway.listDinerOrders('history')).toEqual([]);
    expect((await gateway.getDinerOrder(sent.id))?.kind).toBe('takeaway');

    gateway.acceptTakeawayAsVenue(sent.id);
    expect((await gateway.getTakeawayOrder(sent.id))?.status).toBe('accepted');
    advance(20);
    gateway.markTakeawayReadyAsVenue(sent.id);

    const feed = await gateway.listNotifications({});
    const kinds = feed.items.filter((row) => row.orderId === sent.id).map((row) => row.kind);
    expect(kinds).toEqual(expect.arrayContaining(['takeaway-accepted', 'takeaway-ready']));
    const accepted = feed.items.find((row) => row.kind === 'takeaway-accepted');
    expect(accepted?.params).toMatchObject({ code: sent.code, readyTime: '14:20' });

    gateway.collectTakeawayAsVenue(sent.id, 'card');
    expect((await gateway.getTakeawayOrder(sent.id))?.paymentMethod).toBe('card');
  });

  it("counts an order nobody collected in the guest's own record, apart from bookings", async () => {
    const { gateway, advance } = await signedIn();
    const sent = await gateway.placeTakeawayOrder(order());
    gateway.acceptTakeawayAsVenue(sent.id);
    advance(20);
    gateway.markTakeawayReadyAsVenue(sent.id);
    advance(31);
    gateway.markTakeawayNoShowAsVenue(sent.id);

    expect((await gateway.getTakeawayOrder(sent.id))?.status).toBe('noShow');
    expect((await gateway.listBookings()).guestRecord).toMatchObject({
      booked: 0,
      noShows: 0,
      isNewGuest: true,
      takeawayNoShows: 1,
    });
  });

  it('refuses a guest blocked for no-shows with the booking refusal', async () => {
    const until = new Date(WEDNESDAY_2PM + 3 * 24 * 3_600_000).toISOString();
    const gateway = createMockGateway({
      now: () => new Date(WEDNESDAY_2PM),
      takeaway: { branches: MOCK_TAKEAWAY_BRANCHES },
      blockedUntilUtc: until,
    });
    const challenge = await gateway.requestPhoneCode('+37491000199');
    await gateway.verifyPhoneCode({ challengeId: challenge.challengeId, code: challenge.devCode! });

    const refused = await gateway.placeTakeawayOrder(order()).catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(BookingBlockedNoShowsError);
    expect(refused).toMatchObject({ blockedUntilUtc: until });
    expect(await gateway.listDinerOrders()).toEqual([]);
  });

  it('tells the guest of a decline, with the reason', async () => {
    const { gateway } = await signedIn();
    const sent = await gateway.placeTakeawayOrder(order());
    gateway.declineTakeawayAsVenue(sent.id, 'Out of milk');
    const feed = await gateway.listNotifications({});
    expect(feed.items.find((row) => row.kind === 'takeaway-declined')?.params).toMatchObject({
      code: sent.code,
      noAnswer: 'false',
      reason: 'Out of milk',
    });
  });

  it('reads the availability only for a signed-in diner, as the route is', async () => {
    const gateway = createMockGateway({
      now: () => new Date(WEDNESDAY_2PM),
      takeaway: { branches: MOCK_TAKEAWAY_BRANCHES },
    });
    await expect(gateway.getTakeawayAvailability(NORTH)).rejects.toMatchObject({ status: 401 });
  });

  it("seeds the seeded account's order being prepared, and one collected yesterday", async () => {
    const gateway = createMockGateway({
      now: () => new Date(WEDNESDAY_2PM),
      takeaway: { branches: MOCK_TAKEAWAY_BRANCHES, seedOrders: true },
    });
    await gateway.loginDiner({ identifier: SEEDED_ACCOUNT.username, password: 'password123' });
    const orders = await gateway.listDinerOrders();
    expect(orders.map((entry) => entry.takeaway?.status)).toEqual(['accepted', 'collected']);
    expect(orders[0]).toMatchObject({ kind: 'takeaway', status: 'preparing' });
  });
});

describe("the floor tablet's world", () => {
  it('seeds a counter worth walking', async () => {
    const gateway = createStaffMockGateway({
      now: () => new Date(WEDNESDAY_2PM),
      seedTakeaway: true,
    });
    const counter = await gateway.listTakeawayOrders('branch-cafe-01');
    expect(counter.active.map((entry) => entry.status)).toEqual([
      'ready',
      'ready',
      'accepted',
      'sent',
    ]);
    expect(counter.finishedToday.map((entry) => entry.status)).toEqual(['collected']);
    expect(counter).toMatchObject({ sentCount: 1, readyCount: 2 });
    const longReady = counter.active.find((entry) => entry.code === 'T-639');
    expect(Date.parse(longReady!.noShowFromUtc!)).toBeLessThanOrEqual(WEDNESDAY_2PM);

    const queue = await gateway.listOrderQueue('branch-cafe-01');
    expect(queue.filter((ticket) => ticket.takeaway).map((ticket) => ticket.tableLabel)).toEqual(
      expect.arrayContaining(['T-317', 'T-205', 'T-639']),
    );
  });

  it('accepts, readies, hands over and marks a no-show at the counter', async () => {
    const gateway = createStaffMockGateway({
      now: () => new Date(WEDNESDAY_2PM),
      seedTakeaway: true,
    });
    const counter = await gateway.listTakeawayOrders('branch-cafe-01');
    const sent = counter.active.find((entry) => entry.status === 'sent')!;
    const accepted = await gateway.acceptTakeawayOrder({
      orderId: sent.id,
      readyAtUtc: sent.requestedPickupUtc,
    });
    expect(accepted.status).toBe('accepted');
    expect((await gateway.markTakeawayOrderReady(sent.id)).status).toBe('ready');
    expect((await gateway.collectTakeawayOrder({ orderId: sent.id, method: 'cash' })).status).toBe(
      'collected',
    );
    const late = counter.active.find((entry) => entry.code === 'T-639')!;
    expect((await gateway.markTakeawayOrderNoShow(late.id)).status).toBe('noShow');
    const fresh = counter.active.find((entry) => entry.code === 'T-205')!;
    await expect(gateway.markTakeawayOrderNoShow(fresh.id)).rejects.toBeInstanceOf(
      TakeawayNoShowTooEarlyError,
    );
  });

  it('starts empty unless asked', async () => {
    const gateway = createStaffMockGateway({ now: () => new Date(WEDNESDAY_2PM) });
    expect((await gateway.listTakeawayOrders('b')).active).toEqual([]);
  });
});

describe("the console's world", () => {
  it('reads the default, saves within bounds and refuses each field out of them', async () => {
    const gateway = createConsoleMockGateway({ role: 'owner' });
    const branchId = NORTH;
    expect(await gateway.getTakeawaySettings(branchId)).toMatchObject({
      enabled: false,
      autoAccept: false,
      prepMinutes: 20,
      lastOrderMinutes: 30,
      maxInProgress: 5,
      acceptWindowMinutes: 5,
      noShowAfterMinutes: 30,
    });
    const saved = await gateway.saveTakeawaySettings({
      branchId,
      settings: {
        enabled: true,
        autoAccept: true,
        prepMinutes: 25,
        lastOrderMinutes: 45,
        maxInProgress: 8,
      },
    });
    expect(saved).toMatchObject({ enabled: true, autoAccept: true, prepMinutes: 25 });

    const error = await gateway
      .saveTakeawaySettings({
        branchId,
        settings: {
          enabled: true,
          autoAccept: false,
          prepMinutes: 7,
          lastOrderMinutes: 20,
          maxInProgress: 31,
        },
      })
      .catch((caughtError: unknown) => caughtError);
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).violations.map((violation) => violation.field)).toEqual([
      'prepMinutes',
      'lastOrderMinutes',
      'maxInProgress',
    ]);
  });

  it('switches a dish to "only in the hall" and back', async () => {
    const gateway = createConsoleMockGateway({ role: 'owner', seedTakeaway: true });
    const menu = await gateway.getAdminMenu(NORTH);
    const eggs = menu
      .flatMap((category) => category.items)
      .find((item) => item.id === 'matnakash-eggs');
    expect(eggs?.availableForTakeaway).toBe(false);
    const back = await gateway.updateMenuItem({
      branchId: NORTH,
      itemId: 'matnakash-eggs',
      patch: { availableForTakeaway: true },
    });
    expect(back.availableForTakeaway).toBe(true);
    expect((await gateway.getTakeawaySettings(NORTH)).enabled).toBe(true);
  });
});
