import { expect, type Page } from '@playwright/test';

import type { Diner } from './api';

/**
 * The diner web build keeps its session in memory outside development builds
 * (the D1 storage rule), so any full page load signs the diner out. After
 * signing in, specs move around the app by tapping, or with `goInApp`, never
 * with `page.goto`.
 */

/** Signs in from a fresh load of the log-in screen; lands on Profile. */
export async function logIn(
  page: Page,
  diner: Pick<Diner, 'username' | 'password' | 'displayName'>,
): Promise<void> {
  await page.goto('/auth/login');
  await page.getByLabel('Username or email').fill(diner.username);
  await page.getByLabel('Password', { exact: true }).fill(diner.password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/auth'));
  await expect(page.getByText(diner.displayName, { exact: true }).first()).toBeVisible();
}

/**
 * Signs in from Profile's own "Log in" button, without a page load, so whatever
 * the app still holds in memory from the diner before is still there to leak.
 */
export async function logInFromProfile(
  page: Page,
  diner: Pick<Diner, 'username' | 'password' | 'displayName'>,
): Promise<void> {
  await openTab(page, 'Profile');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await page.getByLabel('Username or email').fill(diner.username);
  await page.getByLabel('Password', { exact: true }).fill(diner.password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByText(diner.displayName, { exact: true }).first()).toBeVisible();
}

/**
 * Client-side navigation, keeping the in-memory session: the same history
 * change the browser's own back and forward make, which Expo Router follows.
 */
export async function goInApp(page: Page, path: string): Promise<void> {
  await page.evaluate((target) => {
    window.history.pushState({}, '', target);
    window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
  }, path);
  await page.waitForURL((url) => url.pathname === path.split('?')[0]);
}

/**
 * The floating tab bar. Screens pushed over the tabs (a place, Edit profile,
 * Favorites) hide it, so this taps Back until it shows.
 */
export async function openTab(
  page: Page,
  name: 'Explore' | 'Bookings' | 'Scan' | 'Orders' | 'Profile',
): Promise<void> {
  const tab = page.getByRole('tab', { name, exact: true });
  for (let step = 0; step < 5 && !(await tab.isVisible()); step += 1) {
    const back = page
      .getByRole('button', { name: 'Back', exact: true })
      .filter({ visible: true })
      .last();
    if (!(await back.isVisible())) break;
    await back.click();
    await tab.or(back).first().waitFor({ state: 'visible' });
  }
  await tab.click();
}

export async function logOut(page: Page): Promise<void> {
  await openTab(page, 'Profile');
  await page.getByRole('button', { name: 'Log Out' }).click();
  await expect(page.getByRole('button', { name: 'Log in', exact: true })).toBeVisible();
}
