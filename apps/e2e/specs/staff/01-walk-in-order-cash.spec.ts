import { expect, test } from '@playwright/test';

import { demoBranch, enrolmentCode, newApi, waiterWithPin } from '../../support/api';
import { enrolTablet, openTablePanel, signInWithPin, tableCard } from '../../support/staff';

/**
 * A waiter's evening on the tablet, end to end against the real backend: the
 * tablet is enrolled with a manager's one-time code, the waiter signs in with
 * their PIN, seats a walk-in party, sends an order to the kitchen, takes the
 * cash and frees the table. Every step is what the Playwright build serves -
 * the same `index.html` as the console, chosen by `/staff`.
 *
 * The table is whichever two-seat window table is free when the floor comes up:
 * the diner specs scan 4 and 7 and the seed and the day's bookings move about,
 * so the spec picks rather than assumes.
 */
test('A waiter enrols the tablet, seats a walk-in, sends an order, takes cash and frees the table', async ({
  page,
}) => {
  const api = await newApi();
  const demo = await demoBranch(api);
  const waiter = await waiterWithPin(api);
  const code = await enrolmentCode(api, demo.branchId);

  await enrolTablet(page, code);
  await signInWithPin(page, waiter.fullName, waiter.pin);

  // A free two-seat table, by name, so every later step names the same one.
  const free = page.getByRole('button', { name: /^Table \d+, 2 seats, Free/u }).first();
  await expect(free).toBeVisible();
  const label = /^Table (\d+),/u.exec((await free.getAttribute('aria-label')) ?? '')?.[1];
  expect(label, 'a free two-seat table on the floor').toBeTruthy();
  const t = label!;

  // Seat three: the stepper opens on two, one more makes three, and the panel
  // says the table is smaller than the party without refusing it.
  let panel = await openTablePanel(page, t);
  await panel.getByRole('button', { name: 'Seat a walk-in', exact: true }).click();
  await panel.getByRole('button', { name: 'One more', exact: true }).click();
  await expect(panel.getByText('More than 2 seats')).toBeVisible();
  await panel.getByRole('button', { name: 'Seat 3 guests', exact: true }).click();

  // A tab opens with the seating: the card now says occupied and the party.
  await expect(tableCard(page, t)).toHaveAccessibleName(
    new RegExp(`^Table ${t}, 2 seats, Occupied`, 'u'),
  );

  // Seating does not open a tab: a party that will not scan gets one from the
  // waiter. Then one cappuccino for the table, sent to the kitchen.
  panel = await openTablePanel(page, t);
  await panel.getByRole('button', { name: 'Start a tab', exact: true }).click();
  await panel.getByRole('button', { name: 'Take an order', exact: true }).click();
  const order = page.getByRole('dialog', { name: `Order · table ${t}` });
  await order
    .getByRole('region', { name: 'Menu' })
    .getByRole('button', { name: /^Cappuccino,/u })
    .click();
  await order.getByRole('button', { name: 'Send 1 dish', exact: true }).click();
  const sent = page.getByRole('dialog', { name: '1 dish sent' });
  await expect(sent).toBeVisible();
  await sent.getByRole('button', { name: 'Floor', exact: true }).click();

  // The bill is the cappuccino. "All of it" keys in exactly what is owed, so
  // the test never computes service or rounding itself.
  panel = await openTablePanel(page, t);
  await panel.getByRole('button', { name: /^Take cash · /u }).click();
  const keypad = page.getByRole('dialog', { name: 'Take cash' });
  await expect(keypad).toBeVisible();
  await keypad
    .getByRole('group', { name: 'Quick amounts' })
    .getByRole('button', { name: 'All of it' })
    .click();
  await keypad.getByRole('button', { name: /^Record /u }).click();

  const recorded = page.getByRole('dialog', { name: 'Paid in full' });
  await expect(recorded).toBeVisible();
  // "Free the table" there returns to the table's panel, where freeing is
  // one tap behind its confirm.
  await recorded.getByRole('button', { name: 'Free the table', exact: true }).click();
  panel = page.getByRole('dialog', { name: `Actions for table ${t}` });
  await panel.getByRole('button', { name: 'Free the table', exact: true }).click();
  await panel
    .getByRole('group', { name: `Free table ${t}?` })
    .getByRole('button', { name: 'Free it', exact: true })
    .click();

  await expect(tableCard(page, t)).toHaveAccessibleName(
    new RegExp(`^Table ${t}, 2 seats, Free`, 'u'),
  );

  await api.dispose();
});
