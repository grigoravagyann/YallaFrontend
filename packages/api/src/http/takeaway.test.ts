import { describe, expect, it, vi } from 'vitest';
import { createAuthSession } from '../auth/session';
import { createMemoryTokenStorage } from '../auth/storage';
import {
  BookingBlockedNoShowsError,
  BookingCommandInUseError,
  PhoneNotVerifiedError,
  TakeawayBusyError,
  TakeawayClosedError,
  TakeawayItemsUnavailableError,
  TakeawayNoShowTooEarlyError,
  TakeawayNotAcceptedError,
  TakeawaySlotUnavailableError,
  TakeawayStatusConflictError,
} from '../contracts/errors';
import { NO_TAKEAWAY, readsTakeawayCounter } from '../contracts/takeaway';
import { NotFoundError, ValidationError } from '../errors';
import { createConsoleHttpGateway, createMemoryIdentityStore } from './consoleHttpGateway';
import { fakeBackend, problemReply, type FakeRoute } from './fakeBackend.testkit';
import { createHttpGateway } from './httpGateway';
import { dinerOrderFromWire, type WireDinerOrder } from './placesMapping';
import { createStaffHttpGateway } from './staffHttpGateway';
import { orderQueueEntry, branchMenu } from './staffMapping';
import {
  branchTakeawayOrdersFromWire,
  kitchenTakeawayFromWire,
  placeTakeawayOrderBody,
  publicTakeawayInfoFromWire,
  staffTakeawayOrderFromWire,
  takeawayAvailabilityFromWire,
  takeawayOrderFromWire,
  takeawayRefusal,
  takeawaySettingsFromWire,
  type WireStaffTakeawayOrder,
  type WireTakeawayAvailability,
  type WireTakeawayOrder,
  type WireTakeawaySettings,
} from './takeawayMapping';
import { adminItem } from './venueSettingsMapping';
import { ApiError } from '../errors';

/**
 * Takeaway over HTTP (`docs/takeaway.md`, 2026-10-22): the guest's four
 * routes, the counter's six, the console's settings, the takeaway order on
 * the Orders tab and the kitchen's band, the place page's info, the per-dish
 * flag, and a typed error for every new refusal.
 */

const BRANCH = '0b5f3c1e-0000-4000-8000-000000000001';
const ORDER = '5d1d0a2e-0000-4000-8000-0000000000c1';
const COMMAND = '3f2b9c10-6d1e-4c1a-9d43-2f6c7f0b1234';
const DISH = '9c000000-0000-4000-8000-000000000001';
const CAKE = '9c000000-0000-4000-8000-000000000002';

const WIRE_LINE = {
  id: 'l-1',
  menuItemId: DISH,
  name: 'Cappuccino',
  unitPriceAmd: 1200,
  quantity: 2,
  lineTotalAmd: 2400,
};

const WIRE_ORDER: WireTakeawayOrder = {
  id: ORDER,
  code: 'T-482',
  status: 1,
  branchId: BRANCH,
  venueName: 'Lumen Coffee',
  branchName: 'Northern Avenue',
  branchAddress: 'Northern Avenue 5',
  branchPhoneE164: '+37410500501',
  latitude: 40.18,
  longitude: 44.51,
  lines: [WIRE_LINE],
  totalAmd: 2400,
  note: '  no sugar  ',
  pickupAsap: true,
  requestedPickupUtc: '2026-10-22T15:10:00Z',
  requestedPickupAt: '19:10:00',
  sentAtUtc: '2026-10-22T14:50:00Z',
  acceptDeadlineUtc: '2026-10-22T14:55:00Z',
  canCancel: true,
  wasReplay: false,
};

