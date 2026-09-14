import { expect, test } from '@playwright/test';

import { demoBranch, myReservations, newApi, registerDiner, uniqueTag } from '../../support/api';
import { logIn, openTab } from '../../support/diner';

/**
 * Plan E1 spec 3. A verified diner books tomorrow from the place page with a note
 * for the venue. The success screen gives a code, Bookings lists it, and the API
 * has the booking with the note (K9: the note reaches the venue).
 */
test('A diner books tomorrow with a note, and Bookings lists it', async ({ page }) => {
  const api = await newApi();
  const demo = await demoBranch(api);
  const diner = await registerDiner(api);
  const note = `High chair please (${uniqueTag()})`;

  await logIn(page, diner);
  await openTab(page, 'Explore');
  await page
    .getByRole('button', { name: new RegExp(`^${demo.venueName} · ${demo.branchName}`) })
    .click();
  await page.waitForURL(`**/place/${demo.branchId}`);
  await page.getByRole('button', { name: 'Book a Table' }).click();
  await page.waitForURL(`**/book/${demo.branchId}**`);

  await page.getByRole('button', { name: tomorrowLabel() }).click();
  // An evening slot well inside the demo branch's hours (09:00 to midnight), so a table fits.
  await page.getByRole('button', { name: '19:00', exact: true }).click();
  await page.getByRole('button', { name: '2', exact: true }).first().click();
  await expect(page.getByText(/No free table seats/)).toHaveCount(0);
  await page.getByLabel('Note for the venue').fill(note);

  const created = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/reservations') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Confirm Booking' }).click();
  const response = await created;
  expect(response.status(), 'the booking is accepted').toBeLessThan(300);
  const booking = (await response.json()) as { id: string; code: string };

  await expect(page.getByText(/^(Table booked|Request sent)$/)).toBeVisible();
  await expect(page.getByText(booking.code, { exact: true })).toBeVisible();
  await expect(page.getByText(note, { exact: true })).toBeVisible();

  // The success screen replaces the booking flow and has no tab bar; it offers the way on.
  await page.getByRole('button', { name: 'See my bookings' }).click();
  await expect(page.getByRole('button', { name: new RegExp(booking.code) })).toBeVisible();

  const stored = (await myReservations(api, diner)).find((entry) => entry.id === booking.id);
  expect(stored?.note).toBe(note);

  await api.dispose();
});

/** Tomorrow's day chip, however the locale orders weekday, day and month. */
function tomorrowLabel(): RegExp {
  const tomorrow = new Date(Date.now() + 86_400_000);
  const part = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('en-US', { ...options, timeZone: 'Asia/Yerevan' }).format(tomorrow);
  const weekday = part({ weekday: 'long' });
  const day = part({ day: 'numeric' });
  const month = part({ month: 'long' });
  return new RegExp(`^(?=.*${weekday})(?=.*\\b${day}\\b)(?=.*${month}).*$`);
}
