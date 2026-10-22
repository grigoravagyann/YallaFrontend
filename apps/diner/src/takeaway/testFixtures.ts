import type { BranchMenu, MenuItemDetail, TakeawayAvailability, TakeawayOrder } from '@yalla/api';

/**
 * Takeaway fixtures shared by the tests under `src/takeaway` and the screens'
 * tests. Not imported by the app.
 */

export function menuItem(
  id: string,
  priceDram: number,
  name = id,
  extra: Partial<MenuItemDetail> = {},
): MenuItemDetail {
  return {
    id,
    categoryId: 'grill',
    name,
    description: '',
    priceDram,
    photo: {
      photoId: `photo-${id}`,
      thumbnailUrl: '',
      cardUrl: '',
      fullUrl: '',
      width: 1600,
      height: 1200,
    },
    ingredients: '',
    allergens: '',
    portionSize: '350 g',
    spiceLevel: 'notSpicy',
    prepMinutes: 15,
    isAvailable: true,
    displayOrder: 0,
    ...extra,
  };
}

export const PORK = menuItem('pork', 4500, 'Pork khorovats');
export const LULA = menuItem('lula', 3200, 'Lula kebab');
export const TAN = menuItem('tan', 600, 'Tan', { categoryId: 'drinks' });
export const KHASHLAMA = menuItem('khashlama', 5200, 'Khashlama', {
  availableForTakeaway: false,
});

export const MENU: BranchMenu = {
  branchId: 'branch-1',
  fetchedAtUtc: '2026-10-22T14:00:00Z',
  categories: [
    { id: 'grill', name: 'Grill', displayOrder: 0, items: [PORK, LULA, KHASHLAMA] },
    { id: 'drinks', name: 'Drinks', displayOrder: 1, items: [TAN] },
  ],
};

export function availability(extra: Partial<TakeawayAvailability> = {}): TakeawayAvailability {
  return {
    branchId: 'branch-1',
    enabled: true,
    open: true,
    prepMinutes: 20,
    asapReadyAtUtc: '2026-10-22T15:05:00Z',
    asapReadyAt: '19:05',
    slots: ['19:15', '19:30', '19:45', '20:00'],
    lastPickupAt: '23:30',
    busy: false,
    opensAt: null,
    opensAtUtc: null,
    ...extra,
  };
}

export function takeawayOrder(extra: Partial<TakeawayOrder> = {}): TakeawayOrder {
  return {
    id: 'order-1',
    code: 'T-482',
    status: 'sent',
    lines: [
      {
        id: 'l1',
        menuItemId: 'pork',
        name: 'Pork khorovats',
        unitPriceDram: 4500,
        quantity: 1,
        lineTotalDram: 4500,
      },
      {
        id: 'l2',
        menuItemId: 'tan',
        name: 'Tan',
        unitPriceDram: 600,
        quantity: 2,
        lineTotalDram: 1200,
      },
    ],
    totalDram: 5700,
    note: null,
    pickupAsap: true,
    requestedPickupUtc: '2026-10-22T15:05:00Z',
    requestedPickupAt: '19:05',
    readyAtUtc: null,
    readyAt: null,
    sentAtUtc: '2026-10-22T14:45:00Z',
    acceptDeadlineUtc: '2026-10-22T14:50:00Z',
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
    wasReplay: false,
    branchId: 'branch-1',
    venueName: 'Lava',
    branchName: 'Abovyan',
    branchAddress: 'Abovyan 12',
    branchPhoneE164: '+37410000000',
    latitude: 40.18,
    longitude: 44.51,
    canCancel: true,
    ...extra,
  };
}