const ORDER_READ = {
  id: ORDER,
  code: 'T-482',
  status: 'sent',
  branchId: BRANCH,
  venueName: 'Lumen Coffee',
  branchName: 'Northern Avenue',
  branchAddress: 'Northern Avenue 5',
  branchPhoneE164: '+37410500501',
  latitude: 40.18,
  longitude: 44.51,
  lines: [
    {
      id: 'l-1',
      menuItemId: DISH,
      name: 'Cappuccino',
      unitPriceDram: 1200,
      quantity: 2,
      lineTotalDram: 2400,
    },
  ],
  totalDram: 2400,
  note: 'no sugar',
  pickupAsap: true,
  requestedPickupUtc: '2026-10-22T15:10:00Z',
  requestedPickupAt: '19:10',
  readyAtUtc: null,
  readyAt: null,
  sentAtUtc: '2026-10-22T14:50:00Z',
  acceptDeadlineUtc: '2026-10-22T14:55:00Z',
  acceptedAtUtc: null,
  readyMarkedAtUtc: null,
  collectedAtUtc: null,
  declinedAtUtc: null,
  cancelledAtUtc: null,
  noShowAtUtc: null,
  declinedBecause: null,
  declineReason: null,
  paymentMethod: null,
  paidAmountDram: null,
  canCancel: true,
  wasReplay: false,
};

const WIRE_STAFF: WireStaffTakeawayOrder = {
  id: ORDER,
  code: 'T-482',
  status: 3,
  guestName: 'Lilit',
  guestPhone: '+37494555666',
  lines: [WIRE_LINE],
  totalAmd: 2400,
  pickupAsap: false,
  requestedPickupUtc: '2026-10-22T15:15:00Z',
  requestedPickupAt: '19:15',
  readyAtUtc: '2026-10-22T15:20:00Z',
  readyAt: '19:20',
  sentAtUtc: '2026-10-22T14:50:00Z',
  acceptedAtUtc: '2026-10-22T14:52:00Z',
  acceptedByName: 'Ani',
  readyMarkedAtUtc: '2026-10-22T15:18:00Z',
  noShowFromUtc: '2026-10-22T15:50:00Z',
  wasReplay: false,
};

const WIRE_AVAILABILITY: WireTakeawayAvailability = {
  branchId: BRANCH,
  enabled: true,
  open: true,
  prepMinutes: 20,
  asapReadyAtUtc: '2026-10-22T15:10:00Z',
  asapReadyAt: '19:10',
  slots: ['19:15', '19:30:00', '19:45'],
  lastPickupAt: '22:30',
  busy: false,
};

const WIRE_SETTINGS: WireTakeawaySettings = {
  enabled: true,
  autoAccept: false,
  prepMinutes: 25,
  lastOrderMinutes: 45,
  maxInProgress: 6,
  acceptWindowMinutes: 5,
  noShowAfterMinutes: 30,
  bounds: {
    prepMinutesMin: 5,
    prepMinutesMax: 90,
    prepMinutesStep: 5,
    lastOrderMinutesMin: 0,
    lastOrderMinutesMax: 120,
    lastOrderMinutesStep: 15,
    maxInProgressMin: 1,
    maxInProgressMax: 30,
  },
};

function dinerOver(routes: Readonly<Record<string, FakeRoute>>) {
  const backend = fakeBackend(routes);
  return {
    backend,
    gateway: createHttpGateway(backend.client({ getToken: () => 'diner-token' }), {
      audience: 'diner',
    }),
  };
}

function staffOver(routes: Readonly<Record<string, FakeRoute>>) {
  const backend = fakeBackend(routes);
  return { backend, gateway: createStaffHttpGateway(backend.client()) };
}

function consoleOver(routes: Readonly<Record<string, FakeRoute>>) {
  const backend = fakeBackend(routes);
  return {
    backend,
    gateway: createConsoleHttpGateway(backend.client({ getToken: () => 'held-token' }), {
      auth: createAuthSession({
        storage: createMemoryTokenStorage('refresh-0'),
        refreshTokens: vi.fn(),
      }),
      identity: createMemoryIdentityStore(),
    }),
  };
}

async function caught(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => null,
    (error: unknown) => error,
  );
}

