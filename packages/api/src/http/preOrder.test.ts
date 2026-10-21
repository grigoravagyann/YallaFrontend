import { describe, expect, it, vi } from 'vitest';
import { createAuthSession } from '../auth/session';
import { createMemoryTokenStorage } from '../auth/storage';
import {
  BookingCommandInUseError,
  BookingNotChangeableError,
  OnMyWayNotOpenError,
  PreOrderAlreadySentError,
  PreOrderItemsUnavailableError,
  PreOrderLockedError,
  PreOrderNotSendableError,
  PreOrdersNotAcceptedError,
  TabNotAcceptingOrdersError,
  TableBusyError,
} from '../contracts/errors';
import { ConcurrencyConflictError, NotFoundError, ValidationError } from '../errors';
import type { components } from '../generated/schema';
import { floorChangeSignal } from './admissionMapping';
import { awaitingApprovalFromWire, type WireAwaitingApproval } from './awaitingApprovalMapping';
import { createConsoleHttpGateway, createMemoryIdentityStore } from './consoleHttpGateway';
import { consoleBookingFromWire } from './consoleMapping';
import { booking } from './dinerMapping';
import { fakeBackend, problemReply, type FakeRoute } from './fakeBackend.testkit';
import { createHttpGateway } from './httpGateway';
import {
  preOrderFromWire,
  type WireDuePreOrder,
  type WirePreOrder,
  type WirePreOrderSettings,
} from './preOrderMapping';
import { createPublicHttpGateway } from './publicHttpGateway';
import {
  managedBookingFromWire,
  publicBranchFromWire,
  type WirePublicBooking,
} from './publicMapping';
import { createStaffHttpGateway } from './staffHttpGateway';
import { branchMenu, orderQueueEntry } from './staffMapping';
import { adminItem } from './venueSettingsMapping';

/**
 * Pre-orders over HTTP (PO wire, 2026-10-21): the pre-order on every booking
 * read, the guest's three routes through both doors, the floor's rail and its
 * two actions, the kitchen's held ticket, the console's settings, and a typed
 * error for every new refusal.
 */

type Schemas = components['schemas'];

const BRANCH = '0b5f3c1e-0000-4000-8000-000000000001';
const RESERVATION = '6f1d0a2e-0000-4000-8000-00000000000a';
const PRE_ORDER_ID = '7a1d0a2e-0000-4000-8000-0000000000b1';
const COMMAND = '3f2b9c10-6d1e-4c1a-9d43-2f6c7f0b1234';
const DISH = '9c000000-0000-4000-8000-000000000001';
const SALAD = '9c000000-0000-4000-8000-000000000002';

const WIRE_PRE_ORDER: WirePreOrder = {
  id: PRE_ORDER_ID,
  reservationId: RESERVATION,
  state: 1,
  lines: [
    {
      id: 'line-1',
      menuItemId: DISH,
      name: 'Khachapuri',
      unitPriceAmd: 3200,
      quantity: 2,
      lineTotalAmd: 6400,
      note: 'no egg',
      availableNow: true,
    },
    {
      id: 'line-2',
      menuItemId: SALAD,
      name: 'Salad',
      unitPriceAmd: 1800,
      quantity: 1,
      lineTotalAmd: 1800,
      availableNow: false,
    },
  ],
  note: "We'd like the salad first",
  totalAmd: 8200,
  editableUntilUtc: '2026-10-22T13:30:00Z',
  dueAtUtc: '2026-10-22T15:00:00Z',
  updatedAtUtc: '2026-10-21T09:00:00Z',
  onTab: false,
};

const PRE_ORDER_READ = {
  id: PRE_ORDER_ID,
  reservationId: RESERVATION,
  state: 'editable',
  lines: [
    {
      id: 'line-1',
      menuItemId: DISH,
      name: 'Khachapuri',
      unitPriceDram: 3200,
      quantity: 2,
      lineTotalDram: 6400,
      note: 'no egg',
      availableNow: true,
    },
    {
      id: 'line-2',
      menuItemId: SALAD,
      name: 'Salad',
      unitPriceDram: 1800,
      quantity: 1,
      lineTotalDram: 1800,
      note: null,
      availableNow: false,
    },
  ],
  note: "We'd like the salad first",
  totalDram: 8200,
  editableUntilUtc: '2026-10-22T13:30:00Z',
  dueAtUtc: '2026-10-22T15:00:00Z',
  sentAtUtc: null,
  kitchenStatus: null,
  onTab: false,
  notComingAtUtc: null,
  updatedAtUtc: '2026-10-21T09:00:00Z',
};

