import type { MenuItemDetail } from '@yalla/api';
import { describe, expect, it } from 'vitest';
import { commandFor, emptyTray, trayLocked, trayReducer, type TrayState } from './tray';

/**
 * Sending the tray, safely, when the answer does not come back.
 *
 * The command id lived in a ref on the tray screen: reused on retry whatever
 * the tray now held, and lost when the screen remounted. Bump a quantity after
 * a timeout and the retry got the *first* order back as a replay — "Sent to the
 * kitchen", with the extra items never sent. Back out and return, and a fresh
 * id sent the whole order twice.
 */

const COFFEE = {
  id: 'cappuccino',
  categoryId: 'c1',
  name: 'Cappuccino',
  description: 'Espresso and milk',
  priceDram: 1200,
  photo: {
    photoId: 'p1',
    thumbnailUrl: '/t',
    cardUrl: '/c',
    fullUrl: '/f',
    width: null,
    height: null,
  },
  ingredients: 'Coffee, milk',
  allergens: 'Milk',
  portionSize: '250 ml',
  spiceLevel: 'notSpicy',
  prepMinutes: 4,
  isAvailable: true,
  displayOrder: 1,
} satisfies MenuItemDetail;

let counter = 0;
const fresh = () => `cmd-${(counter += 1)}`;

function withCoffee(): TrayState {
  return trayReducer(emptyTray, { type: 'add', item: COFFEE, atMs: 0 });
}

describe('the command id for a send', () => {
  it('is the same for a retry of the same tray, held above the screen', () => {
    let state = withCoffee();
    const first = commandFor(state, fresh);
    state = trayReducer(state, { type: 'sending', ...first });
    state = trayReducer(state, { type: 'sendFailed', uncertain: true });

    expect(commandFor(state, fresh).commandId).toBe(first.commandId);
  });

  it('is a new one once the tray has changed after a definite refusal', () => {
    let state = withCoffee();
    const first = commandFor(state, fresh);
    state = trayReducer(state, { type: 'sending', ...first });
    // Sold out: nothing was placed, so the diner edits and sends again.
    state = trayReducer(state, { type: 'sendFailed', uncertain: false });
    const key = state.lines[0]!.key;
    state = trayReducer(state, { type: 'increment', key });

    expect(commandFor(state, fresh).commandId).not.toBe(first.commandId);
  });

  it('is a new one when the tray no longer holds what the pending send carried', () => {
    let state = withCoffee();
    const first = commandFor(state, fresh);
    state = trayReducer(state, { type: 'sending', ...first });
    // Changed while the first send was still in flight, then that send timed
    // out: the id the server may hold describes one coffee, not two.
    const key = state.lines[0]!.key;
    state = trayReducer(state, { type: 'increment', key });
    state = trayReducer(state, { type: 'sendFailed', uncertain: true });

    expect(commandFor(state, fresh).commandId).not.toBe(first.commandId);
  });

  it('locks the tray while it is unknown whether the last send went through', () => {
    let state = withCoffee();
    const first = commandFor(state, fresh);
    state = trayReducer(state, { type: 'sending', ...first });
    state = trayReducer(state, { type: 'sendFailed', uncertain: true });
    const key = state.lines[0]!.key;

    const edited = trayReducer(state, { type: 'increment', key });

    // Editing now would send different items under a command the server may
    // already hold — and get the old order back as a "success".
    expect(trayLocked(edited)).toBe(true);
    expect(edited.lines[0]?.quantity).toBe(1);
  });

  it('clears the pending send once the server accepts it', () => {
    let state = withCoffee();
    const first = commandFor(state, fresh);
    state = trayReducer(state, { type: 'sending', ...first });
    state = trayReducer(state, {
      type: 'sent',
      order: { orderId: 'o1', estimatedReadyAtUtc: null, atMs: 1 },
    });

    expect(state.pendingSend).toBeNull();
    expect(trayLocked(state)).toBe(false);
  });
});