describe('the takeaway order on the wire', () => {
  it('reads every field of the guest view, in the client vocabulary', () => {
    expect(takeawayOrderFromWire(WIRE_ORDER)).toEqual(ORDER_READ);
  });

  it('reads each status, and one this build does not know as unknown', () => {
    const statuses = [1, 2, 3, 4, 5, 6, 7, 9].map(
      (status) => takeawayOrderFromWire({ ...WIRE_ORDER, status: status as 1 }).status,
    );
    expect(statuses).toEqual([
      'sent',
      'accepted',
      'ready',
      'collected',
      'declined',
      'cancelled',
      'noShow',
      'unknown',
    ]);
  });

  it('reads the payment, the decline cause and a blank phone', () => {
    const collected = takeawayOrderFromWire({
      ...WIRE_ORDER,
      status: 4,
      paymentMethod: 2,
      paidAmountAmd: 2400,
      branchPhoneE164: '',
      canCancel: false,
    });
    expect(collected).toMatchObject({
      paymentMethod: 'card',
      paidAmountDram: 2400,
      branchPhoneE164: null,
      canCancel: false,
    });
    const declined = takeawayOrderFromWire({
      ...WIRE_ORDER,
      status: 5,
      declinedBecause: 2,
      declinedAtUtc: '2026-10-22T14:55:00Z',
    });
    expect(declined).toMatchObject({ declinedBecause: 'noAnswer', declineReason: null });
    expect(
      takeawayOrderFromWire({ ...WIRE_ORDER, declinedBecause: 1, declineReason: ' Out of milk ' }),
    ).toMatchObject({ declinedBecause: 'venue', declineReason: 'Out of milk' });
  });

  it("reads the counter's card: the guest, the phone and when no-show opens", () => {
    expect(staffTakeawayOrderFromWire(WIRE_STAFF)).toMatchObject({
      status: 'ready',
      guestName: 'Lilit',
      guestPhone: '+37494555666',
      acceptedByName: 'Ani',
      readyAt: '19:20',
      noShowFromUtc: '2026-10-22T15:50:00Z',
      acceptDeadlineUtc: null,
    });
    // A platform admin's view: the number is the venue's to call.
    expect(staffTakeawayOrderFromWire({ ...WIRE_STAFF, guestPhone: '' }).guestPhone).toBeNull();
  });

  it('reads the counter, an absent column as empty', () => {
    expect(
      branchTakeawayOrdersFromWire({
        active: [WIRE_STAFF],
        sentCount: 2,
        readyCount: 1,
        asOfUtc: '2026-10-22T15:00:00Z',
      }),
    ).toMatchObject({ finishedToday: [], sentCount: 2, readyCount: 1, active: [{ id: ORDER }] });
  });

  it('reads the availability, every wall clock cut to minutes', () => {
    expect(takeawayAvailabilityFromWire(WIRE_AVAILABILITY)).toEqual({
      branchId: BRANCH,
      enabled: true,
      open: true,
      prepMinutes: 20,
      asapReadyAtUtc: '2026-10-22T15:10:00Z',
      asapReadyAt: '19:10',
      slots: ['19:15', '19:30', '19:45'],
      lastPickupAt: '22:30',
      busy: false,
      opensAt: null,
      opensAtUtc: null,
    });
    expect(
      takeawayAvailabilityFromWire({
        ...WIRE_AVAILABILITY,
        open: false,
        slots: [],
        asapReadyAt: null,
        asapReadyAtUtc: null,
        lastPickupAt: null,
        opensAt: '10:00:00',
        opensAtUtc: '2026-10-23T06:00:00Z',
      }),
    ).toMatchObject({ open: false, opensAt: '10:00', opensAtUtc: '2026-10-23T06:00:00Z' });
  });

  it('reads the settings with their bounds', () => {
    expect(takeawaySettingsFromWire(WIRE_SETTINGS)).toEqual(WIRE_SETTINGS);
  });

  it('reads the kitchen band and the place page info, absent as none', () => {
    expect(
      kitchenTakeawayFromWire({
        code: 'T-482',
        readyAtUtc: '2026-10-22T15:20:00Z',
        readyAtLocalTime: '19:20:00',
        guestName: 'Lilit',
        note: '',
      }),
    ).toEqual({
      code: 'T-482',
      readyAtUtc: '2026-10-22T15:20:00Z',
      readyAtLocalTime: '19:20',
      guestName: 'Lilit',
      note: null,
    });
    expect(kitchenTakeawayFromWire(null)).toBeNull();
    expect(publicTakeawayInfoFromWire({ enabled: true, prepMinutes: 25 })).toEqual({
      enabled: true,
      prepMinutes: 25,
    });
    expect(publicTakeawayInfoFromWire(undefined)).toEqual(NO_TAKEAWAY);
  });

  it('writes exactly one of asap and at, the note trimmed and blank as none', () => {
    const lines = [{ menuItemId: DISH, quantity: 2 }];
    expect(
      placeTakeawayOrderBody({
        branchId: BRANCH,
        pickup: { asap: true },
        note: '   ',
        lines,
        clientCommandId: COMMAND,
      }),
    ).toEqual({
      branchId: BRANCH,
      pickup: { asap: true },
      note: null,
      lines,
      clientCommandId: COMMAND,
    });
    expect(
      placeTakeawayOrderBody({
        branchId: BRANCH,
        pickup: { at: '19:30' },
        note: ' separate bag ',
        lines,
        clientCommandId: COMMAND,
      }),
    ).toMatchObject({ pickup: { at: '19:30' }, note: 'separate bag' });
  });
});