const VIEW = {
  id: RESERVATION,
  code: 'K7Q2LM',
  status: 2,
  branchId: BRANCH,
  branchName: 'Northern Avenue',
  tableId: 'tbl-4',
  tableLabel: '4',
  partySize: 4,
  startUtc: '2026-10-22T15:30:00Z',
  endUtc: '2026-10-22T17:00:00Z',
  localDate: '2026-10-22',
  localStartTime: '19:30:00',
  localEndTime: '21:00:00',
  timeZoneId: 'Asia/Yerevan',
  cancellationDeadlineUtc: '2026-10-22T13:30:00Z',
  cancelledAfterDeadline: false,
  clientCommandId: COMMAND,
  guestName: 'Anna',
  guestPhone: '+37499111222',
  wasReplay: false,
} as Schemas['Yalla.Application.Reservations.ReservationView'];

const WITH_PRE_ORDER = {
  ...VIEW,
  preOrder: WIRE_PRE_ORDER,
  preOrderEditableUntilUtc: '2026-10-22T13:30:00Z',
  guestConfirmedOnWayAtUtc: '2026-10-22T14:50:00Z',
};

const DUE: WireDuePreOrder = {
  reservationId: RESERVATION,
  code: 'K7Q2LM',
  tableId: 'tbl-4',
  tableLabel: '4',
  roomName: 'Hall',
  startUtc: '2026-10-22T15:30:00Z',
  localStartTime: '19:30:00',
  partySize: 4,
  status: 2,
  guestName: 'Anna',
  guestPhone: '+37499111222',
  guestConfirmedOnWayAtUtc: '2026-10-22T14:50:00Z',
  dueAtUtc: '2026-10-22T15:00:00Z',
  preOrder: { ...WIRE_PRE_ORDER, state: 2 },
  wasReplay: false,
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

describe('the pre-order on the wire', () => {
  it('reads every field, in the client vocabulary', () => {
    expect(preOrderFromWire(WIRE_PRE_ORDER)).toEqual(PRE_ORDER_READ);
  });

  it('reads each state, and a state this build does not know as unknown', () => {
    const states = [1, 2, 3, 4, 5, 9].map(
      (state) =>
        preOrderFromWire({ ...WIRE_PRE_ORDER, state: state as WirePreOrder['state'] }).state,
    );
    expect(states).toEqual(['editable', 'locked', 'sent', 'notComing', 'cancelled', 'unknown']);
  });

  it('reads a sent one with its kitchen progress and the not-coming mark', () => {
    const sent = preOrderFromWire({
      ...WIRE_PRE_ORDER,
      state: 3,
      sentAtUtc: '2026-10-22T15:01:00Z',
      kitchenStatus: 3,
      onTab: true,
      notComingAtUtc: '2026-10-22T15:00:30Z',
    });
    expect(sent).toMatchObject({
      state: 'sent',
      sentAtUtc: '2026-10-22T15:01:00Z',
      kitchenStatus: 'ready',
      onTab: true,
      notComingAtUtc: '2026-10-22T15:00:30Z',
    });
  });

  it('rides on the diner booking, with the editor window and the on-my-way answer', () => {
    const read = booking(WITH_PRE_ORDER, 'Lumen');
    expect(read.preOrder).toEqual(PRE_ORDER_READ);
    expect(read.preOrderEditableUntilUtc).toBe('2026-10-22T13:30:00Z');
    expect(read.guestConfirmedOnWayAtUtc).toBe('2026-10-22T14:50:00Z');
  });

  it('reads a booking with none as none, nothing offered', () => {
    const read = booking(VIEW, null);
    expect(read.preOrder).toBeNull();
    expect(read.preOrderEditableUntilUtc).toBeNull();
    expect(read.guestConfirmedOnWayAtUtc).toBeNull();
  });

  it('rides on the console list and the floor awaiting list', () => {
    const console = consoleBookingFromWire(WITH_PRE_ORDER);
    expect(console.preOrder).toEqual(PRE_ORDER_READ);
    expect(console.guestConfirmedOnWayAtUtc).toBe('2026-10-22T14:50:00Z');

    const awaiting = awaitingApprovalFromWire({
      reservation: WITH_PRE_ORDER,
    } as unknown as WireAwaitingApproval);
    expect(awaiting.preOrder).toEqual(PRE_ORDER_READ);
    expect(awaiting.guestConfirmedOnWayAtUtc).toBe('2026-10-22T14:50:00Z');
  });

  it('rides on the manage link, with whether to ask "on your way" — and no branch id', () => {
    const wire = {
      reservationId: RESERVATION,
      code: 'K7Q2LM',
      status: 2,
      venueSlug: 'lumen',
      branchSlug: 'north',
      timeZoneId: 'Asia/Yerevan',
      localDate: '2026-10-22',
      localStartTime: '19:30:00',
      preOrder: WIRE_PRE_ORDER,
      preOrderEditableUntilUtc: '2026-10-22T13:30:00Z',
      onYourWayAsked: true,
    } as unknown as WirePublicBooking;
    const managed = managedBookingFromWire(wire);
    // The link publishes no branch id: the picker's menu is found by slugs.
    expect(managed).not.toHaveProperty('branchId');
    expect(managed).toMatchObject({ venueSlug: 'lumen', branchSlug: 'north' });
    expect(managed.preOrder).toEqual(PRE_ORDER_READ);
    expect(managed.preOrderEditableUntilUtc).toBe('2026-10-22T13:30:00Z');
    expect(managed.guestConfirmedOnWayAtUtc).toBeNull();
    expect(managed.onYourWayAsked).toBe(true);

    const older = managedBookingFromWire({
      ...wire,
      preOrder: undefined,
      onYourWayAsked: undefined,
    } as unknown as WirePublicBooking);
    expect(older.preOrder).toBeNull();
    expect(older.onYourWayAsked).toBe(false);
  });
});

describe('menus and the branch page', () => {
  const MENU = {
    branchId: BRANCH,
    categories: [
      {
        id: 'c1',
        name: 'Bakery',
        displayOrder: 0,
        items: [
          {
            id: DISH,
            categoryId: 'c1',
            name: 'Khachapuri',
            description: 'Cheese bread',
            priceAmd: 3200,
            photo: { photoId: 'p', thumbnailUrl: '/t', cardUrl: '/c', fullUrl: '/f' },
            ingredients: 'flour',
            allergens: 'gluten',
            portionSize: '1',
            spiceLevel: 0,
            prepMinutes: 10,
            isAvailable: true,
            isComplete: true,
            displayOrder: 0,
            availableForPreOrder: false,
          },
          {
            id: SALAD,
            categoryId: 'c1',
            name: 'Salad',
            description: 'Greens',
            priceAmd: 1800,
            photo: { photoId: 'q', thumbnailUrl: '/t', cardUrl: '/c', fullUrl: '/f' },
            ingredients: 'greens',
            allergens: 'None',
            portionSize: '1',
            spiceLevel: 0,
            prepMinutes: 5,
            isAvailable: true,
            isComplete: true,
            displayOrder: 1,
          },
        ],
      },
    ],
  } as unknown as Schemas['Yalla.Application.Menus.BranchMenuView'];

  it('says per dish whether it can be pre-ordered; absent is yes', () => {
    const items = branchMenu(MENU, 'now').categories[0]?.items ?? [];
    expect(items.map((item) => item.availableForPreOrder)).toEqual([false, true]);
  });

  it('carries the flag on the console menu too', () => {
    const item = MENU.categories[0]?.items[0] as unknown as Parameters<typeof adminItem>[0];
    expect(adminItem(item).availableForPreOrder).toBe(false);
    expect(
      adminItem({ ...item, availableForPreOrder: undefined } as unknown as typeof item)
        .availableForPreOrder,
    ).toBe(true);
  });

  it('publishes whether the branch takes pre-orders', () => {
    const page = (accepts: boolean | undefined) =>
      publicBranchFromWire(
        {
          branchId: BRANCH,
          venueSlug: 'lumen',
          branchSlug: 'north',
          venueName: 'Lumen',
          branchName: 'North',
          timeZoneId: 'Asia/Yerevan',
          policy: {
            turnTimeMinutes: 105,
            minLeadMinutes: 30,
            cancellationDeadlineMinutes: 120,
            ...(accepts === undefined ? {} : { acceptsPreOrders: accepts }),
          },
        } as unknown as Parameters<typeof publicBranchFromWire>[0],
        'https://api.test',
      );
    expect(page(true).policy.acceptsPreOrders).toBe(true);
    expect(page(undefined).policy.acceptsPreOrders).toBe(false);
  });
});

describe('the kitchen and the change stream', () => {
  const TICKET = {
    orderId: PRE_ORDER_ID,
    tableLabel: '4',
    status: 2,
    placedAtUtc: '2026-10-22T15:01:00Z',
    waitingMinutes: 3,
    lines: [],
    placedByName: 'Davit',
    preOrder: {
      reservationId: RESERVATION,
      startUtc: '2026-10-22T15:30:00Z',
      localStartTime: '19:30:00',
      partySize: 4,
      guestName: 'Anna',
    },
  } as unknown as Schemas['Yalla.Application.Ordering.KitchenOrderView'];

  it('reads a held ticket: no tab yet, the pre-order marker on it', () => {
    const entry = orderQueueEntry(TICKET);
    expect(entry.tabId).toBeNull();
    expect(entry.preOrder).toEqual({
      reservationId: RESERVATION,
      startUtc: '2026-10-22T15:30:00Z',
      localStartTime: '19:30',
      partySize: 4,
      guestName: 'Anna',
    });
  });

  it('reads an ordinary ticket with its tab and no marker', () => {
    const entry = orderQueueEntry({
      ...TICKET,
      tabId: 'tab-1',
      preOrder: undefined,
    } as unknown as typeof TICKET);
    expect(entry.tabId).toBe('tab-1');
    expect(entry.preOrder).toBeNull();
  });

  it('reads signal 6 as a pre-order change', () => {
    expect(floorChangeSignal(6)).toBe('preOrderChanged');
  });
});

describe("the guest's routes, from the app", () => {
  it('saves the whole pre-order with a PUT, notes trimmed, and reads the answer', async () => {
    const { backend, gateway } = dinerOver({
      [`PUT /api/reservations/${RESERVATION}/pre-order`]: {
        body: { reservationId: RESERVATION, preOrder: WIRE_PRE_ORDER, wasReplay: false },
      },
    });

    const result = await gateway.replacePreOrder({
      reservationId: RESERVATION,
      clientCommandId: COMMAND,
      lines: [
        { menuItemId: DISH, quantity: 2, note: ' no egg ' },
        { menuItemId: SALAD, quantity: 1, note: '  ' },
      ],
      note: "  We'd like the salad first ",
    });

    expect(backend.requests[0]?.body).toEqual({
      lines: [
        { menuItemId: DISH, quantity: 2, note: 'no egg' },
        { menuItemId: SALAD, quantity: 1, note: null },
      ],
      note: "We'd like the salad first",
      clientCommandId: COMMAND,
    });
    expect(result).toEqual({
      reservationId: RESERVATION,
      preOrder: PRE_ORDER_READ,
      wasReplay: false,
    });
  });

  it('clears with a POST and reads no pre-order back', async () => {
    const { backend, gateway } = dinerOver({
      [`POST /api/reservations/${RESERVATION}/pre-order/clear`]: {
        body: { reservationId: RESERVATION, wasReplay: true },
      },
    });

    const result = await gateway.clearPreOrder({
      reservationId: RESERVATION,
      clientCommandId: COMMAND,
    });

    expect(backend.requests[0]?.body).toEqual({ clientCommandId: COMMAND });
    expect(result).toEqual({ reservationId: RESERVATION, preOrder: null, wasReplay: true });
  });

  it('answers "on my way" with a bodiless POST', async () => {
    const { backend, gateway } = dinerOver({
      [`POST /api/reservations/${RESERVATION}/on-my-way`]: {
        body: {
          reservationId: RESERVATION,
          guestConfirmedOnWayAtUtc: '2026-10-22T14:50:00Z',
          wasReplay: false,
        },
      },
    });

    const result = await gateway.confirmOnMyWay(RESERVATION);

    expect(backend.requests[0]?.body).toBeUndefined();
    expect(result).toEqual({
      reservationId: RESERVATION,
      guestConfirmedOnWayAtUtc: '2026-10-22T14:50:00Z',
      wasReplay: false,
    });
  });

  const refusals: readonly [string, FakeRoute, (error: unknown) => void][] = [
    [
      'pre-order-locked',
      problemReply(409, 'pre-order-locked', {
        reservationId: RESERVATION,
        lockedAtUtc: '2026-10-22T13:30:00Z',
      }),
      (error) => {
        expect(error).toBeInstanceOf(PreOrderLockedError);
        expect(error).toMatchObject({
          reservationId: RESERVATION,
          lockedAtUtc: '2026-10-22T13:30:00Z',
        });
      },
    ],
    [
      'pre-order-already-sent',
      problemReply(409, 'pre-order-already-sent', {
        reservationId: RESERVATION,
        sentAtUtc: '2026-10-22T15:01:00Z',
      }),
      (error) => {
        expect(error).toBeInstanceOf(PreOrderAlreadySentError);
        expect(error).toMatchObject({ sentAtUtc: '2026-10-22T15:01:00Z' });
      },
    ],
    [
      'pre-orders-not-accepted',
      problemReply(409, 'pre-orders-not-accepted', { branchId: BRANCH }),
      (error) => {
        expect(error).toBeInstanceOf(PreOrdersNotAcceptedError);
        expect(error).toMatchObject({ branchId: BRANCH });
      },
    ],
    [
      'pre-order-items-unavailable',
      problemReply(422, 'pre-order-items-unavailable', {
        items: [
          { menuItemId: DISH, reason: 2 },
          { menuItemId: SALAD, reason: 3 },
          { menuItemId: 'gone', reason: 1 },
          { menuItemId: 'later', reason: 7 },
        ],
      }),
      (error) => {
        expect(error).toBeInstanceOf(PreOrderItemsUnavailableError);
        expect((error as PreOrderItemsUnavailableError).items).toEqual([
          { menuItemId: DISH, reason: 'soldOut' },
          { menuItemId: SALAD, reason: 'notForPreOrder' },
          { menuItemId: 'gone', reason: 'notOnMenu' },
          { menuItemId: 'later', reason: 'unknown' },
        ]);
      },
    ],
    [
      'reservation-not-changeable',
      problemReply(409, 'reservation-not-changeable', {
        reservationId: RESERVATION,
        status: 6,
        startUtc: '2026-10-22T15:30:00Z',
      }),
      (error) => {
        expect(error).toBeInstanceOf(BookingNotChangeableError);
        expect(error).toMatchObject({ reservationId: RESERVATION });
      },
    ],
    [
      'client-command-id-in-use',
      problemReply(409, 'client-command-id-in-use'),
      (error) => expect(error).toBeInstanceOf(BookingCommandInUseError),
    ],
    [
      'concurrent-update',
      problemReply(409, 'concurrent-update'),
      (error) => expect(error).toBeInstanceOf(ConcurrencyConflictError),
    ],
    [
      'validation-failed',
      problemReply(422, 'validation-failed', {
        fields: [{ field: 'lines[2].quantity', message: 'Between 1 and 20.', bound: 'range' }],
      }),
      (error) => {
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as ValidationError).field).toBe('lines[2].quantity');
      },
    ],
    [
      'not your booking',
      problemReply(404, 'not-found'),
      (error) => expect(error).toBeInstanceOf(NotFoundError),
    ],
  ];

  for (const [name, reply, check] of refusals) {
    it(`reads ${name} on a save as its own error`, async () => {
      const { gateway } = dinerOver({ [`PUT /api/reservations/${RESERVATION}/pre-order`]: reply });
      const error = await gateway
        .replacePreOrder({
          reservationId: RESERVATION,
          clientCommandId: COMMAND,
          lines: [{ menuItemId: DISH, quantity: 1 }],
        })
        .catch((caught: unknown) => caught);
      check(error);
    });
  }

  it('reads on-my-way-not-open with the booking status and when it opens', async () => {
    const { gateway } = dinerOver({
      [`POST /api/reservations/${RESERVATION}/on-my-way`]: problemReply(409, 'on-my-way-not-open', {
        reservationId: RESERVATION,
        status: 6,
        opensAtUtc: '2026-10-22T13:00:00Z',
      }),
    });
    const error = await gateway.confirmOnMyWay(RESERVATION).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(OnMyWayNotOpenError);
    expect(error).toMatchObject({
      reservationId: RESERVATION,
      bookingStatus: 'cancelledByDiner',
      opensAtUtc: '2026-10-22T13:00:00Z',
    });
  });
});

