import { orderItemsTotal, type Order, type OrderItem, type OrderStatus } from './model';

/**
 * Six orders for the Orders tab: three still moving, three finished.
 *
 * Built against a clock rather than frozen, so the active ones are always
 * "today" and never age out of the Active segment while the app is on the mock.
 */

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

function photo(id: string): string {
  return `https://images.unsplash.com/${id}?auto=format&fit=crop&w=400&q=70`;
}

function item(
  id: string,
  name: string,
  quantity: number,
  unitPriceDram: number,
  note?: string,
): OrderItem {
  return { id, name, quantity, unitPriceDram, ...(note !== undefined ? { note } : {}) };
}

/** Timeline entries stepped back from `placedAt`, each `gapMs` apart. */
function timeline(
  placedAt: Date,
  statuses: readonly OrderStatus[],
  gapMs: number,
): Order['timeline'] {
  return statuses.map((status, index) => ({
    status,
    at: new Date(placedAt.getTime() + index * gapMs).toISOString(),
  }));
}

function order(input: {
  id: string;
  placeId: string;
  placeName: string;
  placePhoto: string;
  kind: Order['kind'];
  placedAt: Date;
  steps: readonly OrderStatus[];
  stepGapMs: number;
  items: readonly OrderItem[];
  tableLabel?: string;
  partySize?: number;
}): Order {
  const status = input.steps[input.steps.length - 1] ?? 'confirmed';
  return {
    id: input.id,
    placeId: input.placeId,
    placeName: input.placeName,
    placePhoto: input.placePhoto,
    kind: input.kind,
    status,
    ...(input.tableLabel !== undefined ? { tableLabel: input.tableLabel } : {}),
    ...(input.partySize !== undefined ? { partySize: input.partySize } : {}),
    placedAt: input.placedAt.toISOString(),
    items: input.items,
    totalDram: orderItemsTotal(input.items),
    timeline: timeline(input.placedAt, input.steps, input.stepGapMs),
  };
}

export function createMockOrders(now: Date): readonly Order[] {
  const t = now.getTime();
  return [
    // Active: at the table, confirmed a quarter of an hour ago.
    order({
      id: 'o-1042',
      placeId: 'b-greentable-main',
      placeName: 'The Green Table',
      placePhoto: photo('photo-1554118811-1e0d58224f24'),
      kind: 'dineIn',
      tableLabel: '5',
      partySize: 2,
      placedAt: new Date(t - 15 * MINUTE_MS),
      steps: ['confirmed'],
      stepGapMs: 0,
      items: [
        item('i-1', 'Shakshuka', 1, 2800),
        item('i-2', 'Armenian breakfast', 1, 3200, 'No basturma'),
        item('i-3', 'Flat white', 2, 1200),
      ],
    }),
    // Active: takeaway, in the kitchen.
    order({
      id: 'o-1041',
      placeId: 'b-lumen-north',
      placeName: 'Lumen Coffee',
      placePhoto: photo('photo-1453614512568-c4024d13c247'),
      kind: 'takeaway',
      placedAt: new Date(t - 40 * MINUTE_MS),
      steps: ['confirmed', 'preparing'],
      stepGapMs: 4 * MINUTE_MS,
      items: [item('i-4', 'Cappuccino', 2, 1300, 'Oat milk'), item('i-5', 'Cardamom bun', 2, 1100)],
    }),
    // Active: takeaway, ready to collect.
    order({
      id: 'o-1040',
      placeId: 'b-greenbean-main',
      placeName: 'Green Bean',
      placePhoto: photo('photo-1445116572660-236099ec97a0'),
      kind: 'takeaway',
      placedAt: new Date(t - 65 * MINUTE_MS),
      steps: ['confirmed', 'preparing', 'ready'],
      stepGapMs: 12 * MINUTE_MS,
      items: [
        item('i-6', 'Lentil & roast veg bowl', 1, 2900),
        item('i-7', 'Mint lemonade', 1, 1100),
      ],
    }),
    // History: dinner two days ago, completed.
    order({
      id: 'o-1027',
      placeId: 'b-dolmama-pushkin',
      placeName: 'Dolmama',
      placePhoto: photo('photo-1517248135467-4c7edcad34c4'),
      kind: 'dineIn',
      tableLabel: '3',
      partySize: 4,
      placedAt: new Date(t - 2 * DAY_MS - 3 * HOUR_MS),
      steps: ['confirmed', 'preparing', 'inProgress', 'completed'],
      stepGapMs: 25 * MINUTE_MS,
      items: [
        item('i-8', 'Dolma in grape leaves', 2, 4200),
        item('i-9', 'Lamb khashlama', 2, 7900),
        item('i-10', 'Areni red, glass', 4, 2200),
        item('i-11', 'Walnut pakhlava', 1, 2200),
      ],
    }),
    // History: cancelled before the kitchen started.
    order({
      id: 'o-1019',
      placeId: 'b-tavern-riverside',
      placeName: 'Tavern Yerevan',
      placePhoto: photo('photo-1466978913421-dad2ebd01d17'),
      kind: 'takeaway',
      placedAt: new Date(t - 5 * DAY_MS - HOUR_MS),
      steps: ['confirmed', 'cancelled'],
      stepGapMs: 6 * MINUTE_MS,
      items: [
        item('i-12', 'Pork khorovats', 3, 5200),
        item('i-13', 'Tonir lavash & cheeses', 1, 3800),
      ],
    }),
    // History: a coffee last week, completed.
    order({
      id: 'o-1003',
      placeId: 'b-ararat-opera',
      placeName: 'Ararat Terrace',
      placePhoto: photo('photo-1592861956120-e524fc739696'),
      kind: 'dineIn',
      tableLabel: '2',
      partySize: 2,
      placedAt: new Date(t - 9 * DAY_MS - 2 * HOUR_MS),
      steps: ['confirmed', 'preparing', 'ready', 'completed'],
      stepGapMs: 15 * MINUTE_MS,
      items: [
        item('i-14', 'Beetroot & matsun', 1, 3400),
        item('i-15', 'Crispy lavash, trout roe', 1, 4800),
        item('i-16', 'Tasting flight of three', 2, 6500),
      ],
    }),
  ];
}