describe('takeaway beside the rest of the API', () => {
  it('reads a takeaway order on the Orders tab: no tab, no table, its own facts', () => {
    const wire = {
      orderId: ORDER,
      tabId: null,
      branchId: BRANCH,
      venueName: 'Lumen Coffee',
      branchName: 'Northern Avenue',
      kind: 'takeaway',
      status: 'inProgress',
      kitchenStatus: 1,
      tableLabel: '',
      partySize: 0,
      placedAtUtc: '2026-10-22T14:50:00Z',
      totalAmd: 2400,
      items: [],
      timeline: [{ status: 'inProgress', atUtc: '2026-10-22T14:50:00Z' }],
      canCancel: true,
      takeaway: {
        code: 'T-482',
        status: 1,
        pickupAsap: true,
        requestedPickupUtc: '2026-10-22T15:10:00Z',
        itemCount: 2,
      },
    } as WireDinerOrder;

    expect(dinerOrderFromWire(wire, 'https://api')).toMatchObject({
      kind: 'takeaway',
      tabId: null,
      tableLabel: null,
      partySize: null,
      status: 'inProgress',
      canCancel: true,
      takeaway: {
        code: 'T-482',
        status: 'sent',
        pickupAsap: true,
        requestedPickupUtc: '2026-10-22T15:10:00Z',
        readyAtUtc: null,
        itemCount: 2,
      },
    });
    // A dine-in order carries none, and its cancel stays the server's false.
    expect(
      dinerOrderFromWire(
        { ...wire, kind: 'dineIn', tabId: 'tab-1', canCancel: false, takeaway: null },
        'https://api',
      ),
    ).toMatchObject({ kind: 'dineIn', tabId: 'tab-1', canCancel: false, takeaway: null });
  });

  it('reads the TAKEAWAY band on a kitchen ticket', () => {
    const entry = orderQueueEntry({
      orderId: ORDER,
      tableLabel: 'T-482',
      status: 2,
      placedAtUtc: '2026-10-22T14:52:00Z',
      estimatedReadyAtUtc: '2026-10-22T15:20:00Z',
      waitingMinutes: 3,
      lines: [],
      takeaway: {
        code: 'T-482',
        readyAtUtc: '2026-10-22T15:20:00Z',
        readyAtLocalTime: '19:20:00',
        guestName: 'Lilit',
        note: 'Separate bag',
      },
    });
    expect(entry).toMatchObject({
      tabId: null,
      tableLabel: 'T-482',
      takeaway: { code: 'T-482', readyAtLocalTime: '19:20', note: 'Separate bag' },
    });
  });

  it('reads the per-dish flag on both menus, absent as yes', () => {
    const item = {
      id: DISH,
      categoryId: 'c-1',
      name: 'Matnakash eggs',
      description: 'Eggs',
      priceAmd: 2800,
      ingredients: 'Eggs',
      allergens: 'Eggs',
      portionSize: '1',
      spiceLevel: 1 as const,
      prepMinutes: 10,
      isAvailable: true,
      isComplete: true,
      availableForPreOrder: true,
      displayOrder: 0,
    } as Parameters<typeof adminItem>[0];
    expect(adminItem({ ...item, availableForTakeaway: false }).availableForTakeaway).toBe(false);
    expect(adminItem(item).availableForTakeaway).toBe(true);
    const menu = branchMenu(
      {
        branchId: BRANCH,
        categories: [
          {
            id: 'c-1',
            name: 'Breakfast',
            displayOrder: 0,
            items: [
              {
                ...item,
                availableForTakeaway: false,
                photo: {
                  photoId: 'p',
                  thumbnailUrl: '/t',
                  cardUrl: '/c',
                  fullUrl: '/f',
                },
              },
            ],
          },
        ],
      } as Parameters<typeof branchMenu>[0],
      '2026-10-22T15:00:00Z',
    );
    expect(menu.categories[0]?.items[0]?.availableForTakeaway).toBe(false);
  });
});