describe("the guest's routes, from the manage link", () => {
  it('saves, clears and answers through the token, with no session', async () => {
    const backend = fakeBackend({
      'PUT /api/public/bookings/tok%2F1/pre-order': {
        body: { reservationId: RESERVATION, preOrder: WIRE_PRE_ORDER, wasReplay: false },
      },
      'POST /api/public/bookings/tok%2F1/pre-order/clear': {
        body: { reservationId: RESERVATION, wasReplay: false },
      },
      'POST /api/public/bookings/tok%2F1/on-my-way': {
        body: {
          reservationId: RESERVATION,
          guestConfirmedOnWayAtUtc: '2026-10-22T14:50:00Z',
          wasReplay: true,
        },
      },
    });
    const gateway = createPublicHttpGateway(backend.client({ getToken: () => 'never-sent' }));

    const saved = await gateway.replaceManagedPreOrder({
      token: 'tok/1',
      clientCommandId: COMMAND,
      lines: [{ menuItemId: DISH, quantity: 2 }],
    });
    const cleared = await gateway.clearManagedPreOrder({
      token: 'tok/1',
      clientCommandId: COMMAND,
    });
    const onWay = await gateway.confirmManagedOnMyWay({ token: 'tok/1' });

    expect(backend.requests.map((request) => request.headers.get('authorization'))).toEqual([
      null,
      null,
      null,
    ]);
    expect(backend.requests[0]?.body).toEqual({
      lines: [{ menuItemId: DISH, quantity: 2, note: null }],
      note: null,
      clientCommandId: COMMAND,
    });
    expect(saved.preOrder).toEqual(PRE_ORDER_READ);
    expect(cleared.preOrder).toBeNull();
    expect(onWay).toEqual({
      reservationId: RESERVATION,
      guestConfirmedOnWayAtUtc: '2026-10-22T14:50:00Z',
      wasReplay: true,
    });
  });

  it('reads the link refusals as the app reads them', async () => {
    const gateway = createPublicHttpGateway(
      fakeBackend({
        'PUT /api/public/bookings/tok/pre-order': problemReply(409, 'pre-order-locked', {
          lockedAtUtc: '2026-10-22T13:30:00Z',
        }),
        'POST /api/public/bookings/tok/on-my-way': problemReply(409, 'on-my-way-not-open', {
          status: 1,
        }),
      }).client(),
    );
    await expect(
      gateway.replaceManagedPreOrder({
        token: 'tok',
        clientCommandId: COMMAND,
        lines: [{ menuItemId: DISH, quantity: 1 }],
      }),
    ).rejects.toBeInstanceOf(PreOrderLockedError);
    await expect(gateway.confirmManagedOnMyWay({ token: 'tok' })).rejects.toMatchObject({
      name: 'OnMyWayNotOpenError',
      bookingStatus: 'pendingApproval',
    });
  });
});

