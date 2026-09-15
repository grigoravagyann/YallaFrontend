import { expect, test } from '@playwright/test';

import {
  approveBooking,
  bookTable,
  demoBranch,
  localDate,
  managerSession,
  newApi,
  notificationFeed,
  registerDiner,
  tableByLabel,
} from '../../support/api';
import { logIn } from '../../support/diner';

/**
 * Addendum K12. A party above the branch's approval threshold waits for a human;
 * the manager approves it, which writes a `booking-confirmed` entry to the diner's
 * feed. Profile counts it, Notifications lists it, and tapping it opens that
 * booking and marks it read.
 */
test('A booking the venue approves shows in Notifications, and opens that booking', async ({
  page,
}) => {
  const api = await newApi();
  const demo = await demoBranch(api);
  const diner = await registerDiner(api);

  const bigTable = await tableByLabel(api, demo.branchId, '8');
  const booking = await bookTable(api, diner, {
    branchId: demo.branchId,
    tableId: bigTable.id,
    date: localDate(2),
    hours: [18, 19, 20, 17, 16],
    partySize: 9,
  });

  const manager = await managerSession(api);
  await approveBooking(api, manager.accessToken, booking.id);
  await expect
    .poll(async () => (await notificationFeed(api, diner)).items.map((item) => item.kind))
    .toContain('booking-confirmed');

  await logIn(page, diner);
  // The row names its unread count: "Notifications, 1".
  const row = page.getByRole('button', { name: 'Notifications, 1', exact: true });
  await expect(row).toBeVisible();
  await row.click();

  // An unread row's label starts with "Unread. ".
  const entry = page.getByRole('button', { name: /^(Unread\. )?Booking confirmed\./ });
  await expect(entry).toBeVisible();
  await entry.click();

  await page.waitForURL(`**/booking/${booking.id}`);
  await expect(page.getByText(booking.code, { exact: true })).toBeVisible();
  await expect.poll(async () => (await notificationFeed(api, diner)).unreadCount).toBe(0);

  await api.dispose();
});