describe("the guest's takeaway routes", () => {
  it('reads the availability of a branch', async () => {
    const { gateway, backend } = dinerOver({
      [`GET /api/diner/branches/${BRANCH}/takeaway`]: { body: WIRE_AVAILABILITY },
    });
    const read = await gateway.getTakeawayAvailability(BRANCH);
    expect(read.slots).toEqual(['19:15', '19:30', '19:45']);
    expect(backend.requests[0]?.headers.get('authorization')).toBe('Bearer diner-token');
  });

  it('sends an order and reads the answer', async () => {
    const { gateway, backend } = dinerOver({
      'POST /api/diner/takeaway-orders': { body: WIRE_ORDER },
    });
    const order = await gateway.placeTakeawayOrder({
      branchId: BRANCH,
      pickup: { at: '19:30' },
      note: 'no sugar',
      lines: [
        { menuItemId: DISH, quantity: 2 },
        { menuItemId: CAKE, quantity: 1 },
      ],
      clientCommandId: COMMAND,
    });
    expect(order).toEqual(ORDER_READ);
    expect(backend.requests[0]?.body).toEqual({
      branchId: BRANCH,
      pickup: { at: '19:30' },
      note: 'no sugar',
      lines: [
        { menuItemId: DISH, quantity: 2 },
        { menuItemId: CAKE, quantity: 1 },
      ],
      clientCommandId: COMMAND,
    });
  });

  it('reads one order, and an unknown one as null', async () => {
    const { gateway } = dinerOver({
      [`GET /api/diner/takeaway-orders/${ORDER}`]: { body: { ...WIRE_ORDER, status: 2 } },
    });
    expect((await gateway.getTakeawayOrder(ORDER))?.status).toBe('accepted');
    expect(await gateway.getTakeawayOrder('nope')).toBeNull();
  });

  it('cancels with no body; a venue that answered first is a status conflict', async () => {
    const ok = dinerOver({
      [`POST /api/diner/takeaway-orders/${ORDER}/cancel`]: {
        body: { ...WIRE_ORDER, status: 6, canCancel: false },
      },
    });
    expect((await ok.gateway.cancelTakeawayOrder(ORDER)).status).toBe('cancelled');
    expect(ok.backend.requests[0]?.body).toBeUndefined();

    const late = dinerOver({
      [`POST /api/diner/takeaway-orders/${ORDER}/cancel`]: problemReply(
        409,
        'takeaway-status-conflict',
        { orderId: ORDER, status: 2 },
      ),
    });
    const error = await caught(late.gateway.cancelTakeawayOrder(ORDER));
    expect(error).toBeInstanceOf(TakeawayStatusConflictError);
    expect(error).toMatchObject({ orderId: ORDER, orderStatus: 'accepted' });
  });

  it.each([
    [
      problemReply(409, 'takeaway-not-accepted', { branchId: BRANCH }),
      TakeawayNotAcceptedError,
      { branchId: BRANCH },
    ],
    [
      problemReply(409, 'takeaway-closed', {
        branchId: BRANCH,
        opensAtUtc: '2026-10-23T06:00:00Z',
        opensAt: '10:00',
      }),
      TakeawayClosedError,
      { opensAtUtc: '2026-10-23T06:00:00Z', opensAt: '10:00' },
    ],
    [
      problemReply(409, 'takeaway-busy', { branchId: BRANCH, maxInProgress: 5 }),
      TakeawayBusyError,
      { maxInProgress: 5 },
    ],
    [
      problemReply(409, 'takeaway-slot-unavailable', {
        branchId: BRANCH,
        at: '19:15',
        slots: ['19:45', '20:00:00'],
      }),
      TakeawaySlotUnavailableError,
      { at: '19:15', slots: ['19:45', '20:00'] },
    ],
    [
      problemReply(422, 'takeaway-items-unavailable', {
        items: [
          { menuItemId: DISH, reason: 3 },
          { menuItemId: CAKE, reason: 2 },
          { menuItemId: 'x', reason: 1 },
          { menuItemId: 'y', reason: 9 },
        ],
      }),
      TakeawayItemsUnavailableError,
      {
        items: [
          { menuItemId: DISH, reason: 'notForTakeaway' },
          { menuItemId: CAKE, reason: 'soldOut' },
          { menuItemId: 'x', reason: 'notOnMenu' },
          { menuItemId: 'y', reason: 'unknown' },
        ],
      },
    ],
    [problemReply(403, 'phone-not-verified'), PhoneNotVerifiedError, {}],
    // Blocked for no-shows: the booking's own refusal (2026-10-23).
    [
      problemReply(403, 'booking-blocked-no-shows', { blockedUntilUtc: '2026-10-30T10:00:00Z' }),
      BookingBlockedNoShowsError,
      { blockedUntilUtc: '2026-10-30T10:00:00Z' },
    ],
    [problemReply(409, 'client-command-id-in-use'), BookingCommandInUseError, {}],
  ])('reads a refused order as its typed error (%#)', async (reply, type, fields) => {
    const { gateway } = dinerOver({ 'POST /api/diner/takeaway-orders': reply });
    const error = await caught(
      gateway.placeTakeawayOrder({
        branchId: BRANCH,
        pickup: { asap: true },
        lines: [{ menuItemId: DISH, quantity: 1 }],
        clientCommandId: COMMAND,
      }),
    );
    expect(error).toBeInstanceOf(type);
    expect(error).toMatchObject(fields);
  });

  it('keeps a 422 on the shape a ValidationError', async () => {
    const { gateway } = dinerOver({
      'POST /api/diner/takeaway-orders': problemReply(422, 'validation-failed', {
        fields: [{ field: 'lines[0].quantity', message: 'Between 1 and 20.' }],
      }),
    });
    const error = await caught(
      gateway.placeTakeawayOrder({
        branchId: BRANCH,
        pickup: { asap: true },
        lines: [{ menuItemId: DISH, quantity: 99 }],
        clientCommandId: COMMAND,
      }),
    );
    expect(error).toBeInstanceOf(ValidationError);
  });
});