describe("the floor's rail", () => {
  it('reads the due list and when to read it again', async () => {
    const backend = fakeBackend({
      [`GET /api/branches/${BRANCH}/pre-orders/due`]: {
        body: {
          items: [
            DUE,
            {
              ...DUE,
              reservationId: 'r2',
              guestPhone: '',
              guestConfirmedOnWayAtUtc: undefined,
              roomName: '  ',
              status: 4,
              preOrder: {
                ...WIRE_PRE_ORDER,
                state: 3,
                sentAtUtc: '2026-10-22T15:01:00Z',
                kitchenStatus: 2,
              },
              sentByName: 'Davit',
              tabId: 'tab-9',
              guestRecord: {
                booked: 3,
                came: 3,
                noShows: 0,
                lateCancellations: 0,
                isNewGuest: false,
              },
            },
          ],
          nextDueAtUtc: '2026-10-22T16:00:00Z',
        },
      },
    });
    const due = await createStaffHttpGateway(backend.client()).listDuePreOrders(BRANCH);

    expect(due.nextDueAtUtc).toBe('2026-10-22T16:00:00Z');
    expect(due.items[0]).toEqual({
      reservationId: RESERVATION,
      code: 'K7Q2LM',
      tableId: 'tbl-4',
      tableLabel: '4',
      roomName: 'Hall',
      startUtc: '2026-10-22T15:30:00Z',
      localStartTime: '19:30',
      partySize: 4,
      status: 'confirmed',
      guestName: 'Anna',
      guestPhone: '+37499111222',
      guestConfirmedOnWayAtUtc: '2026-10-22T14:50:00Z',
      guestRecord: null,
      dueAtUtc: '2026-10-22T15:00:00Z',
      preOrder: { ...PRE_ORDER_READ, state: 'locked' },
      sentByName: null,
      notComingByName: null,
      tabId: null,
      wasReplay: false,
    });
    expect(due.items[1]).toMatchObject({
      guestPhone: null,
      guestConfirmedOnWayAtUtc: null,
      roomName: null,
      status: 'seated',
      sentByName: 'Davit',
      tabId: 'tab-9',
      preOrder: { state: 'sent', kitchenStatus: 'inKitchen' },
      guestRecord: { booked: 3, came: 3 },
    });
  });

  it('reads an empty rail with nothing coming', async () => {
    const backend = fakeBackend({
      [`GET /api/branches/${BRANCH}/pre-orders/due`]: { body: { items: [] } },
    });
    expect(await createStaffHttpGateway(backend.client()).listDuePreOrders(BRANCH)).toEqual({
      items: [],
      nextDueAtUtc: null,
    });
  });

  it('sends and marks not coming with the command id, reading the card back', async () => {
    const backend = fakeBackend({
      [`POST /api/reservations/${RESERVATION}/pre-order/send`]: {
        body: { ...DUE, preOrder: { ...WIRE_PRE_ORDER, state: 3 }, wasReplay: true },
      },
      [`POST /api/reservations/${RESERVATION}/pre-order/not-coming`]: {
        body: { ...DUE, preOrder: { ...WIRE_PRE_ORDER, state: 4 }, notComingByName: 'Davit' },
      },
    });
    const gateway = createStaffHttpGateway(backend.client());

    const sent = await gateway.sendPreOrder({
      reservationId: RESERVATION,
      clientCommandId: COMMAND,
    });
    const marked = await gateway.markPreOrderNotComing({
      reservationId: RESERVATION,
      clientCommandId: COMMAND,
    });

    expect(backend.requests.map((request) => request.body)).toEqual([
      { clientCommandId: COMMAND },
      { clientCommandId: COMMAND },
    ]);
    expect(sent).toMatchObject({ wasReplay: true, preOrder: { state: 'sent' } });
    expect(marked).toMatchObject({ notComingByName: 'Davit', preOrder: { state: 'notComing' } });
  });

  const staffRefusals: readonly [string, FakeRoute, (error: unknown) => void][] = [
    [
      'pre-order-not-sendable',
      problemReply(409, 'pre-order-not-sendable', {
        reservationId: RESERVATION,
        status: 1,
        sendableFromUtc: '2026-10-22T13:30:00Z',
        endUtc: '2026-10-22T17:00:00Z',
      }),
      (error) => {
        expect(error).toBeInstanceOf(PreOrderNotSendableError);
        expect(error).toMatchObject({
          bookingStatus: 'pendingApproval',
          sendableFromUtc: '2026-10-22T13:30:00Z',
          endUtc: '2026-10-22T17:00:00Z',
        });
      },
    ],
    [
      'tab-not-accepting-orders',
      problemReply(409, 'tab-not-accepting-orders', { tabId: 'tab-9', status: 2 }),
      (error) => {
        expect(error).toBeInstanceOf(TabNotAcceptingOrdersError);
        expect(error).toMatchObject({ tabId: 'tab-9', tabStatus: 'closing' });
      },
    ],
    [
      'table-lock-timeout',
      problemReply(503, 'table-lock-timeout'),
      (error) => expect(error).toBeInstanceOf(TableBusyError),
    ],
    [
      'pre-order-already-sent',
      problemReply(409, 'pre-order-already-sent', { sentAtUtc: '2026-10-22T15:01:00Z' }),
      (error) => expect(error).toBeInstanceOf(PreOrderAlreadySentError),
    ],
    [
      'no pre-order',
      problemReply(404, 'not-found'),
      (error) => expect(error).toBeInstanceOf(NotFoundError),
    ],
  ];

  for (const [name, reply, check] of staffRefusals) {
    it(`reads ${name} on a send as its own error`, async () => {
      const gateway = createStaffHttpGateway(
        fakeBackend({ [`POST /api/reservations/${RESERVATION}/pre-order/send`]: reply }).client(),
      );
      const error = await gateway
        .sendPreOrder({ reservationId: RESERVATION, clientCommandId: COMMAND })
        .catch((caught: unknown) => caught);
      check(error);
    });
  }
});

