import { type Page } from '@playwright/test';

/**
 * Signs in to the console with an email and password read from the environment
 * or made for this run. The console keeps its session in IndexedDB, so it
 * survives a reload, unlike the diner web build.
 */
export async function signInConsole(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/sign-in'));
}
