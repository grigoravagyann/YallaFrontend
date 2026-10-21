import { describe, expect, it } from 'vitest';
import { DEFAULT_PRE_ORDER_SETTINGS } from '../contracts/preOrder';
import { ForbiddenError, ValidationError } from '../errors';
import { createConsoleMockGateway } from './consoleMock';

/**
 * The console's pre-order settings in the mock (PO wire §6, 2026-10-21): off,
 * 30 minutes and nothing excluded by default; all three saved together; the
 * exclusions are the whole list and follow the dish onto the menu; bounds
 * named; manager or above at the branch.
 */

const NORTH = 'b-lumen-north';
const START = Date.parse('2026-10-21T08:00:00.000Z');

function console(options: Parameters<typeof createConsoleMockGateway>[0] = {}) {
  return createConsoleMockGateway({ now: () => new Date(START), role: 'owner', ...options });
}

async function caught(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => null,
    (error: unknown) => error,
  );
}

describe('pre-order settings', () => {
  it('starts off, 30 minutes, nothing excluded, with the bounds and the fixed numbers', async () => {
    expect(await console().getPreOrderSettings(NORTH)).toEqual(DEFAULT_PRE_ORDER_SETTINGS);
  });

  it('saves all three, and the exclusions follow the dishes on the menu', async () => {
    const gateway = console();
    const saved = await gateway.savePreOrderSettings({
      branchId: NORTH,
      settings: {
        acceptsPreOrders: true,
        minutesBefore: 45,
        excludedMenuItemIds: ['gata', 'espresso'],
      },
    });
    expect(saved).toMatchObject({ acceptsPreOrders: true, minutesBefore: 45 });
    expect([...saved.excludedMenuItemIds].sort()).toEqual(['espresso', 'gata']);
    expect(await gateway.getPreOrderSettings(NORTH)).toEqual(saved);

    const items = (await gateway.getAdminMenu(NORTH)).flatMap((category) => category.items);
    const flag = (id: string) => items.find((item) => item.id === id)?.availableForPreOrder;
    expect(flag('gata')).toBe(false);
    expect(flag('espresso')).toBe(false);
    expect(flag('croissant')).toBe(true);

    // The whole list: what is left out is pre-orderable again.
    await gateway.savePreOrderSettings({
      branchId: NORTH,
      settings: { acceptsPreOrders: true, minutesBefore: 45, excludedMenuItemIds: ['gata'] },
    });
    const after = (await gateway.getAdminMenu(NORTH)).flatMap((category) => category.items);
    expect(after.find((item) => item.id === 'espresso')?.availableForPreOrder).toBe(true);
  });

  it('names a minutes value out of bounds and a dish not on the menu, saving nothing', async () => {
    const gateway = console();
    const error = await caught(
      gateway.savePreOrderSettings({
        branchId: NORTH,
        settings: {
          acceptsPreOrders: true,
          minutesBefore: 121,
          excludedMenuItemIds: ['not-a-dish'],
        },
      }),
    );
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).violations).toMatchObject([
      { field: 'minutesBefore', bound: 'range', min: 5, max: 120 },
      { field: 'excludedMenuItemIds' },
    ]);
    expect(await gateway.getPreOrderSettings(NORTH)).toEqual(DEFAULT_PRE_ORDER_SETTINGS);
  });

  it('is a manager’s: a waiter is refused', async () => {
    const error = await caught(console({ role: 'waiter' }).getPreOrderSettings(NORTH));
    expect(error).toBeInstanceOf(ForbiddenError);
  });

  it('in mock mode: Northern Avenue takes them, and a pending booking carries one', async () => {
    const gateway = console({ seedPreOrders: true });
    expect((await gateway.getPreOrderSettings(NORTH)).acceptsPreOrders).toBe(true);
    const pending = await gateway.listPendingReservations(NORTH);
    const withOne = pending.find((booking) => booking.preOrder);
    expect(withOne?.preOrder?.lines.length).toBeGreaterThan(0);
    expect(withOne?.preOrder?.state).toBe('editable');
  });
});