describe("the console's settings", () => {
  const SETTINGS: WirePreOrderSettings = {
    acceptsPreOrders: true,
    minutesBefore: 45,
    excludedMenuItemIds: [DISH],
    bounds: { minutesBeforeMin: 5, minutesBeforeMax: 120 },
    editableUntilHoursBefore: 2,
    onYourWayMinutesBefore: 45,
  };

  it('reads and saves all three, every time', async () => {
    const { backend, gateway } = consoleOver({
      [`GET /api/branches/${BRANCH}/pre-order-settings`]: { body: SETTINGS },
      [`PUT /api/branches/${BRANCH}/pre-order-settings`]: (request) => ({
        body: { ...SETTINGS, ...(request.body as object) },
      }),
    });

    expect(await gateway.getPreOrderSettings(BRANCH)).toEqual(SETTINGS);
    const saved = await gateway.savePreOrderSettings({
      branchId: BRANCH,
      settings: { acceptsPreOrders: false, minutesBefore: 30, excludedMenuItemIds: [] },
    });

    expect(backend.requests[1]?.body).toEqual({
      acceptsPreOrders: false,
      minutesBefore: 30,
      excludedMenuItemIds: [],
    });
    expect(saved).toMatchObject({
      acceptsPreOrders: false,
      minutesBefore: 30,
      excludedMenuItemIds: [],
    });
  });

  it('fills the product numbers a server leaves out', async () => {
    const { gateway } = consoleOver({
      [`GET /api/branches/${BRANCH}/pre-order-settings`]: {
        body: { acceptsPreOrders: false, minutesBefore: 30, excludedMenuItemIds: [] },
      },
    });
    expect(await gateway.getPreOrderSettings(BRANCH)).toEqual({
      acceptsPreOrders: false,
      minutesBefore: 30,
      excludedMenuItemIds: [],
      bounds: { minutesBeforeMin: 5, minutesBeforeMax: 120 },
      editableUntilHoursBefore: 2,
      onYourWayMinutesBefore: 45,
    });
  });

  it('keeps a bound refusal as the field it names', async () => {
    const { gateway } = consoleOver({
      [`PUT /api/branches/${BRANCH}/pre-order-settings`]: problemReply(422, 'validation-failed', {
        fields: [{ field: 'minutesBefore', message: '5 to 120', bound: 'range', min: 5, max: 120 }],
      }),
    });
    const error = await gateway
      .savePreOrderSettings({
        branchId: BRANCH,
        settings: { acceptsPreOrders: true, minutesBefore: 200, excludedMenuItemIds: [] },
      })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).field).toBe('minutesBefore');
  });
});
