import type { Menu, OrderQueueEntry } from '@yalla/api';
import { minutesBetween } from '@yalla/format';
import { describe, expect, it } from 'vitest';
import {
  ageOrders,
  allergenIndex,
  dishAllergens,
  firstName,
  kitchenArrivals,
  kitchenCounts,
  projectOrders,
  sortTickets,
  ticketBand,
  ticketMinutes,
  ticketMinutesFromStart,
} from './kitchenBoard';
import type { QueuedCommand } from './commands/types';

/**
 * The kitchen board's arithmetic (floor-tablet `Kitchen` artboard): which band
 * a ticket is in, the three counts, the two orders, the sender's first name,
 * the dish's allergens, and a "ready" the tablet has queued but not sent.
 */

function ticket(overrides: Partial<OrderQueueEntry> = {}): OrderQueueEntry {
  return {
    orderId: 'o1',
    tabId: 'tab1',
    tableLabel: '4',
    status: 'inKitchen',
    placedAtUtc: '2026-10-19T14:28:00Z',
    estimatedReadyAtUtc: null,
    waitingMinutes: 3,
    lines: [],
    placedByName: 'Narek Hakobyan',
    ...overrides,
  };
}

describe('a pre-order ticket (2026-10-21)', () => {
  /** Sent 30 minutes before a 15:00 booking; the server counts `minutes` since then. */
  const preOrder = (minutes: number, status: OrderQueueEntry['status'] = 'inKitchen') =>
    ticket({
      tabId: null,
      status,
      placedAtUtc: '2026-10-21T14:30:00Z',
      waitingMinutes: minutes,
      preOrder: {
        reservationId: 'r1',
        startUtc: '2026-10-21T15:00:00Z',
        localStartTime: '19:00',
        partySize: 4,
        guestName: 'Anna',
      },
    });

  it("is timed to its booking, by the server's count: minutes to go before, late after", () => {
    expect(ticketMinutesFromStart(preOrder(10))).toBe(-20);
    expect(ticketMinutesFromStart(preOrder(30))).toBe(0);
    expect(ticketMinutesFromStart(preOrder(45))).toBe(15);
    expect(ticketMinutesFromStart(ticket())).toBeNull();
  });

  it('is fresh until the booking starts, then ages from the start', () => {
    expect(ticketBand(preOrder(25))).toBe('fresh');
    expect(ticketBand(preOrder(35))).toBe('fresh');
    expect(ticketBand(preOrder(36))).toBe('waiting');
    expect(ticketBand(preOrder(42))).toBe('late');
    expect(ticketBand(preOrder(50, 'ready'))).toBe('ready');
  });

  // Review S4: the party came late and the waiter sent from the card after
  // the start. The kitchen first saw it at the send, so it ages from then.
  it('sent after its booking started, ages from the send, never late on arrival', () => {
    const lateSend = (minutes: number) =>
      ticket({
        tabId: null,
        placedAtUtc: '2026-10-21T15:25:00Z',
        waitingMinutes: minutes,
        preOrder: {
          reservationId: 'r1',
          startUtc: '2026-10-21T15:00:00Z',
          localStartTime: '19:00',
          partySize: 4,
          guestName: 'Anna',
        },
      });
    expect(ticketMinutesFromStart(lateSend(0))).toBe(0);
    expect(ticketBand(lateSend(0))).toBe('fresh');
    expect(ticketBand(lateSend(7))).toBe('waiting');
    expect(ticketBand(lateSend(12))).toBe('late');
    expect(kitchenCounts([lateSend(0)])).toEqual({ fresh: 1, waiting: 0, late: 0 });
  });
});