describe("the counter's takeaway routes", () => {
  it('lists the counter', async () => {
    const { gateway } = staffOver({
      [`GET /api/branches/${BRANCH}/takeaway-orders`]: {
        body: {
          branchId: BRANCH,
          active: [WIRE_STAFF, { ...WIRE_STAFF, id: 'o-2', status: 1 }],
          finishedToday: [{ ...WIRE_STAFF, id: 'o-3', status: 4, paymentMethod: 1 }],
          sentCount: 1,
          readyCount: 1,
          asOfUtc: '2026-10-22T15:00:00Z',
        },
      },
    });
    const counter = await gateway.listTakeawayOrders(BRANCH);
    expect(counter.active.map((order) => order.status)).toEqual(['ready', 'sent']);
    expect(counter.finishedToday[0]).toMatchObject({ status: 'collected', paymentMethod: 'cash' });
    expect(counter).toMatchObject({ sentCount: 1, readyCount: 1 });
  });

  it('sends each move to its route, with its body', async () => {
    const answer = (status: number) => ({ body: { ...WIRE_STAFF, status } });
    const { gateway, backend } = staffOver({
      [`POST /api/takeaway-orders/${ORDER}/accept`]: answer(2),
      [`POST /api/takeaway-orders/${ORDER}/decline`]: answer(5),
      [`POST /api/takeaway-orders/${ORDER}/ready`]: answer(3),
      [`POST /api/takeaway-orders/${ORDER}/collect`]: answer(4),
      [`POST /api/takeaway-orders/${ORDER}/no-show`]: answer(7),
    });

    expect(
      (await gateway.acceptTakeawayOrder({ orderId: ORDER, readyAtUtc: '2026-10-22T15:20:00Z' }))
        .status,
    ).toBe('accepted');
    expect((await gateway.declineTakeawayOrder({ orderId: ORDER, reason: '  ' })).status).toBe(
      'declined',
    );
    expect((await gateway.markTakeawayOrderReady(ORDER)).status).toBe('ready');
    expect((await gateway.collectTakeawayOrder({ orderId: ORDER, method: 'card' })).status).toBe(
      'collected',
    );
    expect((await gateway.markTakeawayOrderNoShow(ORDER)).status).toBe('noShow');

    expect(backend.requests.map((request) => [request.path, request.body])).toEqual([
      [`/api/takeaway-orders/${ORDER}/accept`, { readyAt: '2026-10-22T15:20:00Z' }],
      [`/api/takeaway-orders/${ORDER}/decline`, { reason: null }],
      [`/api/takeaway-orders/${ORDER}/ready`, undefined],
      [`/api/takeaway-orders/${ORDER}/collect`, { method: 2 }],
      [`/api/takeaway-orders/${ORDER}/no-show`, undefined],
    ]);
  });

  it('reads the counter refusals', async () => {
    const { gateway } = staffOver({
      [`POST /api/takeaway-orders/${ORDER}/no-show`]: problemReply(
        409,
        'takeaway-no-show-too-early',
        { orderId: ORDER, noShowFromUtc: '2026-10-22T15:50:00Z' },
      ),
      [`POST /api/takeaway-orders/${ORDER}/accept`]: problemReply(409, 'takeaway-status-conflict', {
        orderId: ORDER,
        status: 6,
      }),
    });
    const early = await caught(gateway.markTakeawayOrderNoShow(ORDER));
    expect(early).toBeInstanceOf(TakeawayNoShowTooEarlyError);
    expect(early).toMatchObject({ noShowFromUtc: '2026-10-22T15:50:00Z' });

    const gone = await caught(
      gateway.acceptTakeawayOrder({ orderId: ORDER, readyAtUtc: '2026-10-22T15:20:00Z' }),
    );
    expect(gone).toBeInstanceOf(TakeawayStatusConflictError);
    expect(gone).toMatchObject({ orderStatus: 'cancelled' });

    const missing = await caught(gateway.markTakeawayOrderReady('nope'));
    expect(missing).toBeInstanceOf(NotFoundError);
  });

  it("reads a takeaway move on the floor's change stream: signal 8, about no table", async () => {
    const { gateway, backend } = staffOver({
      [`GET /api/branches/${BRANCH}/tables/changes`]: {
        body: {
          branchId: BRANCH,
          afterSequence: 40,
          maxSequence: 41,
          hasMore: false,
          changes: [
            {
              sequence: 41,
              tableStateChangeId: '7a000000-0000-4000-8000-000000000041',
              diningTableId: null,
              tableLabel: null,
              fromStatus: 1,
              toStatus: 1,
              reason: 'takeaway placed',
              actorType: 3,
              actorId: null,
              atUtc: '2026-10-26T15:00:00Z',
              tableSessionId: null,
              reservationId: null,
              tabId: null,
              signal: 8,
            },
          ],
        },
      },
    });

    const page = await gateway.getFloorChanges({ branchId: BRANCH, afterSequence: 40 });

    expect(backend.requests[0]?.query.get('afterSequence')).toBe('40');
    expect(page.lastSequence).toBe(41);
    expect(page.changes).toEqual([
      {
        sequence: 41,
        tableId: null,
        tableLabel: null,
        fromStatus: 'free',
        toStatus: 'free',
        atUtc: '2026-10-26T15:00:00Z',
        tableSessionId: null,
        reservationId: null,
        actor: 'system',
        actorId: null,
        reason: 'takeaway placed',
        tabId: null,
        signal: 'takeawayChanged',
      },
    ]);
    expect(readsTakeawayCounter(page.changes[0]?.signal)).toBe(true);
    expect(readsTakeawayCounter('preOrderChanged')).toBe(false);
  });
});

