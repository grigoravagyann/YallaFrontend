import type { DinerOrder } from '@yalla/api';
import { describe, expect, it } from 'vitest';
import { orderFromApi } from './httpMapping';
import { canCancelOrder } from './model';

const ORDER: DinerOrder = {
  orderId: 'o1',
  tabId: 'tab',
  branchId: 'b1',
  venueName: 'Lumen Coffee',
  branchName: 'Cascade',
  coverPhoto: null,
  kind: 'dineIn',
  status: 'confirmed',
  tableLabel: '5',
  partySize: 2,
  placedAtUtc: '2026-09-14T09:00:00Z',
  estimatedReadyAtUtc: null,
  totalAmd: 2400,
  items: [
    {
      lineId: 'l1',
      name: 'Flat white',
      quantity: 2,
      unitPriceAmd: 1200,
      lineTotalAmd: 2400,
      note: 'oat',
      isVoided: false,
    },
    {
      lineId: 'l2',
      name: 'Cake',
      quantity: 1,
      unitPriceAmd: 900,
      lineTotalAmd: 0,
      note: null,
      isVoided: true,
    },
  ],
  timeline: [{ status: 'confirmed', atUtc: '2026-09-14T09:00:00Z' }],
  canCancel: false,
};

describe('orderFromApi', () => {
  it('maps the receipt, drops voided lines, and never offers a cancel', () => {
    const order = orderFromApi(ORDER);

    expect(order).toMatchObject({
      id: 'o1',
      placeId: 'b1',
      placeName: 'Lumen Coffee · Cascade',
      placePhoto: '',
      tableLabel: '5',
      partySize: 2,
      totalDram: 2400,
      timeline: [{ status: 'confirmed', at: '2026-09-14T09:00:00Z' }],
    });
    expect(order.items).toEqual([
      { id: 'l1', name: 'Flat white', quantity: 2, unitPriceDram: 1200, note: 'oat' },
    ]);
    // Confirmed, but the domain has no diner cancel.
    expect(canCancelOrder(order)).toBe(false);
  });
});