describe('a pre-order ticket, live QA 2026-10-21', () => {
  const marker = {
    reservationId: 'r1',
    startUtc: '2026-10-21T18:00:00Z',
    localStartTime: '22:00',
    partySize: 2,
    guestName: 'Gohar',
  };

  // Bug 2: the party sat at 20:01 for a 22:00 booking, and at 20:13 the ticket
  // still said "in 107 min". On their tab it is their food: timed as any order.
  it('on a seated party’s tab never counts down, and seated early is fresh, not late', () => {
    const onTab = ticket({
      tabId: 'tab-6',
      placedAtUtc: '2026-10-21T16:00:30Z',
      waitingMinutes: 13,
      preOrder: marker,
    });
    expect(ticketMinutesFromStart(onTab, Date.parse('2026-10-21T16:13:40Z'))).toBe(0);
    expect(ticketMinutes(onTab)).toBe(0);
    expect(ticketBand(onTab)).toBe('fresh');
    // After the start it ages from the start like a held one.
    const later = { ...onTab, waitingMinutes: 135 };
    expect(ticketMinutes(later)).toBe(minutesBetween(marker.startUtc, '2026-10-21T18:15:30Z'));
  });

  // The rail said "in 118 min" while the kitchen said "in 119 min" at the
  // same moment: one rule now, the rail's whole minutes to the start.
  it('counts down to the start in the same whole minutes as the rail', () => {
    const held = ticket({
      tabId: null,
      placedAtUtc: '2026-10-21T16:00:30Z',
      waitingMinutes: 1,
      preOrder: marker,
    });
    for (const at of ['2026-10-21T16:01:40Z', '2026-10-21T16:01:59Z', '2026-10-21T16:02:20Z']) {
      const now = Date.parse(at);
      const waited = Math.trunc((now - Date.parse(held.placedAtUtc)) / 60_000);
      const order = { ...held, waitingMinutes: waited };
      expect(ticketMinutesFromStart(order, now)).toBe(minutesBetween(marker.startUtc, at));
    }
  });

  it("never trusts a tablet clock beyond the server's own minute", () => {
    const held = ticket({
      tabId: null,
      placedAtUtc: '2026-10-21T16:00:30Z',
      waitingMinutes: 1,
      preOrder: marker,
    });
    // The server's minute is 16:01:30–16:02:30, 117½ to 118½ minutes before
    // the start: a pass tablet three hours out still reads 117 or 118.
    const ahead = ticketMinutesFromStart(held, Date.parse('2026-10-21T19:00:00Z'))!;
    const behind = ticketMinutesFromStart(held, Date.parse('2026-10-21T13:00:00Z'))!;
    expect(ahead).toBe(-117);
    expect(behind).toBe(-118);
  });
});

describe('the band a ticket is in', () => {
  it('is fresh under 6 minutes, waiting from 6, late from 12', () => {
    expect(ticketBand(ticket({ waitingMinutes: 0 }))).toBe('fresh');
    expect(ticketBand(ticket({ waitingMinutes: 5 }))).toBe('fresh');
    expect(ticketBand(ticket({ waitingMinutes: 6 }))).toBe('waiting');
    expect(ticketBand(ticket({ waitingMinutes: 11 }))).toBe('waiting');
    expect(ticketBand(ticket({ waitingMinutes: 12 }))).toBe('late');
    expect(ticketBand(ticket({ waitingMinutes: 40 }))).toBe('late');
  });

  it('is ready once it has left the kitchen, however old', () => {
    expect(ticketBand(ticket({ status: 'ready', waitingMinutes: 30 }))).toBe('ready');
  });

  // Live QA 1: the kitchen cannot act on a ticket its waiter has not sent, so
  // it is never late, and never red, on the kitchen's board.
  it('is "not sent" for a ticket its waiter has not sent yet, however old', () => {
    expect(ticketBand(ticket({ status: 'new', waitingMinutes: 113 }))).toBe('unsent');
  });
});

describe('the counts over the board', () => {
  it('counts new, waiting and late among the tickets cooking, never the ready or the unsent ones', () => {
    const counts = kitchenCounts([
      ticket({ orderId: 'a', waitingMinutes: 1 }),
      ticket({ orderId: 'b', waitingMinutes: 2, status: 'new' }),
      ticket({ orderId: 'c', waitingMinutes: 8 }),
      ticket({ orderId: 'd', waitingMinutes: 14 }),
      ticket({ orderId: 'e', waitingMinutes: 20 }),
      ticket({ orderId: 'f', waitingMinutes: 20, status: 'ready' }),
      ticket({ orderId: 'g', waitingMinutes: 90, status: 'new' }),
    ]);
    expect(counts).toEqual({ fresh: 1, waiting: 1, late: 2 });
  });
});

