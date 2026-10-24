import { expect, test, type Page } from '@playwright/test';

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

  // Which days' slots the screen has fetched, so the wait below is for tomorrow's answer
  // only when it has not come already (late in the evening the screen opens on tomorrow).
  const slotDays = new Set<string>();
  page.on('response', (response) => {
    if (response.url().includes('/availability/slots') && response.ok()) {
      slotDays.add(new URL(response.url()).searchParams.get('date') ?? '');
    }
  });

  await logIn(page, diner);
  await openTab(page, 'Explore');
  await page
    .getByRole('button', { name: new RegExp(`^${demo.venueName} · ${demo.branchName}`) })
    .click();
  await page.waitForURL(`**/place/${demo.branchId}`);
  await page.getByRole('button', { name: 'Book a Table' }).click();
  await page.waitForURL(`**/book/${demo.branchId}**`);

  // Tomorrow's day of slots, so the times struck or left out are known before choosing one.
  // Late in the evening today has no bookable time left and the screen opens on tomorrow
  // already: its slots have come, and pressing the chosen day asks for nothing new.
  const tomorrow = page.getByRole('button', { name: tomorrowLabel() });
  await expect(tomorrow).toBeVisible();
  const tomorrowKey = yerevanDateKey(1);
  if (slotDays.has(tomorrowKey)) {
    await tomorrow.click();
  } else {
    const daySlots = page.waitForResponse(
      (response) =>
        response.url().includes('/availability/slots') &&
        response.ok() &&
        new URL(response.url()).searchParams.get('date') === tomorrowKey,
    );
    await tomorrow.click();
    await daySlots;
  }
  // Party sizes are radios in a named group (their selected state reaches
  // screen readers), not plain buttons.
  await page.getByRole('radio', { name: '2', exact: true }).first().click();
  // An evening time well inside the demo branch's hours (09:00 to midnight), so a table fits.
  // Confirm waits for that time's own room — the table it books, whether a
  // booking follows on it — so the answer for 19:00 is waited for, not raced.
  const sevenPm = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname.endsWith(`/branches/${demo.branchId}/availability`) &&
      (url.searchParams.get('time') ?? '').startsWith('19:00') &&
      response.ok()
    );
  });
  await chooseTime(page, '19:00');
  await sevenPm;
  await expect(page.getByText(/No free table seats/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Confirm Booking/u })).toBeEnabled();
  await page.getByLabel('Note for the venue').fill(note);

  const created = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/reservations') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Confirm Booking' }).click();
  // Booking times: when a booking follows on the table the screen asks first —
  // "Will you free the table by …?" — and nothing is sent without a yes.
  const freeBy = page.getByRole('button', { name: /^Yes, I'll free it by/u });
  await freeBy
    .waitFor({ state: 'visible', timeout: 2_000 })
    .then(() => freeBy.click())
    .catch(() => undefined);
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

/**
 * Choose a time on the Book screen's time wheel.
 *
 * The wheel is one adjustable control — a slider named "Time" on the web —
 * whose value is the chosen time ("19:00", with any note after a comma). Home
 * goes to the day's first time that can be had and each ArrowUp to the next,
 * never onto a struck one, so this is the stable accessible way in, the same
 * a screen reader's swipe takes. Fails if the time is never reached.
 */
async function chooseTime(page: Page, time: string): Promise<void> {
  const wheel = page.getByRole('slider', { name: 'Time', exact: true });
  await expect(wheel).toBeVisible();
  await wheel.focus();
  await wheel.press('Home');
  for (let step = 0; step < 120; step += 1) {
    const value = (await wheel.getAttribute('aria-valuetext')) ?? '';
    if (value.split(',')[0] === time) return;
    await wheel.press('ArrowUp');
    // The next time, or the end of the day — which fails here, naming the value.
    await expect(wheel).not.toHaveAttribute('aria-valuetext', value, { timeout: 5_000 });
  }
  throw new Error(`The time wheel never reached ${time}.`);
}

/** The branch's calendar day `days` from now, as the slots request names it (yyyy-MM-dd). */
function yerevanDateKey(days: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Yerevan' }).format(
    new Date(Date.now() + days * 86_400_000),
  );
}

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
