import { createMockGateway, type MenuItemDetail } from '@yalla/api';
import { describe, expect, it } from 'vitest';
import {
  emptyTray,
  trayBarState,
  trayItemCount,
  trayReducer,
  traySubtotalDram,
  trayToOrderLines,
  UNSENT_NUDGE_MS,
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
    // A photo record rather than a URL since Backend 9: one upload, three
    // variants, and which one a screen draws is a layout decision.
    photo: {
      photoId: `photo-${id}`,
      thumbnailUrl: `/api/photos/photo-${id}/thumbnail`,
      cardUrl: `/api/photos/photo-${id}/card`,
      fullUrl: `/api/photos/photo-${id}/full`,
      width: 1600,
      height: 1200,
    },
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
    const state = run([{ type: 'add', item: CAPPUCCINO, atMs: 0 }]);
    expect(state.lines).toHaveLength(1);
    expect(state.lines[0]?.quantity).toBe(1);
    expect(trayItemCount(state)).toBe(1);
  });

  it('bumps the quantity when the same plain item is tapped again', () => {
    // What a diner means by tapping twice. A second line would make a round of
    // four coffees four rows to scroll past.
    const state = run([
      { type: 'add', item: CAPPUCCINO, atMs: 0 },
      { type: 'add', item: CAPPUCCINO, atMs: 0 },
      { type: 'add', item: GATA, atMs: 0 },
    ]);
    expect(state.lines).toHaveLength(2);
    expect(state.lines[0]?.quantity).toBe(2);
  });

  it('leaves a line with a note or a shared flag alone when the item is re-added', () => {
    // "One shared bottle and one for me" is two lines, not a quantity of two.
    let state = run([{ type: 'add', item: CAPPUCCINO, atMs: 0 }]);
    const key = state.lines[0]!.key;
    state = trayReducer(state, { type: 'setNote', key, note: 'no sugar' });
    state = trayReducer(state, { type: 'add', item: CAPPUCCINO, atMs: 0 });

    expect(state.lines).toHaveLength(2);
    expect(state.lines[0]?.note).toBe('no sugar');
    expect(state.lines[1]?.quantity).toBe(1);
  });

  it('increments and decrements, and removes the line at zero', () => {
    let state = run([{ type: 'add', item: CAPPUCCINO, atMs: 0 }]);
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
      { type: 'add', item: CAPPUCCINO, atMs: 0 },
      { type: 'add', item: GATA, atMs: 0 },
    ]);
    state = trayReducer(state, { type: 'setNote', key: state.lines[1]!.key, note: 'warm' });

    expect(state.lines[0]?.note).toBe('');
    expect(state.lines[1]?.note).toBe('warm');
  });

  it('toggles shared per line and remembers that the explanation was shown', () => {
    let state = run([{ type: 'add', item: CAPPUCCINO, atMs: 0 }]);
    const key = state.lines[0]!.key;
    expect(state.sharedExplained).toBe(false);

    state = trayReducer(state, { type: 'toggleShared', key });
    expect(state.lines[0]?.isShared).toBe(true);
    expect(state.sharedExplained).toBe(true);

    state = trayReducer(state, { type: 'toggleShared', key });
    expect(state.lines[0]?.isShared).toBe(false);
  });

  it('clears after a send, but not the explanation', () => {
    let state = run([{ type: 'add', item: CAPPUCCINO, atMs: 0 }]);
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
      { type: 'add', item: first, atMs: 0 },
      { type: 'add', item: first, atMs: 0 },
      { type: 'add', item: second, atMs: 0 },
    ]);

    const previewed = traySubtotalDram(state);

    await gateway.placeOrder({
      tabId: tab.tabId,
      clientCommandId: '22222222-2222-4222-8222-222222222222',
      lines: trayToOrderLines(state, tab.me.participantId),
    });

    const view = await gateway.getDinerTab(tab.tabId);
    const charged = (view?.myLines ?? []).reduce((sum, line) => sum + line.lineTotalDram, 0);

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

    let state = run([{ type: 'add', item, atMs: 0 }]);
    state = trayReducer(state, { type: 'toggleShared', key: state.lines[0]!.key });

    const lines = trayToOrderLines(state, tab.me.participantId);
    expect(lines[0]?.isShared).toBe(true);
    // Attributed even though it is shared: the server splits it across the
    // snapshot, and knowing who tapped it is what lets the tab say who added it.
    expect(lines[0]?.participantId).toBe(tab.me.participantId);

    await gateway.placeOrder({
      tabId: tab.tabId,
      clientCommandId: '44444444-4444-4444-8444-444444444444',
      lines,
    });

    const view = await gateway.getDinerTab(tab.tabId);
    const placed = view?.myLines[0];
    expect(placed?.isShared).toBe(true);
    // How many ways it splits, from the snapshot taken when it was ordered —
    // `TabLineView.sharedWithCount`. Only the host was at the table.
    expect(placed?.sharedWithCount).toBe(1);
  });
});