describe('the order of the board', () => {
  const board = [
    ticket({ orderId: 'young', tableLabel: '12', waitingMinutes: 1 }),
    ticket({ orderId: 'ready', tableLabel: '2', waitingMinutes: 30, status: 'ready' }),
    ticket({ orderId: 'old', tableLabel: '9', waitingMinutes: 14 }),
    ticket({
      orderId: 'twin-later',
      tableLabel: '3',
      waitingMinutes: 5,
      placedAtUtc: '2026-10-19T14:30:00Z',
    }),
    ticket({
      orderId: 'twin-earlier',
      tableLabel: 'Bar 1',
      waitingMinutes: 5,
      placedAtUtc: '2026-10-19T14:29:00Z',
    }),
  ];

  // Review S3: by the same minutes as the band. A pre-order sent long before
  // its booking has waited longest but is not due yet; a late table is.
  it('by wait: a pre-order not due yet sorts after a late ticket, by the minutes its band reads', () => {
    const early = ticket({
      orderId: 'pre-order',
      tableLabel: '11',
      tabId: null,
      // Sent 115 minutes before a 15:00 booking; 95 minutes later it is due in 20.
      placedAtUtc: '2026-10-21T13:05:00Z',
      waitingMinutes: 95,
      preOrder: {
        reservationId: 'r1',
        startUtc: '2026-10-21T15:00:00Z',
        localStartTime: '19:00',
        partySize: 4,
        guestName: 'Anna',
      },
    });
    const late = ticket({ orderId: 'late', tableLabel: '5', waitingMinutes: 14 });
    const young = ticket({ orderId: 'young', tableLabel: '2', waitingMinutes: 4 });
    expect(sortTickets([early, young, late], 'age').map((order) => order.orderId)).toEqual([
      'late',
      'young',
      'pre-order',
    ]);
  });

  it('by wait: the oldest cooking on the left, then the unsent, ready ones last', () => {
    const withUnsent = [
      ...board,
      ticket({ orderId: 'unsent', tableLabel: '6', waitingMinutes: 90, status: 'new' }),
    ];
    expect(sortTickets(withUnsent, 'age').map((order) => order.orderId)).toEqual([
      'old',
      'twin-earlier',
      'twin-later',
      'young',
      'unsent',
      'ready',
    ]);
  });

  it('by table: in table number order, as a person counts them', () => {
    expect(sortTickets(board, 'table').map((order) => order.tableLabel)).toEqual([
      '2',
      '3',
      '9',
      '12',
      'Bar 1',
    ]);
  });
});

describe('who sent it', () => {
  it('is the first name, as the ticket has room for', () => {
    expect(firstName('Narek Hakobyan')).toBe('Narek');
    expect(firstName('  Ani  ')).toBe('Ani');
    expect(firstName('Ani Hakobyan (Northern Avenue)')).toBe('Ani');
  });
});

