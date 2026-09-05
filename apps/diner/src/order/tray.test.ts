import { createMockGateway, type MenuItemDetail } from '@yalla/api';
import { describe, expect, it } from 'vitest';
import {
  emptyTray,
  trayItemCount,
  trayReducer,
  traySubtotalDram,
  trayToOrderLines,
  type TrayState,
} from './tray';

/**
 * The order tray.
 *
 * A basket, not a document. Its bugs are invisible ones: a line that quietly
 * merges with another, a decrement that leaves a zero-quantity row, a subtotal
 * that disagrees with what the kitchen will charge.
 */

function menuItem(id: string, priceDram: number, name = id): MenuItemDetail {
  return {
    id,
    categoryId: 'c1',
    name,
    description: '',
    priceDram,
    photoUrl: null,
    ingredients: '',
    allergens: '',
    portionSize: '',
    spiceLevel: 'notSpicy',
    prepMinutes: 5,
    isAvailable: true,
    displayOrder: 0,
  };
}

const CAPPUCCINO = menuItem('cappuccino', 1200, 'Cappuccino');
const GATA = menuItem('gata', 850, 'Gata');

function run(actions: readonly Parameters<typeof trayReducer>[1][]): TrayState {
  return actions.reduce(trayReducer, emptyTray);
}

// --- 1. add, increment, decrement to removal, note, shared, clear ----------

describe('the tray', () => {
  it('adds an item', () => {
    const state = run([{ type: 'add', item: CAPPUCCINO }]);
    expect(state.lines).toHaveLength(1);
    expect(state.lines[0]?.quantity).toBe(1);
    expect(trayItemCount(state)).toBe(1);
  });

  it('bumps the quantity when the same plain item is tapped again', () => {
    // What a diner means by tapping twice. A second line would make a round of
    // four coffees four rows to scroll past.
    const state = run([
      { type: 'add', item: CAPPUCCINO },
      { type: 'add', item: CAPPUCCINO },
      { type: 'add', item: GATA },
    ]);
    expect(state.lines).toHaveLength(2);
    expect(state.lines[0]?.quantity).toBe(2);
  });

  it('leaves a line with a note or a shared flag alone when the item is re-added', () => {
    // "One shared bottle and one for me" is two lines, not a quantity of two.
    let state = run([{ type: 'add', item: CAPPUCCINO }]);
    const key = state.lines[0]!.key;
    state = trayReducer(state, { type: 'setNote', key, note: 'no sugar' });
    state = trayReducer(state, { type: 'add', item: CAPPUCCINO });

    expect(state.lines).toHaveLength(2);
    expect(state.lines[0]?.note).toBe('no sugar');
    expect(state.lines[1]?.quantity).toBe(1);
  });

  it('increments and decrements, and removes the line at zero', () => {
    let state = run([{ type: 'add', item: CAPPUCCINO }]);
    const key = state.lines[0]!.key;

    state = trayReducer(state, { type: 'increment', key });
    expect(state.lines[0]?.quantity).toBe(2);

    state = trayReducer(state, { type: 'decrement', key });
    expect(state.lines[0]?.quantity).toBe(1);

    // Down to zero removes it. A stepper that stops at one leaves a diner
    // hunting for a delete control that does not exist.
    state = trayReducer(state, { type: 'decrement', key });
    expect(state.lines).toHaveLength(0);
    expect(trayItemCount(state)).toBe(0);
  });

  it('keeps a note per line', () => {
    let state = run([
      { type: 'add', item: CAPPUCCINO },
      { type: 'add', item: GATA },
    ]);
    state = trayReducer(state, { type: 'setNote', key: state.lines[1]!.key, note: 'warm' });

    expect(state.lines[0]?.note).toBe('');
    expect(state.lines[1]?.note).toBe('warm');
  });

  it('toggles shared per line and remembers that the explanation was shown', () => {
    let state = run([{ type: 'add', item: CAPPUCCINO }]);
    const key = state.lines[0]!.key;
    expect(state.sharedExplained).toBe(false);

    state = trayReducer(state, { type: 'toggleShared', key });
    expect(state.lines[0]?.isShared).toBe(true);
    expect(state.sharedExplained).toBe(true);

    state = trayReducer(state, { type: 'toggleShared', key });
    expect(state.lines[0]?.isShared).toBe(false);
  });

  it('clears after a send, but not the explanation', () => {
    let state = run([{ type: 'add', item: CAPPUCCINO }]);
    state = trayReducer(state, { type: 'toggleShared', key: state.lines[0]!.key });
    state = trayReducer(state, { type: 'clear' });

    expect(state.lines).toHaveLength(0);
    expect(trayItemCount(state)).toBe(0);
    // Per session, not per order. Explaining it again after every send is noise.
    expect(state.sharedExplained).toBe(true);
  });
});