describe("the console's takeaway settings", () => {
  it('reads and saves all five', async () => {
    const { gateway, backend } = consoleOver({
      [`GET /api/branches/${BRANCH}/takeaway-settings`]: { body: WIRE_SETTINGS },
      [`PUT /api/branches/${BRANCH}/takeaway-settings`]: { body: WIRE_SETTINGS },
    });
    expect(await gateway.getTakeawaySettings(BRANCH)).toEqual(WIRE_SETTINGS);
    await gateway.saveTakeawaySettings({
      branchId: BRANCH,
      settings: {
        enabled: true,
        autoAccept: false,
        prepMinutes: 25,
        lastOrderMinutes: 45,
        maxInProgress: 6,
      },
    });
    expect(backend.requests[1]?.body).toEqual({
      enabled: true,
      autoAccept: false,
      prepMinutes: 25,
      lastOrderMinutes: 45,
      maxInProgress: 6,
    });
  });

  it('sends the per-dish switch on the item patch', async () => {
    const { gateway, backend } = consoleOver({
      [`PATCH /api/branches/${BRANCH}/menu/items/${DISH}`]: {
        body: {
          id: DISH,
          categoryId: 'c-1',
          name: 'Eggs',
          priceAmd: 2800,
          spiceLevel: 1,
          isAvailable: true,
          availableForPreOrder: true,
          availableForTakeaway: false,
          displayOrder: 0,
          isComplete: true,
          missingFields: [],
        },
      },
    });
    const item = await gateway.updateMenuItem({
      branchId: BRANCH,
      itemId: DISH,
      patch: { availableForTakeaway: false },
    });
    expect(backend.requests[0]?.body).toEqual({ availableForTakeaway: false });
    expect(item.availableForTakeaway).toBe(false);
  });
});

describe('a refusal that is not a takeaway one', () => {
  it('is left to the client', () => {
    expect(takeawayRefusal(new Error('x'))).toBeNull();
    expect(
      takeawayRefusal(
        new ApiError('x', {
          status: 409,
          url: 'u',
          problem: {
            type: 'about:blank',
            title: 't',
            status: 409,
            detail: 'd',
            // problem-codes: not-a-problem-code — any other code falls through
            code: 'something-else',
            traceId: 'trace',
          },
        }),
      ),
    ).toBeNull();
  });
});