describe("a dish's allergens", () => {
  const menu: Menu = {
    branchId: 'b1',
    updatedAtUtc: '2026-10-19T14:00:00Z',
    sections: [
      {
        id: 's',
        name: 'Food',
        items: [
          {
            id: 'trout',
            name: 'Trout',
            description: null,
            priceDram: 1,
            isAvailable: true,
            allergens: 'fish, Celery',
          },
          {
            id: 'water',
            name: 'Water',
            description: null,
            priceDram: 1,
            isAvailable: true,
            allergens: 'none',
          },
          {
            id: 'tolma',
            name: 'Tolma',
            description: null,
            priceDram: 1,
            isAvailable: true,
            allergens: null,
          },
          { id: 'cake', name: 'Cake', description: null, priceDram: 1, isAvailable: true },
        ],
      },
    ],
  };

  const index = allergenIndex(menu);

  it('are the presets the venue ticked and its own words', () => {
    expect(dishAllergens(index, 'trout')).toEqual({ presets: ['fish'], other: 'Celery' });
  });

  it('are nothing for a dish the menu says is clean: "none", or nothing written', () => {
    expect(dishAllergens(index, 'water')).toBeNull();
    expect(dishAllergens(index, 'tolma')).toBeNull();
  });

  // FT4 review S4: a warning the tablet cannot give must not look like "none".
  it('are unknown for a dish the menu lacks, a menu cached before them, no dish, or no menu', () => {
    expect(dishAllergens(index, 'cake')).toBe('unknown');
    expect(dishAllergens(index, 'gone')).toBe('unknown');
    expect(dishAllergens(index, undefined)).toBe('unknown');
    expect(dishAllergens(null, 'trout')).toBe('unknown');
  });
});

describe('the minutes while the queue cannot be re-read (FT4 review N5)', () => {
  it('carry on from the last read by the whole minutes since', () => {
    const board = [ticket({ waitingMinutes: 11 })];
    expect(ageOrders(board, 0)).toBe(board);
    expect(ageOrders(board, 2).map((order) => order.waitingMinutes)).toEqual([13]);
    expect(ticketBand(ageOrders(board, 1)[0]!)).toBe('late');
  });
});

describe('a move the tablet has not sent yet', () => {
  function queued(orderId: string, status: 'ready' | 'inKitchen', seq: number): QueuedCommand {
    return {
      id: `c-${seq}`,
      kind: 'setOrderStatus',
      scope: 'tab1',
      seq,
      takenAtMs: 0,
      attempts: 0,
      precondition: null,
      takenOffline: true,
      subject: { tableId: null, tableLabel: '4', tabId: 'tab1' },
      body: { kind: 'setOrderStatus', command: { orderId, status, clientCommandId: `c-${seq}` } },
    };
  }

  it('shows the ticket where the tap put it, and marks it', () => {
    const { orders, pendingOrderIds } = projectOrders(
      [ticket({ orderId: 'o1' }), ticket({ orderId: 'o2', status: 'new' })],
      [queued('o1', 'ready', 1), queued('o2', 'inKitchen', 2)],
    );
    expect(orders.map((order) => order.status)).toEqual(['ready', 'inKitchen']);
    expect([...pendingOrderIds]).toEqual(['o1', 'o2']);
  });

  it('leaves the board alone with nothing queued, and ignores every other kind', () => {
    const board = [ticket()];
    const other: QueuedCommand = {
      ...queued('o1', 'ready', 1),
      kind: 'acknowledgeServiceRequest',
      body: {
        kind: 'acknowledgeServiceRequest',
        command: { requestId: 'r', clientCommandId: 'x' },
      },
    };
    const projected = projectOrders(board, [other]);
    expect(projected.orders).toBe(board);
    expect(projected.pendingOrderIds.size).toBe(0);
  });
});

describe('what has reached the kitchen since the last read', () => {
  it('is nothing on the first read, then each ticket first seen cooking, once', () => {
    const first = kitchenArrivals(null, [ticket({ orderId: 'a' })]);
    expect(first.arrived).toEqual([]);

    const second = kitchenArrivals(first.seen, [
      ticket({ orderId: 'a' }),
      ticket({ orderId: 'b' }),
      ticket({ orderId: 'c', status: 'new' }),
    ]);
    expect(second.arrived.map((order) => order.orderId)).toEqual(['b']);

    // Sent on later: an arrival. Gone ready and back on the list: not again.
    const third = kitchenArrivals(second.seen, [
      ticket({ orderId: 'b', status: 'ready' }),
      ticket({ orderId: 'c' }),
    ]);
    expect(third.arrived.map((order) => order.orderId)).toEqual(['c']);
    expect(kitchenArrivals(third.seen, [ticket({ orderId: 'b' })]).arrived).toEqual([]);
  });
});
