import { expect, test } from '@playwright/test';

import { dinerFields, newApi } from '../../support/api';

/**
 * Plan E1 spec 1. A new diner creates an account, confirms the number with the
 * code (Development returns it from request-code instead of texting it), and
 * Profile no longer says "Not verified". The API agrees.
 */
test('A new diner signs up, confirms the number with the code, and Profile shows it verified', async ({
  page,
}) => {
  const api = await newApi();
  const fields = dinerFields();
  const localNumber = fields.phoneE164.replace(/^\+374/, '');

  await page.goto('/auth/signup');
  await page.getByLabel('Your name').fill(fields.displayName);
  await page.getByLabel('Username', { exact: true }).fill(fields.username);
  await page.getByLabel('Email', { exact: true }).fill(fields.email);
  await page.getByLabel('Phone number').fill(localNumber);
  await page.getByLabel('Password', { exact: true }).fill(fields.password);

  const registered = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/auth/diner/register') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Create account' }).click();
  expect((await registered).status(), 'register answers 2xx').toBeLessThan(300);

  await expect(page.getByText(fields.displayName, { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/Not verified/)).toBeVisible();

  await page.getByRole('button', { name: 'Verify', exact: true }).click();
  const phone = page.getByLabel('Phone number');
  if ((await phone.inputValue()) === '') await phone.fill(localNumber);

  const issued = page.waitForResponse('**/api/auth/diner/request-code');
  await page.getByRole('button', { name: 'Send code' }).click();
  const { developmentCode } = (await (await issued).json()) as { developmentCode?: string };
  expect(developmentCode, 'Development returns the code').toBeTruthy();

  const verified = page.waitForResponse('**/api/auth/diner/verify-code');
  await page.getByLabel('Enter the code').fill(developmentCode!);
  const signIn = (await (await verified).json()) as { accessToken: string };

  // A phone that does not remember a name asks for one; this one usually does.
  const nameStep = page.getByText('What should the venue call you?');
  const profileName = page.getByText(fields.displayName, { exact: true }).first();
  await expect(nameStep.or(profileName)).toBeVisible();
  if (await nameStep.isVisible()) {
    await page.getByLabel('Your name').fill(fields.displayName);
    await page.getByRole('button', { name: 'Continue' }).click();
  }

  await expect(profileName).toBeVisible();
  await expect(page.getByText(/Not verified/)).toHaveCount(0);

  const me = await api.get('/api/diner/me', {
    headers: { authorization: `Bearer ${signIn.accessToken}` },
  });
  expect(me.ok()).toBe(true);
  const profile = (await me.json()) as {
    phoneE164: string;
    phoneVerified: boolean;
    username?: string;
  };
  expect(profile.phoneVerified).toBe(true);
  expect(profile.phoneE164).toBe(fields.phoneE164);
  expect(profile.username).toBe(fields.username);

  await api.dispose();
});