// --- 2. the tray subtotal matches what the server charges ------------------

describe('the tray subtotal', () => {
  it('is display-only and agrees with the server for the same items', async () => {
    const gateway = createMockGateway({ latencyMs: 0 });

    const scan = await gateway.scanTableCode({
      tableCode: (await import('@yalla/api')).mockTableCode('b-lumen-north-t1'),
      commandId: '11111111-1111-4111-8111-111111111111',
    });
    const tab = scan.tab;

    const menu = await gateway.getBranchMenuDetail(tab.branchId);
    const items = (menu?.categories ?? []).flatMap((category) => category.items);
    const first = items[0]!;
    const second = items[1]!;

    let state = run([
      { type: 'add', item: first },
      { type: 'add', item: first },
      { type: 'add', item: second },
    ]);

    const previewed = traySubtotalDram(state);

    await gateway.placeOrder({
      tabId: tab.id,
      clientCommandId: '22222222-2222-4222-8222-222222222222',
      lines: trayToOrderLines(state, tab.yourParticipantId),
    });

    const view = await gateway.getDinerTab(tab.id);
    const charged = (view?.lines ?? []).reduce((sum, line) => sum + line.lineTotalDram, 0);

    // The tray's arithmetic is the one place this app multiplies money, and it
    // is a preview of items not yet ordered. It still has to agree with what the
    // kitchen will charge for exactly those items, or the number is a lie people
    // will notice at the counter.
    expect(previewed).toBe(charged);
    expect(previewed).toBe(first.priceDram * 2 + second.priceDram);

    state = trayReducer(state, { type: 'clear' });
    expect(traySubtotalDram(state)).toBe(0);
  });
});

// --- 6. the shared badge reads the line's own snapshot ---------------------

describe('a shared line', () => {
  it('is sent as shared and comes back with the split count from its snapshot', async () => {
    const gateway = createMockGateway({ latencyMs: 0, simulateJoiners: false });
    const { mockTableCode } = await import('@yalla/api');

    const scan = await gateway.scanTableCode({
      tableCode: mockTableCode('b-lumen-north-t2'),
      commandId: '33333333-3333-4333-8333-333333333333',
    });
    const tab = scan.tab;

    const menu = await gateway.getBranchMenuDetail(tab.branchId);
    const item = (menu?.categories ?? []).flatMap((category) => category.items)[0]!;

    let state = run([{ type: 'add', item }]);
    state = trayReducer(state, { type: 'toggleShared', key: state.lines[0]!.key });

    const lines = trayToOrderLines(state, tab.yourParticipantId);
    expect(lines[0]?.isShared).toBe(true);
    // Attributed even though it is shared: the server splits it across the
    // snapshot, and knowing who tapped it is what lets the tab say who added it.
    expect(lines[0]?.participantId).toBe(tab.yourParticipantId);

    await gateway.placeOrder({
      tabId: tab.id,
      clientCommandId: '44444444-4444-4444-8444-444444444444',
      lines,
    });

    const view = await gateway.getDinerTab(tab.id);
    const placed = view?.lines[0];
    expect(placed?.isShared).toBe(true);
    // One person at the table when it was ordered, so it splits one way — not
    // however many happen to be on the tab when the bill is read.
    expect(placed?.sharedWithCount).toBe(1);
  });
});