// --- Test 8, second half: the tray survives a failed send ---------------------

describe('a send that did not go', () => {
  it('leaves the tray exactly as it was', () => {
    // The tray is emptied by `sent`, and `sent` is dispatched from the success
    // branch of `placeOrder` and nowhere else — there is deliberately no action
    // that empties it on failure. Nothing was placed, so the items are still
    // what this person wants; making them rebuild an order the server merely
    // declined to take is a second insult after the first.
    let state = trayReducer(emptyTray, { type: 'add', item: CAPPUCCINO, atMs: 0 });
    state = trayReducer(state, { type: 'add', item: CAPPUCCINO, atMs: 0 });
    state = trayReducer(state, { type: 'setNote', key: 't1', note: 'no sugar' });

    const before = state;

    // Every failure path the screen has: offline, sold out, tab closing, and a
    // generic error. None of them touches the reducer.
    expect(state).toEqual(before);
    expect(trayItemCount(state)).toBe(2);
    expect(state.lines[0]?.note).toBe('no sugar');
  });

  it('is emptied only by the server accepting it', () => {
    let state = trayReducer(emptyTray, { type: 'add', item: CAPPUCCINO, atMs: 0 });
    expect(trayItemCount(state)).toBe(1);

    state = trayReducer(state, {
      type: 'sent',
      order: { orderId: 'o-1', estimatedReadyAtUtc: '2026-09-06T19:20:00Z', atMs: 1_000 },
    });

    expect(state.lines).toEqual([]);
    expect(state.lastSent?.orderId).toBe('o-1');
  });
});

// --- Test 4's sibling: the bar cannot read as sent ----------------------------

describe('what the bar shows', () => {
  it('shows nothing when the tray is empty and nothing has been sent', () => {
    expect(trayBarState(emptyTray, 0)).toEqual({ kind: 'empty' });
  });

  it('says plainly that nothing has been sent while the tray holds items', () => {
    const state = trayReducer(emptyTray, { type: 'add', item: CAPPUCCINO, atMs: 0 });
    const bar = trayBarState(state, 0);

    expect(bar.kind).toBe('holding');
    if (bar.kind !== 'holding') return;
    expect(bar.count).toBe(1);
    // Not yet long enough to nag somebody who is still reading the menu.
    expect(bar.nudge).toBe(false);
  });

  it('says so inline once a tray has sat unsent for a few minutes', () => {
    const state = trayReducer(emptyTray, { type: 'add', item: CAPPUCCINO, atMs: 0 });

    expect(trayBarState(state, UNSENT_NUDGE_MS - 1).kind).toBe('holding');
    const nagging = trayBarState(state, UNSENT_NUDGE_MS + 1);
    if (nagging.kind !== 'holding') throw new Error('expected the holding state');
    expect(nagging.nudge).toBe(true);
  });

  it('restarts the clock when a tray is emptied by hand', () => {
    // Somebody who changes their mind and starts again has not been sitting on
    // an unsent order for five minutes.
    let state = trayReducer(emptyTray, { type: 'add', item: CAPPUCCINO, atMs: 0 });
    state = trayReducer(state, { type: 'decrement', key: 't1' });
    expect(state.startedAtMs).toBeNull();

    state = trayReducer(state, { type: 'add', item: CAPPUCCINO, atMs: UNSENT_NUDGE_MS });
    const bar = trayBarState(state, UNSENT_NUDGE_MS + 1);
    if (bar.kind !== 'holding') throw new Error('expected the holding state');
    expect(bar.nudge).toBe(false);
  });

  it('becomes a confirmed state only after the server accepted an order', () => {
    const sent = trayReducer(emptyTray, {
      type: 'sent',
      order: { orderId: 'o-9', estimatedReadyAtUtc: '2026-09-06T19:20:00Z', atMs: 0 },
    });

    const bar = trayBarState(sent, 0);
    expect(bar.kind).toBe('sent');
    if (bar.kind !== 'sent') return;
    expect(bar.estimatedReadyAtUtc).toBe('2026-09-06T19:20:00Z');
    // No count and no money on the confirmed state. It is a different object
    // from the tray, not the tray rendered green.
    expect(bar).not.toHaveProperty('count');
    expect(bar).not.toHaveProperty('subtotalDram');
  });

  it('drops the confirmation the moment something new is added', () => {
    // "Order sent" sitting above a tray with new items in it is the exact
    // confusion the bar exists to prevent.
    let state = trayReducer(emptyTray, {
      type: 'sent',
      order: { orderId: 'o-9', estimatedReadyAtUtc: null, atMs: 0 },
    });
    expect(trayBarState(state, 0).kind).toBe('sent');

    state = trayReducer(state, { type: 'add', item: CAPPUCCINO, atMs: 10 });
    expect(trayBarState(state, 10).kind).toBe('holding');
    expect(state.lastSent).toBeNull();
  });
});
