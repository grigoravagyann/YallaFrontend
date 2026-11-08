import { expect, type Page } from '@playwright/test';

/**
 * The staff tablet, driven as a waiter would: the app lives at `/staff` on the
 * console's origin. A fresh browser context is an unenrolled tablet, so a spec
 * enrols it with a one-time code first and then signs a person in with their
 * PIN. The PIN is tapped on the keypad and never typed into a field, logged or
 * asserted on.
 */

/** Redeems a manager's one-time code on the enrolment screen, then goes to the PIN pad. */
export async function enrolTablet(page: Page, code: string, deviceName = 'Hall 1'): Promise<void> {
  await page.goto('/staff');
  await page.getByRole('textbox', { name: 'One-time code' }).fill(code);
  await page.getByRole('button', { name: deviceName, exact: true }).click();
  await page.getByRole('button', { name: 'Connect the tablet', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'The tablet is connected' })).toBeVisible();
  await page.getByRole('button', { name: 'Go to the PIN pad', exact: true }).click();
}

/** Taps a person's name on the roster and their PIN on the keypad; the floor is up when it returns. */
export async function signInWithPin(page: Page, fullName: string, pin: string): Promise<void> {
  await page.getByRole('button', { name: fullName, exact: true }).click();
  await expect(page.getByText(`${fullName.split(/\s+/u)[0]}, tap your PIN`)).toBeVisible();
  for (const digit of pin) {
    await page.getByRole('button', { name: digit, exact: true }).click();
  }
  await expect(page.getByRole('list', { name: 'Tables' })).toBeVisible();
}

/** The floor's card for a table, whatever its state. */
export function tableCard(page: Page, label: string) {
  return page.getByRole('button', { name: new RegExp(`^Table ${label}, `, 'u') });
}

/** Opens the table's action panel and returns it. */
export async function openTablePanel(page: Page, label: string) {
  await tableCard(page, label).click();
  const panel = page.getByRole('dialog', { name: `Actions for table ${label}` });
  await expect(panel).toBeVisible();
  return panel;
}
