import { type Page } from '@playwright/test';

/**
 * Signs in to the console with an email and password read from the environment
 * or made for this run. The console keeps its session in IndexedDB, so it
 * survives a reload, unlike the diner web build.
 */
export async function signInConsole(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/sign-in');
  // Exact: the password field has a "Show password" toggle beside it, and a
  // substring match would find both.
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/sign-in'));
}
