import { expect, test } from '@playwright/test';

import {
  branchDetail,
  branchMenu,
  branchRooms,
  demoBranch,
  newApi,
  publicBranches,
  registerDiner,
  SEED_BRANCH_SLUG,
  SEED_VENUE_SLUG,
} from '../../support/api';
import { logIn, openTab } from '../../support/diner';

/**
 * Plan E1 spec 2. Explore shows the seeded branch from the real API and opens it
 * by the API's id; the place page draws its rooms as photos with every table
 * pinned (room by room), the menu tab and the seeded reviews; and "Pick a time"
 * asks for the public branch page by slug and draws the same rooms at a slot. A
 * build on the mock data source fails at the first step: its places are not the
 * backend's.
 */
test('Explore lists the demo branch with the API id, and its place page is real', async ({
  page,
}) => {
  const api = await newApi();
  const demo = await demoBranch(api);
  const listed = (await publicBranches(api)).find((entry) => entry.branchId === demo.branchId);
  expect(listed, 'GET /api/public/branches lists the demo branch').toBeTruthy();

  // Explore is behind an account: a signed-out diner starts on the welcome.
  await logIn(page, await registerDiner(api));
  await openTab(page, 'Explore');
  const card = page.getByRole('button', {
    name: new RegExp(`^${demo.venueName} · ${demo.branchName}`),
  });
  await expect(card).toBeVisible();
  await card.click();
  await page.waitForURL(`**/place/${demo.branchId}`);

  // Rooms: the first room's pins on its photos, each a button named by its table
  // and state; another room's pins only once that room is picked.
  const rooms = (await branchRooms(api, demo.branchId)).rooms;
  expect(rooms.length, 'the seed photographs rooms').toBeGreaterThan(1);
  const pinsOf = (room: (typeof rooms)[number]) =>
    room.photos.flatMap((entry) => entry.tables.map((table) => table.label));
  const pin = (label: string) =>
    page.getByRole('button', {
      name: new RegExp(`^Table ${label}, (free|reserved|occupied|out of service)$`),
    });
  const anyPin = page.getByRole('button', {
    name: /^Table \w+, (free|reserved|occupied|out of service)$/,
  });
  for (const room of rooms.slice(0, 2)) {
    expect(pinsOf(room).length, `the seed pins tables in ${room.name}`).toBeGreaterThan(0);
    await page.getByRole('tab', { name: room.name, exact: true }).click();
    await expect(anyPin).toHaveCount(pinsOf(room).length);
    for (const label of pinsOf(room)) await expect(pin(label)).toHaveCount(1);
  }

  // Menu: a seeded dish, as the API lists it, on screen. Only once it is there do
  // the failure and empty texts mean anything: while the menu loads, neither is.
  const menu = await branchMenu(api, demo.branchId);
  const dish = menu.categories.flatMap((category) => category.items)[0];
  expect(dish, 'GET /api/branches/{id}/menu has items for the demo branch').toBeTruthy();
  await page.getByRole('tab', { name: 'Menu' }).click();
  await expect(page.getByText(dish!.name, { exact: true }).first()).toBeVisible();
  await expect(page.getByText('We could not load the menu.')).toHaveCount(0);
  await expect(page.getByText('This place has not published a menu yet.')).toHaveCount(0);

  // Reviews: the seeded ones, as the public API returns them.
  await page.getByRole('tab', { name: 'Reviews' }).click();
  const withText = (await branchDetail(api, demo.branchId)).recentReviews.find(
    (review) => review.text,
  );
  expect(withText, 'the seed has reviews with text').toBeTruthy();
  await expect(page.getByText(withText!.text!, { exact: true })).toBeVisible();

  // "Pick a time" asks the public branch page by slug, not by id, and draws the
  // first room's pins again, coloured at the slot.
  const slugRequest = page.waitForRequest((request) =>
    request.url().includes(`/api/public/branches/${SEED_VENUE_SLUG}/${SEED_BRANCH_SLUG}`),
  );
  await page.getByRole('button', { name: 'Pick a time' }).click();
  await slugRequest;
  await expect(page.getByRole('heading', { name: demo.branchName })).toBeVisible();
  await expect(anyPin).toHaveCount(pinsOf(rooms[0]!).length);

  await api.dispose();
});
